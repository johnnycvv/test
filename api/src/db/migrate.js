require('dotenv').config();
const db = require('./postgres');

const migrations = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,

  `CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter','pro','enterprise')),
    max_agents INT DEFAULT 10,
    max_trunks INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'agent' CHECK (role IN ('admin','agent','supervisor')),
    display_name TEXT,
    extension TEXT,
    sip_username TEXT UNIQUE,
    sip_password TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, email)
  )`,

  `CREATE TABLE IF NOT EXISTS sip_trunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    registrar TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    auth_realm TEXT,
    priority INT DEFAULT 1,
    status TEXT DEFAULT 'inactive' CHECK (status IN ('active','inactive','registered','failed')),
    codecs TEXT[] DEFAULT ARRAY['PCMU','PCMA'],
    last_registered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS did_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    country_code CHAR(2),
    description TEXT,
    assigned_to_type TEXT CHECK (assigned_to_type IN ('queue','agent','ivr',NULL)),
    assigned_to_id UUID,
    trunk_id UUID REFERENCES sip_trunks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    strategy TEXT DEFAULT 'round_robin' CHECK (strategy IN ('round_robin','least_idle','sequential')),
    max_wait_seconds INT DEFAULT 300,
    max_size INT DEFAULT 50,
    moh_file TEXT DEFAULT 'default',
    recording_enabled BOOLEAN DEFAULT false,
    callback_enabled BOOLEAN DEFAULT false,
    ring_timeout INT DEFAULT 30,
    announce_position BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS queue_agents (
    queue_id UUID REFERENCES queues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    priority INT DEFAULT 1,
    wrap_up_time INT DEFAULT 0,
    PRIMARY KEY (queue_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ivr_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    greeting_text TEXT,
    timeout_seconds INT DEFAULT 10,
    max_retries INT DEFAULT 3,
    options JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS call_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    did_id UUID REFERENCES did_numbers(id) ON DELETE SET NULL,
    nodes JSONB DEFAULT '[]',
    edges JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS cdr (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    call_uuid TEXT NOT NULL,
    direction TEXT CHECK (direction IN ('inbound','outbound')),
    caller_id TEXT,
    callee TEXT,
    did_number TEXT,
    queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    trunk_id UUID REFERENCES sip_trunks(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INT DEFAULT 0,
    wait_seconds INT DEFAULT 0,
    disposition TEXT DEFAULT 'missed' CHECK (disposition IN ('answered','missed','abandoned','voicemail','busy')),
    recording_url TEXT,
    notes TEXT,
    hangup_cause TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_cdr_tenant_started ON cdr(tenant_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_cdr_queue ON cdr(queue_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cdr_agent ON cdr(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_did_tenant ON did_numbers(tenant_id)`,
];

async function migrate() {
  console.log('[Migrate] Running migrations...');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const sql of migrations) {
      await client.query(sql);
    }
    await client.query('COMMIT');
    console.log('[Migrate] All migrations complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrate] Failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
// Note: run addPaymentsTables() separately after initial migrate
