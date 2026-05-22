'use client';
import { useState, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
const tok = () => localStorage.getItem('cc_token');
const apiFetch = (path, opts={}) => fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json', ...(opts.headers||{}) } }).then(r => r.json());
const COUNTRY_FLAGS = { GB:'🇬🇧', US:'🇺🇸', AU:'🇦🇺', DE:'🇩🇪', FR:'🇫🇷', NL:'🇳🇱', CA:'🇨🇦', IN:'🇮🇳', SG:'🇸🇬' };
const inputStyle = { width:'100%', padding:'8px 12px', background:'#13161f', border:'1px solid #2e3352', borderRadius:'6px', color:'#e2e8f0', fontSize:'0.875rem', outline:'none', marginTop:'4px' };
const labelStyle = { display:'block', fontSize:'0.8rem', color:'#8892aa', marginBottom:'2px' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 };
const btnSecondary = { padding:'8px 16px', background:'#1e2235', color:'#e2e8f0', border:'1px solid #2e3352', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem' };
const btnDanger = { padding:'4px 10px', background:'rgba(220,38,38,0.15)', color:'#f87171', border:'1px solid rgba(220,38,38,0.3)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
const btnGhost = { padding:'4px 10px', background:'rgba(0,255,65,0.06)', color:'#00aa2a', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
export default function DidsPage() {
const [dids, setDids]             = useState([]);
const [queues, setQueues]         = useState([]);
const [agents, setAgents]         = useState([]);
const [loading, setLoading]       = useState(true);
const [showAdd, setShowAdd]       = useState(false);
const [assignDid, setAssignDid]   = useState(null);
const [form, setForm]             = useState({ number:'', countryCode:'GB', description:'' });
const [assignForm, setAssignForm] = useState({ type:'queue', targetId:'' });
const [saving, setSaving]         = useState(false);
const [error, setError]           = useState('');
async function load() {
try {
const [d, q, a] = await Promise.all([apiFetch('/api/dids'), apiFetch('/api/queues'), apiFetch('/api/agents')]);
setDids(Array.isArray(d) ? d : []);
setQueues(Array.isArray(q) ? q : []);
setAgents(Array.isArray(a) ? a : []);
} catch(e) { console.error(e); }
setLoading(false);
}
useEffect(() => { load(); }, []);
async function addDid() {
setSaving(true); setError('');
try {
const r = await apiFetch('/api/dids', { method:'POST', body: JSON.stringify(form) });
if (r.error) throw new Error(r.error);
await load(); setShowAdd(false); setForm({ number:'', countryCode:'GB', description:'' });
} catch(e) { setError(e.message); } finally { setSaving(false); }
}
async function assign() {
setSaving(true); setError('');
try {
const r = await apiFetch('/api/dids/' + assignDid.id + '/assign', { method:'PATCH', body: JSON.stringify({ type: assignForm.type||null, targetId: assignForm.targetId||null }) });
if (r.error) throw new Error(r.error);
await load(); setAssignDid(null);
} catch(e) { setError(e.message); } finally { setSaving(false); }
}
async function del(id) {
if (!confirm('Delete this DID?')) return;
await apiFetch('/api/dids/' + id, { method:'DELETE' });
await load();
}
const getTargets = () => assignForm.type === 'queue' ? queues.map(q=>({id:q.id,label:q.name})) : agents.map(a=>({id:a.id,label:a.display_name}));
if (loading) return (
<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'200px',color:'#006614',fontFamily:'monospace',letterSpacing:'0.1em'}}>[ LOADING DID NUMBERS... ]</div>
);
return (
<div style={{padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
<div>
<h1 style={{fontSize:'1.25rem',fontWeight:700,color:'#00ff41',fontFamily:'monospace',letterSpacing:'0.1em'}}>[DID NUMBERS]</h1>
<p style={{fontSize:'0.8rem',color:'#006614',marginTop:'2px',fontFamily:'monospace'}}>// Phone numbers assigned to your account</p>
</div>
<button style={btnPrimary} onClick={() => setShowAdd(true)}>+ Add number</button>
</div>
  <div style={{background:'rgba(0,8,0,0.9)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'8px',overflow:'hidden'}}>
    {dids.length === 0 ? (
      <div style={{textAlign:'center',padding:'48px',color:'#006614',fontFamily:'monospace'}}>
        <div style={{fontSize:'2rem',marginBottom:'12px'}}>📱</div>
        <div style={{letterSpacing:'0.1em'}}>NO DID NUMBERS CONFIGURED</div>
        <div style={{fontSize:'0.75rem',marginTop:'8px',color:'#003300'}}>Add your first phone number to start receiving calls</div>
      </div>
    ) : (
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.875rem'}}>
        <thead>
          <tr style={{background:'rgba(0,15,0,0.8)'}}>
            {['Number','Country','Description','Assigned to',''].map(h => (
              <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'#006614',fontFamily:'monospace',fontSize:'0.7rem',letterSpacing:'0.1em',borderBottom:'1px solid rgba(0,255,65,0.1)'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dids.map(d => (
            <tr key={d.id} style={{borderBottom:'1px solid rgba(0,255,65,0.06)'}}>
              <td style={{padding:'12px 14px',fontFamily:'monospace',fontWeight:600,color:'#00ff41'}}>{d.number}</td>
              <td style={{padding:'12px 14px',color:'#94a3b8'}}>{COUNTRY_FLAGS[d.country_code]||'🌐'} {d.country_code||'—'}</td>
              <td style={{padding:'12px 14px',color:'#64748b'}}>{d.description||'—'}</td>
              <td style={{padding:'12px 14px'}}>
                {d.assigned_to_type ? (
                  <span style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{padding:'2px 8px',borderRadius:'12px',fontSize:'0.7rem',fontFamily:'monospace',background:'rgba(96,165,250,0.1)',color:'#60a5fa',border:'1px solid rgba(96,165,250,0.2)'}}>{d.assigned_to_type}</span>
                    <span style={{fontSize:'0.875rem',color:'#94a3b8'}}>{d.assigned_name}</span>
                  </span>
                ) : <span style={{color:'#64748b',fontSize:'0.875rem'}}>Unassigned</span>}
              </td>
              <td style={{padding:'12px 14px'}}>
                <div style={{display:'flex',gap:'6px'}}>
                  <button style={btnGhost} onClick={() => { setAssignDid(d); setAssignForm({ type: d.assigned_to_type||'queue', targetId: d.assigned_to_id||'' }); }}>Assign</button>
                  <button style={btnDanger} onClick={() => del(d.id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>

  {showAdd && (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
      <div style={{width:'100%',maxWidth:'440px',background:'rgba(0,8,0,0.97)',border:'1px solid rgba(0,255,65,0.3)',borderRadius:'8px',padding:'24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
          <h2 style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.9rem',fontWeight:'bold',letterSpacing:'0.1em'}}>[ ADD DID NUMBER ]</h2>
          <button onClick={() => setShowAdd(false)} style={{background:'none',border:'none',color:'#006614',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div><label style={labelStyle}>Phone number (E.164) *</label><input style={inputStyle} value={form.number} onChange={e=>setForm({...form,number:e.target.value})} placeholder="+442079460001"/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
            <div>
              <label style={labelStyle}>Country</label>
              <select style={inputStyle} value={form.countryCode} onChange={e=>setForm({...form,countryCode:e.target.value})}>
                {Object.entries(COUNTRY_FLAGS).map(([code,flag]) => <option key={code} value={code}>{flag} {code}</option>)}
                <option value="">Other</option>
              </select>
            </div>
            <div><label style={labelStyle}>Description</label><input style={inputStyle} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Main UK line"/></div>
          </div>
          {error && <p style={{fontSize:'0.8rem',color:'#f87171',background:'rgba(220,38,38,0.1)',padding:'8px 12px',borderRadius:'6px'}}>{error}</p>}
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',paddingTop:'8px'}}>
            <button style={btnSecondary} onClick={() => setShowAdd(false)}>Cancel</button>
            <button style={btnPrimary} onClick={addDid} disabled={saving||!form.number}>{saving?'Adding...':'Add number'}</button>
          </div>
        </div>
      </div>
    </div>
  )}

  {assignDid && (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
      <div style={{width:'100%',maxWidth:'440px',background:'rgba(0,8,0,0.97)',border:'1px solid rgba(0,255,65,0.3)',borderRadius:'8px',padding:'24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
          <h2 style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.9rem',fontWeight:'bold',letterSpacing:'0.1em'}}>[ ASSIGN {assignDid.number} ]</h2>
          <button onClick={() => setAssignDid(null)} style={{background:'none',border:'none',color:'#006614',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div>
            <label style={labelStyle}>Route this number to</label>
            <select style={inputStyle} value={assignForm.type} onChange={e=>setAssignForm({type:e.target.value,targetId:''})}>
              <option value="queue">Call queue</option>
              <option value="agent">Agent (direct)</option>
              <option value="">Unassign</option>
            </select>
          </div>
          {assignForm.type && (
            <div>
              <label style={labelStyle}>Select {assignForm.type}</label>
              <select style={inputStyle} value={assignForm.targetId} onChange={e=>setAssignForm({...assignForm,targetId:e.target.value})}>
                <option value="">Choose...</option>
                {getTargets().map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          )}
          {error && <p style={{fontSize:'0.8rem',color:'#f87171',background:'rgba(220,38,38,0.1)',padding:'8px 12px',borderRadius:'6px'}}>{error}</p>}
          <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',paddingTop:'8px'}}>
            <button style={btnSecondary} onClick={() => setAssignDid(null)}>Cancel</button>
            <button style={btnPrimary} onClick={assign} disabled={saving||(assignForm.type&&!assignForm.targetId)}>{saving?'Saving...':'Save assignment'}</button>
          </div>
        </div>
      </div>
    </div>
  )}
</div>
);
}