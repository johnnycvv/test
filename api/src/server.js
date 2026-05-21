require('dotenv').config();
const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const jwt     = require('jsonwebtoken');

const { register } = require('./services/websocketBus');
require('./services/usageMonitor'); // start background checks

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/queues', require('./routes/queues'));
app.use('/api/trunks', require('./routes/trunks'));
app.use('/api/dids',   require('./routes/dids'));
app.use('/api/cdr',    require('./routes/cdr'));
app.use('/api/live',   require('./routes/live'));
app.use('/api/ivr',      require('./routes/ivr'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/twilio', require('./routes/twilio'));
app.use('/api/sip', require('./routes/sip'));
app.use('/api/dialler', require('./routes/dialler'));
app.use('/api/chat',    require('./routes/chat'));

// ── SIP config endpoint (for WebRTC softphone bootstrap) ────────────────────
app.get('/api/sip-config', (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    res.json({
      stunServer: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302',
      turnServer: process.env.TURN_SERVER || null,
      turnUser: process.env.TURN_USER || null,
      turnPass: process.env.TURN_PASS || null,
      sipWsServer: process.env.SIP_WS_SERVER || null,
      domain: process.env.SIP_DOMAIN || 'cloudcall.local',
    });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── WebSocket handler ────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  // Expect ?token=<jwt> in query string
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) { ws.close(4001, 'Unauthorized'); return; }

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    ws.close(4001, 'Invalid token');
    return;
  }

  ws.tenantId = user.tenantId;
  ws.userId   = user.userId;
  ws.isAlive  = true;

  register(user.tenantId, ws);
  ws.send(JSON.stringify({ event: 'connected', userId: user.userId, tenantId: user.tenantId }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      // Client-sent ping
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch {}
  });

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (e) => console.error('[WS] error:', e.message));
});

// Heartbeat — drop dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);
wss.on('close', () => clearInterval(heartbeat));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[CloudCall API] Listening on port ${PORT}`);
  console.log(`[CloudCall API] Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, server };
