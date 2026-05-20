const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const { getCDR, getDailyStats, startCall, answerCall, endCall } = require('../services/cdrService');
const { setAgentStatus, enqueue, dequeue } = require('../services/queueService');
const db = require('../db/postgres');

const router = express.Router();
router.use(auth, ts);

// GET /api/cdr — paginated call log
router.get('/', async (req, res) => {
  try {
    const { from, to, queueId, agentId, disposition, limit = 100, offset = 0 } = req.query;
    const rows = await getCDR(req.tenantId, { from, to, queueId, agentId, disposition, limit: parseInt(limit), offset: parseInt(offset) });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/cdr/stats — daily summary stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await getDailyStats(req.tenantId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/cdr/export — CSV download
router.get('/export', async (req, res) => {
  try {
    const rows = await getCDR(req.tenantId, { limit: 10000 });
    const headers = ['id','call_uuid','direction','caller_id','callee','did_number','queue_name','agent_name',
                     'started_at','answered_at','ended_at','duration_seconds','wait_seconds','disposition','hangup_cause'];
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="call-logs.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/cdr/:id/notes — add notes to a call record
router.patch('/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    await db.query(`UPDATE cdr SET notes=$1 WHERE id=$2 AND tenant_id=$3`, [notes, req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Simulated call lifecycle endpoints (replaces FreeSWITCH ESL in MVP) ───

// POST /api/calls/simulate/inbound — simulate an inbound call arriving
router.post('/simulate/inbound', async (req, res) => {
  try {
    const { callerId = '+441234567890', queueId, didNumber = '+442079460001' } = req.body;

    // Find queue to route to
    let targetQueueId = queueId;
    if (!targetQueueId) {
      const did = await db.query(
        `SELECT * FROM did_numbers WHERE tenant_id=$1 AND number=$2 LIMIT 1`,
        [req.tenantId, didNumber]
      );
      if (did.rows[0]?.assigned_to_type === 'queue') targetQueueId = did.rows[0].assigned_to_id;
    }

    const callUuid = uuidv4();
    await startCall(req.tenantId, {
      callUuid,
      direction: 'inbound',
      callerId,
      callee: didNumber,
      didNumber,
      queueId: targetQueueId,
    });

    if (targetQueueId) await enqueue(req.tenantId, targetQueueId, callUuid);

    // Auto-answer simulation: pick an agent after 3s
    if (targetQueueId) {
      const { pickAgent } = require('../services/queueService');
      const qRes = await db.query(`SELECT strategy FROM queues WHERE id=$1`, [targetQueueId]);
      const strategy = qRes.rows[0]?.strategy || 'round_robin';

      setTimeout(async () => {
        const agent = await pickAgent(req.tenantId, targetQueueId, strategy);
        if (agent) {
          await dequeue(req.tenantId, targetQueueId, callUuid);
          await answerCall(req.tenantId, callUuid, agent.id);
          await setAgentStatus(req.tenantId, agent.id, 'on_call');

          // Auto-end after 30-90s
          const dur = Math.floor(Math.random() * 60000 + 30000);
          setTimeout(async () => {
            await endCall(req.tenantId, callUuid, { disposition: 'answered' });
            await setAgentStatus(req.tenantId, agent.id, 'available');
          }, dur);
        } else {
          // No agent — end as missed after maxWait
          setTimeout(async () => {
            await endCall(req.tenantId, callUuid, { disposition: 'missed' });
          }, 30000);
        }
      }, 3000);
    }

    res.json({ callUuid, message: 'Inbound call simulated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/calls/:uuid/answer — agent answers a call
router.post('/:uuid/answer', async (req, res) => {
  try {
    await answerCall(req.tenantId, req.params.uuid, req.user.userId);
    await setAgentStatus(req.tenantId, req.user.userId, 'on_call');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/calls/:uuid/hangup — end a call
router.post('/:uuid/hangup', async (req, res) => {
  try {
    const { disposition, notes } = req.body;
    await endCall(req.tenantId, req.params.uuid, { disposition });
    await setAgentStatus(req.tenantId, req.user.userId, 'available');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
