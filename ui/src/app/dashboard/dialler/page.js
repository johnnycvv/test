'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('cc_token') || '';
}

async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const STATUS_COLORS = {
  ready:     { bg: '#1a2a1a', text: '#4ade80', border: '#166534' },
  running:   { bg: '#1a1a2e', text: '#60a5fa', border: '#1d4ed8' },
  paused:    { bg: '#2a2010', text: '#fbbf24', border: '#92400e' },
  completed: { bg: '#1a2a1a', text: '#4ade80', border: '#166534' },
  stopped:   { bg: '#2a1a1a', text: '#f87171', border: '#991b1b' },
};

function StatBox({ label, value, color = '#e2e8f0' }) {
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3352', borderRadius: '10px', padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ color, fontSize: '1.75rem', fontWeight: '700', lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>{label}</div>
    </div>
  );
}

function ProgressBar({ value, max, color = '#2563eb' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: '8px', background: '#22263a', borderRadius: '4px', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
    </div>
  );
}

export default function DiallerPage() {
  const [campaigns,    setCampaigns]    = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [stats,        setStats]        = useState(null);
  const [numbers,      setNumbers]      = useState([]);
  const [queues,       setQueues]       = useState([]);
  const [trunks,       setTrunks]       = useState([]);
  const [showCreate,   setShowCreate]   = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [liveFeed,     setLiveFeed]     = useState([]);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    name: '', messageText: '', audioUrl: '',
    press1QueueId: '', trunkId: '',
    callerId: '', callsPerMinute: 10,
    useCustomSip: false,
    customSipHost: '', customSipUser: '', customSipPass: '',
  });

  async function loadCampaigns() {
    const data = await req('/api/dialler/campaigns').catch(() => []);
    setCampaigns(Array.isArray(data) ? data : []);
  }

  async function loadQueues() {
    const data = await req('/api/queues').catch(() => []);
    setQueues(Array.isArray(data) ? data : []);
  }

  async function loadTrunks() {
    const data = await req('/api/trunks').catch(() => []);
    setTrunks(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadCampaigns();
    loadQueues();
    loadTrunks();
    const t = setInterval(loadCampaigns, 5000);
    return () => clearInterval(t);
  }, []);

  async function selectCampaign(c) {
    setSelected(c);
    setUploadResult(null);
    const [s, n] = await Promise.all([
      req(`/api/dialler/campaigns/${c.id}/stats`).catch(() => null),
      req(`/api/dialler/campaigns/${c.id}/numbers`).catch(() => []),
    ]);
    setStats(s);
    setNumbers(Array.isArray(n) ? n : []);
  }

  // Refresh stats for selected campaign
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(async () => {
      const s = await req(`/api/dialler/campaigns/${selected.id}/stats`).catch(() => null);
      setStats(s);
      // Refresh campaign status
      const updated = await req(`/api/dialler/campaigns`).catch(() => null);
      if (updated) {
        setCampaigns(updated);
        const found = updated.find(c => c.id === selected.id);
        if (found) setSelected(found);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [selected?.id]);

  // WebSocket live feed
  useWebSocket(useCallback((evt) => {
    const diallerEvents = ['dialler.calling','dialler.answered','dialler.transferred','dialler.no_answer','dialler.completed','dialler.paused','dialler.stopped','dialler.started'];
    if (diallerEvents.includes(evt.event)) {
      setLiveFeed(prev => [{
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        event: evt.event.replace('dialler.', ''),
        phone: evt.phone || '',
        name: evt.name || '',
      }, ...prev].slice(0, 50));
      loadCampaigns();
    }
  }, []));

  async function createCampaign() {
    const payload = {
      name: form.name,
      messageText: form.messageText || null,
      audioUrl: form.audioUrl || null,
      press1QueueId: form.press1QueueId || null,
      trunkId: form.useCustomSip ? null : (form.trunkId || null),
      customSipHost: form.useCustomSip ? form.customSipHost : null,
      customSipUser: form.useCustomSip ? form.customSipUser : null,
      customSipPass: form.useCustomSip ? form.customSipPass : null,
      callerId: form.callerId || null,
      callsPerMinute: parseInt(form.callsPerMinute) || 10,
    };
    const created = await req('/api/dialler/campaigns', { method: 'POST', body: payload });
    await loadCampaigns();
    setShowCreate(false);
    setSelected(created);
    setForm({ name:'', messageText:'', audioUrl:'', press1QueueId:'', trunkId:'', callerId:'', callsPerMinute:10, useCustomSip:false, customSipHost:'', customSipUser:'', customSipPass:'' });
  }

  async function uploadCSV(campaignId) {
    if (!fileRef.current?.files[0]) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('csv', fileRef.current.files[0]);
      const res = await fetch(`${API}/api/dialler/campaigns/${campaignId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUploadResult(data);
      const n = await req(`/api/dialler/campaigns/${campaignId}/numbers`).catch(() => []);
      setNumbers(n);
      await loadCampaigns();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally { setUploading(false); }
  }

  async function action(campaignId, act) {
    await req(`/api/dialler/campaigns/${campaignId}/${act}`, { method: 'POST' });
    await loadCampaigns();
    if (selected?.id === campaignId) {
      const updated = campaigns.find(c => c.id === campaignId);
      if (updated) setSelected(updated);
    }
  }

  async function deleteCampaign(id) {
    if (!confirm('Delete this campaign?')) return;
    await req(`/api/dialler/campaigns/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    await loadCampaigns();
  }

  const s = { color: '#e2e8f0', background: '#0f1117', minHeight: '100vh', fontFamily: 'Inter, sans-serif' };
  const card = { background: '#1a1d27', border: '1px solid #2e3352', borderRadius: '12px', padding: '20px' };
  const input = { width: '100%', padding: '10px 12px', background: '#13161f', border: '1px solid #2e3352', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' };
  const label = { display: 'block', color: '#8892aa', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };
  const btn = (bg, text = 'white') => ({ padding: '8px 16px', background: bg, color: text, border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' });

  return (
    <div style={s}>
      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ color: 'white', fontSize: '1.25rem', fontWeight: '700', margin: 0 }}>Auto Dialler (P1)</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '4px' }}>Upload a CSV and auto-dial with message + key-press transfer</p>
          </div>
          <button onClick={() => setShowCreate(true)} style={btn('#2563eb')}>+ New campaign</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
          {/* Campaign list */}
          <div>
            <div style={{ color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Campaigns</div>
            {campaigns.length === 0 && (
              <div style={{ ...card, textAlign: 'center', color: '#475569', padding: '32px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📞</div>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>No campaigns yet</p>
              </div>
            )}
            {campaigns.map(c => {
              const sc = STATUS_COLORS[c.status] || STATUS_COLORS.ready;
              return (
                <div
                  key={c.id}
                  onClick={() => selectCampaign(c)}
                  style={{
                    ...card,
                    marginBottom: '8px',
                    cursor: 'pointer',
                    borderColor: selected?.id === c.id ? '#2563eb' : '#2e3352',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: '600', color: 'white', fontSize: '0.875rem', marginBottom: '4px' }}>{c.name}</div>
                    <span style={{ fontSize: '0.65rem', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                      {c.status}
                    </span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                    {c.total_numbers} numbers · {c.calls_made} called · {c.calls_transferred} transferred
                  </div>
                  <ProgressBar value={c.calls_made} max={c.total_numbers} color={c.status === 'running' ? '#2563eb' : '#475569'} />
                </div>
              );
            })}
          </div>

          {/* Campaign detail */}
          <div>
            {!selected ? (
              <div style={{ ...card, textAlign: 'center', color: '#475569', padding: '48px' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📋</div>
                <p style={{ margin: 0 }}>Select a campaign to manage it</p>
              </div>
            ) : (
              <div>
                {/* Campaign header */}
                <div style={{ ...card, marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ color: 'white', margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>{selected.name}</h2>
                      {selected.queue_name && (
                        <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '4px' }}>Press 1 → {selected.queue_name}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {selected.status === 'ready' || selected.status === 'paused' ? (
                        <button onClick={() => action(selected.id, 'start')} style={btn('#16a34a')}>▶ Start</button>
                      ) : null}
                      {selected.status === 'running' ? (
                        <button onClick={() => action(selected.id, 'pause')} style={btn('#d97706')}>⏸ Pause</button>
                      ) : null}
                      {['running','paused'].includes(selected.status) ? (
                        <button onClick={() => action(selected.id, 'stop')} style={btn('#dc2626')}>⏹ Stop</button>
                      ) : null}
                      <button onClick={() => deleteCampaign(selected.id)} style={btn('#1a1d27', '#f87171')}>Delete</button>
                    </div>
                  </div>

                  {/* Stats */}
                  {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                      <StatBox label="Total" value={stats.total} />
                      <StatBox label="Pending" value={stats.pending} color="#94a3b8" />
                      <StatBox label="Calling" value={stats.calling} color="#60a5fa" />
                      <StatBox label="Answered" value={stats.answered} color="#4ade80" />
                      <StatBox label="Transferred" value={stats.transferred} color="#818cf8" />
                      <StatBox label="Failed" value={parseInt(stats.failed||0)+parseInt(stats.no_answer||0)+parseInt(stats.busy||0)} color="#f87171" />
                    </div>
                  )}

                  {stats && parseInt(stats.total) > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Progress</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                          {stats.total - stats.pending} / {stats.total}
                        </span>
                      </div>
                      <ProgressBar
                        value={parseInt(stats.total) - parseInt(stats.pending)}
                        max={parseInt(stats.total)}
                        color="#2563eb"
                      />
                    </div>
                  )}
                </div>

                {/* CSV upload */}
                {selected.status === 'ready' && (
                  <div style={{ ...card, marginBottom: '16px' }}>
                    <div style={{ color: 'white', fontWeight: '600', fontSize: '0.875rem', marginBottom: '12px' }}>Upload CSV</div>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '12px' }}>
                      CSV format: phone_number, name (optional). First column must be the number. UK numbers starting with 0 are auto-converted to +44.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv"
                        style={{ flex: 1, ...input }}
                      />
                      <button
                        onClick={() => uploadCSV(selected.id)}
                        disabled={uploading}
                        style={btn('#2563eb')}
                      >
                        {uploading ? 'Uploading…' : '⬆ Upload'}
                      </button>
                    </div>
                    {uploadResult && (
                      <div style={{ marginTop: '10px', color: '#4ade80', fontSize: '0.8rem', background: '#0f2010', border: '1px solid #166534', borderRadius: '8px', padding: '10px' }}>
                        ✅ {uploadResult.numbersLoaded} numbers loaded.
                        Preview: {uploadResult.preview?.map(p => p.phone).join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Live feed + numbers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Live feed */}
                  <div style={card}>
                    <div style={{ color: 'white', fontWeight: '600', fontSize: '0.875rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selected.status === 'running' ? '#4ade80' : '#475569', display: 'inline-block' }} />
                      Live feed
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '0.75rem' }}>
                      {liveFeed.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: '16px' }}>No events yet</div>}
                      {liveFeed.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', padding: '4px 0', borderBottom: '1px solid #1e2235' }}>
                          <span style={{ color: '#475569', flexShrink: 0 }}>{e.time}</span>
                          <span style={{
                            color: e.event === 'transferred' ? '#818cf8' : e.event === 'answered' ? '#4ade80' : e.event === 'calling' ? '#60a5fa' : '#f87171',
                            flexShrink: 0, fontWeight: '600', minWidth: '80px',
                          }}>{e.event}</span>
                          <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{e.phone}</span>
                          {e.name && <span style={{ color: '#64748b' }}>{e.name}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Number list */}
                  <div style={card}>
                    <div style={{ color: 'white', fontWeight: '600', fontSize: '0.875rem', marginBottom: '12px' }}>
                      Numbers ({numbers.length})
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '0.75rem' }}>
                      {numbers.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: '16px' }}>No numbers loaded</div>}
                      {numbers.map(n => {
                        const statusColor = {
                          pending: '#64748b', calling: '#60a5fa', answered: '#4ade80',
                          transferred: '#818cf8', failed: '#f87171', no_answer: '#f59e0b', busy: '#f59e0b',
                        }[n.status] || '#64748b';
                        return (
                          <div key={n.id} style={{ display: 'flex', gap: '10px', padding: '4px 0', borderBottom: '1px solid #1e2235', alignItems: 'center' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                            <span style={{ color: '#94a3b8', fontFamily: 'monospace', flex: 1 }}>{n.phone_number}</span>
                            {n.name && <span style={{ color: '#64748b' }}>{n.name}</span>}
                            <span style={{ color: statusColor, fontSize: '0.65rem', textTransform: 'uppercase' }}>{n.status}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create campaign modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ ...card, width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'white', margin: 0, fontSize: '1rem', fontWeight: '700' }}>New dialler campaign</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={label}>Campaign name *</label>
                <input style={input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Summer promo" />
              </div>

              <div>
                <label style={label}>Message (text-to-speech) *</label>
                <textarea
                  style={{ ...input, minHeight: '80px', resize: 'vertical' }}
                  value={form.messageText}
                  onChange={e => setForm({...form, messageText: e.target.value})}
                  placeholder="Hello, this is a message from CloudCall. Press 1 to speak with an agent."
                />
              </div>

              <div>
                <label style={label}>Or audio file URL (overrides text)</label>
                <input style={input} value={form.audioUrl} onChange={e => setForm({...form, audioUrl: e.target.value})} placeholder="https://yourserver.com/message.mp3" />
              </div>

              <div>
                <label style={label}>Press 1 → transfer to queue</label>
                <select style={input} value={form.press1QueueId} onChange={e => setForm({...form, press1QueueId: e.target.value})}>
                  <option value="">Select queue…</option>
                  {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </div>

              <div>
                <label style={label}>Caller ID (outbound number)</label>
                <input style={input} value={form.callerId} onChange={e => setForm({...form, callerId: e.target.value})} placeholder="+441234567890" />
              </div>

              <div>
                <label style={label}>Calls per minute</label>
                <input type="number" style={input} value={form.callsPerMinute} onChange={e => setForm({...form, callsPerMinute: e.target.value})} min={1} max={60} />
              </div>

              {/* SIP selection */}
              <div>
                <label style={{ ...label, marginBottom: '10px' }}>SIP trunk</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                  <input type="checkbox" checked={form.useCustomSip} onChange={e => setForm({...form, useCustomSip: e.target.checked})} />
                  <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Use custom SIP credentials</span>
                </label>

                {!form.useCustomSip ? (
                  <select style={input} value={form.trunkId} onChange={e => setForm({...form, trunkId: e.target.value})}>
                    <option value="">Use default trunk</option>
                    {trunks.map(t => <option key={t.id} value={t.id}>{t.name} ({t.registrar})</option>)}
                  </select>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input style={input} value={form.customSipHost} onChange={e => setForm({...form, customSipHost: e.target.value})} placeholder="SIP host (e.g. sip.provider.com)" />
                    <input style={input} value={form.customSipUser} onChange={e => setForm({...form, customSipUser: e.target.value})} placeholder="SIP username" />
                    <input type="password" style={input} value={form.customSipPass} onChange={e => setForm({...form, customSipPass: e.target.value})} placeholder="SIP password" />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
                <button onClick={() => setShowCreate(false)} style={{ ...btn('#22263a', '#94a3b8'), border: '1px solid #2e3352' }}>Cancel</button>
                <button onClick={createCampaign} disabled={!form.name || !form.messageText} style={btn('#2563eb')}>Create campaign</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
