'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const token = localStorage.getItem('cc_token');
    if (token) { router.replace('/dashboard'); } else { router.replace('/paywall'); }
  }, [router]);
  return null;
}
