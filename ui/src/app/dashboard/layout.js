'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
const NAV = [
  { href: '/dashboard', label: 'Live Dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/dashboard/chat', label: 'Agent Chat', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 12 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { href: '/dashboard/queues', label: 'Call Queues', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { href: '/dashboard/agents', label: 'Agents', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { href: '/dashboard/cdr', label: 'Call Logs', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/dashboard/trunks', label: 'SIP Trunks', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2' },
  { href: '/dashboard/dids', label: 'DID Numbers', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const token = localStorage.getItem('cc_token');
    if (!token) router.push('/login');
  }, []);
  const user = JSON.parse(localStorage.getItem('cc_user') || '{}');
  function logout() {
    localStorage.clear();
    window.location.href = '/login';
  }
  return (<div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#0f1117'}}><aside style={{width:'224px',display:'flex',flexDirection:'column',borderRight:'1px solid #2e3352',background:'#13161f',flexShrink:0}}><div style={{display:'flex',alignItems:'center',gap:'10px',padding:'0 16px',height:'56px',borderBottom:'1px solid #2e3352'}}><div style={{width:'28px',height:'28px',borderRadius:'8px',background:'#2563eb',display:'flex',alignItems:'center',justifyContent:'center'}}><svg style={{width:'16px',height:'16px',color:'white'}} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}><path strokeLinecap='round' strokeLinejoin='round' d='M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z'/></svg></div><span style={{fontWeight:'700',color:'white'}}>CloudCall</span></div><nav style={{flex:1,padding:'12px',overflowY:'auto'}}>{NAV.map(item=>(<Link key={item.href} href={item.href} style={{display:'flex',alignItems:'center',gap:'12px',padding:'8px 12px',borderRadius:'8px',marginBottom:'2px',textDecoration:'none',color:pathname===item.href?'#60a5fa':'#8892aa',background:pathname===item.href?'rgba(37,99,235,0.15)':'transparent',fontSize:'0.875rem'}}><svg style={{width:'16px',height:'16px',flexShrink:0}} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={1.5}><path strokeLinecap='round' strokeLinejoin='round' d={item.icon}/></svg>{item.label}</Link>))}</nav><div style={{borderTop:'1px solid #2e3352',padding:'12px'}}><div style={{padding:'8px',color:'#8892aa',fontSize:'0.75rem'}}>{user.email}</div><button onClick={logout} style={{width:'100%',textAlign:'left',padding:'6px 8px',color:'#64748b',fontSize:'0.75rem',background:'none',border:'none',cursor:'pointer'}}>Sign out</button></div></aside><main style={{flex:1,overflowY:'auto'}}>{children}</main></div>);
}
