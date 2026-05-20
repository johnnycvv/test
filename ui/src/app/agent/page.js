'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { api, twilioApi } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';

const pad = n => n < 10 ? '0' + n : n;
const fmtTimer = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

const STATUSES = [
  { val: 'available', label: 'Available', dot: 'dot-green',  text: 'text-emerald-400' },
  { val: 'break',     label: 'On break',  dot: 'dot-amber',  text: 'text-amber-400'   },
  { val: 'offline',   label: 'Offline',   dot: 'dot-gray',   text: 'text-slate-500'   },
];

// Call state machine
const CALL_STATE = {
  IDLE:        'idle',
  CONNECTING:  'connecting',
  RINGING:     'ringing',
  INCOMING:    'incoming',
  ACTIVE:      'active',
  ENDING:      'ending',
};

export default function AgentPage() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  // Twilio device
  const deviceRef    = useRef(null);
  const callRef      = useRef(null);

  // UI state
  const [status,      setStatus]      = useState('offline');
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [callState,   setCallState]   = useState(CALL_STATE.IDLE);
  const [callInfo,    setCallInfo]    = useState(null); // { from, to, direction, callSid }
  const [callTimer,   setCallTimer]   = useState(0);
  const [dialNumber,  setDialNumber]  = useState('');
  const [muted,       setMuted]       = useState(false);
  const [onHold,      setOnHold]      = useState(false);
  const [notes,       setNotes]       = useState('');
  const [volume,      setVolume]      = useState(1);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading]);

  // ── Init Twilio Device ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    async function initDevice() {
      try {
        // Dynamically import Twilio Voice SDK (client-side only)
        const { Device } = await import('@twilio/voice-sdk');

        const { token, identity } = await twilioApi.getToken();

        const device = new Device(token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu'],
          fakeLocalDTMF: true,
          enableRingingState: true,
        });

        // ── Device event handlers ─────────────────────────────────────────────
        device.on('ready', () => {
          console.log('[Twilio] Device ready, identity:', identity);
          setDeviceReady(true);
          setDeviceError('');
        });

        device.on('error', (err) => {
          console.error('[Twilio] Device error:', err.message);
          setDeviceError(err.message);
        });

        device.on('tokenWillExpire', async () => {
          console.log('[Twilio] Token expiring, refreshing...');
          const { token: newToken } = await twilioApi.getToken();
          device.updateToken(newToken);
        });

        // ── Incoming call ─────────────────────────────────────────────────────
        device.on('incoming', (call) => {
          console.log('[Twilio] Incoming call from:', call.parameters.From);
          callRef.current = call;

          setCallState(CALL_STATE.INCOMING);
          setCallInfo({
            from:      call.parameters.From,
            to:        call.parameters.To,
            direction: 'inbound',
            callSid:   call.parameters.CallSid,
          });

          // Attach call event handlers
          attachCallHandlers(call);
        });

        device.register();
        deviceRef.current = device;
      } catch (err) {
        console.error('[Twilio] Init failed:', err.message);
        setDeviceError(`Twilio init failed: ${err.message}. Check TWILIO_* env vars.`);
      }
    }

    initDevice();

    return () => {
      deviceRef.current?.destroy();
    };
  }, [user]);

  // ── Call event handlers ───────────────────────────────────────────────────
  function attachCallHandlers(call) {
    call.on('accept', () => {
      console.log('[Twilio] Call accepted');
      setCallState(CALL_STATE.ACTIVE);
      setMuted(false);
      setOnHold(false);
      startTimer();
      api.setAgentStatus(user.id, 'on_call').catch(() => {});
    });

    call.on('ringing', () => {
      setCallState(CALL_STATE.RINGING);
    });

    call.on('disconnect', () => {
      console.log('[Twilio] Call disconnected');
      endCallCleanup();
    });

    call.on('cancel', () => {
      console.log('[Twilio] Call cancelled');
      endCallCleanup();
    });

    call.on('reject', () => {
      endCallCleanup();
    });

    call.on('error', (err) => {
      console.error('[Twilio] Call error:', err.message);
      setDeviceError(err.message);
      endCallCleanup();
    });
  }

  function startTimer() {
    clearInterval(timerRef.current);
    setCallTimer(0);
    timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
  }

  function endCallCleanup() {
    clearInterval(timerRef.current);
    setCallTimer(0);
    setCallState(CALL_STATE.IDLE);
    setCallInfo(null);
    setMuted(false);
    setOnHold(false);
    setNotes('');
    callRef.current = null;
    api.setAgentStatus(user.id, 'available').catch(() => {});
  }

  // ── Agent actions ─────────────────────────────────────────────────────────

  async function setMyStatus(s) {
    await api.setAgentStatus(user.id, s).catch(() => {});
    setStatus(s);
    // Register or unregister with Twilio based on status
    if (s === 'offline' || s === 'break') {
      deviceRef.current?.unregister();
    } else {
      deviceRef.current?.register();
    }
  }

  async function answerCall() {
    if (!callRef.current) return;
    setCallState(CALL_STATE.CONNECTING);
    callRef.current.accept();
  }

  function rejectCall() {
    callRef.current?.reject();
    endCallCleanup();
  }

  async function makeCall() {
    if (!dialNumber.trim() || !deviceRef.current || !deviceReady) return;
    setCallState(CALL_STATE.CONNECTING);

    try {
      const call = await deviceRef.current.connect({
        params: {
          To:   dialNumber.trim(),
          From: user.sipUsername || user.email,
        },
      });
      callRef.current = call;
      setCallInfo({
        from:      user.displayName,
        to:        dialNumber.trim(),
        direction: 'outbound',
      });
      attachCallHandlers(call);
    } catch (err) {
      console.error('[Twilio] makeCall error:', err);
      setDeviceError(err.message);
      setCallState(CALL_STATE.IDLE);
    }
  }

  function hangup() {
    setCallState(CALL_STATE.ENDING);
    callRef.current?.disconnect();
    // cleanup fires via disconnect event
  }

  function toggleMute() {
    if (!callRef.current) return;
    const next = !muted;
    callRef.current.mute(next);
    setMuted(next);
  }

  function toggleHold() {
    // Hold is implemented by muting both directions via Twilio
    // In production: call Twilio REST API to put call on hold with MOH
    const next = !onHold;
    callRef.current?.mute(next);
    setOnHold(next);
  }

  function sendDtmf(digit) {
    callRef.current?.sendDigits(digit);
    setDialNumber(d => d + digit);
  }

  function dialDigit(d) {
    if (callState === CALL_STATE.ACTIVE) {
      sendDtmf(d);
    } else {
      setDialNumber(n => n + d);
    }
  }

  // WebSocket — listen for platform events
  useWebSocket(useCallback((evt) => {
    // Could handle supervisor whisper, barge etc here in future
  }, []));

  const curStatus = STATUSES.find(s => s.val === status) || STATUSES[2];
  const isOnCall  = [CALL_STATE.ACTIVE, CALL_STATE.CONNECTING, CALL_STATE.RINGING, CALL_STATE.ENDING].includes(callState);

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: '#0f1117' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="w-64 flex flex-col border-r border-[#2e3352]" style={{ background: '#13161f' }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[#2e3352]">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <span className="font-bold text-white">CloudCall</span>
        </div>

        {/* Agent identity */}
        <div className="p-4 border-b border-[#2e3352]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-900/40 border border-blue-800/30 flex items-center justify-center text-sm font-bold text-blue-400">
              {user.displayName?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{user.displayName}</p>
              <p className="text-xs text-slate-500">Ext {user.extension}</p>
            </div>
          </div>

          {/* Device status */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3 ${
            deviceReady
              ? 'bg-emerald-950/30 border border-emerald-900/30 text-emerald-400'
              : deviceError
              ? 'bg-red-950/30 border border-red-900/30 text-red-400'
              : 'bg-[#1a1d27] border border-[#2e3352] text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${deviceReady ? 'bg-emerald-500 pulse' : deviceError ? 'bg-red-500' : 'bg-slate-600'}`} />
            {deviceReady ? 'Twilio connected' : deviceError ? 'Connection error' : 'Connecting…'}
          </div>

          {deviceError && (
            <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded-lg px-2 py-1.5 mb-3 leading-relaxed">{deviceError}</p>
          )}

          {/* Status selector */}
          <p className="text-xs text-slate-600 uppercase tracking-wide mb-2">My status</p>
          <div className="space-y-1">
            {STATUSES.map(s => (
              <button key={s.val} onClick={() => setMyStatus(s.val)} disabled={isOnCall}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  status === s.val ? 'bg-[#22263a] border border-[#2e3352]' : 'hover:bg-[#1a1d27]'
                } ${isOnCall ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <span className={`${s.dot} flex-shrink-0`} />
                <span className={status === s.val ? s.text : 'text-slate-400'}>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Current state display */}
        <div className="p-4 flex-1">
          <div className="text-center py-4">
            <div className={`inline-flex w-16 h-16 rounded-full items-center justify-center mb-3 ${
              callState === CALL_STATE.ACTIVE   ? 'bg-red-950/40 border border-red-800/30' :
              callState === CALL_STATE.INCOMING ? 'bg-emerald-950/40 border border-emerald-700/30' :
              callState === CALL_STATE.RINGING  ? 'bg-amber-950/40 border border-amber-800/30' :
              status === 'available'            ? 'bg-emerald-950/30 border border-emerald-900/30' :
              'bg-[#1a1d27] border border-[#2e3352]'
            }`}>
              <span className={`w-4 h-4 rounded-full ${
                callState === CALL_STATE.ACTIVE   ? 'bg-red-500 pulse' :
                callState === CALL_STATE.INCOMING ? 'bg-emerald-500 pulse' :
                callState === CALL_STATE.RINGING  ? 'bg-amber-400 pulse' :
                status === 'available'            ? 'bg-emerald-500 pulse' :
                'bg-slate-600'
              }`} />
            </div>

            {callState === CALL_STATE.ACTIVE && (
              <>
                <p className="text-sm font-semibold text-red-400">On call</p>
                <p className="timer text-2xl font-bold text-white mt-1">{fmtTimer(callTimer)}</p>
                <p className="text-xs text-slate-500 mt-1 truncate px-2">
                  {callInfo?.direction === 'inbound' ? callInfo?.from : callInfo?.to}
                </p>
              </>
            )}
            {callState === CALL_STATE.INCOMING && (
              <p className="text-sm font-semibold text-emerald-400 pulse">Incoming call</p>
            )}
            {callState === CALL_STATE.RINGING && (
              <p className="text-sm font-semibold text-amber-400 pulse">Ringing…</p>
            )}
            {callState === CALL_STATE.CONNECTING && (
              <p className="text-sm font-semibold text-blue-400">Connecting…</p>
            )}
            {callState === CALL_STATE.IDLE && (
              <>
                <p className={`text-sm font-semibold ${curStatus.text}`}>
                  {curStatus.label}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {status === 'available' ? 'Ready for calls' : 'Not taking calls'}
                </p>
              </>
            )}
          </div>

          {/* Volume control */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-600">Speaker volume</p>
              <p className="text-xs text-slate-500">{Math.round(volume * 100)}%</p>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={volume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (callRef.current) callRef.current.volume(v);
              }}
              className="w-full h-1.5 rounded-full appearance-none bg-[#2e3352] accent-blue-500"
            />
          </div>
        </div>

        <div className="p-4 border-t border-[#2e3352]">
          <button onClick={logout} className="w-full text-xs text-slate-600 hover:text-slate-400 text-left px-2 py-1">
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main softphone pane ───────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xs space-y-4">

          {/* ── Incoming call card ────────────────────────────────────────────── */}
          {callState === CALL_STATE.INCOMING && (
            <div className="card rounded-2xl p-6" style={{ borderColor: '#1a4a2a', boxShadow: '0 0 30px rgba(34,197,94,0.2)' }}>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-950/50 border border-emerald-700/40 flex items-center justify-center mx-auto mb-4 pulse">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Incoming call</p>
                <p className="text-2xl font-bold text-white mb-1">{callInfo?.from || 'Unknown'}</p>
                <p className="text-sm text-slate-500 mb-6">Inbound · via Twilio</p>
                <div className="flex gap-3">
                  <button onClick={rejectCall} className="flex-1 btn bg-red-950/50 text-red-400 border border-red-900/40 hover:bg-red-950/80 justify-center py-3 rounded-xl">
                    Decline
                  </button>
                  <button onClick={answerCall} className="flex-1 btn bg-emerald-600 text-white hover:bg-emerald-500 justify-center py-3 rounded-xl font-semibold">
                    Answer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Active call controls ──────────────────────────────────────────── */}
          {isOnCall && callState !== CALL_STATE.INCOMING && (
            <div className="card rounded-2xl p-5" style={{ borderColor: '#3f1f1f', boxShadow: '0 0 25px rgba(239,68,68,0.12)' }}>
              <div className="text-center mb-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                  {callState === CALL_STATE.ACTIVE   ? 'Active call' :
                   callState === CALL_STATE.RINGING  ? 'Ringing…'   :
                   callState === CALL_STATE.CONNECTING ? 'Connecting…' : 'Ending…'}
                </p>
                <p className="text-lg font-bold text-white truncate">
                  {callInfo?.direction === 'inbound' ? callInfo?.from : callInfo?.to}
                </p>
                {callState === CALL_STATE.ACTIVE && (
                  <p className="timer text-3xl font-bold text-red-400 mt-1">{fmtTimer(callTimer)}</p>
                )}
                {callState !== CALL_STATE.ACTIVE && (
                  <div className="mt-2 flex items-center justify-center gap-1.5">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                    <span className="text-xs text-slate-500">
                      {callState === CALL_STATE.CONNECTING ? 'Establishing connection…' : callState === CALL_STATE.RINGING ? 'Waiting for answer…' : 'Ending call…'}
                    </span>
                  </div>
                )}
              </div>

              {/* Call action buttons */}
              {callState === CALL_STATE.ACTIVE && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button onClick={toggleMute}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-xs transition-colors ${
                      muted ? 'bg-red-950/40 border-red-900/40 text-red-400' : 'border-[#2e3352] bg-[#1a1d27] text-slate-400 hover:bg-[#22263a]'
                    }`}>
                    <span className="text-base">{muted ? '🔇' : '🎤'}</span>
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button onClick={toggleHold}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border text-xs transition-colors ${
                      onHold ? 'bg-amber-950/40 border-amber-900/40 text-amber-400' : 'border-[#2e3352] bg-[#1a1d27] text-slate-400 hover:bg-[#22263a]'
                    }`}>
                    <span className="text-base">⏸</span>
                    {onHold ? 'Resume' : 'Hold'}
                  </button>
                  <button
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-[#2e3352] bg-[#1a1d27] text-slate-400 hover:bg-[#22263a] text-xs"
                    onClick={() => { /* transfer — future feature */ }}>
                    <span className="text-base">↗</span>
                    Transfer
                  </button>
                </div>
              )}

              {/* DTMF dial pad (shown during active call for IVR navigation) */}
              {callState === CALL_STATE.ACTIVE && (
                <div className="mb-4">
                  <div className="border border-[#2e3352] bg-[#13161f] rounded-xl px-3 py-2 mb-2 text-center font-mono text-sm text-slate-400 min-h-[32px]">
                    {dialNumber || <span className="text-slate-700">Keypad</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
                      <button key={d} onClick={() => dialDigit(d)}
                        className="h-10 rounded-lg border border-[#2e3352] bg-[#1a1d27] text-sm font-semibold text-white hover:bg-[#22263a] active:bg-[#2a2f47] transition-colors">
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Call notes */}
              {callState === CALL_STATE.ACTIVE && (
                <div className="mb-4">
                  <label className="label">Call notes</label>
                  <textarea className="input resize-none text-sm" rows={2}
                    value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Notes for this call…" />
                </div>
              )}

              {/* Hang up */}
              <button onClick={hangup}
                disabled={callState === CALL_STATE.ENDING}
                className="w-full btn bg-red-600 text-white hover:bg-red-500 justify-center py-3 rounded-xl font-semibold disabled:opacity-50">
                {callState === CALL_STATE.ENDING ? 'Ending…' : 'End call'}
              </button>
            </div>
          )}

          {/* ── Dial pad (idle state) ─────────────────────────────────────────── */}
          {callState === CALL_STATE.IDLE && (
            <div className="card rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 text-center">
                Dial pad
              </h2>

              {/* Number display */}
              <div className="border border-[#2e3352] bg-[#13161f] rounded-xl px-4 py-3 mb-3 flex items-center gap-2">
                <span className="flex-1 font-mono text-xl text-center tracking-widest text-white">
                  {dialNumber || <span className="text-slate-700">Enter number</span>}
                </span>
                {dialNumber && (
                  <button onClick={() => setDialNumber(n => n.slice(0, -1))}
                    className="text-slate-500 hover:text-slate-300 text-sm w-6 h-6 flex items-center justify-center">
                    ⌫
                  </button>
                )}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  ['1',''],['2','ABC'],['3','DEF'],
                  ['4','GHI'],['5','JKL'],['6','MNO'],
                  ['7','PQRS'],['8','TUV'],['9','WXYZ'],
                  ['*',''],['0','+'],['#',''],
                ].map(([d, sub]) => (
                  <button key={d} onClick={() => setDialNumber(n => n + d)}
                    className="h-14 rounded-xl border border-[#2e3352] bg-[#1a1d27] flex flex-col items-center justify-center hover:bg-[#22263a] active:bg-[#2a2f47] transition-colors">
                    <span className="text-lg font-semibold text-white leading-none">{d}</span>
                    {sub && <span className="text-xs text-slate-600 leading-none mt-0.5">{sub}</span>}
                  </button>
                ))}
              </div>

              {/* Call button */}
              <button onClick={makeCall}
                disabled={!dialNumber.trim() || !deviceReady || status === 'offline'}
                className={`w-full btn justify-center py-3 rounded-xl font-semibold transition-all ${
                  dialNumber.trim() && deviceReady && status !== 'offline'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/30'
                    : 'bg-[#1a1d27] text-slate-600 border border-[#2e3352] cursor-not-allowed'
                }`}>
                <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </button>

              {status === 'offline' && (
                <p className="text-center text-xs text-slate-600 mt-2">Set status to Available to make calls</p>
              )}
              {!deviceReady && status !== 'offline' && !deviceError && (
                <p className="text-center text-xs text-slate-600 mt-2">Connecting to Twilio…</p>
              )}
            </div>
          )}

          {/* Twilio badge */}
          <div className="text-center">
            <span className="text-xs text-slate-700">Powered by Twilio WebRTC</span>
          </div>
        </div>
      </main>
    </div>
  );
}
