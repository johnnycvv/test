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
  setAgentStatus: (id, status) => request(`/api/agents/${id}/status`, {