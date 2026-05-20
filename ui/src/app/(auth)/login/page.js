'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

function PhoneIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(email, password);
      router.push(user.role === 'agent' ? '/agent' : '/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'radial-gradient(ellipse at 30% 50%, #0f1729 0%, #0f1117 60%)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 border-r border-[#2e3352]/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
            <PhoneIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">CloudCall</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Enterprise telephony<br />
            <span className="text-blue-400">in your hands</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-10">
            Manage your call centre, agents, queues, and SIP trunks from one professional platform.
          </p>
          <div className="space-y-3">
            {[
              'Real-time call monitoring and live dashboards',
              'Intelligent call routing with queue management',
              'Built-in usage monitoring and compliance tools',
            ].map(item => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-400">
                <div className="w-5 h-5 rounded-full bg-blue-950/60 border border-blue-800/50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600">© {new Date().getFullYear()} CloudCall. Registered telecommunications provider.</p>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <PhoneIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">CloudCall</span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">Welcome back</h1>
          <p className="text-slate-500 text-sm mb-8">Sign in to your call centre account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <input type="email" className="input" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" required autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2.5">{error}</div>
            )}

            <button type="submit" className="btn-primary w-full justify-center py-3 font-semibold" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in →'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#2e3352] text-center space-y-2">
            <p className="text-xs text-slate-600">
              Don't have an account?{' '}
              <a href="/paywall" className="text-blue-500 hover:text-blue-400">Get access</a>
            </p>
            <p className="text-xs text-slate-600">
              Need help?{' '}
              <a href="https://t.me/your_support_bot" target="_blank" className="text-blue-500 hover:text-blue-400">Contact support</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
