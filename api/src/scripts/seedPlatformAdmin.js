require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../db/postgres');

async function seedPlatformAdmin() {
  // Platform admin has NO tenant_id — gives access to admin-payments panel
  const email    = process.env.PLATFORM_ADMIN_EMAIL    || 'platform@cloudcall.admin';
  const password = process.env.PLATFORM_ADMIN_PASSWORD || 'CloudCall-Admin-2024!';

  const existing = await db.query(`SELECT id FROM users WHERE email=$1`, [email]);
  if (existing.rows[0]) {
    console.log('[Seed] Platform admin already exists:', email);
    return process.exit(0);
  }

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, role, display_name, extension, sip_username, sip_password)
     VALUES (gen_random_uuid(), NULL, $1, $2, 'admin', 'Platform Admin', '000', 'platform_admin', 'na')`,
    [email, hash]
  );

  console.log('\n[Seed] ✅ Platform admin created\n');
  console.log('  Email:   ', email);
  console.log('  Password:', password);
  console.log('\n  ⚠  Store these credentials securely — they bypass the paywall.\n');
  process.exit(0);
}

seedPlatformAdmin().catch(e => { console.error(e); process.exit(1); });
