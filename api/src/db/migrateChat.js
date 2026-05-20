require('dotenv').config();
const db = require('./postgres');

async function run() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Agent public keys for ECDH
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_keys (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        public_key_jwk JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Chat channels (direct or group)
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'direct' CHECK (type IN ('direct','group')),
        name TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Channel members
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_members (
        channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (channel_id, user_id)
      )
    `);

    // Messages — ciphertext only, never plaintext
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id),
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        ephemeral_public_key JSONB,
        message_type TEXT DEFAULT 'text',
        sent_at TIMESTAMPTZ DEFAULT now(),
        edited_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ
      )
    `);

    // GDPR audit log — metadata only, zero content
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id),
        actor_id UUID REFERENCES users(id),
        action TEXT NOT NULL,
        channel_id UUID,
        message_id UUID,
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Delivery receipts
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_receipts (
        message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        delivered_at TIMESTAMPTZ DEFAULT now(),
        read_at TIMESTAMPTZ,
        PRIMARY KEY (message_id, user_id)
      )
    `);

    // GDPR retention policy per tenant
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_retention_policy (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        retain_days INT DEFAULT 90,
        updated_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, sent_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_audit_tenant ON chat_audit_log(tenant_id, created_at DESC)`);

    await client.query('COMMIT');
    console.log('[Migrate] Chat tables created.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Migrate] Chat migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
