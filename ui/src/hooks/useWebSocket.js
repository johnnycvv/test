'use client';
import { useEffect, useRef, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export function useWebSocket(onEvent) {
  const ws = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = localStorage.getItem('cc_token');
    if (!token) return;

    const url = `${WS_URL}/ws?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      console.log('[WS] Connected');
    };

    socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        onEventRef.current?.(data);
      } catch {}
    };

    socket.onclose = (evt) => {
      if (evt.code !== 4001) {
        // Reconnect after 3s unless unauthorized
        setTimeout(connect, 3000);
      }
    };

    socket.onerror = () => socket.close();

    // Heartbeat ping every 25s
    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    socket.addEventListener('close', () => clearInterval(ping));
  }, []);

  useEffect(() => {
    connect();
    return () => ws.current?.close();
  }, [connect]);

  return ws;
}
