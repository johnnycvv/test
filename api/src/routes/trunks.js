const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const { activateTrunk } = require('../services/sipTrunkService');

const router = express.Router();
router.use(auth, ts);

// GET /api/trunks
router.get('/', async (req, res) => {
  try {
    const trunks = await req.db.find('sip_trunks', {}, 'priority ASC');
    // Mask password in response
    res.json(trunks.map(t => ({ ...t, password: '••••••••' })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trunks
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, registrar, username, password, authRealm, priority, codecs } = req.body;
    if (!name || !registrar || !username || !password) {
      return res.status(400).json({ error: 'name, registrar, username and password required' });
    }
    const trunk = await req.db.insert('sip_trunks', {
      name,
      registrar,
      username,
      password,
      auth_realm: authRealm || registrar,
      priority: priority || 1,
      codecs: codecs || ['PCMU', 'PCMA'],
      status: 'inactive',
    });
    res.status(201).json({ ...trunk, password: '••••••••' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/trunks/:id
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, registrar, username, password, priority, codecs } = req.body;
    const fields = {};
    if (name !== undefined)      fields.name = name;
    if (registrar !== undefined) fields.registrar = registrar;
    if (username !== undefined)  fields.username = username;
    if (password !== undefined)  fields.password = password;
    if (priority !== undefined)  fields.priority = priority;
    if (codecs !== undefined)    fields.codecs = codecs;

    const updated = await req.db.update('sip_trunks', req.params.id, fields);
    if (!updated) return res.status(404).json({ error: 'Trunk not found' });
    res.json({ ...updated, password: '••••••••' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/trunks/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const ok = await req.db.delete('sip_trunks', req.params.id);
    if (!ok) return res.status(404).json({ error: 'Trunk not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/trunks/:id/test — test connection + register
router.post('/:id/test', requireRole('admin'), async (req, res) => {
  try {
    const result = await activateTrunk(req.tenantId, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
