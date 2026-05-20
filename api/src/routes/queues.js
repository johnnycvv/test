const express = require('express');
const db = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const { getQueueStats } = require('../services/queueService');

const router = express.Router();
router.use(auth, ts);

// GET /api/queues
router.get('/', async (req, res) => {
  try {
    const queues = await req.db.find('queues', {}, 'name ASC');
    if (!queues.length) return res.json([]);

    const stats = await getQueueStats(req.tenantId, queues.map(q => q.id));

    // Attach agent count
    const result = await db.query(
      `SELECT queue_id, COUNT(*) AS agent_count FROM queue_agents WHERE queue_id = ANY($1) GROUP BY queue_id`,
      [queues.map(q => q.id)]
    );
    const agentCounts = {};
    result.rows.forEach(r => { agentCounts[r.queue_id] = parseInt(r.agent_count); });

    res.json(queues.map(q => ({
      ...q,
      agentCount: agentCounts[q.id] || 0,
      ...stats[q.id],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/queues/:id
router.get('/:id', async (req, res) => {
  try {
    const queue = await req.db.findOne('queues', req.params.id);
    if (!queue) return res.status(404).json({ error: 'Queue not found' });

    const agentResult = await db.query(
      `SELECT u.id, u.display_name, u.email, u.extension, qa.priority
       FROM queue_agents qa JOIN users u ON u.id = qa.user_id
       WHERE qa.queue_id = $1 ORDER BY qa.priority, u.display_name`,
      [queue.id]
    );

    res.json({ ...queue, agents: agentResult.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/queues
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, description, strategy, maxWaitSeconds, maxSize, mohFile, recordingEnabled, callbackEnabled, ringTimeout } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    const queue = await req.db.insert('queues', {
      name,
      description: description || null,
      strategy: strategy || 'round_robin',
      max_wait_seconds: maxWaitSeconds || 300,
      max_size: maxSize || 50,
      moh_file: mohFile || 'default',
      recording_enabled: recordingEnabled || false,
      callback_enabled: callbackEnabled || false,
      ring_timeout: ringTimeout || 30,
    });
    res.status(201).json(queue);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/queues/:id
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, description, strategy, maxWaitSeconds, mohFile, recordingEnabled, callbackEnabled, ringTimeout } = req.body;
    const fields = {};
    if (name !== undefined)              fields.name = name;
    if (description !== undefined)       fields.description = description;
    if (strategy !== undefined)          fields.strategy = strategy;
    if (maxWaitSeconds !== undefined)    fields.max_wait_seconds = maxWaitSeconds;
    if (mohFile !== undefined)           fields.moh_file = mohFile;
    if (recordingEnabled !== undefined)  fields.recording_enabled = recordingEnabled;
    if (callbackEnabled !== undefined)   fields.callback_enabled = callbackEnabled;
    if (ringTimeout !== undefined)       fields.ring_timeout = ringTimeout;

    const updated = await req.db.update('queues', req.params.id, fields);
    if (!updated) return res.status(404).json({ error: 'Queue not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/queues/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const ok = await req.db.delete('queues', req.params.id);
    if (!ok) return res.status(404).json({ error: 'Queue not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/queues/:id/agents
router.get('/:id/agents', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.display_name, u.email, u.extension, qa.priority
       FROM queue_agents qa JOIN users u ON u.id = qa.user_id
       WHERE qa.queue_id = $1 AND u.tenant_id = $2 ORDER BY qa.priority`,
      [req.params.id, req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/queues/:id/agents — add agent to queue
router.post('/:id/agents', requireRole('admin'), async (req, res) => {
  try {
    const { userId, priority = 1 } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    await db.query(
      `INSERT INTO queue_agents (queue_id, user_id, priority) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, userId, priority]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/queues/:id/agents/:userId — remove agent from queue
router.delete('/:id/agents/:userId', requireRole('admin'), async (req, res) => {
  try {
    await db.query(
      `DELETE FROM queue_agents WHERE queue_id=$1 AND user_id=$2`,
      [req.params.id, req.params.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
