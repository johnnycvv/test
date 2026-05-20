'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';

function fmt(s) { if (!s) return '—'; return `${Math.floor(s/60)}m ${s%60}s`; }
function fmtTime(d) { return d ? new Date(d).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'; }

const STATUS_COLORS = { available:'text-emerald-400', on_call:'text-red-400', break:'text-amber-400', offline:'text-slate-500' };
const STATUS_DOT    = { available:'dot-green', on_call:'dot-red', break:'dot-amber', offline:'dot-gray' };

export default function DashboardPage() {
  const [data,       setData]       = useState(null);
  const [timers,     setTimers]     = useState({});
  const [loading,    setLoading]    = useState(true);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getLiveOverview();
      setData(d);
      const t = {};
      d.activeCalls.forEach(c => {
        t[c.call_uuid] = Math.floor((Date.now() - new Date(c.answered_at || c.started_at)) / 1000);
      });
      setTimers(t);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTimers(p => { const n={}; for(const k in p) n[k]=p[k]+1; return n; }), 1000);
    return () => clearInterval(t);
  }, []);

  useWebSocket(useCallback(evt => {
    if (['call.ringing','call.answered','call.ended','agent.status','queue.depth'].includes(evt.event)) load();
  }, [load]));

  async function simulate() {
    setSimulating(true);
    try { await api.simulateInbound({}); } finally { setTimeout(()=>setSimulating(false),2000); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/></div>;

  const s  = data?.stats || {};
  const ag = data?.agents || [];
  const qu = data?.queues || [];
  const ac = data?.activeCalls || [];
  const agSt = data?.agentsByStatus || {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Live dashboard</h1>
          <p className="page-sub">Real-time call centre overview</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
            <span className="dot-green pulse"/>LIVE
          </span>
          <button onClick={simulate} disabled={simulating} className="btn-secondary text-xs">
            {simulating ? '📞 Ringing…' : '+ Simulate call'}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Active calls',     val: ac.length,                                      color:'text-white' },
          { label:'In queue',         val: qu.reduce((a,q)=>a+(q.waiting||0),0),           color:'text-amber-400' },
          { label:'Agents online',    val: (agSt.available||0)+(agSt.on_call||0),          color:'text-emerald-400' },
          { label:'Missed today',     val: s.missed_today||0,                              color:'text-red-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="stat-card">
            <p className="stat-label">{label}</p>
            <p className={`stat-val ${color}`}>{val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active calls */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e3352]">
            <h2 className="text-sm font-semibold text-white">Active calls</h2>
            <span className="text-xs text-slate-500">{ac.length} calls</span>
          </div>
          <div className="divide-y divide-[#1e2235]">
            {ac.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-600">No active calls</p>
            ) : ac.map(call => (
              <div key={call.call_uuid} className="px-5 py-3.5 flex items-center gap-3">
                <span className={`${call.answered_at?'dot-green':'dot-amber'} pulse flex-shrink-0`}/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{call.caller_id}</p>
                  <p className="text-xs text-slate-500">
                    {call.answered_at ? `${call.agent_name||'Agent'}` : `Waiting · ${call.queue_name||'Queue'}`}
                  </p>
                </div>
                <span className="timer text-xs text-slate-400 tabular-nums flex-shrink-0">
                  {fmt(timers[call.call_uuid]||0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Queue load */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e3352]">
            <h2 className="text-sm font-semibold text-white">Queue load</h2>
          </div>
          <div className="p-5 space-y-5">
            {qu.length === 0 ? (
              <p className="text-center text-sm text-slate-600 py-4">No queues configured</p>
            ) : qu.map(q => {
              const total = (q.active||0) + (q.waiting||0);
              const pct   = total > 0 ? Math.min(100, ((q.active||0)/total)*100) : 0;
              return (
                <div key={q.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">{q.name}</span>
                    <span className="text-xs text-slate-500">{q.active||0} active · {q.waiting||0} waiting</span>
                  </div>
                  <div className="h-1.5 bg-[#22263a] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${(q.waiting||0)>0?'bg-amber-500':'bg-emerald-500'}`}
                      style={{ width:`${Math.max(3,pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Agent grid */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e3352]">
          <h2 className="text-sm font-semibold text-white">Agent status</h2>
          <div className="flex gap-4 text-xs text-slate-500">
            {[['available','emerald'],['on_call','red'],['break','amber'],['offline','slate']].map(([st,c])=>(
              <span key={st} className={`flex items-center gap-1 text-${c}-400`}>
                <span className={`dot-${st==='available'?'green':st==='on_call'?'red':st==='break'?'amber':'gray'}`}/>
                {st.replace('_',' ')} {agSt[st]||0}
              </span>
            ))}
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {ag.map(agent => (
            <div key={agent.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-[#2e3352] bg-[#1a1d27]">
              <div className="w-8 h-8 rounded-full bg-blue-900/40 border border-blue-800/30 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
                {agent.display_name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">{agent.display_name}</p>
                <p className={`text-xs font-medium ${STATUS_COLORS[agent.status]||'text-slate-500'}`}>
                  {agent.status?.replace('_',' ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's summary */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Today's summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { label:'Total calls',   val: s.total_today||0 },
            { label:'Answered',      val: s.answered_today||0 },
            { label:'Missed',        val: s.missed_today||0 },
            { label:'Avg wait',      val: fmt(s.avg_wait) },
          ].map(({ label, val }) => (
            <div key={label} className="py-3 rounded-xl bg-[#1a1d27] border border-[#2e3352]">
              <p className="text-2xl font-bold text-white mb-1">{val}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
