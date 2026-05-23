'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/dashboard',          label: '> Live Dashboard' },
  { href: '/dashboard/chat',     label: '> Agent Chat' },
  { href: '/dashboard/dialler',  label: '> Auto Dialler' },
  { href: '/dashboard/queues',   label: '> Call Queues' },
  { href: '/dashboard/agents',   label: '> Agents' },
  { href: '/dashboard/cdr',      label: '> Call Logs' },
  { href: '/dashboard/trunks',   label: '> SIP Trunks' },
  { href: '/dashboard/dids',     label: '> DID Numbers' },
  { href: '/dashboard/siplog',   label: '> SIP Call Log' },
  { href: '/dashboard/settings', label: '> Settings' },

export default function DashboardLayout({ children }) {
  const pathname = usePathname();

  function logout() {
    localStorage.clear();
    window.location.href = '/login';
  }

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('cc_user') || '{}'); } catch { return {}; }
  })();

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'transparent' }}>
      <aside style={{ width:'220px', display:'flex', flexDirection:'column', borderRight:'1px solid rgba(0,255,65,0.2)', background:'rgba(0,5,0,0.92)', flexShrink:0, backdropFilter:'blur(10px)' }}>
        <div style={{ padding:'20px 16px', borderBottom:'1px solid rgba(0,255,65,0.2)' }}>
          <div style={{ color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'1.1rem', fontWeight:'bold', letterSpacing:'0.1em', textShadow:'0 0 10px rgba(0,255,65,0.8)' }}>
            [CLOUDCALL]
          </div>
          <div style={{ color:'#003300', fontSize:'0.65rem', fontFamily:'monospace', marginTop:'4px', letterSpacing:'0.15em' }}>
            SECURE TELEPHONY v2.0
          </div>
        </div>
        <nav style={{ flex:1, padding:'8px', overflowY:'auto' }}>
          <div style={{ color:'#003300', fontSize:'0.6rem', fontFamily:'monospace', padding:'8px 12px 4px', letterSpacing:'0.2em' }}>
            // NAVIGATION
          </div>
          {NAV.map(item => (
            <Link key={item.href} href={item.href} style={{
              display:'block', padding:'8px 12px', marginBottom:'2px', textDecoration:'none',
              fontFamily:'Share Tech Mono, monospace', fontSize:'0.8rem', letterSpacing:'0.05em',
              color: pathname === item.href ? '#00ff41' : '#006614',
              background: pathname === item.href ? 'rgba(0,255,65,0.08)' : 'transparent',
              border: pathname === item.href ? '1px solid rgba(0,255,65,0.25)' : '1px solid transparent',
              borderRadius:'2px', transition:'all 0.15s',
              textShadow: pathname === item.href ? '0 0 8px rgba(0,255,65,0.5)' : 'none',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ borderTop:'1px solid rgba(0,255,65,0.2)', padding:'12px' }}>
          <div style={{ color:'#00aa2a', fontFamily:'monospace', fontSize:'0.7rem', padding:'4px 8px', letterSpacing:'0.05em' }}>
            {user.email || 'AGENT'}
          </div>
          <div style={{ color:'#003300', fontFamily:'monospace', fontSize:'0.65rem', padding:'2px 8px' }}>
            ROLE: {(user.role || 'unknown').toUpperCase()}
          </div>
          <button onClick={logout} style={{ width:'100%', textAlign:'left', padding:'6px 8px', marginTop:'4px', color:'#006614', fontFamily:'monospace', fontSize:'0.7rem', background:'none', border:'none', cursor:'pointer' }}>            [LOGOUT]
          </button>
        </div>
      </aside>
      <main style={{ flex:1, overflowY:'auto', background:'rgba(0,3,0,0.7)', backdropFilter:'blur(4px)' }}>
        {children}
      </main>
    </div>
  );
}
