const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');
const db = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const router = express.Router();
router.use(auth, ts);
router.get('/', async (req, res) => {
try {
const r = await db.query('SELECT id, email, display_name, role, extension, sip_username, sip_password, status, is_active, created_at FROM users WHERE tenant_id = $1 ORDER BY display_name ASC', [req.tenantId]);
res.json(r.rows);
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.post('/invite', requireRole('admin', 'supervisor'), async (req, res) => {
try {
const { email, displayName, role = 'agent', extension } = req.body;
if (!displayName) return res.status(400).json({ error: 'Display name required' });
const agentEmail = email || (displayName.toLowerCase().replace(/\s+/g, '.') + '.' + Date.now() + '@agent.local');
const existing = await db.query('SELECT id FROM users WHERE email=$1', [agentEmail]);
if (existing.rows[0]) return res.status(409).json({ error: 'Email already in use' });
const temporaryPassword = Math.random().toString(36).slice(2, 10) + 'Aa1!';
const hash = await bcrypt.hash(temporaryPassword, 12);
const sipUsername = displayName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '') + Math.floor(Math.random() * 1000);
const sipPassword = uuid().replace(/-/g, '').slice(0, 16);
const result = await db.query('INSERT INTO users (tenant_id, email, display_name, role, extension, sip_username, sip_password, password_hash, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id, email, display_name, role, extension, sip_username', [req.tenantId, agentEmail, displayName, role, extension || null, sipUsername, sipPassword, hash]);
res.status(201).json({ ...result.rows[0], temporaryPassword });
} catch (err) { console.error('[Agents] invite error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.patch('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { displayName, role, extension, isActive } = req.body;
    const fields = []; const vals = []; let i = 1;
    if (displayName !== undefined) { fields.push('display_name=$' + i++); vals.push(displayName); }
    if (role !== undefined) { fields.push('role=$' + i++); vals.push(role); }
    if (extension !== undefined) { fields.push('extension=$' + i++); vals.push(extension); }
    if (isActive !== undefined) { fields.push('is_active=$' + i++); vals.push(isActive); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id, req.tenantId);
    await db.query('UPDATE users SET ' + fields.join(',') + ' WHERE id=′+i+++′ANDtenantid=' + i++ + ' AND tenant_id=
′+i+++′ANDtenanti​d=' + i, vals);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.patch('/:id/status', async (req, res) => {
try {
const { status } = req.body;
await db.query('UPDATE users SET status=$1 WHERE id=$2 AND tenant_id=$3', [status, req.params.id, req.tenantId]);
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.patch('/:id/password', requireRole('admin'), async (req, res) => {
try {
const { password } = req.body;
if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
const hash = await bcrypt.hash(password, 12);
await db.query('UPDATE users SET password_hash=$1 WHERE id=$2 AND tenant_id=$3', [hash, req.params.id, req.tenantId]);
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.delete('/:id', requireRole('admin'), async (req, res) => {
try {
await db.query('DELETE FROM users WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.get('/:id/qr-token', requireRole('admin'), async (req, res) => {
try {
const result = await db.query('SELECT * FROM users WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
const agent = result.rows[0];
if (!agent) return res.status(404).json({ error: 'Agent not found' });
const jwt = require('jsonwebtoken');
const token = jwt.sign({ userId: agent.id, tenantId: req.tenantId, role: agent.role, email: agent.email, qr: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
res.json({ token, agentName: agent.display_name });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.get('/:id/sip-config', requireRole('admin', 'supervisor'), async (req, res) => {
try {
const agentRes = await db.query('SELECT u.display_name, u.extension, u.sip_username, u.sip_password, st.registrar, st.username AS trunk_user, st.password AS trunk_pass, st.realm FROM users u LEFT JOIN sip_trunks st ON st.tenant_id = u.tenant_id AND st.is_active = true WHERE u.id = $1 AND u.tenant_id = $2 ORDER BY st.created_at ASC LIMIT 1', [req.params.id, req.tenantId]);
const agent = agentRes.rows[0];
if (!agent) return res.status(404).json({ error: 'Agent not found' });
if (!agent.registrar) return res.status(404).json({ error: 'No SIP trunk configured. Add one in Dashboard first.' });
const username = agent.sip_username || agent.trunk_user;
const password = agent.sip_password || agent.trunk_pass;
const server = agent.registrar.replace(/^wss?:///, '').split(':')[0];
const realm = agent.realm || server;
if (!username || !password) return res.status(400).json({ error: 'No SIP credentials found for this agent.' });
res.json({ username, password, server, realm, transport: 'tls', displayName: agent.display_name, extension: agent.extension, sipUri: 'sip:' + username + ':' + password + '@' + server + ';transport=tls' });
} catch (err) { console.error('[sip-config]', err.message); res.status(500).json({ error: 'Server error: ' + err.message }); }
});
module.exports = router;