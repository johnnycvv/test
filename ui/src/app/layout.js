import './globals.css';
import { AuthProvider } from '@/lib/auth';
import TelegramWidget from '@/components/TelegramWidget';
import MatrixRain from '@/components/MatrixRain';

export const metadata = {
  title: 'CloudCall — Secure Telephony Platform',
  description: 'Professional cloud call centre platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="scanlines">
        <MatrixRain />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <AuthProvider>
            {children}
            <TelegramWidget />
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}