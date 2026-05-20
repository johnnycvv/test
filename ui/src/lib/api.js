const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken() {
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

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    return;
  }

  if (res.headers.get('content-type')?.includes('text/csv')) {
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),

  // Agents
  getAgents: () => request('/api/agents'),
  inviteAgent: (data) => request('/api/agents/invite', { method: 'POST', body: data }),
  updateAgent: (id, data) => request(`/api/agents/${id}`, { method: 'PATCH', body: data }),
  setAgentStatus: (id, status) => request(`/api/agents/${id}/status`, { method: 'PATCH', body: { status } }),
  deleteAgent: (id) => request(`/api/agents/${id}`, { method: 'DELETE' }),
  changePassword: (id, password) => request(`/api/agents/${id}/password`, { method: 'PATCH', body: { password } }),

  // Queues
  getQueues: () => request('/api/queues'),
  getQueue: (id) => request(`/api/queues/${id}`),
  createQueue: (data) => request('/api/queues', { method: 'POST', body: data }),
  updateQueue: (id, data) => request(`/api/queues/${id}`, { method: 'PATCH', body: data }),
  deleteQueue: (id) => request(`/api/queues/${id}`, { method: 'DELETE' }),
  getQueueAgents: (id) => request(`/api/queues/${id}/agents`),
  addQueueAgent: (queueId, userId, priority) => request(`/api/queues/${queueId}/agents`, { method: 'POST', body: { userId, priority } }),
  removeQueueAgent: (queueId, userId) => request(`/api/queues/${queueId}/agents/${userId}`, { method: 'DELETE' }),

  // Trunks
  getTrunks: () => request('/api/trunks'),
  createTrunk: (data) => request('/api/trunks', { method: 'POST', body: data }),
  updateTrunk: (id, data) => request(`/api/trunks/${id}`, { method: 'PATCH', body: data }),
  deleteTrunk: (id) => request(`/api/trunks/${id}`, { method: 'DELETE' }),
  testTrunk: (id) => request(`/api/trunks/${id}/test`, { method: 'POST' }),

  // DIDs
  getDids: () => request('/api/dids'),
  createDid: (data) => request('/api/dids', { method: 'POST', body: data }),
  assignDid: (id, type, targetId) => request(`/api/dids/${id}/assign`, { method: 'PATCH', body: { type, targetId } }),
  deleteDid: (id) => request(`/api/dids/${id}`, { method: 'DELETE' }),

  // IVR
  getIvr: () => request('/api/ivr'),
  createIvr: (data) => request('/api/ivr', { method: 'POST', body: data }),
  updateIvr: (id, data) => request(`/api/ivr/${id}`, { method: 'PATCH', body: data }),
  deleteIvr: (id) => request(`/api/ivr/${id}`, { method: 'DELETE' }),

  // CDR / Calls
  getCdr: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/cdr${q ? '?' + q : ''}`);
  },
  getStats: () => request('/api/cdr/stats'),
  exportCdr: async () => {
    const blob = await request('/api/cdr/export');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'call-logs.csv'; a.click();
    URL.revokeObjectURL(url);
  },
  addCallNotes: (id, notes) => request(`/api/cdr/${id}/notes`, { method: 'PATCH', body: { notes } }),
  simulateInbound: (data) => request('/api/cdr/simulate/inbound', { method: 'POST', body: data }),

  // Live
  getLiveOverview: () => request('/api/live/overview'),
};

// ── Chat API ──────────────────────────────────────────────────────────────────
export const chatApi = {
  registerKey:    (publicKeyJwk) => request('/api/chat/keys', { method: 'POST', body: { publicKeyJwk } }),
  getPeerKey:     (userId) => request(`/api/chat/keys/${userId}`),
  getChannels:    () => request('/api/chat/channels'),
  openDirect:     (targetUserId) => request('/api/chat/channels/direct', { method: 'POST', body: { targetUserId } }),
  createGroup:    (name, memberIds) => request('/api/chat/channels/group', { method: 'POST', body: { name, memberIds } }),
  getMessages:    (channelId, before, limit = 50) => request(`/api/chat/channels/${channelId}/messages?limit=${limit}${before ? '&before=' + before : ''}`),
  sendMessage:    (channelId, payload) => request(`/api/chat/channels/${channelId}/messages`, { method: 'POST', body: payload }),
  markRead:       (messageId) => request(`/api/chat/messages/${messageId}/read`, { method: 'PATCH' }),
  deleteMessage:  (messageId) => request(`/api/chat/messages/${messageId}`, { method: 'DELETE' }),
  sendTyping:     (channelId) => request('/api/chat/typing', { method: 'POST', body: { channelId } }),
  getAuditLog:    () => request('/api/chat/gdpr/audit'),
  getRetention:   () => request('/api/chat/gdpr/retention'),
  setRetention:   (retainDays) => request('/api/chat/gdpr/retention', { method: 'PATCH', body: { retainDays } }),
  eraseMyData:    () => request('/api/chat/gdpr/my-data', { method: 'DELETE' }),
};

// ── Twilio ────────────────────────────────────────────────────────────────────
export const twilioApi = {
  getToken: () => request('/api/twilio/token', { method: 'POST' }),
};
