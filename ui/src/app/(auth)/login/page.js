'use client';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch(API + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Access denied');
      localStorage.setItem('cc_token', data.accessToken);
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      window.location.replace('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'transparent' }}>
      <div style={{ width:'100%', maxWidth:'400px', padding:'2rem', background:'rgba(0,8,0,0.92)', border:'1px solid rgba(0,255,65,0.3)', borderRadius:'4px', backdropFilter:'blur(10px)', boxShadow:'0 0 40px rgba(0,255,65,0.1)' }}>
        <div style={{ color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'1.8rem', fontWeight:'bold', textAlign:'center', marginBottom:'4px', textShadow:'0 0 20px rgba(0,255,65,0.8)', letterSpacing:'0.2em' }}>
          CLOUDCALL
        </div>
        <div style={{ color:'#003300', fontFamily:'monospace', fontSize:'0.7rem', textAlign:'center', marginBottom:'2rem', letterSpacing:'0.1em' }}>
          // AUTHENTICATE TO PROCEED
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', color:'#00aa2a', fontFamily:'monospace', fontSize:'0.7rem', marginBottom:'6px', letterSpacing:'0.15em', textTransform:'uppercase' }}>// USER IDENTIFIER</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              style={{ width:'100%', padding:'10px 12px', background:'rgba(0,15,0,0.9)', border:'1px solid rgba(0,255,65,0.3)', borderRadius:'2px', color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'0.875rem', outline:'none', boxSizing:'border-box' }}
              placeholder="agent@cloudcall.net" />
          </div>
          <div style={{ marginBottom:'20px' }}>
            <label style={{ display:'block', color:'#00aa2a', fontFamily:'monospace', fontSize:'0.7rem', marginBottom:'6px', letterSpacing:'0.15em', textTransform:'uppercase' }}>// ACCESS CODE</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width:'100%', padding:'10px 12px', background:'rgba(0,15,0,0.9)', border:'1px solid rgba(0,255,65,0.3)', borderRadius:'2px', color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'0.875rem', outline:'none', boxSizing:'border-box' }}
              placeholder="••••••••" />
          </div>
          {error && <div style={{ color:'#ff4444', background:'rgba(255,0,0,0.1)', border:'1px solid rgba(255,0,0,0.3)', borderRadius:'2px', padding:'10px 12px', fontFamily:'monospace', fontSize:'0.8rem', marginBottom:'16px' }}>ERROR: {error}</div>}
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:'12px', background:'#00ff41', color:'#000', border:'none', borderRadius:'2px', fontFamily:'Share Tech Mono, monospace', fontSize:'0.9rem', fontWeight:'bold', cursor:'pointer', letterSpacing:'0.15em', textTransform:'uppercase', boxShadow:'0 0 20px rgba(0,255,65,0.4)' }}>
            {loading ? '[ AUTHENTICATING... ]' : '[ ENTER THE SYSTEM ]'}
          </button>
        </form>
        <div style={{ marginTop:'16px', textAlign:'center', color:'#003300', fontFamily:'monospace
', fontSize:'0.65rem', letterSpacing:'0.1em' }}>ENCRYPTED CONNECTION ESTABLISHED</div></div></div>);}