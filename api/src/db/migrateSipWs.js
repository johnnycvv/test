require('dotenv').config();
const db = require('./postgres');

async function run() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Add WebSocket and realm fields to SIP trunks if not exists
    await client.query(`ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS realm TEXT`);
    await client.query(`ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS ws_uri TEXT`);
    await client.query(`ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS proxy TEXT`);
    await client.query(`ALTER TABLE sip_trunks ADD COLUMN IF NOT EXISTS expires INT DEFAULT 300`);
    await client.query('COMMIT');
    console.log('[Migrate] SIP WebSocket fields added.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrate] Failed:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}
run();
