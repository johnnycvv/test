const db = require('../db/postgres');
const { broadcast } = require('./websocketBus');

const THRESHOLDS = {
  calls_per_hour:        100,
  calls_per_day:         500,
  avg_call_duration_max: 3600,
  international_pct:     0.8,
  unique_numbers_hour:   200,
};

async function flagTenant(tenantId, flagType, description, severity) {
  await db.query(
    `INSERT INTO usage_flags (tenant_id,flag_type,description,severity)
     VALUES ($1,$2,$3,$4)`,
    [tenantId, flagType, description, severity]
  );
  broadcast(tenantId, { event: 'usage.flag', flagType, severity, description });
  console.warn(`[UsageMonitor] Flag: tenant=${tenantId} type=${flagType} severity=${severity}`);
}

async function runChecks() {
  try {
    const tenants = await db.query(`SELECT id FROM tenants`);
    for (const { id } of tenants.rows) {
      await checkTenant(id);
    }
  } catch (err) {
    console.error('[UsageMonitor] Check error:', err.message);
  }
}

async function checkTenant(tenantId) {
  const [hourly, daily, intl, uniq] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM cdr WHERE tenant_id=$1 AND started_at > now()-interval '1h'`,[tenantId]),
    db.query(`SELECT COUNT(*) FROM cdr WHERE tenant_id=$1 AND started_at > now()-interval '24h'`,[tenantId]),
    db.query(`SELECT COUNT(*) FILTER (WHERE caller_id LIKE '+%' AND caller_id NOT LIKE '+44%' AND caller_id NOT LIKE '+1%') AS intl,
                     COUNT(*) AS total
              FROM cdr WHERE tenant_id=$1 AND started_at > now()-interval '24h'`,[tenantId]),
    db.query(`SELECT COUNT(DISTINCT caller_id) FROM cdr WHERE tenant_id=$1 AND started_at > now()-interval '1h'`,[tenantId]),
  ]);

  const callsHour = parseInt(hourly.rows[0].count);
  const callsDay  = parseInt(daily.rows[0].count);
  const intlRow   = intl.rows[0];
  const uniqNums  = parseInt(uniq.rows[0].count);
  const intlPct   = intlRow.total > 0 ? intlRow.intl / intlRow.total : 0;

  if (callsHour > THRESHOLDS.calls_per_hour)
    await flagTenant(tenantId, 'high_call_volume', `${callsHour} calls in last hour (threshold: ${THRESHOLDS.calls_per_hour})`, 'high');

  if (callsDay > THRESHOLDS.calls_per_day)
    await flagTenant(tenantId, 'high_daily_volume', `${callsDay} calls today (threshold: ${THRESHOLDS.calls_per_day})`, 'medium');

  if (intlPct > THRESHOLDS.international_pct && intlRow.total > 20)
    await flagTenant(tenantId, 'high_international', `${Math.round(intlPct*100)}% international calls`, 'medium');

  if (uniqNums > THRESHOLDS.unique_numbers_hour)
    await flagTenant(tenantId, 'mass_dialling', `${uniqNums} unique numbers dialled in 1 hour`, 'critical');
}

// Run every 15 minutes
setInterval(runChecks, 15 * 60 * 1000);

module.exports = { runChecks, checkTenant };
