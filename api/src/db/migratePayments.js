require('dotenv').config();
const db = require('./postgres');

async function run() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        company_name TEXT,
        stripe_session_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        stripe_payment_intent TEXT,
        amount_gbp NUMERIC(10,2) NOT NULL DEFAULT 500.00,
        promo_code TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','refunded')),
        tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
        temp_password TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        paid_at TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ps_email ON payment_sessions(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ps_stripe ON payment_sessions(stripe_session_id)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_flags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id),
        flag_type TEXT NOT NULL,
        description TEXT,
        severity TEXT DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
        resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_uf_tenant ON usage_flags(tenant_id)`);
    await client.query('COMMIT');
    console.log('[Migrate] Payment + usage_flags tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrate] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
run().then(() => process.exit(0)).catch(() => process.exit(1));
