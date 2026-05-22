'use client';
import { useState, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
const tok = () => localStorage.getItem('cc_token');
const apiFetch = (path, opts={}) => fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json', ...(opts.headers||{}) } }).then(r => r.json());
function Modal({ title, onClose, children }) {
return (
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
<div style={{width:'100%',maxWidth:'440px',background:'rgba(0,8,0,0.97)',border:'1px solid rgba(0,255,65,0.3)',borderRadius:'8px',padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
<h2 style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.9rem',fontWeight:'bold'}}>{title}</h2>
<button onClick={onClose} style={{background:'none',border:'none',color:'#006614',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
</div>
{children}
</div>
</div>
);
}
export default function QueuesPage() {
const [queues, setQueues]         = useState([]);
const [agents, setAgents]         = useState([]);
const [loading, setLoading]       = useState(true);
const [showCreate, setShowCreate] = useState(false);
const [editQueue, setEditQueue]   = useState(null);
const [viewQueue, setViewQueue]   = useState(null);
const [form, setForm]             = useState({ name:'', description:'', strategy:'round_robin', maxWaitSeconds:300, recordingEnabled:false, callbackEnabled:false });
const [saving, setSaving]         = useState(false);
const [error, setError]           = useState('');
async function load() {
try {
const [q, a] = await Promise.all([apiFetch('/api/queues'), apiFetch('/api/agents')]);
setQueues(Array.isArray(q) ? q : []);
setAgents(Array.isArray(a) ? a : []);
} catch(e) { console.error(e); }
setLoading(false);
}
useEffect(() => { load(); }, []);
async function save() {
setSaving(true); setError('');
try {
const body = JSON.stringify({ name:form.name, description:form.description, strategy:form.strategy, maxWaitSeconds:form.maxWaitSeconds, recordingEnabled:form.recordingEnabled, callbackEnabled:form.callbackEnabled });
if (editQueue) {
await apiFetch('/api/queues/' + editQueue.id, { method:'PATCH', body });
} else {
await apiFetch('/api/queues', { method:'POST', body });
}
await load();
setShowCreate(false); setEditQueue(null);
setForm({ name:'', description:'', strategy:'round_robin', maxWaitSeconds:300, recordingEnabled:false, callbackEnabled:false });
} catch(e) { setError(e.message); } finally { setSaving(false); }
}
async function deleteQ(id) {
if (!confirm('Delete this queue?')) return;
await apiFetch('/api/queues/' + id, { method:'DELETE' });
await load();
}
async function addAgent(queueId, userId) {
await apiFetch('/api/queues/' + queueId + '/agents', { method:'POST', body: JSON.stringify({ userId }) });
const q = await apiFetch('/api/queues/' + queueId);
setViewQueue(q);
}
async function removeAgent(queueId, userId) {
await apiFetch('/api/queues/' + queueId + '/agents/' + userId, { method:'DELETE' });
const q = await apiFetch('/api/queues/' + queueId);
setViewQueue(q);
}
function openEdit(q) {
setForm({ name:q.name, description:q.description||'', strategy:q.strategy, maxWaitSeconds:q.max_wait_seconds, recordingEnabled:q.recording_enabled, callbackEnabled:q.callback_enabled });
setEditQueue(q);
setShowCreate(true);
}
const inp = { width:'100%', padding:'8px 12px', background:'#13161f', border:'1px solid #2e3352', borderRadius:'6px', color:'#e2e8f0', fontSize:'0.875rem', outline:'none', marginTop:'4px' };
const lbl = { display:'block', fontSize:'0.8rem', color:'#8892aa', marginBottom:'2px' };
const btnP = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 };
const btnS = { padding:'8px 16px', background:'#1e2235', color:'#e2e8f0', border:'1px solid #2e3352', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem' };
const btnD = { padding:'4px 10px', background:'rgba(220,38,38,0.15)', color:'#f87171', border:'1px solid rgba(220,38,38,0.3)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
const btnG = { padding:'4px 10px', background:'rgba(0,255,65,0.06)', color:'#00aa2a', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'200px',color:'#006614',fontFamily:'monospace'}}>[ LOADING QUEUES... ]</div>;
return (
<div style={{padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
<div>
<h1 style={{fontSize:'1.25rem',fontWeight:700,color:'#00ff41',fontFamily:'monospace',letterSpacing:'0.1em'}}>[CALL QUEUES]</h1>
<p style={{fontSize:'0.8rem',color:'#006614',marginTop:'2px',fontFamily:'monospace'}}>// Manage inbound call distribution</p>
</div>
<button style={btnP} onClick={() => { setEditQueue(null); setShowCreate(true); }}>+ New queue</button>
</div>
  <div style={{background:'rgba(0,8,0,0.9)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'8px',overflow:'hidden'}}>
    {queues.length === 0 ? (
      <div style={{textAlign:'center',padding:'48px',color:'#006614',fontFamily:'monospace'}}>
        <div style={{fontSize:'2rem',marginBottom:'12px'}}>☎️</div>
        <div>NO QUEUES CONFIGURED</div>
      </div>
    ) : (
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.875rem'}}>
        <thead>
          <tr style={{background:'rgba(0,15,0,0.8)'}}>
            {['Queue','Strategy','Agents','Max wait','Recording','Load',''].map(h => (
              <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'#006614',fontFamily:'monospace',fontSize:'0.7rem',borderBottom:'1px solid rgba(0,255,65,0.1)'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {queues.map(q => (
            <tr key={q.id} style={{borderBottom:'1px solid rgba(0,255,65,0.06)'}}>
              <td style={{padding:'12px 14px'}}>
                <div style={{color:'#00ff41',fontFamily:'monospace',fontWeight:600}}>{q.name}</div>
                <div style={{fontSize:'0.75rem',color:'#006614'}}>{q.description}</div>
              </td>
              <td style={{padding:'12px 14px',color:'#94a3b8',fontFamily:'monospace',fontSize:'0.75rem'}}>{(q.strategy||'').replace('_',' ')}</td>
              <td style={{padding:'12px 14px',color:'#94a3b8'}}>{q.agentCount||0}</td>
              <td style={{padding:'12px 14px',color:'#94a3b8'}}>{Math.floor((q.max_wait_seconds||0)/60)}m</td>
              <td style={{padding:'12px 14px'}}>
                <span style={{padding:'2px 8px',borderRadius:'12px',fontSize:'0.7rem',background:q.recording_enabled?'rgba(0,255,65,0.1)':'rgba(100,116,139,0.1)',color:q.recording_enabled?'#00ff41':'#64748b'}}>
                  {q.recording_enabled?'ON':'OFF'}
                </span>
              </td>
              <td style={{padding:'12px 14px',color:'#64748b',fontSize:'0.75rem'}}>{q.active||0} active · {q.waiting||0} waiting</td>
              <td style={{padding:'12px 14px'}}>
                <div style={{display:'flex',gap:'6px'}}>
                  <button style={btnG} onClick={async () => { const full = await apiFetch('/api/queues/'+q.id); setViewQueue(full); }}>Agents</button>
                  <button style={btnG} onClick={() => openEdit(q)}>Edit</button>
                  <button style={btnD} onClick={() => deleteQ(q.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>

  {showCreate && (
    <Modal title={editQueue ? '[ EDIT QUEUE ]' : '[ NEW QUEUE ]'} onClose={() => { setShowCreate(false); setEditQueue(null); }}>
      <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
        <div><label style={lbl}>Queue name *</label><input style={inp} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Sales"/></div>
        <div><label style={lbl}>Description</label><input style={inp} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Optional"/></div>
        <div>
          <label style={lbl}>Strategy</label>
          <select style={inp} value={form.strategy} onChange={e=>setForm({...form,strategy:e.target.value})}>
            <option value="round_robin">Round robin</option>
            <option value="least_idle">Least idle</option>
            <option value="sequential">Sequential</option>
          </select>
        </div>
        <div><label style={lbl}>Max wait (seconds)</label><input type="number" style={inp} value={form.maxWaitSeconds} onChange={e=>setForm({...form,maxWaitSeconds:parseInt(e.target.value)})} min={30} max={3600}/></div>
        <div style={{display:'flex',gap:'24px'}}>
          <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.875rem',color:'#94a3b8',cursor:'pointer'}}>
            <input type="checkbox" checked={form.recordingEnabled} onChange={e=>setForm({...form,recordingEnabled:e.target.checked})}/>
            Enable recording
          </label>
          <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.875rem',color:'#94a3b8',cursor:'pointer'}}>
            <input type="checkbox" checked={form.callbackEnabled} onChange={e=>setForm({...form,callbackEnabled:e.target.checked})}/>
            Callback option
          </label>
        </div>
        {error && <p style={{fontSize:'0.8rem',color:'#f87171',background:'rgba(220,38,38,0.1)',padding:'8px 12px',borderRadius:'6px'}}>{error}</p>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',paddingTop:'8px'}}>
          <button style={btnS} onClick={()=>{setShowCreate(false);setEditQueue(null);}}>Cancel</button>
          <button style={btnP} onClick={save} disabled={saving||!form.name}>{saving?'Saving...':editQueue?'Save changes':'Create queue'}</button>
        </div>
      </div>
    </Modal>
  )}

  {viewQueue && (
    <Modal title={'[ AGENTS IN: ' + (viewQueue.name||'').toUpperCase() + ' ]'} onClose={() => setViewQueue(null)}>
      <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
        <div style={{maxHeight:'200px',overflowY:'auto'}}>
          {(viewQueue.agents||[]).length===0 && <p style={{fontSize:'0.875rem',color:'#64748b',textAlign:'center',padding:'16px'}}>No agents assigned</p>}
          {(viewQueue.agents||[]).map(a => (
            <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(0,255,65,0.08)'}}>
              <div>
                <div style={{fontSize:'0.875rem',color:'#e2e8f0'}}>{a.display_name}</div>
                <div style={{fontSize:'0.75rem',color:'#64748b'}}>{a.email}</div>
              </div>
              <button style={btnD} onClick={()=>removeAgent(viewQueue.id,a.id)}>Remove</button>
            </div>
          ))}
        </div>
        <div>
          <label style={lbl}>Add agent</label>
          <select style={inp} defaultValue="" onChange={e=>{if(e.target.value)addAgent(viewQueue.id,e.target.value);}}>
            <option value="">Select agent...</option>
            {agents.filter(a=>!(viewQueue.agents||[]).find(qa=>qa.id===a.id)).map(a=>(
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )}
</div>
);
}