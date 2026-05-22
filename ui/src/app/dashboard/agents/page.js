'use client';
import { useState, useEffect } from 'react';
import QrModal from '@/components/QrModal';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
const tok = () => localStorage.getItem('cc_token');
const apiFetch = (path, opts={}) => fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json', ...(opts.headers||{}) } }).then(r => r.json());
const inputStyle = { width:'100%', padding:'8px 12px', background:'#13161f', border:'1px solid #2e3352', borderRadius:'6px', color:'#e2e8f0', fontSize:'0.875rem', outline:'none', marginTop:'4px' };
const labelStyle = { display:'block', fontSize:'0.8rem', color:'#8892aa', marginBottom:'2px' };
const btnPrimary = { padding:'8px 16px', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem', fontWeight:600 };
const btnSecondary = { padding:'8px 16px', background:'#1e2235', color:'#e2e8f0', border:'1px solid #2e3352', borderRadius:'6px', cursor:'pointer', fontSize:'0.875rem' };
const btnDanger = { padding:'4px 10px', background:'rgba(220,38,38,0.15)', color:'#f87171', border:'1px solid rgba(220,38,38,0.3)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
const btnGhost = { padding:'4px 10px', background:'rgba(0,255,65,0.06)', color:'#00aa2a', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', cursor:'pointer', fontSize:'0.75rem' };
function Modal({ title, onClose, children }) {
return (
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
<div style={{width:'100%',maxWidth:'440px',background:'rgba(0,8,0,0.97)',border:'1px solid rgba(0,255,65,0.3)',borderRadius:'8px',padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
<h2 style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.9rem',fontWeight:'bold',letterSpacing:'0.1em'}}>{title}</h2>
<button onClick={onClose} style={{background:'none',border:'none',color:'#006614',cursor:'pointer',fontSize:'1.2rem'}}>✕</button>
</div>
{children}
</div>
</div>
);
}
function StatusBadge({ s }) {
const colors = { available:'#00ff41', on_call:'#ff4444', break:'#ffaa00', offline:'#333300' };
const color = colors[s] || '#333300';
return <span style={{padding:'2px 8px',borderRadius:'12px',fontSize:'0.7rem',fontFamily:'monospace',background:color+'18',color,border:'1px solid '+color+'44'}}>{(s||'offline').replace('_',' ')}</span>;
}
export default function AgentsPage() {
const [agents, setAgents]         = useState([]);
const [loading, setLoading]       = useState(true);
const [showInvite, setShowInvite] = useState(false);
const [qrAgent, setQrAgent]       = useState(null);
const [form, setForm]             = useState({ email:'', displayName:'', role:'agent', extension:'' });
const [saving, setSaving]         = useState(false);
const [error, setError]           = useState('');
async function load() {
try {
const a = await apiFetch('/api/agents');
setAgents(Array.isArray(a) ? a : []);
} catch(e) { console.error(e); }
setLoading(false);
}
useEffect(() => { load(); }, []);
async function invite() {
setSaving(true); setError('');
try {
const result = await apiFetch('/api/agents/invite', { method:'POST', body: JSON.stringify({ email: form.email, displayName: form.displayName, role: form.role, extension: form.extension }) });
if (result.error) throw new Error(result.error);
setShowInvite(false);
setForm({ email:'', displayName:'', role:'agent', extension:'' });
await load();
setQrAgent(result);
} catch(e) { setError(e.message); } finally { setSaving(false); }
}
async function deactivate(id) {
if (!confirm('Deactivate this agent?')) return;
await apiFetch('/api/agents/' + id, { method:'PATCH', body: JSON.stringify({ isActive: false }) });
await load();
}
if (loading) return (
<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'200px',color:'#006614',fontFamily:'monospace',letterSpacing:'0.1em'}}>[ LOADING AGENTS... ]</div>
);
return (
<div style={{padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
<div>
<h1 style={{fontSize:'1.25rem',fontWeight:700,color:'#00ff41',fontFamily:'monospace',letterSpacing:'0.1em'}}>[AGENTS]</h1>
<p style={{fontSize:'0.8rem',color:'#006614',marginTop:'2px',fontFamily:'monospace'}}>// {agents.length} users in your account</p>
</div>
<button style={btnPrimary} onClick={() => setShowInvite(true)}>+ Add agent</button>
</div>
  <div style={{background:'rgba(0,8,0,0.9)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'8px',overflow:'hidden'}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.875rem'}}>
      <thead>
        <tr style={{background:'rgba(0,15,0,0.8)'}}>
          {['Agent','Role','Extension','SIP Username','Status',''].map(h => (
            <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'#006614',fontFamily:'monospace',fontSize:'0.7rem',letterSpacing:'0.1em',borderBottom:'1px solid rgba(0,255,65,0.1)'}}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {agents.map(a => (
          <tr key={a.id} style={{borderBottom:'1px solid rgba(0,255,65,0.06)'}}>
            <td style={{padding:'12px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'rgba(0,255,65,0.08)',border:'1px solid rgba(0,255,65,0.2)',display:'flex',alignItems:'center',justifyContent:'center',color:'#00ff41',fontWeight:'bold',fontSize:'0.875rem',flexShrink:0}}>
                  {(a.display_name||'?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{color:'#e2e8f0',fontWeight:500}}>{a.display_name}</div>
                  <div style={{fontSize:'0.75rem',color:'#64748b'}}>{a.email}</div>
                </div>
              </div>
            </td>
            <td style={{padding:'12px 14px'}}><span style={{padding:'2px 8px',borderRadius:'12px',fontSize:'0.7rem',fontFamily:'monospace',background:'rgba(96,165,250,0.1)',color:'#60a5fa',border:'1px solid rgba(96,165,250,0.2)'}}>{a.role}</span></td>
            <td style={{padding:'12px 14px',fontFamily:'monospace',color:'#94a3b8'}}>{a.extension||'—'}</td>
            <td style={{padding:'12px 14px',fontFamily:'monospace',fontSize:'0.75rem',color:'#64748b'}}>{a.sip_username||'—'}</td>
            <td style={{padding:'12px 14px'}}><StatusBadge s={a.status}/></td>
            <td style={{padding:'12px 14px'}}>
              <div style={{display:'flex',gap:'6px'}}>
                <button style={btnGhost} onClick={() => setQrAgent(a)}>📱 QR</button>
                {a.is_active && <button style={btnDanger} onClick={() => deactivate(a.id)}>Deactivate</button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {showInvite && (
    <Modal title="[ ADD AGENT ]" onClose={() => setShowInvite(false)}>
      <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
        <div><label style={labelStyle}>Full name *</label><input style={inputStyle} value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Jane Smith"/></div>
        <div><label style={labelStyle}>Email address *</label><input type="email" style={inputStyle} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="jane@company.com"/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
          <div>
            <label style={labelStyle}>Role</label>
            <select style={inputStyle} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div><label style={labelStyle}>Extension</label><input style={inputStyle} value={form.extension} onChange={e=>setForm({...form,extension:e.target.value})} placeholder="200"/></div>
        </div>
        {error && <p style={{fontSize:'0.8rem',color:'#f87171',background:'rgba(220,38,38,0.1)',padding:'8px 12px',borderRadius:'6px'}}>{error}</p>}
        <div style={{display:'flex',justifyContent:'flex-end',gap:'10px',paddingTop:'8px'}}>
          <button style={btnSecondary} onClick={() => setShowInvite(false)}>Cancel</button>
          <button style={btnPrimary} onClick={invite} disabled={saving||!form.email||!form.displayName}>{saving?'Creating...':'Create agent'}</button>
        </div>
      </div>
    </Modal>
  )}

  {qrAgent && <QrModal agent={qrAgent} onClose={() => setQrAgent(null)} />}
</div>
);
}