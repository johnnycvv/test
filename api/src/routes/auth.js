const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/postgres');
const { auth } = require('../middleware/auth');

const router = express.Router();

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await db.query(
      `SELECT u.*, t.name AS tenant_name, t.plan
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.is_active = true`,
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    };

    res.json({
      accessToken: signAccess(payload),
      refreshToken: signRefresh(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        extension: user.extension,
        sipUsername: user.sip_username,
        sipPassword: user.sip_password,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const { userId, tenantId, role, email } = payload;
    res.json({ accessToken: signAccess({ userId, tenantId, role, email }) });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.*, t.name AS tenant_name, t.plan
       FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      extension: user.extension,
      sipUsername: user.sip_username,
      sipPassword: user.sip_password,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      plan: user.plan,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
