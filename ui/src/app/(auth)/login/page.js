'use client';
import { useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(API + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('cc_token', data.accessToken);
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      localStorage.setItem('cc_refresh', data.refreshToken);
      window.location.href = '/dashboard';
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return (<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f1117'}}><div style={{width:'100%',maxWidth:'400px',padding:'2rem',background:'#1a1d27',borderRadius:'12px',border:'1px solid #2e3352'}}><h1 style={{color:'white',marginBottom:'1.5rem',fontSize:'1.5rem'}}>CloudCall Login</h1><form onSubmit={handleSubmit}><div style={{marginBottom:'1rem'}}><label style={{color:'#8892aa',fontSize:'0.75rem',display:'block',marginBottom:'0.5rem'}}>EMAIL</label><input type='email' value={email} onChange={e=>setEmail(e.target.value)} required style={{width:'100%',padding:'0.75rem',background:'#13161f',border:'1px solid #2e3352',borderRadius:'8px',color:'white',fontSize:'0.875rem'}} placeholder='you@company.com'/></div><div style={{marginBottom:'1rem'}}><label style={{color:'#8892aa',fontSize:'0.75rem',display:'block',marginBottom:'0.5rem'}}>PASSWORD</label><input type='password' value={password} onChange={e=>setPassword(e.target.value)} required style={{width:'100%',padding:'0.75rem',background:'#13161f',border:'1px solid #2e3352',borderRadius:'8px',color:'white',fontSize:'0.875rem'}} placeholder='••••••••'/></div>{error&&<div style={{color:'#f87171',background:'#450a0a',padding:'0.75rem',borderRadius:'8px',marginBottom:'1rem',fontSize:'0.875rem'}}>{error}</div>}<button type='submit' disabled={loading} style={{width:'100%',padding:'0.75rem',background:'#2563eb',color:'white',border:'none',borderRadius:'8px',fontSize:'0.875rem',fontWeight:'600',cursor:'pointer'}}>{loading?'Signing in...':'Sign in'}</button></form></div></div>);
}
