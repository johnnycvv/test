'use client';

export default function TelegramWidget() {
  return (
    <>
      <a
        href="https://t.me/your_support_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(135deg,#0088cc,#0066aa)', boxShadow: '0 4px 24px rgba(0,136,204,0.4)' }}
        title="Live support via Telegram"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/>
        </svg>
        <span className="text-white text-sm font-medium">Live Support</span>
      </a>
    </>
  );
}
