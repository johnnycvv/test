const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cc_token');
}

export function setToken(token) {
  localStorage.setItem('cc_token', token);
}

export function clearToken() {
  localStorage.removeItem('cc_token');
  localStorage.removeItem('cc_user');
}

async function request(path, opts = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),
  getAgents: () => request('/api/agents'),
  inviteAgent: (data) => request('/api/agents/invite', { method: 'POST', body: data }),
  updateAgent: (id, data) => request(`/api/agents/${id}`, { method: 'PATCH', body: data }),
  setAgentStatus: (id, status) => request(`/api/agents/${id}/status`, {method: 'PATCH', body: { status } }),
  deleteAgent: (id) => request(`/api/agents/${id}`, { method: 'DELETE' }),
  changePassword: (id, password) => request(`/api/agents/${id}/password`, { method: 'PATCH', body: { password } }),
  getQueues: () => request('/api/queues'),
  getQueue: (id) => request(`/api/queues/${id}`),
  createQueue: (data) => request('/api/queues', { method: 'POST', body: data }),
  updateQueue: (id, data) => request(`/api/queues/${id}`, { method: 'PATCH', body: data }),
  deleteQueue: (id) => request(`/api/queues/${id}`, { method: 'DELETE' }),
  getQueueAgents: (id) => request(`/api/queues/${id}/agents`),
  addQueueAgent: (queueId, userId, priority) => request(`/api/queues/${queueId}/agents`, { method: 'POST', body: { userId, priority } }),
  removeQueueAgent: (queueId, userId) => request(`/api/queues/${queueId}/agents/${userId}`, { method: 'DELETE' }),
  getTrunks: () => request('/api/trunks'),
  createTrunk: (data) => request('/api/trunks', { method: 'POST', body: data }),
  updateTrunk: (id, data) => request(`/api/trunks/${id}`, { method: 'PATCH', body: data }),
  deleteTrunk: (id) => request(`/api/trunks/${id}`, { method: 'DELETE' }),
  testTrunk: (id) => request(`/api/trunks/${id}/test`, { method: 'POST' }),
  getDids: () => request('/api/dids'),
  createDid: (data) => request('/api/dids', { method: 'POST', body: data }),
  assignDid: (id, type, targetId) => request(`/api/dids/${id}/assign`, { method: 'PATCH', body: { type, targetId } }),
  deleteDid: (id) => request(`/api/dids/${id}`, { method: 'DELETE' }),
  getIvr: () => request('/api/ivr'),
  createIvr: (data) => request('/api/ivr', { method: 'POST', body: data }),
  updateIvr: (id, data) => request(`/api/ivr/${id}`, { method: 'PATCH', body: data }),
  deleteIvr: (id) => request(`/api/ivr/${id}`, { method: 'DELETE' }),
  getCdr: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/cdr${q ? '?' + q : ''}`);
  },
  getStats: () => request('/api/cdr/stats'),
  exportCdr: async () => {
    const blob = await reque