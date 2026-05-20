'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function TrunksPage() {
  const [trunks, setTrunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', registrar: '', username: '', password: '', priority: 1 });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [error, setError] = useState('');

  async function load() { setTrunks(await api.getTrunks()); setLoading(false); }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setError('');
    try {
      await api.createTrunk(form);
      await load();
      setShowAdd(false);
      setForm({ name: '', registrar: '', username: '', password: '', priority: 1 });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function test(id) {
    setTesting(p => ({...p, [id]: true}));
    try {
      const res = await api.testTrunk(id);
      setTestResults(p => ({...p, [id]: res}));
      await load();
    } finally { setTesting(p => ({...p, [id]: false})); }
  }

  async function del(id) {
    if (!confirm('Delete this trunk?')) return;
    await api.deleteTrunk(id); await load();
  }

  function statusBadge(status) {
    const map = { registered: 'badge-green', active: 'badge-blue', inactive: 'badge-gray', failed: 'badge-red' };
    return <span className={map[status] || 'badge-gray'}>{status}</span>;
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">SIP trunks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Connect SIP providers for inbound and outbound calls</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add trunk</button>
      </div>

      {/* Trunk list */}
      <div className="space-y-3 mb-8">
        {trunks.length === 0 && (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔌</p>
            <p className="font-medium text-gray-600">No SIP trunks connected</p>
            <p className="text-sm mt-1">Add your first trunk to enable calling</p>
          </div>
        )}
        {trunks.map(trunk => (
          <div key={trunk.id} className="card p-5">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-gray-900">{trunk.name}</h3>
                  {statusBadge(trunk.status)}
                  <span className="text-xs text-gray-400">Priority {trunk.priority}</span>
                </div>
                <p className="text-sm text-gray-500">{trunk.registrar} · {trunk.username}</p>
                {trunk.last_registered_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last registered: {new Date(trunk.last_registered_at).toLocaleString()}
                  </p>
                )}
                {testResults[trunk.id] && (
                  <p className={`text-xs mt-1 ${testResults[trunk.id].ok ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults[trunk.id].ok
                      ? `✅ Connected · ${testResults[trunk.id].latencyMs}ms latency`
                      : '❌ Connection failed — check credentials'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  className="btn-secondary text-xs"
                  onClick={() => test(trunk.id)}
                  disabled={testing[trunk.id]}
                >
                  {testing[trunk.id] ? 'Testing…' : 'Test connection'}
                </button>
                <button className="btn-danger text-xs px-2 py-1" onClick={() => del(trunk.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add trunk form (inline when no modal) */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Add SIP trunk</h2>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1">✕</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Provider name *</label>
                  <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Twilio" />
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm({...form, priority: parseInt(e.target.value)})}>
                    <option value={1}>1 — Primary</option>
                    <option value={2}>2 — Failover</option>
                    <option value={3}>3 — Standby</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Registrar host *</label>
                <input className="input" value={form.registrar} onChange={e => setForm({...form, registrar: e.target.value})} placeholder="sip.provider.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">SIP username *</label>
                  <input className="input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="username" />
                </div>
                <div>
                  <label className="label">SIP password *</label>
                  <input type="password" className="input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
                </div>
              </div>
              <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3">
                <strong>Note:</strong> In production mode, this will register with your FreeSWITCH server. Credentials are encrypted at rest.
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn-primary" onClick={save} disabled={saving || !form.name || !form.registrar || !form.username || !form.password}>
                  {saving ? 'Saving…' : 'Add trunk'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
