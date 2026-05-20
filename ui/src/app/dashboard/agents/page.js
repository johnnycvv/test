'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function StatusBadge({ s }) {
  const map = { available:'badge-green', on_call:'badge-red', break:'badge-amber', offline:'badge-gray' };
  return <span className={map[s]||'badge-gray'}>{s?.replace('_',' ')}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg">
      <div className="card w-full max-w-md p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1 text-slate-400">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showInvite, setShowInvite]   = useState(false);
  const [newCreds, setNewCreds]       = useState(null);
  const [form, setForm]               = useState({ email:'', displayName:'', role:'agent', extension:'' });
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function load() { setAgents(await api.getAgents()); setLoading(false); }
  useEffect(() => { load(); }, []);

  async function invite() {
    setSaving(true); setError('');
    try {
      const result = await api.inviteAgent(form);
      setNewCreds(result); setShowInvite(false);
      setForm({ email:'', displayName:'', role:'agent', extension:'' });
      await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  async function deactivate(id) {
    if (!confirm('Deactivate this agent?')) return;
    await api.updateAgent(id, { isActive: false }); await load();
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/></div>;

  return (
    <div className="p-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-sub">{agents.length} users in your account</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite(true)}>+ Invite agent</button>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead><tr><th>Agent</th><th>Role</th><th>Extension</th><th>SIP Username</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-900/40 border border-blue-800/30 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
                      {a.display_name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{a.display_name}</p>
                      <p className="text-xs text-slate-500">{a.email}</p>
                    </div>
                  </div>
                </td>
                <td><span className="badge-indigo capitalize">{a.role}</span></td>
                <td className="font-mono text-sm text-slate-300">{a.extension||'—'}</td>
                <td className="font-mono text-xs text-slate-500">{a.sip_username||'—'}</td>
                <td><StatusBadge s={a.status}/></td>
                <td>
                  {a.is_active && <button className="btn-danger text-xs px-2 py-1" onClick={() => deactivate(a.id)}>Deactivate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <Modal title="Invite agent" onClose={() => setShowInvite(false)}>
          <div className="space-y-4">
            <div><label className="label">Full name *</label><input className="input" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Jane Smith"/></div>
            <div><label className="label">Email address *</label><input type="email" className="input" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="jane@company.com"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Role</label>
                <select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
                  <option value="agent">Agent</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option>
                </select>
              </div>
              <div><label className="label">Extension</label><input className="input" value={form.extension} onChange={e=>setForm({...form,extension:e.target.value})} placeholder="200"/></div>
            </div>
            {error && <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              <button className="btn-primary" onClick={invite} disabled={saving||!form.email||!form.displayName}>{saving?'Inviting…':'Send invite'}</button>
            </div>
          </div>
        </Modal>
      )}

      {newCreds && (
        <Modal title="Agent created ✅" onClose={() => setNewCreds(null)}>
          <p className="text-sm text-slate-400 mb-4">Share these credentials securely.</p>
          <div className="bg-[#13161f] border border-[#2e3352] rounded-xl p-4 space-y-2 font-mono text-sm">
            <div><span className="text-slate-500">Email: </span><span className="text-white">{newCreds.email}</span></div>
            <div><span className="text-slate-500">Temp password: </span><span className="text-amber-400">{newCreds.temporaryPassword}</span></div>
            <div><span className="text-slate-500">SIP user: </span><span className="text-white">{newCreds.sip_username}</span></div>
          </div>
          <p className="text-xs text-amber-500 mt-3">⚠ Ask the agent to change their password on first login.</p>
          <button className="btn-primary mt-5 w-full justify-center" onClick={() => setNewCreds(null)}>Done</button>
        </Modal>
      )}
    </div>
  );
}
