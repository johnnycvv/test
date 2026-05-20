'use client';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { user } = useAuth();
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [pwError,    setPwError]    = useState('');
  const [pwSuccess,  setPwSuccess]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  async function changePassword() {
    setPwError(''); setPwSuccess(false);
    if (password.length < 8) return setPwError('Password must be at least 8 characters');
    if (password !== confirm) return setPwError('Passwords do not match');
    setSaving(true);
    try { await api.changePassword(user.id, password); setPwSuccess(true); setPassword(''); setConfirm(''); }
    catch (e) { setPwError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Account and security settings</p>
      </div>

      <div className="card p-6 mb-4 rounded-xl">
        <h2 className="text-sm font-semibold text-white mb-4">Account information</h2>
        <div className="space-y-3">
          {[
            { label:'Company',   val: user?.tenantName },
            { label:'Plan',      val: user?.plan },
            { label:'Email',     val: user?.email },
            { label:'Role',      val: user?.role },
            { label:'Extension', val: user?.extension||'—' },
          ].map(({ label, val }) => (
            <div key={label} className="flex items-center py-2 border-b border-[#2e3352] last:border-0">
              <span className="w-32 text-xs text-slate-500 uppercase tracking-wide">{label}</span>
              <span className="text-sm font-medium text-slate-300 capitalize">{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 mb-4 rounded-xl">
        <h2 className="text-sm font-semibold text-white mb-2">SIP credentials</h2>
        <p className="text-xs text-slate-500 mb-4">Used by the web softphone and SIP clients.</p>
        <div className="bg-[#13161f] border border-[#2e3352] rounded-xl p-4 font-mono text-sm space-y-2">
          <div><span className="text-slate-500">Username: </span><span className="text-slate-300">{user?.sipUsername}</span></div>
          <div><span className="text-slate-500">Password: </span><span className="text-slate-300">••••••••</span></div>
          <div><span className="text-slate-500">Domain: </span><span className="text-slate-300">cloudcall.local</span></div>
        </div>
      </div>

      <div className="card p-6 rounded-xl">
        <h2 className="text-sm font-semibold text-white mb-4">Change password</h2>
        <div className="space-y-3 max-w-sm">
          <div><label className="label">New password</label><input type="password" className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Min 8 characters"/></div>
          <div><label className="label">Confirm password</label><input type="password" className="input" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat password"/></div>
          {pwError   && <p className="text-sm text-red-400">{pwError}</p>}
          {pwSuccess && <p className="text-sm text-emerald-400">✅ Password updated successfully</p>}
          <button className="btn-primary" onClick={changePassword} disabled={saving||!password}>{saving?'Saving…':'Update password'}</button>
        </div>
      </div>
    </div>
  );
}
