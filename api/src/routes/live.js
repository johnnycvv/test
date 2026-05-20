const express = require('express');
const db = require('../db/postgres');
const { auth } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const { getAllAgentStatuses, getQueueStats } = require('../services/queueService');

const router = express.Router();
router.use(auth, ts);

// GET /api/live/overview — single call for dashboard
router.get('/overview', async (req, res) => {
  try {
    const [agentsResult, queuesResult, activeCallsResult, statsResult] = await Promise.all([
      db.query(`SELECT id, display_name, role FROM users WHERE tenant_id=$1 AND is_active=true`, [req.tenantId]),
      db.query(`SELECT id, name, strategy FROM queues WHERE tenant_id=$1`, [req.tenantId]),
      db.query(
        `SELECT c.*, u.display_name AS agent_name, q.name AS queue_name
         FROM cdr c
         LEFT JOIN users u ON u.id = c.agent_id
         LEFT JOIN queues q ON q.id = c.queue_id
         WHERE c.tenant_id=$1 AND c.ended_at IS NULL ORDER BY c.started_at DESC`,
        [req.tenantId]
      ),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE started_at >= now() - interval '24h') AS total_today,
           COUNT(*) FILTER (WHERE started_at >= now() - interval '24h' AND disposition='answered') AS answered_today,
           COUNT(*) FILTER (WHERE started_at >= now() - interval '24h' AND disposition='missed') AS missed_today,
           AVG(wait_seconds) FILTER (WHERE started_at >= now() - interval '24h')::INT AS avg_wait
         FROM cdr WHERE tenant_id=$1`,
        [req.tenantId]
      ),
    ]);

    const agents = agentsResult.rows;
    const queues = queuesResult.rows;

    const [statuses, queueStats] = await Promise.all([
      agents.length ? getAllAgentStatuses(req.tenantId, agents.map(a => a.id)) : Promise.resolve({}),
      queues.length ? getQueueStats(req.tenantId, queues.map(q => q.id)) : Promise.resolve({}),
    ]);

    const agentsByStatus = { available: 0, on_call: 0, break: 0, offline: 0 };
    agents.forEach(a => {
      const s = statuses[a.id] || 'offline';
      agentsByStatus[s] = (agentsByStatus[s] || 0) + 1;
    });

    res.json({
      activeCalls: activeCallsResult.rows,
      agents: agents.map(a => ({ ...a, status: statuses[a.id] || 'offline' })),
      agentsByStatus,
      queues: queues.map(q => ({ ...q, ...queueStats[q.id] })),
      stats: statsResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/live/agents
router.get('/agents', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, display_name, role, extension FROM users WHERE tenant_id=$1 AND is_active=true`,
      [req.tenantId]
    );
    const agents = result.rows;
    const statuses = agents.length ? await getAllAgentStatuses(req.tenantId, agents.map(a => a.id)) : {};
    res.json(agents.map(a => ({ ...a, status: statuses[a.id] || 'offline' })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/live/queues
router.get('/queues', async (req, res) => {
  try {
    const result = await db.query(`SELECT id, name FROM queues WHERE tenant_id=$1`, [req.tenantId]);
    const queues = result.rows;
    const stats = queues.length ? await getQueueStats(req.tenantId, queues.map(q => q.id)) : {};
    res.json(queues.map(q => ({ ...q, ...stats[q.id] })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
