const express = require('express');
const db = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');

const router = express.Router();
router.use(auth, ts);

// GET /api/dids
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*,
         CASE d.assigned_to_type
           WHEN 'queue'  THEN (SELECT name FROM queues WHERE id = d.assigned_to_id)
           WHEN 'agent'  THEN (SELECT display_name FROM users WHERE id = d.assigned_to_id)
           WHEN 'ivr'    THEN (SELECT name FROM ivr_menus WHERE id = d.assigned_to_id)
         END AS assigned_name,
         t.name AS trunk_name
       FROM did_numbers d
       LEFT JOIN sip_trunks t ON t.id = d.trunk_id
       WHERE d.tenant_id = $1
       ORDER BY d.number`,
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/dids
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { number, countryCode, description, trunkId } = req.body;
    if (!number) return res.status(400).json({ error: 'number required' });

    const did = await req.db.insert('did_numbers', {
      number: number.trim(),
      country_code: countryCode || null,
      description: description || null,
      trunk_id: trunkId || null,
    });
    res.status(201).json(did);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/dids/:id/assign — assign DID to queue/agent/ivr
router.patch('/:id/assign', requireRole('admin'), async (req, res) => {
  try {
    const { type, targetId } = req.body;
    const validTypes = ['queue', 'agent', 'ivr', null];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'type must be queue, agent, ivr, or null' });
    }
    const updated = await req.db.update('did_numbers', req.params.id, {
      assigned_to_type: type,
      assigned_to_id: targetId || null,
    });
    if (!updated) return res.status(404).json({ error: 'DID not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/dids/:id — update DID details
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { description, trunkId, countryCode } = req.body;
    const fields = {};
    if (description !== undefined) fields.description = description;
    if (trunkId !== undefined)     fields.trunk_id = trunkId;
    if (countryCode !== undefined) fields.country_code = countryCode;

    const updated = await req.db.update('did_numbers', req.params.id, fields);
    if (!updated) return res.status(404).json({ error: 'DID not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/dids/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const ok = await req.db.delete('did_numbers', req.params.id);
    if (!ok) return res.status(404).json({ error: 'DID not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
