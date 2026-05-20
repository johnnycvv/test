require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/postgres');

async function seed() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  const tenantName  = get('--name') || 'Demo Company';
  const adminEmail  = get('--email') || 'admin@demo.com';
  const adminPass   = get('--password') || 'demo1234';

  console.log('[Seed] Creating tenant:', tenantName);
  const tenantResult = await db.query(
    `INSERT INTO tenants (name, plan) VALUES ($1, 'pro') RETURNING *`,
    [tenantName]
  );
  const tenant = tenantResult.rows[0];
  console.log('[Seed] Tenant created:', tenant.id);

  const hash = await bcrypt.hash(adminPass, 12);
  const sipPass = Math.random().toString(36).slice(-10);
  const ext = '100';

  const adminResult = await db.query(
    `INSERT INTO users (tenant_id, email, password_hash, role, display_name, extension, sip_username, sip_password)
     VALUES ($1,$2,$3,'admin',$4,$5,$6,$7) RETURNING *`,
    [tenant.id, adminEmail, hash, 'Admin User', ext, `${ext}_${tenant.id.slice(0,8)}`, sipPass]
  );
  console.log('[Seed] Admin user created:', adminEmail);

  // Demo agents
  const agents = [
    { name: 'Sara Mitchell', ext: '101' },
    { name: 'Tom Kowalski',  ext: '102' },
    { name: 'Priya Nair',    ext: '103' },
  ];
  for (const ag of agents) {
    const aHash = await bcrypt.hash('agent1234', 12);
    const aSipPass = Math.random().toString(36).slice(-10);
    const email = `${ag.name.split(' ')[0].toLowerCase()}@demo.com`;
    await db.query(
      `INSERT INTO users (tenant_id, email, password_hash, role, display_name, extension, sip_username, sip_password)
       VALUES ($1,$2,$3,'agent',$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [tenant.id, email, aHash, ag.name, ag.ext, `${ag.ext}_${tenant.id.slice(0,8)}`, aSipPass]
    );
  }
  console.log('[Seed] Demo agents created');

  // Demo queue
  const qResult = await db.query(
    `INSERT INTO queues (tenant_id, name, description, strategy, max_wait_seconds, recording_enabled)
     VALUES ($1,'Sales','Inbound sales calls','round_robin',180,true) RETURNING *`,
    [tenant.id]
  );
  const queue = qResult.rows[0];

  // Add all agents to queue
  const usersResult = await db.query(
    `SELECT id FROM users WHERE tenant_id=$1 AND role='agent'`, [tenant.id]
  );
  for (const u of usersResult.rows) {
    await db.query(
      `INSERT INTO queue_agents (queue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [queue.id, u.id]
    );
  }

  // Demo DID
  await db.query(
    `INSERT INTO did_numbers (tenant_id, number, country_code, description, assigned_to_type, assigned_to_id)
     VALUES ($1,'+442079460001','GB','Main UK number','queue',$2)`,
    [tenant.id, queue.id]
  );

  console.log('\n[Seed] ✅ Setup complete!\n');
  console.log('  Tenant:   ', tenantName, `(${tenant.id})`);
  console.log('  Login:    ', adminEmail);
  console.log('  Password: ', adminPass);
  console.log('  URL:       http://localhost:3000\n');

  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
