const db = require('../db/postgres');
const { broadcast } = require('./websocketBus');
const { removeActive } = require('./queueService');

/**
 * Create a new CDR record when call starts.
 */
async function startCall(tenantId, { callUuid, direction, callerId, callee, didNumber, queueId, trunkId }) {
  const result = await db.query(
    `INSERT INTO cdr (tenant_id, call_uuid, direction, caller_id, callee, did_number, queue_id, trunk_id, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING *`,
    [tenantId, callUuid, direction, callerId, callee, didNumber, queueId || null, trunkId || null]
  );
  const cdr = result.rows[0];

  broadcast(tenantId, {
    event: 'call.ringing',
    callUuid,
    callerId,
    callee,
    queueId,
    direction,
    ts: Date.now(),
  });

  return cdr;
}

/**
 * Mark call as answered by an agent.
 */
async function answerCall(tenantId, callUuid, agentId) {
  const result = await db.query(
    `UPDATE cdr SET answered_at = now(), agent_id = $1, disposition = 'answered'
     WHERE call_uuid = $2 AND tenant_id = $3 RETURNING *`,
    [agentId, callUuid, tenantId]
  );
  const cdr = result.rows[0];
  if (cdr) {
    broadcast(tenantId, { event: 'call.answered', callUuid, agentId, ts: Date.now() });
  }
  return cdr;
}

/**
 * End a call — compute duration, update CDR.
 */
async function endCall(tenantId, callUuid, { disposition = 'answered', recordingUrl = null, hangupCause = null } = {}) {
  const result = await db.query(
    `UPDATE cdr
     SET ended_at = now(),
         duration_seconds = COALESCE(EXTRACT(EPOCH FROM (now() - answered_at))::INT, 0),
         wait_seconds = COALESCE(EXTRACT(EPOCH FROM (COALESCE(answered_at, now()) - started_at))::INT, 0),
         disposition = COALESCE(NULLIF($1,''), disposition),
         recording_url = COALESCE($2, recording_url),
         hangup_cause = $3
     WHERE call_uuid = $4 AND tenant_id = $5
     RETURNING *, queue_id`,
    [disposition, recordingUrl, hangupCause, callUuid, tenantId]
  );
  const cdr = result.rows[0];
  if (cdr) {
    if (cdr.queue_id) await removeActive(tenantId, cdr.queue_id, callUuid);
    broadcast(tenantId, {
      event: 'call.ended',
      callUuid,
      duration: cdr.duration_seconds,
      disposition: cdr.disposition,
      ts: Date.now(),
    });
  }
  return cdr;
}

/**
 * Get CDR list for a tenant with optional filters.
 */
async function getCDR(tenantId, { from, to, queueId, agentId, disposition, limit = 100, offset = 0 } = {}) {
  const conditions = ['c.tenant_id = $1'];
  const vals = [tenantId];
  let idx = 2;

  if (from)        { conditions.push(`c.started_at >= $${idx++}`); vals.push(from); }
  if (to)          { conditions.push(`c.started_at <= $${idx++}`); vals.push(to); }
  if (queueId)     { conditions.push(`c.queue_id = $${idx++}`);    vals.push(queueId); }
  if (agentId)     { conditions.push(`c.agent_id = $${idx++}`);    vals.push(agentId); }
  if (disposition) { conditions.push(`c.disposition = $${idx++}`); vals.push(disposition); }

  vals.push(limit, offset);

  const sql = `
    SELECT c.*,
           u.display_name AS agent_name,
           q.name AS queue_name
    FROM cdr c
    LEFT JOIN users u ON u.id = c.agent_id
    LEFT JOIN queues q ON q.id = c.queue_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.started_at DESC
    LIMIT $${idx++} OFFSET $${idx}
  `;
  const result = await db.query(sql, vals);
  return result.rows;
}

/**
 * Daily stats summary for dashboard reporting.
 */
async function getDailyStats(tenantId) {
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE started_at >= now() - interval '24h') AS total_today,
       COUNT(*) FILTER (WHERE started_at >= now() - interval '24h' AND disposition='answered') AS answered_today,
       COUNT(*) FILTER (WHERE started_at >= now() - interval '24h' AND disposition='missed') AS missed_today,
       AVG(wait_seconds) FILTER (WHERE started_at >= now() - interval '24h')::INT AS avg_wait,
       AVG(duration_seconds) FILTER (WHERE started_at >= now() - interval '24h' AND disposition='answered')::INT AS avg_duration
     FROM cdr WHERE tenant_id = $1`,
    [tenantId]
  );
  return result.rows[0];
}

module.exports = { startCall, answerCall, endCall, getCDR, getDailyStats };
