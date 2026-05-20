const { redis, AGENT_STATUS_KEY, QUEUE_WAITING_KEY, QUEUE_ACTIVE_KEY } = require('../db/redis');
const { broadcast } = require('./websocketBus');
const db = require('../db/postgres');

/**
 * Set agent status and broadcast to tenant dashboard.
 */
async function setAgentStatus(tenantId, agentId, status) {
  const key = AGENT_STATUS_KEY(tenantId, agentId);
  await redis.set(key, status, 'EX', 86400); // expire after 24h
  broadcast(tenantId, { event: 'agent.status', agentId, status, ts: Date.now() });
}

async function getAgentStatus(tenantId, agentId) {
  const key = AGENT_STATUS_KEY(tenantId, agentId);
  return (await redis.get(key)) || 'offline';
}

/**
 * Get all agent statuses for a tenant (from Redis, fallback to offline).
 */
async function getAllAgentStatuses(tenantId, agentIds) {
  const pipeline = redis.pipeline();
  for (const id of agentIds) pipeline.get(AGENT_STATUS_KEY(tenantId, id));
  const results = await pipeline.exec();
  const map = {};
  agentIds.forEach((id, i) => { map[id] = results[i][1] || 'offline'; });
  return map;
}

/**
 * Add a call to a queue waiting list.
 */
async function enqueue(tenantId, queueId, callUuid) {
  const key = QUEUE_WAITING_KEY(tenantId, queueId);
  await redis.zadd(key, Date.now(), callUuid);
  await redis.expire(key, 3600);
  const depth = await redis.zcard(key);
  broadcast(tenantId, { event: 'queue.depth', queueId, waiting: depth });
}

/**
 * Remove from waiting, add to active.
 */
async function dequeue(tenantId, queueId, callUuid) {
  const waitKey = QUEUE_WAITING_KEY(tenantId, queueId);
  const activeKey = QUEUE_ACTIVE_KEY(tenantId, queueId);
  await redis.zrem(waitKey, callUuid);
  await redis.sadd(activeKey, callUuid);
  await redis.expire(activeKey, 3600);
  const depth = await redis.zcard(waitKey);
  broadcast(tenantId, { event: 'queue.depth', queueId, waiting: depth });
}

/**
 * Remove from active when call ends.
 */
async function removeActive(tenantId, queueId, callUuid) {
  if (!queueId) return;
  const activeKey = QUEUE_ACTIVE_KEY(tenantId, queueId);
  await redis.srem(activeKey, callUuid);
}

/**
 * Get queue depth stats for all queues.
 */
async function getQueueStats(tenantId, queueIds) {
  const pipeline = redis.pipeline();
  for (const id of queueIds) {
    pipeline.zcard(QUEUE_WAITING_KEY(tenantId, id));
    pipeline.scard(QUEUE_ACTIVE_KEY(tenantId, id));
  }
  const results = await pipeline.exec();
  const stats = {};
  queueIds.forEach((id, i) => {
    stats[id] = {
      waiting: results[i * 2][1] || 0,
      active: results[i * 2 + 1][1] || 0,
    };
  });
  return stats;
}

/**
 * Pick best available agent from a queue per strategy.
 */
async function pickAgent(tenantId, queueId, strategy = 'round_robin') {
  const result = await db.query(
    `SELECT u.id, u.display_name FROM queue_agents qa
     JOIN users u ON u.id = qa.user_id
     WHERE qa.queue_id = $1 AND u.is_active = true
     ORDER BY qa.priority ASC`,
    [queueId]
  );
  const agents = result.rows;
  if (!agents.length) return null;

  const statuses = await getAllAgentStatuses(tenantId, agents.map(a => a.id));
  const available = agents.filter(a => statuses[a.id] === 'available');
  if (!available.length) return null;

  if (strategy === 'sequential') return available[0];
  if (strategy === 'round_robin') {
    // Simple round-robin using Redis counter
    const key = `rr:${tenantId}:${queueId}`;
    const idx = await redis.incr(key) % available.length;
    await redis.expire(key, 3600);
    return available[idx];
  }
  if (strategy === 'least_idle') {
    // Sort by last call ended (approximated by status set time — future: track last_call_at)
    return available[available.length - 1];
  }
  return available[0];
}

module.exports = {
  setAgentStatus,
  getAgentStatus,
  getAllAgentStatuses,
  enqueue,
  dequeue,
  removeActive,
  getQueueStats,
  pickAgent,
};
