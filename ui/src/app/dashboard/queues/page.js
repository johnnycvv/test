'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function QueuesPage() {
  const [queues, setQueues] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editQueue, setEditQueue] = useState(null);
  const [viewQueue, setViewQueue] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', strategy: 'round_robin', maxWaitSeconds: 300, recordingEnabled: false, callbackEnabled: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const [q, a] = await Promise.all([api.getQueues(), api.getAgents()]);
    setQueues(q); setAgents(a); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setError('');
    try {
      if (editQueue) {
        await api.updateQueue(editQueue.id, form);
      } else {
        await api.createQueue(form);
      }
      await load();
      setShowCreate(false); setEditQueue(null);
      setForm({ name: '', description: '', strategy: 'round_robin', maxWaitSeconds: 300, recordingEnabled: false, callbackEnabled: false });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteQ(id) {
    if (!confirm('Delete this queue?')) return;
    await api.deleteQueue(id); await load();
  }

  async function addAgent(queueId, userId) {
    await api.addQueueAgent(queueId, userId);
    const q = await api.getQueue(queueId);
    setViewQueue(q);
  }

  async function removeAgent(queueId, userId) {
    await api.removeQueueAgent(queueId, userId);
    const q = await api.getQueue(queueId);
    setViewQueue(q);
  }

  function openEdit(q) {
    setForm({ name: q.name, description: q.description || '', strategy: q.strategy, maxWaitSeconds: q.max_wait_seconds, recordingEnabled: q.recording_enabled, callbackEnabled: q.callback_enabled });
    setEditQueue(q);
    setShowCreate(true);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Call queues</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage inbound call distribution</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditQueue(null); setShowCreate(true); }}>+ New queue</button>
      </div>

      <div className="card overflow-hidden">
        {queues.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">☎️</p>
            <p className="font-medium text-gray-600">No queues yet</p>
            <p className="text-sm mt-1">Create your first call queue to start routing calls</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Queue</th><th>Strategy</th><th>Agents</th><th>Max wait</th><th>Recording</th><th>Load</th><th></th></tr>
            </thead>
            <tbody>
              {queues.map(q => (
                <tr key={q.id}>
                  <td>
                    <div className="font-medium text-gray-900">{q.name}</div>
                    <div className="text-xs text-gray-400">{q.description}</div>
                  </td>
                  <td className="capitalize">{q.strategy.replace('_', ' ')}</td>
                  <td>{q.agentCount}</td>
                  <td>{Math.floor(q.max_wait_seconds / 60)}m</td>
                  <td>{q.recording_enabled ? <span className="badge-green">On</span> : <span className="badge-gray">Off</span>}</td>
                  <td>
                    <span className="text-xs text-gray-500">{q.active||0} active · {q.waiting||0} waiting</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button className="btn-ghost text-xs px-2 py-1" onClick={async () => { const full = await api.getQueue(q.id); setViewQueue(full); }}>Agents</button>
                      <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(q)}>Edit</button>
                      <button className="btn-danger text-xs px-2 py-1" onClick={() => deleteQ(q.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <Modal title={editQueue ? 'Edit queue' : 'New queue'} onClose={() => { setShowCreate(false); setEditQueue(null); }}>
          <div className="space-y-4">
            <div>
              <label className="label">Queue name *</label>
              <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Sales" />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Optional" />
            </div>
            <div>
              <label className="label">Distribution strategy</label>
              <select className="input" value={form.strategy} onChange={e => setForm({...form, strategy: e.target.value})}>
                <option value="round_robin">Round robin</option>
                <option value="least_idle">Least idle agent</option>
                <option value="sequential">Sequential (priority order)</option>
              </select>
            </div>
            <div>
              <label className="label">Max wait time (seconds)</label>
              <input type="number" className="input" value={form.maxWaitSeconds} onChange={e => setForm({...form, maxWaitSeconds: parseInt(e.target.value)})} min={30} max={3600} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.recordingEnabled} onChange={e => setForm({...form, recordingEnabled: e.target.checked})} className="rounded"/>
                Enable recording
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.callbackEnabled} onChange={e => setForm({...form, callbackEnabled: e.target.checked})} className="rounded"/>
                Callback option
              </label>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button className="btn-secondary" onClick={() => { setShowCreate(false); setEditQueue(null); }}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving || !form.name}>
                {saving ? 'Saving…' : (editQueue ? 'Save changes' : 'Create queue')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Agent management modal */}
      {viewQueue && (
        <Modal title={`Agents in: ${viewQueue.name}`} onClose={() => setViewQueue(null)}>
          <div className="space-y-4">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(viewQueue.agents || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No agents assigned</p>}
              {(viewQueue.agents || []).map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium">{a.display_name}</p>
                    <p className="text-xs text-gray-400">{a.email} · Ext {a.extension}</p>
                  </div>
                  <button className="btn-danger text-xs px-2 py-1" onClick={() => removeAgent(viewQueue.id, a.id)}>Remove</button>
                </div>
              ))}
            </div>
            <div>
              <label className="label">Add agent</label>
              <select className="input" defaultValue="" onChange={e => { if (e.target.value) addAgent(viewQueue.id, e.target.value); }}>
                <option value="">Select agent to add…</option>
                {agents.filter(a => !(viewQueue.agents||[]).find(qa => qa.id === a.id)).map(a => (
                  <option key={a.id} value={a.id}>{a.display_name} ({a.email})</option>
                ))}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
