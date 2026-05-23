'use client';
import { useState, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
const tok = () => localStorage.getItem('cc_token');
const apiFetch = (path, opts={}) => fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json', ...(opts.headers||{}) } }).then(r => r.json());
const statusColor = { answered:'#00ff41', failed:'#ff4444', timeout:'#ffaa00', busy:'#ff8800', rejected:'#ff4444', calling:'#60a5fa' };
export default function SipLogPage() {
const [logs, setLogs]         = useState([]);
const [total, setTotal]       = useState(0);
const [loading, setLoading]   = useState(true);
const [filter, setFilter]     = useState({ status:'', direction:'' });
const [page, setPage]         = useState(0);
const limit = 50;
async function load() {
setLoading(true);
try {
const params = new URLSearchParams({ limit, offset: page * limit });
if (filter.status) params.set('status', filter.status);
if (filter.direction) params.set('direction', filter.direction);
const r = await apiFetch('/api/siplog?' + params.toString());
setLogs(r.logs || []);
setTotal(r.total || 0);
} catch(e) { console.error(e); }
setLoading(false);
}
useEffect(() => { load(); }, [page, filter]);
async function clearLogs() {
if (!confirm('Clear all SIP logs? This cannot be undone.')) return;
await apiFetch('/api/siplog/clear', { method:'DELETE' });
await load();
}
function formatDuration(s) {
if (!s) return '—';
if (s < 60) return s + 's';
return Math.floor(s/60) + 'm ' + (s%60) + 's';
}
function formatTime(t) {
if (!t) return '—';
return new Date(t).toLocaleString();
}
const inp = { padding:'6px 10px', background:'#13161f', border:'1px solid #2e3352', borderRadius:'6px', color:'#e2e8f0', fontSize:'0.8rem', outline:'none' };
const btnD = { padding:'6px 12px', background:'rgba(220,38,38,0.15)', color:'#f87171', border:'1px solid rgba(220,38,38,0.3)', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' };
const btnG = { padding:'6px 12px', background:'rgba(0,255,65,0.06)', color:'#00aa2a', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' };
return (
<div style={{padding:'24px'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'24px'}}>
<div>
<h1 style={{fontSize:'1.25rem',fontWeight:700,color:'#00ff41',fontFamily:'monospace',letterSpacing:'0.1em'}}>[SIP CALL LOG]</h1>
<p style={{fontSize:'0.8rem',color:'#006614',marginTop:'2px',fontFamily:'monospace'}}>// {total} total records</p>
</div>
<div style={{display:'flex',gap:'10px',alignItems:'center'}}>
<select style={inp} value={filter.status} onChange={e=>{ setFilter({...filter,status:e.target.value}); setPage(0); }}>
<option value="">All statuses</option>
<option value="answered">Answered</option>
<option value="failed">Failed</option>
<option value="timeout">Timeout</option>
<option value="busy">Busy</option>
<option value="rejected">Rejected</option>
</select>
<select style={inp} value={filter.direction} onChange={e=>{ setFilter({...filter,direction:e.target.value}); setPage(0); }}>
<option value="">All directions</option>
<option value="outbound">Outbound</option>
<option value="inbound">Inbound</option>
</select>
<button style={btnG} onClick={load}>Refresh</button>
<button style={btnD} onClick={clearLogs}>Clear logs</button>
</div>
</div>
  <div style={{background:'rgba(0,8,0,0.9)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'8px',overflow:'hidden'}}>
    {loading ? (
      <div style={{textAlign:'center',padding:'48px',color:'#006614',fontFamily:'monospace'}}>[ LOADING... ]</div>
    ) : logs.length === 0 ? (
      <div style={{textAlign:'center',padding:'48px',color:'#006614',fontFamily:'monospace'}}>
        <div style={{fontSize:'2rem',marginBottom:'12px'}}>📋</div>
        <div>NO SIP CALL LOGS YET</div>
        <div style={{fontSize:'0.75rem',marginTop:'8px',color:'#003300'}}>Logs will appear here when calls are made</div>
      </div>
    ) : (
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
          <thead>
            <tr style={{background:'rgba(0,15,0,0.8)'}}>
              {['Time','Direction','From','To','SIP Host','Response','Status','Duration','Error'].map(h => (
                <th key={h} style={{padding:'10px 12px',textAlign:'left',color:'#006614',fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.1em',borderBottom:'1px solid rgba(0,255,65,0.1)',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} style={{borderBottom:'1px solid rgba(0,255,65,0.05)'}}>
                <td style={{padding:'10px 12px',color:'#64748b',fontFamily:'monospace',fontSize:'0.72rem',whiteSpace:'nowrap'}}>{formatTime(l.created_at)}</td>
                <td style={{padding:'10px 12px'}}>
                  <span style={{padding:'1px 8px',borderRadius:'10px',fontSize:'0.65rem',fontFamily:'monospace',background:l.direction==='inbound'?'rgba(96,165,250,0.1)':'rgba(0,255,65,0.06)',color:l.direction==='inbound'?'#60a5fa':'#00aa2a',border:'1px solid '+(l.direction==='inbound'?'rgba(96,165,250,0.2)':'rgba(0,255,65,0.15)')}}>
                    {l.direction||'outbound'}
                  </span>
                </td>
                <td style={{padding:'10px 12px',fontFamily:'monospace',color:'#94a3b8',fontSize:'0.75rem'}}>{l.from_number||'—'}</td>
                <td style={{padding:'10px 12px',fontFamily:'monospace',color:'#e2e8f0',fontSize:'0.75rem',fontWeight:500}}>{l.to_number||'—'}</td>
                <td style={{padding:'10px 12px',fontFamily:'monospace',color:'#64748b',fontSize:'0.72rem'}}>{l.sip_host||'—'}</td>
                <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:'0.75rem'}}>
                  {l.sip_response_code ? (
                    <span style={{color:l.sip_response_code===200?'#00ff41':l.sip_response_code>=400?'#ff4444':'#ffaa00',fontWeight:600}}>
                      {l.sip_response_code} {l.sip_response_text||''}
                    </span>
                  ) : '—'}
                </td>
                <td style={{padding:'10px 12px'}}>
                  <span style={{padding:'1px 8px',borderRadius:'10px',fontSize:'0.65rem',fontFamily:'monospace',background:(statusColor[l.status]||'#64748b')+'18',color:statusColor[l.status]||'#64748b',border:'1px solid '+(statusColor[l.status]||'#64748b')+'44'}}>
                    {l.status||'—'}
                  </span>
                </td>
                <td style={{padding:'10px 12px',fontFamily:'monospace',color:'#94a3b8',fontSize:'0.75rem'}}>{formatDuration(l.duration_seconds)}</td>
                <td style={{padding:'10px 12px',color:'#ff6666',fontSize:'0.7rem',maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.error_message||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>

  {total > limit && (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'16px',fontFamily:'monospace',fontSize:'0.8rem',color:'#64748b'}}>
      <span>Showing {page*limit+1}–{Math.min((page+1)*limit,total)} of {total}</span>
      <div style={{display:'flex',gap:'8px'}}>
        <button style={btnG} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button>
        <button style={btnG} disabled={(page+1)*limit>=total} onClick={()=>setPage(p=>p+1)}>Next</button>
      </div>
    </div>
  )}
</div>
);
}
