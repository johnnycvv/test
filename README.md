# CloudCall — Cloud Call Centre SaaS

A complete, self-hosted cloud call centre platform. Multi-tenant, real-time, and built for resale.

## 🚀 Quick Start (under 10 minutes)

### Prerequisites
- Docker + Docker Compose
- Git

### 1. Clone and configure
```bash
git clone https://github.com/your-org/cloudcall
cd cloudcall
cp .env.example .env
```

Edit `.env` — at minimum set a strong `JWT_SECRET`:
```env
JWT_SECRET=your-64-character-random-string-here
DB_PASS=your-database-password
```

### 2. Start all services
```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- CloudCall API on port 3001
- CloudCall UI on port 3000

Wait ~30 seconds for services to be healthy, then:

### 3. Run migrations + seed demo data
```bash
docker compose exec api npm run migrate
docker compose exec api npm run seed
```

Or with custom credentials:
```bash
docker compose exec api node src/scripts/seed.js \
  --name "Your Company" --email admin@you.com --password yourpassword
```

### 4. Open the app
- **Admin dashboard:** http://localhost:3000
- **Agent portal:** http://localhost:3000/agent
- **API:** http://localhost:3001

Default demo credentials: `admin@demo.com` / `demo1234`

---

## 📁 Project Structure

```
cloudcall/
├── api/                    # Node.js + Express backend
│   └── src/
│       ├── server.js       # Main HTTP + WebSocket server
│       ├── db/
│       │   ├── migrate.js  # DB schema migration
│       │   ├── postgres.js # PG connection pool
│       │   └── redis.js    # Redis client + key helpers
│       ├── middleware/
│       │   ├── auth.js     # JWT auth middleware
│       │   └── tenantScope.js  # Multi-tenant DB helpers
│       ├── routes/
│       │   ├── auth.js     # Login, refresh, me
│       │   ├── agents.js   # Agent CRUD + status
│       │   ├── queues.js   # Queue management
│       │   ├── trunks.js   # SIP trunk management
│       │   ├── dids.js     # DID number management
│       │   ├── cdr.js      # Call logs + simulation
│       │   ├── live.js     # Real-time live state
│       │   └── ivr.js      # IVR menu management
│       ├── services/
│       │   ├── websocketBus.js  # Real-time event broadcast
│       │   ├── queueService.js  # Redis queue state machine
│       │   ├── cdrService.js    # Call record lifecycle
│       │   └── sipTrunkService.js  # Trunk health + failover
│       └── scripts/seed.js # Demo data setup
│
├── ui/                     # Next.js 14 frontend
│   └── src/
│       ├── app/
│       │   ├── dashboard/   # Admin pages (live, queues, agents...)
│       │   ├── agent/       # Agent softphone portal
│       │   └── (auth)/login/
│       ├── hooks/
│       │   └── useWebSocket.js  # Real-time WS hook
│       └── lib/
│           ├── api.js       # Typed API client
│           └── auth.js      # Auth context
│
└── docker-compose.yml
```

---

## 🏗️ Architecture

```
Browser clients (Admin / Agent / Supervisor)
        │ HTTPS / WSS
        ▼
  API Gateway (Express + Node.js)
  JWT auth · REST + WebSocket · multi-tenant
        │
  ┌─────┼─────────────────────────────────┐
  │     │                                 │
  ▼     ▼                                 ▼
Queue  CDR      SIP Trunk      WS Event
Manager Service  Manager        Bus
  │               │             │
  ▼               ▼             ▼
Redis         PostgreSQL    All connected
(live state)  (persistent)  browsers
```

---

## 🔌 Connecting Real SIP Trunks (Production)

For production calling, you need FreeSWITCH:

### Add FreeSWITCH to docker-compose.yml
```yaml
freeswitch:
  image: signalwire/freeswitch-public:latest
  network_mode: host
  volumes:
    - ./freeswitch/conf:/etc/freeswitch
  environment:
    - FREESWITCH_PASSWORD=ClueCon
```

### Update API environment
```env
FS_HOST=127.0.0.1
FS_PORT=8021
FS_PASSWORD=ClueCon
SIP_WS_SERVER=wss://your-domain.com:7443
SIP_DOMAIN=your-domain.com
```

### FreeSWITCH ESL integration
The API's `sipTrunkService.js` is pre-wired for `node-esl`. Install it:
```bash
npm install modesl
```

Then in `sipTrunkService.js`, replace the simulation with:
```js
const esl = require('modesl');
const conn = new esl.Connection(process.env.FS_HOST, 8021, process.env.FS_PASSWORD);

async function activateTrunk(tenantId, trunkId) {
  // Reload Sofia profile with new trunk credentials
  conn.api('sofia profile external restart');
}
```

---

## 📞 WebRTC Softphone (Production)

The agent portal at `/agent` is ready to connect a real WebRTC softphone.

### Install SIP.js
```bash
cd ui && npm install sip.js
```

### Usage in agent page
The `useSip` hook (described in docs) wraps `sip.js`:
```js
import { UserAgent, Registerer } from 'sip.js';

