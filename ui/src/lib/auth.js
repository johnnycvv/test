'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, clearToken } from '@/lib/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cc_user');
      const token = localStorage.getItem('cc_token');
      if (stored && token) { setUser(JSON.parse(stored)); }
    } catch(e) {}
    setLoading(false);
  }, []);
  async function login(email, password) {
    const data = await api.login(email, password);
    setToken(data.accessToken);
    localStorage.setItem('cc_user', JSON.stringify(data.user));
    localStorage.setItem('cc_refresh', data.refreshToken);
    setUser(data.user);
    return data.user;
  }
  function logout() {
    clearToken();
    localStorage.removeItem('cc_user');
    localStorage.removeItem('cc_refresh');
    setUser(null);
    window.location.href = '/login';
  }
  return <AuthContext.Provider value={{ user, login, logout, loading }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
