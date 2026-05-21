const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const { setAgentStatus, getAllAgentStatuses } = require('../services/queueService');

const router = express.Router();
router.use(auth, ts);

// GET /api/agents — list all agents with current status
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, display_name, role, extension, sip_username, is_active, created_at
       FROM users WHERE tenant_id = $1 ORDER BY display_name`,
      [req.tenantId]
    );
    const agents = result.rows;
    const ids = agents.map(a => a.id);
    const statuses = ids.length ? await getAllAgentStatuses(req.tenantId, ids) : {};

    res.json(agents.map(a => ({ ...a, status: statuses[a.id] || 'offline' })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/agents/invite — create new agent
router.post('/invite', requireRole('admin'), async (req, res) => {
  try {
    const { email, displayName, role = 'agent', extension } = req.body;
    if (!email || !displayName) return res.status(400).json({ error: 'email and displayName required' });

    const tempPass = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(tempPass, 12);
    const sipUser = `${(extension || '200')}_${req.tenantId.slice(0, 8)}`;
    const sipPass = Math.random().toString(36).slice(-10);

    const result = await db.query(
      `INSERT INTO users (tenant_id, email, password_hash, role, display_name, extension, sip_username, sip_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, display_name, role, extension, sip_username`,
      [req.tenantId, email.toLowerCase(), hash, role, displayName, extension || '200', sipUser, sipPass]
    );

    res.status(201).json({ ...result.rows[0], temporaryPassword: tempPass });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/agents/:id — update agent details
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { displayName, role, extension, isActive } = req.body;
    const fields = {};
    if (displayName !== undefined) fields.display_name = displayName;
    if (role !== undefined)        fields.role = role;
    if (extension !== undefined)   fields.extension = extension;
    if (isActive !== undefined)    fields.is_active = isActive;

    const updated = await req.db.update('users', req.params.id, fields);
    if (!updated) return res.status(404).json({ error: 'Agent not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/agents/:id/status — agent sets their own status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['available', 'break', 'offline'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }
    // Agents can only set own status; admins can set any
    if (req.user.role === 'agent' && req.user.userId !== req.params.id) {
      return res.status(403).json({ error: 'Can only set your own status' });
    }
    await setAgentStatus(req.tenantId, req.params.id, status);
    res.json({ agentId: req.params.id, status });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/agents/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await db.query(`UPDATE users SET is_active=false WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/agents/:id/password
router.patch('/:id/password', async (req, res) => {
  try {
    if (req.user.role === 'agent' && req.user.userId !== req.params.id) {
      return res.status(403).json({ error: 'Cannot change another agent\'s password' });
    }
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters' });
    const hash = await bcrypt.hash(password, 12);
    await db.query(`UPDATE users SET password_hash=$1 WHERE id=$2 AND tenant_id=$3`, [hash, req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// GET /api/agents/:id/qr-token — generate a short-lived token for QR code login
router.get('/:id/qr-token', requireRole('admin'), async (req, res) => {
  try {
    const agent = await req.db.findOne('users', req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: agent.id, tenantId: req.tenantId, role: agent.role, email: agent.email, qr: true },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, agentName: agent.display_name });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
