require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

const AGENT_STATUS_KEY = (tenantId, agentId) => `agent:${tenantId}:${agentId}:status`;
const QUEUE_WAITING_KEY = (tenantId, queueId) => `queue:${tenantId}:${queueId}:waiting`;
const QUEUE_ACTIVE_KEY  = (tenantId, queueId) => `queue:${tenantId}:${queueId}:active`;
const SESSION_KEY       = (token) => `session:${token}`;

module.exports = {
  redis,
  AGENT_STATUS_KEY,
  QUEUE_WAITING_KEY,
  QUEUE_ACTIVE_KEY,
  SESSION_KEY,
};
