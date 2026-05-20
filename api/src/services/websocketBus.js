const WebSocket = require('ws');

/** Map of tenantId → Set of WebSocket connections */
const tenantClients = new Map();

function register(tenantId, ws) {
  if (!tenantClients.has(tenantId)) tenantClients.set(tenantId, new Set());
  tenantClients.get(tenantId).add(ws);
  ws.on('close', () => {
    const set = tenantClients.get(tenantId);
    if (set) { set.delete(ws); if (set.size === 0) tenantClients.delete(tenantId); }
  });
}

function broadcast(tenantId, event) {
  const clients = tenantClients.get(tenantId);
  if (!clients) return;
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function broadcastAll(event) {
  const payload = JSON.stringify(event);
  for (const clients of tenantClients.values()) {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

module.exports = { register, broadcast, broadcastAll };
