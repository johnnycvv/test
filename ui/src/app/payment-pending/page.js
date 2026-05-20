'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function PendingInner() {
  const params    = useSearchParams();
  const router    = useRouter();
  const sessionId = params.get('session_id');
  const [status, setStatus]   = useState('pending');
  const [email,  setEmail]    = useState('');
  const [creds,  setCreds]    = useState(null);
  const [dots,   setDots]     = useState('.');

  // Animate dots
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);

  // Poll payment status
  useEffect(() => {
    if (!sessionId) return;
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const res  = await fetch(`${API}/api/payments/status/${sessionId}`);
        const data = await res.json();
        setEmail(data.email || '');
        if (data.status === 'paid') {
          setStatus('paid');
          setCreds({ email: data.email, tempPassword: data.tempPassword });
          clearInterval(poll);
        } else if (data.status === 'expired' || attempts > 120) {
          setStatus('expired');
          clearInterval(poll);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(poll);
  }, [sessionId]);

  if (status === 'paid') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #0a1f0a 0%, #0f1117 55%)' }}>
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-950/50 border border-emerald-700/40 flex items-center justify-center mx-auto mb-6 glow-green">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Payment confirmed!</h1>
        <p className="text-slate-400 mb-8">Your CloudCall account is ready. Use these credentials to log in.</p>

        <div className="card rounded-xl p-5 text-left mb-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-[#2e3352]">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Email</span>
              <span className="font-mono text-sm text-white">{creds?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Temp password</span>
              <span className="font-mono text-sm text-amber-400">{creds?.tempPassword}</span>
            </div>
          </div>
        </div>

        <div className="text-xs text-amber-500 bg-amber-950/30 border border-amber-900/40 rounded-lg px-4 py-3 mb-6">
          ⚠ Save these credentials now — this page won't show them again. Change your password after first login.
        </div>

        <button
          onClick={() => router.push('/login')}
          className="btn-primary w-full justify-center py-3 text-base font-semibold"
        >
          Go to login →
        </button>
      </div>
    </div>
  );

  if (status === 'expired') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0f1117' }}>
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-full bg-red-950/40 border border-red-800/40 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Session expired</h1>
        <p className="text-slate-400 mb-6">Your checkout session has expired. Please try again.</p>
        <button onClick={() => router.push('/paywall')} className="btn-primary w-full justify-center py-3">
          Return to checkout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #0f1729 0%, #0f1117 55%)' }}>
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-full border border-blue-700/40 bg-blue-950/30 flex items-center justify-center mx-auto mb-6 glow-blue">
          <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Confirming your payment{dots}</h1>
        <p className="text-slate-400 mb-2">
          {email ? `Waiting for confirmation for ${email}` : 'Waiting for payment confirmation from Stripe.'}
        </p>
        <p className="text-slate-600 text-sm mb-8">This page checks automatically. Do not close it.</p>

        <div className="card rounded-xl p-4">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <div className="dot-blue pulse flex-shrink-0"/>
            Listening for Stripe payment webhook…
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-600">
          Problems?{' '}
          <a href="https://t.me/your_support_bot" target="_blank" className="text-blue-500 hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}

export default function PaymentPendingPage() {
  return <Suspense><PendingInner /></Suspense>;
}
