'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function fmtDur(s) { if(!s) return '—'; return `${Math.floor(s/60)}m ${s%60}s`; }
function fmtTime(d) { return d ? new Date(d).toLocaleString([],{dateStyle:'short',timeStyle:'short'}) : '—'; }

function DispositionBadge({ d }) {
  const map = { answered:'badge-green', missed:'badge-red', abandoned:'badge-amber', voicemail:'badge-blue', busy:'badge-gray' };
  return <span className={map[d]||'badge-gray'}>{d}</span>;
}

export default function CdrPage() {
  const [rows,      setRows]      = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filters,   setFilters]   = useState({ disposition:'', from:'', to:'' });

  async function load() {
    setLoading(true);
    const params = {};
    if (filters.disposition) params.disposition = filters.disposition;
    if (filters.from)        params.from        = filters.from;
    if (filters.to)          params.to          = filters.to;
    const [r, s] = await Promise.all([api.getCdr(params), api.getStats()]);
    setRows(r); setStats(s); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function doExport() { setExporting(true); await api.exportCdr().catch(()=>{}); setExporting(false); }

  return (
    <div className="p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Call logs</h1>
          <p className="page-sub">Complete call detail records</p>
        </div>
        <button className="btn-secondary" onClick={doExport} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ Export CSV'}</button>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label:'Total today',   val: stats.total_today||0 },
            { label:'Answered',      val: stats.answered_today||0 },
            { label:'Missed',        val: stats.missed_today||0 },
            { label:'Avg wait',      val: fmtDur(stats.avg_wait) },
          ].map(({ label, val }) => (
            <div key={label} className="stat-card">
              <p className="stat-label">{label}</p>
              <p className="stat-val">{val}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div><label className="label">From</label><input type="date" className="input w-40" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></div>
        <div><label className="label">To</label><input type="date" className="input w-40" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></div>
        <div><label className="label">Disposition</label>
          <select className="input w-36" value={filters.disposition} onChange={e=>setFilters({...filters,disposition:e.target.value})}>
            <option value="">All</option>
            <option value="answered">Answered</option>
            <option value="missed">Missed</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
        <button className="btn-primary" onClick={load}>Apply</button>
        <button className="btn-ghost" onClick={() => { setFilters({disposition:'',from:'',to:''}); setTimeout(load,50); }}>Clear</button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"/></div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-sm text-slate-500">No call records found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Time</th><th>Direction</th><th>Caller</th><th>Queue</th><th>Agent</th><th>Wait</th><th>Duration</th><th>Disposition</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="text-xs text-slate-500 whitespace-nowrap">{fmtTime(r.started_at)}</td>
                    <td><span className={r.direction==='inbound'?'badge-blue':'badge-indigo'}>{r.direction}</span></td>
                    <td className="font-mono text-sm text-slate-300">{r.caller_id||'—'}</td>
                    <td className="text-slate-400">{r.queue_name||'—'}</td>
                    <td className="text-slate-400">{r.agent_name||'—'}</td>
                    <td className="text-slate-500 text-sm">{fmtDur(r.wait_seconds)}</td>
                    <td className="text-slate-500 text-sm">{fmtDur(r.duration_seconds)}</td>
                    <td><DispositionBadge d={r.disposition}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
