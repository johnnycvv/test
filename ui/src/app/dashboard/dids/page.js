'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const COUNTRY_FLAGS = { GB:'🇬🇧', US:'🇺🇸', AU:'🇦🇺', DE:'🇩🇪', FR:'🇫🇷', NL:'🇳🇱', CA:'🇨🇦', IN:'🇮🇳', SG:'🇸🇬' };

export default function DidsPage() {
  const [dids, setDids] = useState([]);
  const [queues, setQueues] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [assignDid, setAssignDid] = useState(null);
  const [form, setForm] = useState({ number: '', countryCode: 'GB', description: '' });
  const [assignForm, setAssignForm] = useState({ type: 'queue', targetId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [d, q, a] = await Promise.all([api.getDids(), api.getQueues(), api.getAgents()]);
    setDids(d); setQueues(q); setAgents(a); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addDid() {
    setSaving(true); setError('');
    try { await api.createDid(form); await load(); setShowAdd(false); setForm({ number: '', countryCode: 'GB', description: '' }); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function assign() {
    setSaving(true); setError('');
    try {
      await api.assignDid(assignDid.id, assignForm.type || null, assignForm.targetId || null);
      await load(); setAssignDid(null);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function del(id) {
    if (!confirm('Delete this DID?')) return;
    await api.deleteDid(id); await load();
  }

  function getTargets() {
    if (assignForm.type === 'queue') return queues.map(q => ({ id: q.id, label: q.name }));
    if (assignForm.type === 'agent') return agents.map(a => ({ id: a.id, label: a.display_name }));
    return [];
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">DID numbers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Phone numbers assigned to your account</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add number</button>
      </div>

      <div className="card overflow-hidden">
        {dids.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📱</p>
            <p className="font-medium text-gray-600">No DID numbers yet</p>
            <p className="text-sm mt-1">Add your first phone number to start receiving calls</p>
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Number</th><th>Country</th><th>Description</th><th>Assigned to</th><th></th></tr></thead>
            <tbody>
              {dids.map(d => (
                <tr key={d.id}>
                  <td className="font-mono font-semibold">{d.number}</td>
                  <td>{COUNTRY_FLAGS[d.country_code] || '🌐'} {d.country_code || '—'}</td>
                  <td className="text-gray-500">{d.description || '—'}</td>
                  <td>
                    {d.assigned_to_type ? (
                      <span>
                        <span className="badge-indigo capitalize">{d.assigned_to_type}</span>
                        <span className="ml-2 text-sm text-gray-600">{d.assigned_name}</span>
                      </span>
                    ) : <span className="text-gray-400 text-sm">Unassigned</span>}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn-ghost text-xs px-2 py-1" onClick={() => { setAssignDid(d); setAssignForm({ type: d.assigned_to_type || 'queue', targetId: d.assigned_to_id || '' }); }}>
                        Assign
                      </button>
                      <button className="btn-danger text-xs px-2 py-1" onClick={() => del(d.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add DID Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Add DID number</h2>
              <button onClick={() => setShowAdd(false)} className="btn-ghost p-1">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Phone number (E.164 format) *</label>
                <input className="input" value={form.number} onChange={e => setForm({...form, number: e.target.value})} placeholder="+442079460001" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Country code</label>
                  <select className="input" value={form.countryCode} onChange={e => setForm({...form, countryCode: e.target.value})}>
                    {Object.entries(COUNTRY_FLAGS).map(([code, flag]) => (
                      <option key={code} value={code}>{flag} {code}</option>
                    ))}
                    <option value="">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Description</label>
                  <input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Main UK line" />
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn-primary" onClick={addDid} disabled={saving || !form.number}>
                  {saving ? 'Adding…' : 'Add number'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign DID Modal */}
      {assignDid && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Assign {assignDid.number}</h2>
              <button onClick={() => setAssignDid(null)} className="btn-ghost p-1">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Route this number to</label>
                <select className="input" value={assignForm.type} onChange={e => setAssignForm({type: e.target.value, targetId: ''})}>
                  <option value="queue">Call queue</option>
                  <option value="agent">Agent (direct)</option>
                  <option value="">Unassign</option>
                </select>
              </div>
              {assignForm.type && (
                <div>
                  <label className="label">Select {assignForm.type}</label>
                  <select className="input" value={assignForm.targetId} onChange={e => setAssignForm({...assignForm, targetId: e.target.value})}>
                    <option value="">Choose…</option>
                    {getTargets().map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button className="btn-secondary" onClick={() => setAssignDid(null)}>Cancel</button>
                <button className="btn-primary" onClick={assign} disabled={saving || (assignForm.type && !assignForm.targetId)}>
                  {saving ? 'Saving…' : 'Save assignment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
