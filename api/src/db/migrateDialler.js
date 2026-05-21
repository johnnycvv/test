require('dotenv').config();
const db = require('./postgres');

async function run() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS dialler_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'ready' CHECK (status IN ('ready','running','paused','completed','stopped')),
        message_text TEXT,
        audio_url TEXT,
        press1_queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
        trunk_id UUID REFERENCES sip_trunks(id) ON DELETE SET NULL,
        custom_sip_host TEXT,
        custom_sip_user TEXT,
        custom_sip_pass TEXT,
        caller_id TEXT,
        calls_per_minute INT DEFAULT 10,
        total_numbers INT DEFAULT 0,
        calls_made INT DEFAULT 0,
        calls_answered INT DEFAULT 0,
        calls_transferred INT DEFAULT 0,
        calls_failed INT DEFAULT 0,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dialler_numbers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES dialler_campaigns(id) ON DELETE CASCADE,
        phone_number TEXT NOT NULL,
        name TEXT,
        custom_data JSONB,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','calling','answered','transferred','failed','no_answer','busy')),
        call_sid TEXT,
        called_at TIMESTAMPTZ,
        answered_at TIMESTAMPTZ,
        transferred_at TIMESTAMPTZ,
        attempt_count INT DEFAULT 0
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_dialler_numbers_campaign ON dialler_numbers(campaign_id, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_dialler_campaigns_tenant ON dialler_campaigns(tenant_id)`);

    await client.query('COMMIT');
    console.log('[Migrate] Dialler tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrate] Dialler migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
