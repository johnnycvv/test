'use client';
import { useState, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';
export default function QrModal({ agent, onClose }) {
const [qrDataUrl, setQrDataUrl] = useState('');
const [loading, setLoading]     = useState(true);
const [error, setError]         = useState('');
const [copied, setCopied]       = useState(false);
const [sipUri, setSipUri]       = useState('');
const [sipDetails, setSipDetails] = useState(null);
const [tab, setTab]             = useState('zoiper');
useEffect(() => {
async function generate() {
try {
const token = localStorage.getItem('cc_token');
const res = await fetch(API + '/api/agents/' + agent.id + '/sip-config', {
headers: { Authorization: 'Bearer ' + token }
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Failed to get SIP config');
setSipDetails(data);
    // Zoiper5 QR format - just the SIP URI works best
    const zoiperUri = 'sip:' + data.username + '@' + data.server;
    setSipUri(zoiperUri);

    const QRCode = (await import('qrcode')).default;
    const dataUrl = await QRCode.toDataURL(zoiperUri, {
      width: 280, margin: 2,
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
if (sipDetails) {
navigator.clipboard.writeText(sipDetails.sipUri);
setCopied(true);
setTimeout(() => setCopied(false), 2000);
}
}
const tabStyle = (t) => ({
padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
border: 'none', background: tab === t ? 'rgba(0,255,65,0.12)' : 'transparent',
color: tab === t ? '#00ff41' : '#006614', fontFamily: 'monospace', letterSpacing: '0.05em',
});
return (
<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'16px'}}>
<div style={{width:'100%',maxWidth:'480px',background:'rgba(0,8,0,0.97)',border:'1px solid rgba(0,255,65,0.3)',borderRadius:'8px',padding:'24px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
      <div>
        <div style={{color:'#00ff41',fontFamily:'monospace',fontSize:'0.9rem',fontWeight:'bold',letterSpacing:'0.1em'}}>[ SIP CONFIG ]</div>
        <div style={{color:'#006614',fontFamily:'monospace',fontSize:'0.7rem',marginTop:'2px'}}>{agent.display_name}</div>
      </div>
      <button onClick={onClose} style={{background:'none',border:'none',color:'#006614',cursor:'pointer',fontSize:'1.2rem'}}>X</button>
    </div>

    <div style={{display:'flex',gap:'4px',marginBottom:'20px',background:'rgba(0,15,0,0.6)',borderRadius:'8px',padding:'4px',border:'1px solid rgba(0,255,65,0.1)'}}>
      <button style={tabStyle('zoiper')} onClick={() => setTab('zoiper')}>Zoiper</button>
      <button style={tabStyle('linphone')} onClick={() => setTab('linphone')}>Linphone</button>
      <button style={tabStyle('manual')} onClick={() => setTab('manual')}>Manual</button>
    </div>

    {loading && <div style={{textAlign:'center',padding:'32px',color:'#006614',fontFamily:'monospace'}}>[ GENERATING... ]</div>}

    {error && <div style={{color:'#ff4444',background:'rgba(255,0,0,0.08)',border:'1px solid rgba(255,0,0,0.3)',borderRadius:'4px',padding:'12px',fontSize:'0.8rem',fontFamily:'monospace',marginBottom:'16px'}}>ERROR: {error}</div>}

    {sipDetails && (
      <>
        {tab === 'zoiper' && (
          <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
            <div style={{textAlign:'center'}}>
              {qrDataUrl && <img src={qrDataUrl} alt="SIP QR" style={{width:200,height:200,display:'block',margin:'0 auto',border:'2px solid rgba(0,255,65,0.4)',borderRadius:'4px'}}/>}
            </div>
            <div style={{background:'rgba(0,15,0,0.6)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'4px',padding:'14px'}}>
              <div style={{color:'#003300',fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.2em',marginBottom:'10px'}}>// ZOIPER SETUP</div>
              <div style={{color:'#00aa2a',fontFamily:'monospace',fontSize:'0.8rem',lineHeight:'2'}}>
                1. Open Zoiper 5<br/>
                2. Tap the QR icon on login screen<br/>
                3. Scan this QR code<br/>
                4. Enter password when asked: <span style={{color:'#00ff41',fontWeight:'bold'}}>{sipDetails.password}</span>
              </div>
            </div>
          </div>
        )}

        {tab === 'linphone' && (
          <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
            <div style={{textAlign:'center'}}>
              {qrDataUrl && <img src={qrDataUrl} alt="SIP QR" style={{width:200,height:200,display:'block',margin:'0 auto',border:'2px solid rgba(0,255,65,0.4)',borderRadius:'4px'}}/>}
            </div>
            <div style={{background:'rgba(0,15,0,0.6)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'4px',padding:'14px'}}>
              <div style={{color:'#003300',fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.2em',marginBottom:'10px'}}>// LINPHONE SETUP</div>
              <div style={{color:'#00aa2a',fontFamily:'monospace',fontSize:'0.8rem',lineHeight:'2'}}>
                1. Open Linphone<br/>
                2. Tap Use SIP account<br/>
                3. Tap Scan QR code<br/>
                4. Enter password: <span style={{color:'#00ff41',fontWeight:'bold'}}>{sipDetails.password}</span>
              </div>
            </div>
          </div>
        )}

        {tab === 'manual' && (
          <div style={{background:'rgba(0,15,0,0.6)',border:'1px solid rgba(0,255,65,0.15)',borderRadius:'4px',padding:'14px'}}>
            <div style={{color:'#003300',fontFamily:'monospace',fontSize:'0.65rem',letterSpacing:'0.2em',marginBottom:'12px'}}>// MANUAL ENTRY</div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px',fontFamily:'monospace',fontSize:'0.8rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,255,65,0.08)'}}>
                <span style={{color:'#006614'}}>Username</span>
                <span style={{color:'#00ff41'}}>{sipDetails.username}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,255,65,0.08)'}}>
                <span style={{color:'#006614'}}>Password</span>
                <span style={{color:'#00ff41'}}>{sipDetails.password}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,255,65,0.08)'}}>
                <span style={{color:'#006614'}}>Domain/Server</span>
                <span style={{color:'#00ff41'}}>{sipDetails.server}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,255,65,0.08)'}}>
                <span style={{color:'#006614'}}>Transport</span>
                <span style={{color:'#00ff41'}}>TLS</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0'}}>
                <span style={{color:'#006614'}}>Port</span>
                <span style={{color:'#00ff41'}}>5061</span>
              </div>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:'8px',marginTop:'16px'}}>
          <button onClick={copySip} style={{flex:1,padding:'10px',background:'rgba(0,255,65,0.08)',border:'1px solid rgba(0,255,65,0.25)',color:'#00ff41',fontFamily:'monospace',fontSize:'0.75rem',cursor:'pointer',borderRadius:'4px'}}>
            {copied ? 'COPIED' : '[ COPY DETAILS ]'}
          </button>
          {qrDataUrl && (
            <a href={qrDataUrl} download={agent.display_name + '-sip.png'} style={{flex:1,padding:'10px',background:'rgba(0,255,65,0.08)',border:'1px solid rgba(0,255,65,0.25)',color:'#00ff41',fontFamily:'monospace',fontSize:'0.75rem',cursor:'pointer',borderRadius:'4px',textDecoration:'none',textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
              [ DOWNLOAD QR ]
            </a>
          )}
        </div>
      </>
    )}
  </div>
</div>
);
}
