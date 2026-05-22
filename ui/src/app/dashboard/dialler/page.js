API is running fine — 304 means it's returning cached data successfully. The console fetch is working but returning cached/empty.
Let me just build the improved dialler page with validation directly. Go to:
https://github.com/johnnycvv/test/edit/main/ui/src/app/dashboard/dialler/page.js
Select all, delete, paste this:

'use client';
import { useState, useEffect, useRef } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
const tok = () => localStorage.getItem('cc_token');
const apiFetch = (path, opts={}) => fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json', ...(opts.headers||{}) } }).then(r => r.json());
function validateNumber(num) {
let n = num.replace(/[\s-().]/g, '');
if (n.startsWith('00')) n = '+' + n.slice(2);
else if (n.startsWith('0')) n = '+44' + n.slice(1);
else if (!n.startsWith('+')) n = '+' + n;
if (n.match(/+440/)) n = n.replace('+440', '+44');
return /^+\d{10,14}$/.test(n) ? n : null;
}
export default function DiallerPage() {
const [campaigns, setCampaigns]   = useState([]);
const [trunks, setTrunks]         = useState([]);
const [queues, setQueues]         = useState([]);
const [loading, setLoading]       = useState(true);
const [showCreate, setShowCreate] = useState(false);
const [selected, setSelected]     = useState(null);
const [csvPreview, setCsvPreview] = useState([]);
const [csvErrors, setCsvErrors]   = useState([]);
const [csvFile, setCsvFile]       = useState(null);
const [uploading, setUploading]   = useState(false);
const [starting, setStarting]     = useState(false);
const [liveFeed, setLiveFeed]     = useState([]);
const [form, setForm]             = useState({ name:'', messageText:'', press1QueueId:'', trunkId:'', callerId:'', callsPerMinute:10 });
const [saving, setSaving]         = useState(false);
const [error, setError]           = useState('');
const wsRef                       = useRef(null);
const fileRef                     = useRef(null);
async function load() {
try {
const [c, t, q] = await Promise.all([apiFetch('/api/dialler/campaigns'), apiFetch('/api/trunks'), apiFetch('/api/queues')]);
setCampaigns(Array.isArray(c) ? c : []);
setTrunks(Array.isArray(t) ? t : []);
setQueues(Array.isArray(q) ? q : []);
} catch(e) { console.error(e); }
setLoading(false);
}
useEffect(() => {
load();
const ws = new WebSocket((process.env.NEXT_PUBLIC_WS_URL || 'wss://cloudcall-api.onrender.com') + '/ws?token=' + tok());
ws.onmessage = (e) => {
try {
const msg = JSON.parse(e.data);
if (msg.event && msg.event.startsWith('dialler.')) {
setLiveFeed(f => [{ time: new Date().toLocaleTimeString(), event: msg.event.replace('dialler.',''), phone: msg.phone||'', name: msg.name||'' }, ...f.slice(0,49)]);
load();
}
} catch(err) {}
};
wsRef.current = ws;
return () => ws.close();
}, []);
function handleCsvFile(file) {
setCsvFile(file);
setCsvPreview([]);
setCsvErrors([]);
const reader = new FileReader();
reader.onload = (e) => {
const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
const startIdx = lines[0] && !/^+?[\d\s()-]+$/.test(lines[0].split(',')[0]) ? 1 : 0;
const preview = [];
const errors = [];
lines.slice(startIdx).forEach((line, idx) => {
const parts = line.split(',');
const raw = parts[0].replace(/[\s-()]/g,'').trim();
const validated = validateNumber(raw);
if (validated) {
preview.push({ raw, validated, name: parts[1]||'', ok: true });
} else {
errors.push('Row ' + (idx + startIdx + 2) + ': "' + raw + '" is not a valid phone number');
preview.push({ raw, validated: null, name: parts[1]||'', ok: false });
}
});
setCsvPreview(preview.slice(0, 10));
setCsvErrors(errors.slice(0, 5));
};
reader.readAsText(file);
}
async function createCampaign() {
setSaving(true); setError('');
try {
const result = await apiFetch('/api/dialler/campaigns', { method:'POST', body: JSON.stringify({ name:form.name, messageText:form.messageText, press1QueueId:form.press1QueueId||null, trunkId:form.trunkId||null, callerId:form.callerId||null, callsPerMinute:form.callsPerMinute }) });
if (result.error) throw new Error(result.error);
if (csvFile) {
const fd = new FormData();
fd.append('csv', csvFile);
const res = await fetch(API + '/api/dialler/campaigns/' + result.id + '/upload', { method:'POST', headers:{ Authorization:'Bearer '+tok() }, body: fd });
const up = await res.json();
if (up.error) throw new Error(up.error);
}
await load();
setShowCreate(false);
setForm({ name:'', messageText:'', press1QueueId:'', trunkId:'', callerId:'', callsPerMinute:10 });
setCsvFile(null); setCsvPreview([]); setCsvErrors([]);
} catch(e) { setError(e.message); } finally { setSaving(false); }
}
async function startCampaign(id) {
setStarting(id);
const r = await apiFetch('/api/dialler/campaigns/' + id + '/start', { method:'POST' });
if (r.error) alert(r.error);
await load();
setStarting(null);
}
async function pauseCampaign(id) {
await apiFetch('/api/dialler/campaigns/' + id + '/pause', { method:'POST' });
await load();
}
async function stopCampaign(id) {
if (!confirm('Stop this campaign?')) return;
await apiFetch('/api/dialler/campaigns/' + id + '/stop', { method:'POST' });
await load();
}
async function deleteCampaign(id) {
if (!confirm('Delete this campaign permanently?')) return;
await apiFetch('/api/dialler/campaigns/' + id, { method:'DELETE' });
await load();
}
const statusColor = { ready:'#60a5fa', running:'#00ff41', paused:'#ffaa00', stopped:'#ff4444', completed:'#94a3b8' };
const inp = { width:'100%', padding:'8px 12px', background:'#13161f', border:'1px solid #2e3352', borderRadius:'6px', color:'#e2e8f0', fontSize:'0.875rem', outline:'none', marginTop:'4px' };
const lbl = { display:'block', fontSize:'0.8rem', color:'#8892aa', marginBottom:'2px' };
const btnP = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 };
const btnS = { padding:'8px 16px', background:'#1e2235', color:'#e2e8f0', border:'1px solid #2e3352', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem' };
const btnG = { padding:'4px 10px', background:'rgba(0,255,65,0.06)', color:'#00aa2a', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
const btnD = { padding:'4px 10px', background:'rgba(220,38,38,0.15)', color:'#f87171', border:'1px solid rgba(220,38,38,0.3)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
const btnO = { padding:'4px 10px', background:'rgba(251,191,36,0.1)', color:'#fbbf24', border:'1px solid rgba(251,191,36,0.3)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'200px',color:'#006614',fontFamily:'monospace'}}>[ LOADING DIALLER... ]</div>;
return (
<div style={{padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
<div>
<h1 style={{fontSize:'1.25rem',fontWeight:700,color:'#00ff41',fontFamily:'monospace',letterSpacing:'0.1em'}}>[P1 AUTO DIALLER]</h1>
<p style={{fontSize:'0.8rem',color:'#006614',marginTop:'2px',fontFamily:'monospace'}}>// Automated outbound calling campaigns</p>
</div>
<button style={btnP} onClick={() => setShowCreate(true)}>+ New campaign</button>
</div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:'20px'}}>
    <div>
      <div style={{background:'rgba(0,8,0,0.9)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'8px',overflow:'hidden',marginBottom:'20px'}}>
        {campaigns.length === 0 ? (
          <div style={{textAlign:'center',padding:'48px',color:'#006614',fontFamily:'monospace'}}>
            <div style={{fontSize:'2rem',marginBottom:'12px'}}>📞</div>
            <div>NO CAMPAIGNS YET</div>
          </div>
        ) : campaigns.map(c => (
          <div key={c.id} style={{padding:'16px',borderBottom:'1px solid rgba(0,255,65,0.06)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
              <div>
                <div style={{color:'#00ff41',fontFamily:'monospace',fontWeight:600,fontSize:'0.95rem'}}>{c.name}</div>
                <div style={{color:'#64748b',fontSize:'0.75rem',marginTop:'2px',fontFamily:'monospace'}}>Press 1 → {c.queue_name||'—'}</div>
                {c.message_text && <div style={{color:'#475569',fontSize:'0.75rem',marginTop:'4px',fontStyle:'italic'}}>"{c.message_text.slice(0,60)}{c.message_text.length>60?'...':''}"</div>}
              </div>
              <span style={{padding:'2px 10px',borderRadius:'12px',fontSize:'0.7rem',fontFamily:'monospace',background:(statusColor[c.status]||'#64748b')+'18',color:statusColor[c.status]||'#64748b',border:'1px solid '+(statusColor[c.status]||'#64748b')+'44'}}>
                {c.status}
              </span>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginBottom:'12px'}}>
              {[['Total',c.total_numbers],['Pending',parseInt(c.total_numbers||0)-parseInt(c.calls_made||0)],['Answered',c.calls_answered||0],['Transferred',c.calls_transferred||0],['Failed',c.calls_failed||0]].map(([l,v])=>(
                <div key={l} style={{background:'rgba(0,15,0,0.6)',borderRadius:'6px',padding:'8px',textAlign:'center'}}>
                  <div style={{color:'#00ff41',fontFamily:'monospace',fontSize:'1rem',fontWeight:700}}>{v}</div>
                  <div style={{color:'#475569',fontSize:'0.65rem',marginTop:'2px'}}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{marginBottom:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',color:'#475569',marginBottom:'4px'}}>
                <span>Progress</span>
                <span>{c.calls_made||0} / {c.total_numbers||0}</span>
              </div>
              <div style={{height:'4px',background:'#1e2235',borderRadius:'2px',overflow:'hidden'}}>
                <div style={{height:'100%',background:'#00ff41',borderRadius:'2px',width:(c.total_numbers>0?Math.round(((c.calls_made||0)/c.total_numbers)*100):0)+'%',transition:'width 0.5s'}}/>
              </div>
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              {c.status === 'ready' && <button style={btnP} onClick={() => startCampaign(c.id)} disabled={starting===c.id}>{starting===c.id?'Starting...':'▶ Start'}</button>}
              {c.status === 'running' && <button style={btnO} onClick={() => pauseCampaign(c.id)}>⏸ Pause</button>}
              {c.status === 'paused' && <button style={btnP} onClick={() => startCampaign(c.id)}>▶ Resume</button>}
              {['running','paused'].includes(c.status) && <button style={btnD} onClick={() => stopCampaign(c.id)}>■ Stop</button>}
              <button style={btnD} onClick={() => deleteCampaign(c.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div>
      <div style={{background:'rgba(0,8,0,0.9)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'8px',padding:'16px'}}>
        <div style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.8rem',letterSpacing:'0.1em',marginBottom:'12px'}}>// LIVE FEED</div>
        {liveFeed.length === 0 ? (
          <div style={{color:'#003300',fontFamily:'monospace',fontSize:'0.75rem',textAlign:'center',padding:'20px'}}>No activity yet</div>
        ) : liveFeed.map((f,i) => (
          <div key={i} style={{padding:'6px 0',borderBottom:'1px solid rgba(0,255,65,0.06)',fontFamily:'monospace',fontSize:'0.72rem'}}>
            <span style={{color:'#475569'}}>{f.time} </span>
            <span style={{color:f.event==='answered'?'#00ff41':f.event==='failed'?'#ff4444':'#fbbf24'}}>{f.event}</span>
            {f.phone && <span style={{color:'#64748b'}}> {f.phone}</span>}
          </div>
        ))}
      </div>
    </div>
  </div>

  {showCreate && (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px',overflowY:'auto'}}>
      <div style={{width:'100%',maxWidth:'560px',background:'rgba(0,8,0,0.97)',border:'1px solid rgba(0,255,65,0.3)',borderRadius:'8px',padding:'24px',margin:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
          <h2 style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.9rem',fontWeight:'bold'}}>[ NEW CAMPAIGN ]</h2>
          <button onClick={() => setShowCreate(false)} style={{background:'none',border:'none',color:'#006614',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:'14px',maxHeight:'70vh',overflowY:'auto',paddingRight:'4px'}}>
          <div><label style={lbl}>Campaign name *</label><input style={inp} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. May Outreach"/></div>

          <div><label style={lbl}>Message to play *</label>
            <textarea style={{...inp,minHeight:'80px',resize:'vertical'}} value={form.messageText} onChange={e=>setForm({...form,messageText:e.target.value})} placeholder="e.g. Hello, this is a message from CloudCall. Press 1 to speak with an agent."/>
            <div style={{fontSize:'0.7rem',color:'#475569',marginTop:'4px'}}>This message will be played when the call is answered. Tell callers to press 1.</div>
          </div>

          <div>
            <label style={lbl}>Press 1 → Transfer to queue</label>
            <select style={inp} value={form.press1QueueId} onChange={e=>setForm({...form,press1QueueId:e.target.value})}>
              <option value="">Select queue...</option>
              {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>SIP trunk</label>
            <select style={inp} value={form.trunkId} onChange={e=>setForm({...form,trunkId:e.target.value})}>
              <option value="">Select trunk...</option>
              {trunks.map(t => <option key={t.id} value={t.id}>{t.name || t.registrar}</option>)}
            </select>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
            <div>
              <label style={lbl}>Caller ID</label>
              <input style={inp} value={form.callerId} onChange={e=>setForm({...form,callerId:e.target.value})} placeholder="+441224460387"/>
              <div style={{fontSize:'0.7rem',color:'#475569',marginTop:'4px'}}>Must match your SIP provider number</div>
            </div>
            <div>
              <label style={lbl}>Calls per minute</label>
              <input type="number" style={inp} value={form.callsPerMinute} onChange={e=>setForm({...form,callsPerMinute:parseInt(e.target.value)})} min={1} max={60}/>
            </div>
          </div>

          <div>
            <label style={lbl}>Upload number list (CSV) *</label>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>{ if(e.target.files[0]) handleCsvFile(e.target.files[0]); }}/>
            <button type="button" onClick={()=>fileRef.current.click()} style={{...btnG,padding:'8px 14px',marginTop:'6px'}}>
              {csvFile ? '✓ ' + csvFile.name : '📁 Choose CSV file'}
            </button>

            <div style={{marginTop:'8px',background:'rgba(0,15,0,0.5)',border:'1px solid rgba(0,255,65,0.1)',borderRadius:'6px',padding:'10px',fontSize:'0.75rem',fontFamily:'monospace'}}>
              <div style={{color:'#006614',marginBottom:'6px'}}>// CSV FORMAT RULES</div>
              <div style={{color:'#475569',lineHeight:'1.8'}}>
                • One number per line<br/>
                • UK: 07700900123 or +447700900123<br/>
                • International: +12125550100<br/>
                • Optional name: 07700900123,John Smith<br/>
                • Do NOT include country code twice (e.g. +4407...)<br/>
                • Header row is auto-detected and skipped
              </div>
            </div>

            {csvErrors.length > 0 && (
              <div style={{marginTop:'8px',background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:'6px',padding:'10px'}}>
                <div style={{color:'#f87171',fontFamily:'monospace',fontSize:'0.75rem',marginBottom:'6px'}}>⚠ {csvErrors.length} invalid number(s) found:</div>
                {csvErrors.map((e,i) => <div key={i} style={{color:'#f87171',fontSize:'0.72rem',fontFamily:'monospace'}}>{e}</div>)}
                <div style={{color:'#f59e0b',fontSize:'0.7rem',marginTop:'6px'}}>Invalid numbers will be skipped automatically.</div>
              </div>
            )}

            {csvPreview.length > 0 && (
              <div style={{marginTop:'8px',background:'rgba(0,15,0,0.5)',border:'1px solid rgba(0,255,65,0.1)',borderRadius:'6px',padding:'10px'}}>
                <div style={{color:'#006614',fontFamily:'monospace',fontSize:'0.72rem',marginBottom:'6px'}}>// PREVIEW (first {csvPreview.length} rows)</div>
                {csvPreview.map((n,i) => (
                  <div key={i} style={{display:'flex',gap:'8px',alignItems:'center',padding:'2px 0',fontFamily:'monospace',fontSize:'0.72rem'}}>
                    <span style={{color:n.ok?'#00ff41':'#ff4444'}}>{n.ok?'✓':'✗'}</span>
                    <span style={{color:n.ok?'#00ff41':'#ff4444'}}>{n.validated||n.raw}</span>
                    {n.name && <span style={{color:'#475569'}}>{n.name}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{color:'#f87171',background:'rgba(220,38,38,0.1)',padding:'10px 12px',borderRadius:'6px',fontSize:'0.8rem'}}>{error}</div>}

          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',paddingTop:'8px'}}>
            <button style={btnS} onClick={() => setShowCreate(false)}>Cancel</button>
            <button style={btnP} onClick={createCampaign} disabled={saving||!form.name||!form.messageText||!csvFile||csvPreview.filter(n=>n.ok).length===0}>
              {saving ? 'Creating...' : 'Create campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )}
</div>
);
}
