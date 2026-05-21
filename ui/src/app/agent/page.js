'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, twilioApi } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
const pad = n => n < 10 ? '0' + n : n;
const fmtTimer = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const STATUSES = [
{ val: 'available', label: 'Available', dot: 'dot-green', text: 'text-emerald-400' },
{ val: 'break', label: 'On break', dot: 'dot-amber', text: 'text-amber-400' },
{ val: 'offline', label: 'Offline', dot: 'dot-gray', text: 'text-slate-500' },
];
const CALL_STATE = { IDLE:'idle', CONNECTING:'connecting', RINGING:'ringing', INCOMING:'incoming', ACTIVE:'active', ENDING:'ending' };
function AgentPageInner() {
const { user, logout, loading } = useAuth();
const router = useRouter();
const searchParams = useSearchParams();
const deviceRef = useRef(null);
const callRef = useRef(null);
const timerRef = useRef(null);
const [status, setStatus] = useState('offline');
const [deviceReady, setDeviceReady] = useState(false);
const [deviceError, setDeviceError] = useState('');
const [callState, setCallState] = useState(CALL_STATE.IDLE);
const [callInfo, setCallInfo] = useState(null);
const [callTimer, setCallTimer] = useState(0);
const [dialNumber, setDialNumber] = useState('');
const [muted, setMuted] = useState(false);
const [onHold, setOnHold] = useState(false);
const [notes, setNotes] = useState('');
const [volume, setVolume] = useState(1);
useEffect(() => {
const qrToken = searchParams?.get('token');
if (qrToken && !user) {
localStorage.setItem('cc_token', qrToken);
fetch((process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com') + '/api/auth/me', {
headers: { Authorization: `Bearer ${qrToken}` }
}).then(r => r.json()).then(data => {
if (data.id) { localStorage.setItem('cc_user', JSON.stringify(data)); window.location.replace('/agent'); }
}).catch(() => router.push('/login'));
}
}, [searchParams]);
useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading]);
useEffect(() => {
if (!user) return;
async function initDevice() {
try {
const { Device } = await import('@twilio/voice-sdk');
const { token } = await twilioApi.getToken();
const device = new Device(token, { logLevel: 1, codecPreferences: ['opus', 'pcmu'], fakeLocalDTMF: true, enableRingingState: true });
device.on('ready', () => { setDeviceReady(true); setDeviceError(''); });
device.on('error', (err) => { setDeviceError(err.message); });
device.on('tokenWillExpire', async () => { const { token: t } = await twilioApi.getToken(); device.updateToken(t); });
device.on('incoming', (call) => {
callRef.current = call;
setCallState(CALL_STATE.INCOMING);
setCallInfo({ from: call.parameters.From, to: call.parameters.To, direction: 'inbound', callSid: call.parameters.CallSid });
attachCallHandlers(call);
});
device.register();
deviceRef.current = device;
} catch (err) { setDeviceError(`Twilio init failed: ${err.message}`); }
}
initDevice();
return () => { deviceRef.current?.destroy(); };
}, [user]);
useEffect(() => {
if (callState === CALL_STATE.ACTIVE) {
timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
} else { clearInterval(timerRef.current); setCallTimer(0); }
return () => clearInterval(timerRef.current);
}, [callState]);
function attachCallHandlers(call) {
call.on('accept', () => { setCallState(CALL_STATE.ACTIVE); setMuted(false); setOnHold(false); api.setAgentStatus(user.id, 'on_call').catch(() => {}); });
call.on('ringing', () => { setCallState(CALL_STATE.RINGING); });
call.on('disconnect', () => { endCallCleanup(); });
call.on('cancel', () => { endCallCleanup(); });
call.on('reject', () => { endCallCleanup(); });
call.on('error', (err) => { setDeviceError(err.message); endCallCleanup(); });
}
function endCallCleanup() {
setCallState(CALL_STATE.IDLE); setCallInfo(null); setMuted(false); setOnHold(false); setNotes(''); callRef.current = null;
api.setAgentStatus(user.id, 'available').catch(() => {});
}
async function setMyStatus(s) {
await api.setAgentStatus(user.id, s).catch(() => {});
setStatus(s);
if (s === 'offline' || s === 'break') { deviceRef.current?.unregister(); } else { deviceRef.current?.register(); }
}
async function answerCall() { if (!callRef.current) return; setCallState(CALL_STATE.CONNECTING); callRef.current.accept(); }
function rejectCall() { callRef.current?.reject(); endCallCleanup(); }
async function makeCall() {
if (!dialNumber.trim() || !deviceRef.current || !deviceReady) return;
setCallState(CALL_STATE.CONNECTING);
try {
const call = await deviceRef.current.connect({ params: { To: dialNumber.trim(), From: user.sipUsername || user.email } });
callRef.current = call;
setCallInfo({ from: user.displayName, to: dialNumber.trim(), direction: 'outbound' });
attachCallHandlers(call);
} catch (err) { setDeviceError(`Twilio init failed: ${err.message}`); }
function hangup() { setCallState(CALL_STATE.ENDING); callRef.current?.disconnect(); }
function toggleMute() { if (!callRef.current) return; const next = !muted; callRef.current.mute(next); setMuted(next); }
function toggleHold() { const next = !onHold; callRef.current?.mute(next); setOnHold(next); }
function dialDigit(d) { if (callState === CALL_STATE.ACTIVE) { callRef.current?.sendDigits(d); } setDialNumber(n => n + d); }
useWebSocket(useCallback((evt) => {}, []));
const curStatus = STATUSES.find(s => s.val === status) || STATUSES[2];
const isOnCall = [CALL_STATE.ACTIVE, CALL_STATE.CONNECTING, CALL_STATE.RINGING, CALL_STATE.ENDING].includes(callState);
if (loading || !user) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/></div>;
const g = { background:'#000', color:'#00ff41', fontFamily:'Share Tech Mono, monospace' };
return (
<div style={{ minHeight:'100vh', display:'flex', ...g }}>
<aside style={{ width:'240px', display:'flex', flexDirection:'column', borderRight:'1px solid rgba(0,255,65,0.2)', background:'rgba(0,5,0,0.95)', flexShrink:0 }}>
<div style={{ padding:'16px', borderBottom:'1px solid rgba(0,255,65,0.2)' }}>
<div style={{ color:'#00ff41', fontSize:'1rem', fontWeight:'bold', letterSpacing:'0.1em', textShadow:'0 0 10px rgba(0,255,65,0.8)' }}>[CLOUDCALL]</div>
<div style={{ color:'#003300', fontSize:'0.65rem', marginTop:'4px' }}>AGENT SOFTPHONE</div>
</div>
<div style={{ padding:'16px', borderBottom:'1px solid rgba(0,255,65,0.2)' }}>
<div style={{ color:'#00aa2a', fontSize:'0.8rem', marginBottom:'4px' }}>{user.displayName}</div>
<div style={{ color:'#006614', fontSize:'0.7rem', marginBottom:'12px' }}>EXT: {user.extension}</div>
<div style={{ fontSize:'0.65rem', color:'#003300', marginBottom:'8px', letterSpacing:'0.1em' }}>// STATUS</div>
{STATUSES.map(s => (
<button key={s.val} onClick={() => setMyStatus(s.val)} disabled={isOnCall} style={{
width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'6px 10px', marginBottom:'2px',
background: status === s.val ? 'rgba(0,255,65,0.08)' : 'transparent',
border: status === s.val ? '1px solid rgba(0,255,65,0.2)' : '1px solid transparent',
borderRadius:'2px', color: status === s.val ? '#00ff41' : '#006614',
fontFamily:'Share Tech Mono, monospace', fontSize:'0.75rem', cursor:'pointer',
opacity: isOnCall ? 0.4 : 1,
}}>
<span style={{ width:'6px', height:'6px', borderRadius:'50%', background: s.val==='available'?'#00ff41':s.val==='break'?'#ffaa00':'#003300', flexShrink:0 }}/>
{s.label.toUpperCase()}
</button>
))}
</div>
<div style={{ padding:'16px', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
<div style={{ width:'80px', height:'80px', borderRadius:'50%', border:2px solid ${callState===CALL_STATE.ACTIVE?'#ff0000':callState===CALL_STATE.INCOMING?'#00ff41':'rgba(0,255,65,0.2)'}, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px', boxShadow: callState===CALL_STATE.ACTIVE?'0 0 20px rgba(255,0,0,0.4)':callState===CALL_STATE.INCOMING?'0 0 20px rgba(0,255,65,0.4)':'none' }}>
<span style={{ width:'16px', height:'16px', borderRadius:'50%', background: callState===CALL_STATE.ACTIVE?'#ff0000':callState===CALL_STATE.INCOMING?'#00ff41':status==='available'?'#00ff41':'#003300' }}/>
</div>
{callState===CALL_STATE.ACTIVE && <><div style={{ color:'#ff4444', fontSize:'0.75rem', letterSpacing:'0.1em' }}>ON CALL</div><div style={{ color:'#00ff41', fontSize:'1.5rem', fontWeight:'bold', marginTop:'4px' }}>{fmtTimer(callTimer)}</div></>}
{callState===CALL_STATE.INCOMING && <div style={{ color:'#00ff41', fontSize:'0.75rem', letterSpacing:'0.1em' }}>INCOMING...</div>}
{callState===CALL_STATE.IDLE && <div style={{ color:'#006614', fontSize:'0.75rem', letterSpacing:'0.1em' }}>{status==='available'?'READY':'STANDBY'}</div>}
</div>
<div style={{ padding:'12px', borderTop:'1px solid rgba(0,255,65,0.2)' }}>
<div style={{ color:'#003300', fontSize:'0.65rem', marginBottom:'4px' }}>
{deviceReady ? '[ TWILIO: ONLINE ]' : deviceError ? '[ TWILIO: ERROR ]' : '[ TWILIO: CONNECTING ]'}
</div>
<button onClick={logout} style={{ background:'none', border:'none', color:'#006614', fontFamily:'monospace', fontSize:'0.7rem', cursor:'pointer', padding:'4px 0' }}>[LOGOUT]</button>
</div>
</aside>
  <main style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'32px' }}>
    <div style={{ width:'100%', maxWidth:'300px' }}>

      {callState === CALL_STATE.INCOMING && (
        <div style={{ background:'rgba(0,20,0,0.9)', border:'1px solid rgba(0,255,65,0.4)', borderRadius:'4px', padding:'24px', textAlign:'center', boxShadow:'0 0 30px rgba(0,255,65,0.2)' }}>
          <div style={{ color:'#00ff41', fontSize:'0.7rem', letterSpacing:'0.2em', marginBottom:'8px' }}>// INCOMING CALL</div>
          <div style={{ color:'#00ff41', fontSize:'1.5rem', fontWeight:'bold', marginBottom:'4px' }}>{callInfo?.from || 'UNKNOWN'}</div>
          <div style={{ color:'#006614', fontSize:'0.75rem', marginBottom:'20px' }}>INBOUND · VIA TWILIO</div>
          <div style={{ display:'flex', gap:'12px' }}>
            <button onClick={rejectCall} style={{ flex:1, padding:'12px', background:'rgba(255,0,0,0.1)', border:'1px solid rgba(255,0,0,0.4)', color:'#ff4444', fontFamily:'Share Tech Mono, monospace', fontSize:'0.8rem', cursor:'pointer', borderRadius:'2px' }}>[DECLINE]</button>
            <button onClick={answerCall} style={{ flex:1, padding:'12px', background:'#00ff41', border:'none', color:'#000', fontFamily:'Share Tech Mono, monospace', fontSize:'0.8rem', cursor:'pointer', fontWeight:'bold', borderRadius:'2px' }}>[ANSWER]</button>
          </div>
        </div>
      )}

      {isOnCall && callState !== CALL_STATE.INCOMING && (
        <div style={{ background:'rgba(10,0,0,0.9)', border:'1px solid rgba(255,0,0,0.3)', borderRadius:'4px', padding:'20px', boxShadow:'0 0 20px rgba(255,0,0,0.1)' }}>
          <div style={{ textAlign:'center', marginBottom:'16px' }}>
            <div style={{ color:'#ff4444', fontSize:'0.7rem', letterSpacing:'0.2em', marginBottom:'4px' }}>{callState===CALL_STATE.ACTIVE?'// ACTIVE CALL':'// CONNECTING...'}</div>
            {callState===CALL_STATE.ACTIVE && <div style={{ color:'#ff4444', fontSize:'2rem', fontWeight:'bold' }}>{fmtTimer(callTimer)}</div>}
          </div>
          {callState===CALL_STATE.ACTIVE && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'12px' }}>
                {[{l:muted?'UNMUTE':'MUTE',fn:toggleMute},{l:onHold?'RESUME':'HOLD',fn:toggleHold},{l:'XFER',fn:()=>{}}].map(b=>(
                  <button key={b.l} onClick={b.fn} style={{ padding:'8px', background:'rgba(0,255,65,0.05)', border:'1px solid rgba(0,255,65,0.2)', color:'#00aa2a', fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer', borderRadius:'2px' }}>{b.l}</button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'4px', marginBottom:'12px' }}>
                {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d=>(
                  <button key={d} onClick={()=>dialDigit(d)} style={{ height:'36px', background:'rgba(0,255,65,0.05)', border:'1px solid rgba(0,255,65,0.15)', color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'0.9rem', cursor:'pointer', borderRadius:'2px' }}>{d}</button>
                ))}
              </div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="// call notes" rows={2} style={{ width:'100%', background:'rgba(0,10,0,0.8)', border:'1px solid rgba(0,255,65,0.2)', color:'#00aa2a', fontFamily:'monospace', fontSize:'0.75rem', padding:'8px', borderRadius:'2px', resize:'none', marginBottom:'12px', boxSizing:'border-box' }}/>
            </>
          )}
          <button onClick={hangup} disabled={callState===CALL_STATE.ENDING} style={{ width:'100%', padding:'12px', background:'rgba(255,0,0,0.15)', border:'1px solid rgba(255,0,0,0.5)', color:'#ff4444', fontFamily:'Share Tech Mono, monospace', fontSize:'0.85rem', cursor:'pointer', borderRadius:'2px', fontWeight:'bold' }}>
            {callState===CALL_STATE.ENDING?'[ ENDING... ]':'[ END CALL ]'}
          </button>
        </div>
      )}

      {callState === CALL_STATE.IDLE && (
        <div style={{ background:'rgba(0,8,0,0.9)', border:'1px solid rgba(0,255,65,0.2)', borderRadius:'4px', padding:'20px' }}>
          <div style={{ color:'#003300', fontSize:'0.65rem', letterSpacing:'0.2em', textAlign:'center', marginBottom:'16px' }}>// DIAL PAD</div>
          <div style={{ background:'rgba(0,15,0,0.8)', border:'1px solid rgba(0,255,65,0.2)', borderRadius:'2px', padding:'10px 12px', marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'1.1rem', letterSpacing:'0.15em', flex:1, textAlign:'center' }}>
              {dialNumber || <span style={{ color:'#003300' }}>_</span>}
            </span>
            {dialNumber && <button onClick={()=>setDialNumber(n=>n.slice(0,-1))} style={{ background:'none', border:'none', color:'#006614', cursor:'pointer', fontSize:'0.9rem' }}>⌫</button>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px', marginBottom:'12px' }}>
            {[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']].map(([d,sub])=>(
              <button key={d} onClick={()=>setDialNumber(n=>n+d)} style={{ height:'52px', background:'rgba(0,255,65,0.04)', border:'1px solid rgba(0,255,65,0.15)', borderRadius:'2px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1px' }}>
                <span style={{ color:'#00ff41', fontFamily:'Share Tech Mono, monospace', fontSize:'1rem', lineHeight:1 }}>{d}</span>
                {sub && <span style={{ color:'#003300', fontSize:'0.55rem', lineHeight:1 }}>{sub}</span>}
              </button>
            ))}
          </div>
          <button onClick={makeCall} disabled={!dialNumber.trim()||!deviceReady||status==='offline'} style={{
            width:'100%', padding:'12px', fontFamily:'Share Tech Mono, monospace', fontSize:'0.85rem', fontWeight:'bold', cursor: dialNumber.trim()&&deviceReady&&status!=='offline'?'pointer':'not-allowed', borderRadius:'2px',
            background: dialNumber.trim()&&deviceReady&&status!=='offline'?'#00ff41':'rgba(0,50,0,0.3)',
            border: dialNumber.trim()&&deviceReady&&status!=='offline'?'none':'1px solid rgba(0,255,65,0.1)',
            color: dialNumber.trim()&&deviceReady&&status!=='offline'?'#000':'#003300',
            boxShadow: dialNumber.trim()&&deviceReady&&status!=='offline'?'0 0 15px rgba(0,255,65,0.4)':'none',
          }}>[ INITIATE CALL ]</button>
          {status==='offline' && <div style={{ color:'#003300', fontSize:'0.65rem', textAlign:'center', marginTop:'8px', letterSpacing:'0.1em' }}>SET STATUS: AVAILABLE</div>}
        </div>
      )}

      <div style={{ textAlign:'center', marginTop:'12px', color:'#001a00', fontSize:'0.6rem', letterSpacing:'0.15em' }}>// TWILIO WEBRTC ENGINE</div>
    </div>
  </main>
</div>
);
}
export default function AgentPage() {
return <Suspense><AgentPageInner /></Suspense>;
}