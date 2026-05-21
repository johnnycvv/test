'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com';

const pad = n => n < 10 ? '0' + n : n;
const fmtTimer = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const STATUSES = [
  { val: 'available', label: 'AVAILABLE', color: '#00ff41' },
  { val: 'break',     label: 'ON BREAK',  color: '#ffaa00' },
  { val: 'offline',   label: 'OFFLINE',   color: '#333300' },
];

const CALL_STATE = { IDLE:'idle', CONNECTING:'connecting', RINGING:'ringing', INCOMING:'incoming', ACTIVE:'active', ENDING:'ending' };

function AgentPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser]           = useState(null);
  const [token, setToken]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [status, setStatus]       = useState('offline');
  const [sipState, setSipState]   = useState('disconnected'); // disconnected, connecting, registered, error
  const [sipError, setSipError]   = useState('');
  const [callState, setCallState] = useState(CALL_STATE.IDLE);
  const [callInfo, setCallInfo]   = useState(null);
  const [callTimer, setCallTimer] = useState(0);
  const [dialNumber, setDialNumber] = useState('');
  const [muted, setMuted]         = useState(false);
  const [onHold, setOnHold]       = useState(false);
  const [dtmf, setDtmf]           = useState('');

  const uaRef       = useRef(null);
  const sessionRef  = useRef(null);
  const timerRef    = useRef(null);
  const remoteAudio = useRef(null);

  // QR token auto-login
  useEffect(() => {
    const qrToken = searchParams?.get('token');
    if (qrToken) {
      fetch(API + '/api/auth/me', { headers: { Authorization: `Bearer ${qrToken}` } })
        .then(r => r.json())
        .then(data => {
          if (data.id) {
            localStorage.setItem('cc_token', qrToken);
            localStorage.setItem('cc_user', JSON.stringify(data));
            window.location.replace('/agent');
          } else { router.push('/login'); }
        })
        .catch(() => router.push('/login'));
      return;
    }

    // Normal auth check
    const t = localStorage.getItem('cc_token');
    const u = localStorage.getItem('cc_user');
    if (!t || !u) { router.push('/login'); return; }
    setToken(t);
    setUser(JSON.parse(u));
    setLoading(false);
  }, []);

  // Init JsSIP once user is loaded
  useEffect(() => {
    if (!user || !token) return;
    initJsSIP(token);
    return () => { uaRef.current?.stop?.(); };
  }, [user, token]);

  // Call timer
  useEffect(() => {
    if (callState === CALL_STATE.ACTIVE) {
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setCallTimer(0);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  async function initJsSIP(authToken) {
    setSipState('connecting');
    setSipError('');
    try {
      // Get SIP credentials from master account config
      const res = await fetch(`${API}/api/sip/credentials`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const creds = await res.json();
      if (!res.ok) throw new Error(creds.error || 'Failed to get SIP credentials');

      // Dynamically load JsSIP (CDN)
      await loadJsSIP();

      const JsSIP = window.JsSIP;
      JsSIP.debug.disable('JsSIP:*');

      const socket = new JsSIP.WebSocketInterface(creds.wsUri);

      const ua = new JsSIP.UA({
        sockets: [socket],
        uri: creds.sipUri,
        password: creds.password,
        realm: creds.realm,
        display_name: creds.displayName,
        register: true,
        register_expires: creds.expires || 300,
        session_timers: false,
        use_preloaded_route: false,
      });

      ua.on('registered', () => { setSipState('registered'); setSipError(''); });
      ua.on('unregistered', () => { setSipState('disconnected'); });
      ua.on('registrationFailed', (e) => {
        setSipState('error');
        setSipError('Registration failed: ' + (e.cause || 'Unknown error'));
      });
      ua.on('connected', () => { setSipState('connecting'); });
      ua.on('disconnected', () => {
        setSipState('error');
        setSipError('WebSocket disconnected from SIP server');
      });

      // Incoming call
      ua.on('newRTCSession', (e) => {
        if (e.originator === 'remote') {
          const session = e.session;
          sessionRef.current = session;
          setCallState(CALL_STATE.INCOMING);
          setCallInfo({ from: e.request.from.uri.user || e.request.from.display_name, direction: 'inbound' });
          attachSessionEvents(session);
        }
      });

      ua.start();
      uaRef.current = ua;
    } catch (err) {
      setSipState('error');
      setSipError(err.message);
    }
  }

  function loadJsSIP() {
    return new Promise((resolve, reject) => {
      if (window.JsSIP) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jssip/3.10.0/jssip.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load JsSIP library'));
      document.head.appendChild(script);
    });
  }

  function attachSessionEvents(session) {
    session.on('accepted', () => {
      setCallState(CALL_STATE.ACTIVE);
      // Connect remote audio
      session.connection?.getRemoteStreams?.()?.forEach?.(stream => {
        if (remoteAudio.current) {
          remoteAudio.current.srcObject = stream;
          remoteAudio.current.play().catch(() => {});
        }
      });
      // Also listen for track events
      session.connection?.addEventListener?.('track', (e) => {
        if (remoteAudio.current) {
          remoteAudio.current.srcObject = e.streams[0];
          remoteAudio.current.play().catch(() => {});
        }
      });
    });

    session.on('progress', () => { setCallState(CALL_STATE.RINGING); });
    session.on('confirmed', () => { setCallState(CALL_STATE.ACTIVE); });

    session.on('ended', () => { endCallCleanup(); });
    session.on('failed', (e) => {
      setSipError('Call failed: ' + (e.cause || ''));
      endCallCleanup();
    });
  }

  function endCallCleanup() {
    setCallState(CALL_STATE.IDLE);
    setCallInfo(null);
    setMuted(false);
    setOnHold(false);
    setDtmf('');
    sessionRef.current = null;
    if (remoteAudio.current) remoteAudio.current.srcObject = null;
    updateStatus('available');
  }

  async function updateStatus(s) {
    setStatus(s);
    if (token && user) {
      await fetch(`${API}/api/agents/${user.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: s })
      }).catch(() => {});
    }
  }

  async function answerCall() {
    if (!sessionRef.current) return;
    setCallState(CALL_STATE.CONNECTING);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sessionRef.current.answer({
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      });
    } catch (err) { setSipError('Mic access denied: ' + err.message); endCallCleanup(); }
  }

  function rejectCall() {
    sessionRef.current?.terminate?.({ status_code: 486, reason_phrase: 'Busy Here' });
    endCallCleanup();
  }

  async function makeCall() {
    if (!dialNumber.trim() || sipState !== 'registered' || !uaRef.current) return;
    setCallState(CALL_STATE.CONNECTING);
    setDtmf('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const target = dialNumber.includes('@') ? dialNumber : `sip:${dialNumber}@${uaRef.current._configuration?.realm || ''}`;
      const session = uaRef.current.call(target, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
        sessionTimersExpires: 300,
        extraHeaders: [],
      });
      sessionRef.current = session;
      setCallInfo({ to: dialNumber, direction: 'outbound' });
      attachSessionEvents(session);
    } catch (err) { setSipError(err.message); setCallState(CALL_STATE.IDLE); }
  }

  function hangup() {
    setCallState(CALL_STATE.ENDING);
    try { sessionRef.current?.terminate?.(); } catch (e) {}
  }

  function toggleMute() {
    const next = !muted;
    if (next) { sessionRef.current?.mute?.(); } else { sessionRef.current?.unmute?.(); }
    setMuted(next);
  }

  function toggleHold() {
    const next = !onHold;
    if (next) { sessionRef.current?.hold?.(); } else { sessionRef.current?.unhold?.(); }
    setOnHold(next);
  }

  function sendDtmf(d) {
    sessionRef.current?.sendDTMF?.(d);
    setDtmf(n => n + d);
    if (callState === CALL_STATE.IDLE) setDialNumber(n => n + d);
  }

  function logout() {
    uaRef.current?.stop?.();
    localStorage.clear();
    window.location.href = '/login';
  }

  const isOnCall = [CALL_STATE.ACTIVE, CALL_STATE.CONNECTING, CALL_STATE.RINGING, CALL_STATE.ENDING].includes(callState);
  const curStatus = STATUSES.find(s => s.val === status) || STATUSES[2];

  const sipStatusColor = sipState === 'registered' ? '#00ff41' : sipState === 'error' ? '#ff4444' : '#ffaa00';
  const sipStatusText = sipState === 'registered' ? '● SIP: REGISTERED' : sipState === 'error' ? '● SIP: ERROR' : sipState === 'connecting' ? '● SIP: CONNECTING...' : '● SIP: OFFLINE';

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#000' }}>
      <div style={{ color:'#00ff41', fontFamily:'Share Tech Mono, monospace' }}>[ LOADING... ]</div>
    </div>
  );

  // Style constants
  const G = '#00ff41';
  const DG = '#006614';
  const DDG = '#003300';
  const BG = 'rgba(0,8,0,0.92)';
  const BORDER = '1px solid rgba(0,255,65,0.2)';
  const FONT = 'Share Tech Mono, monospace';

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'transparent', color:G, fontFamily:FONT }}>
      {/* Hidden audio element for SIP calls */}
      <audio ref={remoteAudio} autoPlay style={{ display:'none' }} />

      {/* ── Sidebar ── */}
      <aside style={{ width:'240px', display:'flex', flexDirection:'column', borderRight:BORDER, background:'rgba(0,5,0,0.96)', flexShrink:0 }}>
        {/* Logo */}
        <div style={{ padding:'20px 16px', borderBottom:BORDER }}>
          <div style={{ fontSize:'1rem', fontWeight:'bold', letterSpacing:'0.15em', textShadow:'0 0 12px rgba(0,255,65,0.8)' }}>[CLOUDCALL]</div>
          <div style={{ color:DDG, fontSize:'0.6rem', marginTop:'4px', letterSpacing:'0.2em' }}>AGENT SOFTPHONE v2.0</div>
        </div>

        {/* Agent info */}
        <div style={{ padding:'16px', borderBottom:BORDER }}>
          <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:'rgba(0,255,65,0.08)', border:'1px solid rgba(0,255,65,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', fontWeight:'bold', marginBottom:'10px' }}>
            {(user?.displayName || user?.display_name || 'A')[0].toUpperCase()}
          </div>
          <div style={{ color:G, fontSize:'0.85rem', fontWeight:'bold' }}>{user?.displayName || user?.display_name}</div>
          <div style={{ color:DG, fontSize:'0.7rem', marginTop:'2px' }}>{user?.email}</div>
          <div style={{ color:'#00aa2a', fontSize:'0.7rem', marginTop:'4px', letterSpacing:'0.1em' }}>EXT: {user?.extension || '—'}</div>
        </div>

        {/* SIP status */}
        <div style={{ margin:'12px', padding:'10px', background:'rgba(0,10,0,0.8)', border:`1px solid ${sipStatusColor}33`, borderRadius:'2px' }}>
          <div style={{ color:sipStatusColor, fontFamily:'monospace', fontSize:'0.7rem', letterSpacing:'0.1em' }}>{sipStatusText}</div>
          {sipError && <div style={{ color:'#ff6666', fontSize:'0.65rem', marginTop:'6px', lineHeight:'1.4' }}>{sipError}</div>}
          {sipState === 'error' && (
            <button onClick={() => initJsSIP(token)} style={{ marginTop:'8px', width:'100%', padding:'6px', background:'rgba(0,255,65,0.08)', border:'1px solid rgba(0,255,65,0.2)', color:DG, fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer', borderRadius:'2px' }}>
              [ RECONNECT ]
            </button>
          )}
        </div>

        {/* Status selector */}
        <div style={{ padding:'0 12px 12px' }}>
          <div style={{ color:DDG, fontSize:'0.6rem', letterSpacing:'0.2em', marginBottom:'8px' }}>// MY STATUS</div>
          {STATUSES.map(s => (
            <button key={s.val} onClick={() => updateStatus(s.val)} disabled={isOnCall} style={{
              width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', marginBottom:'4px',
              background: status === s.val ? 'rgba(0,255,65,0.06)' : 'transparent',
              border: status === s.val ? `1px solid ${s.color}44` : '1px solid transparent',
              borderRadius:'2px', color: status === s.val ? s.color : DDG,
              fontFamily:FONT, fontSize:'0.75rem', cursor: isOnCall ? 'not-allowed' : 'pointer',
              opacity: isOnCall ? 0.5 : 1, letterSpacing:'0.1em',
            }}>
              <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: status === s.val ? s.color : DDG, flexShrink:0, boxShadow: status === s.val ? `0 0 6px ${s.color}` : 'none' }}/>
              {s.label}
            </button>
          ))}
        </div>

        {/* Call state indicator */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{
            width:'64px', height:'64px', borderRadius:'50%',
            border: callState === CALL_STATE.ACTIVE ? '2px solid #ff0000' : callState === CALL_STATE.INCOMING ? '2px solid #00ff41' : '2px solid rgba(0,255,65,0.15)',
            display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'10px',
            boxShadow: callState === CALL_STATE.ACTIVE ? '0 0 20px rgba(255,0,0,0.3)' : callState === CALL_STATE.INCOMING ? '0 0 20px rgba(0,255,65,0.3)' : 'none',
          }}>
            <span style={{ width:'14px', height:'14px', borderRadius:'50%', background: callState === CALL_STATE.ACTIVE ? '#ff0000' : callState === CALL_STATE.INCOMING ? G : status === 'available' ? G : DDG }}/>
          </div>
          {callState === CALL_STATE.ACTIVE && <div style={{ color:'#ff4444', fontSize:'0.7rem', letterSpacing:'0.1em' }}>ON CALL</div>}
          {callState === CALL_STATE.ACTIVE && <div style={{ color:'#ff4444', fontSize:'1.4rem', fontWeight:'bold', marginTop:'4px' }}>{fmtTimer(callTimer)}</div>}
          {callState === CALL_STATE.INCOMING && <div style={{ color:G, fontSize:'0.7rem', letterSpacing:'0.1em' }}>INCOMING...</div>}
          {callState === CALL_STATE.RINGING && <div style={{ color:'#ffaa00', fontSize:'0.7rem', letterSpacing:'0.1em' }}>RINGING...</div>}
          {callState === CALL_STATE.IDLE && <div style={{ color:DG, fontSize:'0.7rem', letterSpacing:'0.1em' }}>{status === 'available' ? 'READY' : 'STANDBY'}</div>}
        </div>

        {/* Footer */}
        <div style={{ borderTop:BORDER, padding:'12px' }}>
          <button onClick={logout} style={{ background:'none', border:'none', color:DDG, fontFamily:FONT, fontSize:'0.65rem', cursor:'pointer', letterSpacing:'0.1em' }}>[LOGOUT]</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'32px', background:'rgba(0,3,0,0.6)' }}>
        <div style={{ width:'100%', maxWidth:'320px', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* ── INCOMING CALL ── */}
          {callState === CALL_STATE.INCOMING && (
            <div style={{ background:'rgba(0,20,0,0.95)', border:'2px solid rgba(0,255,65,0.5)', borderRadius:'4px', padding:'28px', textAlign:'center', boxShadow:'0 0 40px rgba(0,255,65,0.2)' }}>
              <div style={{ color:DDG, fontSize:'0.65rem', letterSpacing:'0.3em', marginBottom:'12px' }}>// INCOMING CALL</div>
              <div style={{ fontSize:'2rem', marginBottom:'8px' }}>📞</div>
              <div style={{ color:G, fontSize:'1.6rem', fontWeight:'bold', letterSpacing:'0.1em', marginBottom:'4px', textShadow:'0 0 10px rgba(0,255,65,0.5)' }}>
                {callInfo?.from || 'UNKNOWN'}
              </div>
              <div style={{ color:DG, fontSize:'0.7rem', letterSpacing:'0.15em', marginBottom:'24px' }}>INBOUND · VIA SIP TRUNK</div>
              <div style={{ display:'flex', gap:'12px' }}>
                <button onClick={rejectCall} style={{ flex:1, padding:'14px', background:'rgba(255,0,0,0.08)', border:'1px solid rgba(255,0,0,0.4)', color:'#ff4444', fontFamily:FONT, fontSize:'0.85rem', cursor:'pointer', borderRadius:'2px', fontWeight:'bold' }}>
                  [DECLINE]
                </button>
                <button onClick={answerCall} style={{ flex:1, padding:'14px', background:G, border:'none', color:'#000', fontFamily:FONT, fontSize:'0.85rem', cursor:'pointer', borderRadius:'2px', fontWeight:'bold', boxShadow:'0 0 15px rgba(0,255,65,0.4)' }}>
                  [ANSWER]
                </button>
              </div>
            </div>
          )}

          {/* ── ACTIVE / CONNECTING CALL ── */}
          {isOnCall && callState !== CALL_STATE.INCOMING && (
            <div style={{ background:'rgba(10,0,0,0.95)', border:'1px solid rgba(255,0,0,0.3)', borderRadius:'4px', padding:'20px', display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ color:'#ff4444', fontSize:'0.65rem', letterSpacing:'0.3em', textAlign:'center' }}>
                {callState === CALL_STATE.ACTIVE ? '// ACTIVE CALL' : callState === CALL_STATE.RINGING ? '// RINGING...' : callState === CALL_STATE.CONNECTING ? '// CONNECTING...' : '// ENDING...'}
              </div>

              {callState === CALL_STATE.ACTIVE && (
                <>
                  <div style={{ color:'#ff4444', fontSize:'3rem', fontWeight:'bold', textAlign:'center', textShadow:'0 0 15px rgba(255,0,0,0.4)' }}>
                    {fmtTimer(callTimer)}
                  </div>
                  <div style={{ color:'#ff6666', fontSize:'1rem', textAlign:'center', letterSpacing:'0.1em' }}>
                    {callInfo?.direction === 'inbound' ? callInfo?.from : callInfo?.to}
                  </div>
                  <div style={{ color:'#440000', fontSize:'0.65rem', textAlign:'center', letterSpacing:'0.15em' }}>
                    {callInfo?.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'} · VIA SIP TRUNK
                  </div>

                  {/* Controls */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
                    {[
                      { label: muted ? 'UNMUTE' : 'MUTE', icon: muted ? '🔇' : '🎤', fn: toggleMute, active: muted },
                      { label: onHold ? 'RESUME' : 'HOLD', icon: '⏸', fn: toggleHold, active: onHold },
                      { label: 'XFER', icon: '↗', fn: () => {}, active: false },
                    ].map(btn => (
                      <button key={btn.label} onClick={btn.fn} style={{
                        padding:'10px 6px', background: btn.active ? 'rgba(255,170,0,0.1)' : 'rgba(0,255,65,0.04)',
                        border: btn.active ? '1px solid rgba(255,170,0,0.4)' : '1px solid rgba(0,255,65,0.15)',
                        color: btn.active ? '#ffaa00' : DG, fontFamily:FONT, fontSize:'0.6rem',
                        cursor:'pointer', borderRadius:'2px', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
                      }}>
                        <span style={{ fontSize:'1.1rem' }}>{btn.icon}</span>
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* DTMF display */}
                  {dtmf && (
                    <div style={{ background:'rgba(0,15,0,0.8)', border:BORDER, borderRadius:'2px', padding:'8px', textAlign:'center', fontFamily:'monospace', color:G, fontSize:'1.1rem', letterSpacing:'0.3em' }}>
                      {dtmf}
                    </div>
                  )}

                  {/* DTMF keypad */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
                    {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                      <button key={d} onClick={() => sendDtmf(d)} style={{
                        height:'40px', background:'rgba(0,255,65,0.04)', border:'1px solid rgba(0,255,65,0.12)',
                        color:G, fontFamily:FONT, fontSize:'1rem', cursor:'pointer', borderRadius:'2px',
                      }}>{d}</button>
                    ))}
                  </div>
                </>
              )}

              {(callState === CALL_STATE.RINGING || callState === CALL_STATE.CONNECTING) && (
                <div style={{ textAlign:'center', color:DG, fontSize:'0.8rem', letterSpacing:'0.15em', padding:'8px' }}>
                  {callInfo?.to}
                </div>
              )}

              <button onClick={hangup} disabled={callState === CALL_STATE.ENDING} style={{
                padding:'14px', background:'rgba(255,0,0,0.12)', border:'1px solid rgba(255,0,0,0.5)',
                color:'#ff4444', fontFamily:FONT, fontSize:'0.9rem', cursor:'pointer', borderRadius:'2px', fontWeight:'bold', letterSpacing:'0.15em',
              }}>
                {callState === CALL_STATE.ENDING ? '[ ENDING... ]' : '[ END CALL ]'}
              </button>
            </div>
          )}

          {/* ── DIAL PAD ── */}
          {callState === CALL_STATE.IDLE && (
            <div style={{ background:BG, border:BORDER, borderRadius:'4px', padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ color:DDG, fontSize:'0.65rem', letterSpacing:'0.3em', textAlign:'center' }}>// DIAL PAD</div>

              {/* Number display */}
              <div style={{ background:'rgba(0,12,0,0.9)', border:'1px solid rgba(0,255,65,0.25)', borderRadius:'2px', padding:'12px 16px', display:'flex', alignItems:'center', minHeight:'52px' }}>
                <span style={{ color:G, fontFamily:'monospace', fontSize:'1.3rem', letterSpacing:'0.2em', flex:1, textAlign:'center' }}>
                  {dialNumber || <span style={{ color:DDG }}>_</span>}
                </span>
                {dialNumber && (
                  <button onClick={() => setDialNumber(n => n.slice(0,-1))} style={{ background:'none', border:'none', color:DG, cursor:'pointer', fontSize:'1rem', padding:'0 4px' }}>⌫</button>
                )}
              </div>

              {/* Keypad */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
                {[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']].map(([d,sub]) => (
                  <button key={d} onClick={() => setDialNumber(n => n + d)} style={{
                    height:'56px', background:'rgba(0,255,65,0.04)', border:'1px solid rgba(0,255,65,0.12)',
                    borderRadius:'2px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px',
                  }}>
                    <span style={{ color:G, fontFamily:FONT, fontSize:'1.2rem', fontWeight:'bold' }}>{d}</span>
                    {sub && <span style={{ color:DDG, fontSize:'0.55rem', letterSpacing:'0.15em' }}>{sub}</span>}
                  </button>
                ))}
              </div>

              {/* Call button */}
              <button
                onClick={makeCall}
                disabled={!dialNumber.trim() || sipState !== 'registered' || status === 'offline'}
                style={{
                  padding:'16px', borderRadius:'2px', fontFamily:FONT, fontSize:'1rem', fontWeight:'bold', letterSpacing:'0.2em',
                  cursor: dialNumber.trim() && sipState === 'registered' && status !== 'offline' ? 'pointer' : 'not-allowed',
                  background: dialNumber.trim() && sipState === 'registered' && status !== 'offline' ? G : 'rgba(0,30,0,0.4)',
                  border: dialNumber.trim() && sipState === 'registered' && status !== 'offline' ? 'none' : '1px solid rgba(0,255,65,0.08)',
                  color: dialNumber.trim() && sipState === 'registered' && status !== 'offline' ? '#000' : DDG,
                  boxShadow: dialNumber.trim() && sipState === 'registered' && status !== 'offline' ? '0 0 20px rgba(0,255,65,0.35)' : 'none',
                }}
              >
                [ INITIATE CALL ]
              </button>

              {sipState !== 'registered' && (
                <div style={{ color:DDG, fontSize:'0.65rem', textAlign:'center', letterSpacing:'0.15em' }}>
                  {sipState === 'error' ? 'SIP ERROR — CHECK TRUNK CONFIG' : 'CONNECTING TO SIP SERVER...'}
                </div>
              )}
              {status === 'offline' && sipState === 'registered' && (
                <div style={{ color:DDG, fontSize:'0.65rem', textAlign:'center', letterSpacing:'0.15em' }}>SET STATUS TO AVAILABLE</div>
              )}
            </div>
          )}

          <div style={{ textAlign:'center', color:'#001a00', fontSize:'0.6rem', letterSpacing:'0.15em' }}>
            // JSSIP WebRTC · No Twilio Required
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AgentPage() {
  return <Suspense fallback={<div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ color:'#00ff41', fontFamily:'monospace' }}>[ LOADING... ]</div></div>}><AgentPageInner /></Suspense>;
}
