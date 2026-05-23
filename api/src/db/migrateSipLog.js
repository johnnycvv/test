require('dotenv').config();
const db = require('./postgres');
async function run() {
const client = await db.getClient();
try {
await client.query('BEGIN');
await client.query('CREATE TABLE IF NOT EXISTS sip_call_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, campaign_id UUID, number_id UUID, direction VARCHAR(10) DEFAULT 'outbound', from_number VARCHAR(50), to_number VARCHAR(50), sip_host VARCHAR(100), sip_response_code INT, sip_response_text VARCHAR(100), status VARCHAR(20), duration_seconds INT DEFAULT 0, started_at TIMESTAMPTZ DEFAULT NOW(), answered_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, error_message TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
await client.query('CREATE INDEX IF NOT EXISTS idx_sip_call_log_tenant ON sip_call_log(tenant_id)');
await client.query('CREATE INDEX IF NOT EXISTS idx_sip_call_log_created ON sip_call_log(created_at DESC)');
await client.query('COMMIT');
console.log('[Migrate] SIP call log table created.');
} catch (err) {
await client.query('ROLLBACK');
console.error('[Migrate] Failed:', err.message);
} finally {
client.release();
process.exit(0);
}
}
run();