const ua = new UserAgent({
  uri: UserAgent.makeURI(`sip:${user.sipUsername}@${domain}`),
  transportOptions: { server: `wss://${domain}:7443` },
  authorizationPassword: user.sipPassword,
});
```

You need:
- **FreeSWITCH with mod_verto** for WebRTC-to-SIP bridging
- **STUN server** — free: `stun:stun.l.google.com:19302`
- **TURN server** — run `coturn` for agents behind strict NAT

---

## 🌐 Production Deployment (VPS / Cloud)

### Nginx reverse proxy
```nginx
server {
    listen 443 ssl;
    server_name app.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/app.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourcompany.com/privkey.pem;

    location /api { proxy_pass http://localhost:3001; }
    location /ws  {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location / { proxy_pass http://localhost:3000; }
}
```

### Let's Encrypt SSL
```bash
certbot --nginx -d app.yourcompany.com
```

### Environment for production
```env
NODE_ENV=production
CORS_ORIGIN=https://app.yourcompany.com
API_URL=https://app.yourcompany.com
WS_URL=wss://app.yourcompany.com
```

---

## 🔑 API Reference

### Auth
```
POST /api/auth/login         { email, password } → { accessToken, refreshToken, user }
POST /api/auth/refresh       { refreshToken } → { accessToken }
GET  /api/auth/me            → user object
```

### Agents
```
GET    /api/agents           → list with real-time status
POST   /api/agents/invite    { email, displayName, role, extension }
PATCH  /api/agents/:id/status { status: "available"|"break"|"offline" }
DELETE /api/agents/:id
```

### Queues
```
GET    /api/queues
POST   /api/queues           { name, strategy, maxWaitSeconds, recordingEnabled }
PATCH  /api/queues/:id
DELETE /api/queues/:id
POST   /api/queues/:id/agents    { userId }
DELETE /api/queues/:id/agents/:userId
```

### SIP Trunks
```
GET    /api/trunks
POST   /api/trunks           { name, registrar, username, password, priority }
POST   /api/trunks/:id/test  → { ok, status, latencyMs }
DELETE /api/trunks/:id
```

### DID Numbers
```
GET    /api/dids
POST   /api/dids             { number, countryCode, description }
PATCH  /api/dids/:id/assign  { type: "queue"|"agent", targetId }
DELETE /api/dids/:id
```

### Call Logs (CDR)
```
GET  /api/cdr?from=&to=&disposition=  → call records
GET  /api/cdr/stats                   → daily summary
GET  /api/cdr/export                  → CSV download
POST /api/cdr/simulate/inbound        → trigger test call
```

### Live State
```
GET  /api/live/overview      → agents + queues + active calls
GET  /api/live/agents        → agent statuses
GET  /api/live/queues        → queue depths
```

### WebSocket Events
Connect: `ws://localhost:3001/ws?token=<jwt>`

Events received:
```json
{ "event": "call.ringing",  "callUuid": "...", "callerId": "+441234567890", "queueId": "..." }
{ "event": "call.answered", "callUuid": "...", "agentId": "..." }
{ "event": "call.ended",    "callUuid": "...", "duration": 194, "disposition": "answered" }
{ "event": "agent.status",  "agentId": "...", "status": "on_call" }
{ "event": "queue.depth",   "queueId": "...", "waiting": 3 }
{ "event": "trunk.status",  "trunkId": "...", "status": "registered" }
```

---

## 🧪 Testing the System

### Simulate inbound calls (no SIP needed)
Use the "Simulate call" button on the dashboard, or:
```bash
curl -X POST http://localhost:3001/api/cdr/simulate/inbound \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"callerId": "+441234567890"}'
```

The system will:
1. Create an inbound call record
2. Add it to the queue
3. Broadcast WS events to dashboard
4. Auto-assign to an available agent after 3s
5. Auto-end after 30-90s

---

## 📦 Multi-Tenant SaaS Mode

Every API call is automatically scoped to the authenticated tenant via JWT. To onboard a new customer:

```bash
docker compose exec api node src/scripts/seed.js \
  --name "New Customer Co" \
  --email admin@newcustomer.com \
  --password temppass123
```

Data is 100% isolated — each tenant sees only their own agents, calls, and configuration.

---

## 🗺️ Roadmap (next features to build)

- [ ] IVR drag-and-drop flow builder (React Flow)
- [ ] Call recordings via FreeSWITCH → S3
- [ ] SMS / WhatsApp channel integration
- [ ] Stripe billing for SaaS plans
- [ ] Call whisper / barge / monitor for supervisors
- [ ] Custom reporting and analytics charts
- [ ] CRM integration (HubSpot, Salesforce)
- [ ] Mobile apps (React Native)

---

## 🛟 Support

- Check `docker compose logs api` for backend errors
- Check `docker compose logs ui` for frontend errors  
- API health: http://localhost:3001/health
