import './globals.css';
import { AuthProvider } from '@/lib/auth';
import TelegramWidget from '@/components/TelegramWidget';

export const metadata = {
  title: 'CloudCall — Professional Call Centre Platform',
  description: 'Enterprise cloud call centre for modern businesses',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>
          {children}
          <TelegramWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
