'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
const NAV = [
  { href: '/dashboard', label: 'Live Dashboard' },
  { href: '/dashboard/chat', label: 'Agent Chat' },
{ href: '/dashboard/dialler', label: 'Auto Dialler' },
  { href: '/dashboard/queues', label: 'Call Queues' },
  { href: '/dashboard/agents', label: 'Agents' },
  { href: '/dashboard/cdr', label: 'Call Logs' },
  { href: '/dashboard/trunks', label: 'SIP Trunks' },
  { href: '/dashboard/dids', label: 'DID Numbers' },
  { href: '/dashboard/settings', label: 'Settings' },
];
export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  function logout() { localStorage.clear(); window.location.href = '/login'; }
  return (<div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#0f1117'}}><aside style={{width:'200px',display:'flex',flexDirection:'column',borderRight:'1px solid #2e3352',background:'#13161f',flexShrink:0}}><div style={{padding:'16px',borderBottom:'1px solid #2e3352',fontWeight:'700',color:'white',fontSize:'1.1rem'}}>? CloudCall</div><nav style={{flex:1,padding:'8px',overflowY:'auto'}}>{NAV.map(item=>(<Link key={item.href} href={item.href} style={{display:'block',padding:'8px 12px',borderRadius:'8px',marginBottom:'2px',textDecoration:'none',color:pathname===item.href?'#60a5fa':'#8892aa',background:pathname===item.href?'rgba(37,99,235,0.15)':'transparent',fontSize:'0.875rem'}}>{item.label}</Link>))}</nav><div style={{borderTop:'1px solid #2e3352',padding:'12px'}}><button onClick={logout} style={{width:'100%',textAlign:'left',padding:'6px 8px',color:'#64748b',fontSize:'0.75rem',background:'none',border:'none',cursor:'pointer'}}>Sign out</button></div></aside><main style={{flex:1,overflowY:'auto'}}>{children}</main></div>);
}
