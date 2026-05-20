'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function fmtDate(d) { return d ? new Date(d).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
function fmtGbp(n) { return `£${parseFloat(n).toFixed(2)}`; }

function StatusBadge({ s }) {
  const map = { paid: 'badge-green', pending: 'badge-amber', expired: 'badge-gray', refunded: 'badge-blue' };
  return <span className={map[s] || 'badge-gray'}>{s}</span>;
}

export default function AdminPaymentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError]   = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!loading && (!user || user.tenantId)) router.push('/dashboard');
  }, [user, loading]);

  async function load() {
    setFetching(true);
    try {
      const token = localStorage.getItem('cc_token');
      const res = await fetch(`${API_URL}/api/payments/admin/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      setSessions(await res.json());
    } catch (e) { setError(e.message); }
    finally { setFetching(false); }
  }

  useEffect(() => { if (user && !user.tenantId) load(); }, [user]);

  async function updateStatus(id, status) {
    const token = localStorage.getItem('cc_token');
    await fetch(`${API_URL}/api/payments/admin/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  const filtered = sessions.filter(s => {
    const matchSearch = !search || s.email?.includes(search) || s.company_name?.includes(search);
    const matchFilter = !filter || s.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = {
    total:    sessions.length,
    paid:     sessions.filter(s => s.status === 'paid').length,
    pending:  sessions.filter(s => s.status === 'pending').length,
    revenue:  sessions.filter(s => s.status === 'paid').reduce((a, s) => a + parseFloat(s.amount_gbp), 0),
  };

  if (loading || !user) return null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment sessions</h1>
          <p className="page-sub">All Stripe checkout sessions across the platform</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm">↻ Refresh</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total sessions',  val: stats.total },
          { label: 'Paid accounts',   val: stats.paid },
          { label: 'Pending',         val: stats.pending },
          { label: 'Total revenue',   val: `£${stats.revenue.toFixed(2)}` },
        ].map(({ label, val }) => (
          <div key={label} className="stat-card">
            <p className="stat-label">{label}</p>
            <p className="stat-val">{val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          className="input max-w-xs"
          placeholder="Search email or company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input w-40" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3 mb-4">{error}</div>}

      {/* Table */}
      <div className="card overflow-hidden">
        {fetching ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-12 text-sm text-slate-500">No sessions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Amount</th>
                  <th>Promo</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Paid at</th>
                  <th>Tenant</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.email}</td>
                    <td className="text-slate-400">{s.company_name || '—'}</td>
                    <td className="font-semibold text-white">{fmtGbp(s.amount_gbp)}</td>
                    <td>{s.promo_code ? <span className="badge-purple">{s.promo_code}</span> : <span className="text-slate-600">—</span>}</td>
                    <td><StatusBadge s={s.status} /></td>
                    <td className="text-xs text-slate-500">{fmtDate(s.created_at)}</td>
                    <td className="text-xs text-slate-500">{fmtDate(s.paid_at)}</td>
                    <td className="text-xs text-slate-500 font-mono">{s.tenant_name || '—'}</td>
                    <td>
                      {s.status === 'paid' && (
                        <button
                          className="btn-danger text-xs px-2 py-1"
                          onClick={() => { if (confirm(`Refund ${s.email}?`)) updateStatus(s.id, 'refunded'); }}
                        >
                          Refund
                        </button>
                      )}
                      {s.status === 'pending' && (
                        <button
                          className="btn-ghost text-xs px-2 py-1"
                          onClick={() => updateStatus(s.id, 'expired')}
                        >
                          Expire
                        </button>
                      )}
                    </td>
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
