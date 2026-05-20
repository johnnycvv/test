'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function PhoneIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
}

const FEATURES = [
  { icon: '☎️', title: 'SIP Trunk Integration',   desc: 'Connect any SIP provider with automatic failover.' },
  { icon: '📋', title: 'Smart Call Queues',         desc: 'Round-robin, priority and sequential routing.' },
  { icon: '🌐', title: 'WebRTC Softphone',          desc: 'Browser-based agent phone — no installs required.' },
  { icon: '📊', title: 'Live Dashboard',            desc: 'Real-time call monitoring and agent status board.' },
  { icon: '🔒', title: 'Call Recording',            desc: 'Record and store calls for compliance and training.' },
  { icon: '📈', title: 'Analytics & CDR Export',   desc: 'Full call records with CSV export and daily reports.' },
  { icon: '🛡️', title: 'Usage Monitoring',         desc: 'Automated abuse detection keeps your platform clean.' },
  { icon: '🌍', title: 'Multi-tenant SaaS',         desc: 'Each account is fully isolated and independently managed.' },
];

function PaywallInner() {
  const router = useRouter();
  const params = useSearchParams();
  const cancelled = params.get('cancelled');

  const [email,         setEmail]         = useState('');
  const [company,       setCompany]       = useState('');
  const [promo,         setPromo]         = useState('');
  const [promoApplied,  setPromoApplied]  = useState(false);
  const [price,         setPrice]         = useState(500);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  function applyPromo() {
    if (promo.trim().toUpperCase() === '150') {
      setPrice(150); setPromoApplied(true); setError('');
    } else {
      setError('Invalid promo code'); setPromoApplied(false); setPrice(500);
    }
  }

  async function handleCheckout() {
    setError(''); setLoading(true);
    try {
      const res  = await fetch(`${API}/api/payments/create-checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, companyName: company, promoCode: promoApplied ? promo : '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment error');
      window.location.href = data.checkoutUrl;
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'radial-gradient(ellipse at 50% 0%, #0f1a35 0%, #0f1117 55%)' }}>

      {/* Top nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#2e3352]/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <PhoneIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">CloudCall</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Already have an account?</span>
          <button onClick={() => router.push('/login')} className="btn-secondary text-sm">Sign in</button>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-6xl">

          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-800/40 bg-blue-950/30 text-blue-400 text-xs font-medium mb-5">
              <span className="dot-blue pulse" />
              Enterprise-grade telephony infrastructure
            </div>
            <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
              Your complete cloud<br />
              <span className="text-blue-400">call centre platform</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
              Everything you need to run a professional call centre — SIP trunks,
              queues, recording, analytics — all in one platform.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

            {/* Feature list */}
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURES.map(f => (
                <div key={f.title} className="flex items-start gap-3 p-4 rounded-xl border border-[#2e3352] bg-[#1a1d27] hover:border-blue-800/50 transition-colors">
                  <span className="text-xl flex-shrink-0 mt-0.5">{f.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout card */}
            <div className="lg:col-span-2">
              <div className="card rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 40px rgba(37,99,235,0.15)' }}>

                {/* Price header */}
                <div className="px-6 pt-6 pb-5 border-b border-[#2e3352]" style={{ background: 'linear-gradient(135deg,#1c2540,#1a1d27)' }}>
                  <div className="flex items-end gap-2 mb-1">
                    <span className="text-4xl font-bold text-white">£{price}</span>
                    {promoApplied && <span className="text-slate-500 line-through text-base mb-1">£500</span>}
                  </div>
                  <p className="text-slate-400 text-sm">One-time payment · Lifetime access</p>
                  {promoApplied && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/40 text-emerald-400 text-xs font-medium">
                      ✓ Promo applied — you save £350
                    </div>
                  )}
                </div>

                {/* Form */}
                <div className="p-6 space-y-4">
                  {cancelled && (
                    <div className="text-sm text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2.5">
                      Payment cancelled — no charge was made.
                    </div>
                  )}

                  <div>
                    <label className="label">Business email *</label>
                    <input className="input" type="email" value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@yourcompany.com" />
                  </div>

                  <div>
                    <label className="label">Company name</label>
                    <input className="input" value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="Your company Ltd" />
                  </div>

                  <div>
                    <label className="label">Promo code</label>
                    <div className="flex gap-2">
                      <input
                        className={`input ${promoApplied ? 'border-emerald-700 bg-emerald-950/20' : ''}`}
                        value={promo}
                        onChange={e => { setPromo(e.target.value); setPromoApplied(false); setPrice(500); }}
                        placeholder="Enter promo code"
                      />
                      <button onClick={applyPromo} className="btn-secondary flex-shrink-0 px-4">Apply</button>
                    </div>
                  </div>

                  {error && (
                    <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5">{error}</div>
                  )}

                  <button
                    onClick={handleCheckout}
                    disabled={loading || !email}
                    className="btn-primary w-full justify-center py-3 text-sm font-semibold mt-2"
                    style={{ background: loading || !email ? '#1e3a6e' : undefined }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Redirecting to Stripe…
                      </span>
                    ) : `Pay £${price} securely →`}
                  </button>

                  {/* Trust signals */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-1.5">
                      {['VISA','MC','AMEX'].map(c => (
                        <div key={c} className="px-2 py-1 rounded bg-[#22263a] border border-[#2e3352]">
                          <span className="text-xs text-slate-400 font-mono">{c}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Secured by Stripe
                    </div>
                  </div>

                  <p className="text-center text-xs text-slate-600 leading-relaxed">
                    Questions?{' '}
                    <a href="https://t.me/your_support_bot" target="_blank" className="text-blue-500 hover:text-blue-400">
                      Chat with support
                    </a>
                    {' '}before purchasing.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#2e3352]/50 px-8 py-5 flex items-center justify-between text-xs text-slate-600">
        <span>© {new Date().getFullYear()} CloudCall. Registered telecommunications provider.</span>
        <a href="https://t.me/your_support_bot" target="_blank" className="text-slate-500 hover:text-slate-400">Support</a>
      </footer>
    </div>
  );
}

export default function PaywallPage() {
  return <Suspense><PaywallInner /></Suspense>;
}
