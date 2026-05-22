'use client';
import { useState, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
export default function QrModal({ agent, onClose }) {
const [qrDataUrl, setQrDataUrl] = useState('');
const [loading,   setLoading]   = useState(true);
const [error,     setError]     = useState('');
const [copied,    setCopied]    = useState(false);
const [sipUri,    setSipUri]    = useState('');
const [tab,       setTab]       = useState('zoiper');
useEffect(() => {
async function generate() {
try {
const token = localStorage.getItem('cc_token');
const res = await fetch(${API}/api/agents/${agent.id}/sip-config, {
headers: { Authorization: Bearer ${token} }
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Failed to get SIP config');
const sipUrl = sip:${data.username}:${data.password}@${data.server};transport=${data.transport || 'tls'};
setSipUri(sipUrl);
const QRCode = (await import('qrcode')).default;
const dataUrl = await QRCode.toDataURL(sipUrl, {
width: 300, margin: 2,
color: { dark: '#00ff41', light: '#000000' },
errorCorrectionLevel: 'M',
});
setQrDataUrl(dataUrl);
} catch (e) {
setError(e.message);
} finally {
setLoading(false);
}
}
generate();
}, [agent.id]);
function copySip() {
navigator.clipboard.writeText(sipUri);
setCopied(true);
setTimeout(() => setCopied(false), 2000);
}
const tabStyle = (t) => ({
padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
border: 'none', background: tab === t ? 'rgba(0,255,65,0.12)' : 'transparent',
color: tab === t ? '#00ff41' : '#006614', fontFamily: 'Share Tech Mono, monospace', letterSpacing: '0.05em',
});
return (
<div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:'16px' }}>
<div style={{ width:'100%', maxWidth:'460px', background:'rgba(0,8,0,0.97)', border:'1px solid rgba(0,255,65,0.3)', borderRadius:'8px', padding:'24px', boxShadow:'0 0 40px rgba(0,255,65,0.1)' }}>
<div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
<div>
<div style={{ color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'0.1em' }}>[ SIP SOFTPHONE CONFIG ]</div>
<div style={{ color:'#006614', fontFamily:'monospace', fontSize:'0.7rem', marginTop:'2px' }}>{agent.display_name} · EXT {agent.extension || '—'}</div>
</div>
<button onClick={onClose} style={{ background:'none', border:'none', color:'#006614', cursor:'pointer', fontSize:'1.2rem' }}>✕</button>
</div>
    <div style={{ display:'flex', gap:'4px', marginBottom:'20px', background:'rgba(0,15,0,0.6)', borderRadius:'8px', padding:'4px', border:'1px solid rgba(0,255,65,0.1)' }}>
      <button style={tabStyle('zoiper')} onClick={() => setTab('zoiper')}>Zoiper</button>
      <button style={tabStyle('linphone')} onClick={() => setTab('linphone')}>Linphone</button>
      <button style={tabStyle('manual')} onClick={() => setTab('manual')}>Manual setup</button>
    </div>

    {loading && (
      <div style={{ textAlign:'center', padding:'32px', color:'#006614', fontFamily:'monospace', fontSize:'0.8rem', letterSpacing:'0.15em' }}>[ GENERATING SIP CONFIG... ]</div>
    )}

    {error && (
      <div style={{ color:'#ff4444', background:'rgba(255,0,0,0.08)', border:'1px solid rgba(255,0,0,0.3)', borderRadius:'4px', padding:'12px', fontSize:'0.8rem', fontFamily:'monospace', marginBottom:'16px' }}>
        ERROR: {error}<br/>
        <span style={{ color:'#ff6666', fontSize:'0.75rem' }}>Make sure a SIP trunk is configured in Dashboard → SIP Trunks</span>
      </div>
    )}

    {qrDataUrl && (
      <>
        <div style={{ textAlign:'center', marginBottom:'16px' }}>
          <div style={{ display:'inline-block', background:'#000', padding:'12px', borderRadius:'4px', border:'2px solid rgba(0,255,65,0.4)', boxShadow:'0 0 20px rgba(0,255,65,0.15)' }}>
            <img src={qrDataUrl} alt="SIP Config QR" style={{ width:200, height:200, display:'block' }} />
          </div>
        </div>

        {tab === 'zoiper' && (
          <div style={{ background:'rgba(0,15,0,0.6)', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', padding:'14px', marginBottom:'16px' }}>
            <div style={{ color:'#003300', fontFamily:'monospace', fontSize:'0.65rem', letterSpacing:'0.2em', marginBottom:'10px' }}>// ZOIPER SETUP</div>
            <div style={{ color:'#00aa2a', fontFamily:'monospace', fontSize:'0.8rem', lineHeight:'1.8' }}>
              1. Open Zoiper on Android/iOS<br/>
              2. Tap Settings → Accounts → +<br/>
              3. Tap Scan QR code<br/>
              4. Scan this QR — auto-configured ✓
            </div>
            <div style={{ marginTop:'10px', color:'#006614', fontFamily:'monospace', fontSize:'0.7rem' }}>⬇ Download Zoiper: Play Store / App Store (free)</div>
          </div>
        )}

        {tab === 'linphone' && (
          <div style={{ background:'rgba(0,15,0,0.6)', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', padding:'14px', marginBottom:'16px' }}>
            <div style={{ color:'#003300', fontFamily:'monospace', fontSize:'0.65rem', letterSpacing:'0.2em', marginBottom:'10px' }}>// LINPHONE SETUP</div>
            <div style={{ color:'#00aa2a', fontFamily:'monospace', fontSize:'0.8rem', lineHeight:'1.8' }}>
              1. Open Linphone on Android/iOS<br/>
              2. Tap Use SIP account<br/>
              3. Tap Scan QR code<br/>
              4. Scan this QR — auto-configured ✓
            </div>
            <div style={{ marginTop:'10px', color:'#006614', fontFamily:'monospace', fontSize:'0.7rem' }}>⬇ Download Linphone: Play Store / App Store (free)</div>
          </div>
        )}

        {tab === 'manual' && (
          <div style={{ background:'rgba(0,15,0,0.6)', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'4px', padding:'14px', marginBottom:'16px' }}>
            <div style={{ color:'#003300', fontFamily:'monospace', fontSize:'0.65rem', letterSpacing:'0.2em', marginBottom:'10px' }}>// MANUAL ENTRY</div>
            <div style={{ color:'#00aa2a', fontFamily:'monospace', fontSize:'0.75rem', lineHeight:'1.8' }}>Enter these in any SIP app:</div>
            <div style={{ background:'rgba(0,20,0,0.8)', border:'1px solid rgba(0,255,65,0.1)', borderRadius:'4px', padding:'10px', marginTop:'8px', fontFamily:'monospace', fontSize:'0.75rem' }}>
              <div style={{ color:'#006614' }}>SIP URI:</div>
              <div style={{ color:'#00ff41', wordBreak:'break-all', marginBottom:'6px' }}>{sipUri}</div>
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={copySip} style={{ flex:1, padding:'10px', background:'rgba(0,255,65,0.08)', border:'1px solid rgba(0,255,65,0.25)', color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'0.75rem', cursor:'pointer', borderRadius:'4px', letterSpacing:'0.1em' }}>
            {copied ? '✓ COPIED' : '[ COPY SIP URI ]'}
          </button>
          <a href={qrDataUrl} download={`${agent.display_name}-sip-qr.png`} style={{ flex:1, padding:'10px', background:'rgba(0,255,65,0.08)', border:'1px solid rgba(0,255,65,0.25)', color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'0.75rem', cursor:'pointer', borderRadius:'4px', letterSpacing:'0.1em', textDecoration:'none', textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center' }}>
            [ DOWNLOAD QR ]
          </a>
        </div>
      </>
    )}
  </div>
</div>
);
}
