'use client';
import { useState, useEffect, useRef } from 'react';

const APP_URL = process.env.NEXT_PUBLIC_API_URL?.replace(':3001', ':3000') || 'https://cloudcall-ui.onrender.com';

export default function QrModal({ agent, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(false);
  const [link,      setLink]      = useState('');

  useEffect(() => {
    async function generate() {
      try {
        const token = localStorage.getItem('cc_token');
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'https://cloudcall-api.onrender.com'}/api/agents/${agent.id}/qr-token`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const softphoneUrl = `https://cloudcall-ui.onrender.com/agent?token=${encodeURIComponent(data.token)}`;
        setLink(softphoneUrl);

        // Generate QR code using canvas
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(softphoneUrl, {
          width: 280,
          margin: 2,
          color: { dark: '#ffffff', light: '#1a1d27' },
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

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-bg">
      <div className="card w-full max-w-sm p-6 rounded-2xl text-center">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Softphone QR — {agent.display_name}</h2>
          <button onClick={onClose} className="btn-ghost p-1 text-slate-400">✕</button>
        </div>

        {loading && (
          <div className="py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Generating QR code…</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 mb-4">{error}</div>
        )}

        {qrDataUrl && (
          <>
            <div className="bg-[#1a1d27] rounded-xl p-4 inline-block mb-4 border border-[#2e3352]">
              <img src={qrDataUrl} alt="QR Code" className="rounded-lg" style={{ width: 200, height: 200 }} />
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Agent scans this with their phone camera to open the softphone — no password needed.
              Valid for <span className="text-amber-400">24 hours</span>.
            </p>

            <div className="flex gap-2">
              <button onClick={copyLink} className="btn-secondary flex-1 justify-center text-xs">
                {copied ? '✓ Copied!' : '🔗 Copy link'}
              </button>
              <a
                href={qrDataUrl}
                download={`${agent.display_name}-softphone-qr.png`}
                className="btn-secondary flex-1 justify-center text-xs"
              >
                ⬇ Download
              </a>
            </div>

            <p className="text-xs text-slate-700 mt-4">
              Ext {agent.extension} · {agent.email}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
