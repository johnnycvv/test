const db = require('../db/postgres');
const { broadcast } = require('./websocketBus');

/**
 * Simulate SIP trunk registration test.
 * In production, this would connect to FreeSWITCH via ESL and reload sofia profile.
 * For MVP without FreeSWITCH, we simulate the registration flow.
 */
async function testTrunkConnection(trunk) {
  // Simulate network check — in production: ESL sofia_contact check
  return new Promise((resolve) => {
    setTimeout(() => {
      // Simulate 80% success rate for demo
      const ok = Math.random() > 0.2;
      resolve({ ok, latencyMs: ok ? Math.floor(Math.random() * 80 + 20) : null });
    }, 1200);
  });
}

/**
 * Register/activate a trunk and update status in DB.
 */
async function activateTrunk(tenantId, trunkId) {
  const result = await db.query(
    `SELECT * FROM sip_trunks WHERE id = $1 AND tenant_id = $2`, [trunkId, tenantId]
  );
  const trunk = result.rows[0];
  if (!trunk) return { ok: false, error: 'Trunk not found' };

  const { ok, latencyMs } = await testTrunkConnection(trunk);
  const newStatus = ok ? 'registered' : 'failed';

  await db.query(
    `UPDATE sip_trunks SET status=$1, last_registered_at=now() WHERE id=$2`,
    [newStatus, trunkId]
  );

  broadcast(tenantId, { event: 'trunk.status', trunkId, status: newStatus, latencyMs });
  return { ok, status: newStatus, latencyMs };
}

/**
 * Get highest-priority registered trunk for a tenant (for outbound calls).
 */
async function getActiveTrunk(tenantId) {
  const result = await db.query(
    `SELECT * FROM sip_trunks WHERE tenant_id=$1 AND status='registered' ORDER BY priority ASC LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Health-check all trunks for all tenants (run on interval).
 */
async function runHealthChecks() {
  const result = await db.query(
    `SELECT id, tenant_id FROM sip_trunks WHERE status IN ('registered','active')`
  );
  for (const { id, tenant_id } of result.rows) {
    await activateTrunk(tenant_id, id).catch(() => {});
  }
}

// Run health checks every 2 minutes
setInterval(runHealthChecks, 120_000);

module.exports = { testTrunkConnection, activateTrunk, getActiveTrunk, runHealthChecks };
