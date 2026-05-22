The issue is req.db.update — it's using an old database helper that doesn't exist. Fix it by editing the file on GitHub right now. Select all, delete, paste this:

const express = require('express');
const db = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const router = express.Router();
router.use(auth, ts);
router.get('/', async (req, res) => {
try {
const result = await db.query('SELECT d.*, CASE d.assigned_to_type WHEN ' + "'queue'" + ' THEN (SELECT name FROM queues WHERE id = d.assigned_to_id) WHEN ' + "'agent'" + ' THEN (SELECT display_name FROM users WHERE id = d.assigned_to_id) END AS assigned_name, t.name AS trunk_name FROM did_numbers d LEFT JOIN sip_trunks t ON t.id = d.trunk_id WHERE d.tenant_id = $1 ORDER BY d.number', [req.tenantId]);
res.json(result.rows);
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.post('/', requireRole('admin'), async (req, res) => {
try {
const { number, countryCode, description, trunkId } = req.body;
if (!number) return res.status(400).json({ error: 'number required' });
const result = await db.query('INSERT INTO did_numbers (tenant_id, number, country_code, description, trunk_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.tenantId, number.trim(), countryCode || null, description || null, trunkId || null]);
res.status(201).json(result.rows[0]);
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.patch('/:id/assign', requireRole('admin'), async (req, res) => {
try {
const { type, targetId } = req.body;
const result = await db.query('UPDATE did_numbers SET assigned_to_type=$1, assigned_to_id=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *', [type || null, targetId || null, req.params.id, req.tenantId]);
if (!result.rows[0]) return res.status(404).json({ error: 'DID not found' });
res.json(result.rows[0]);
} catch (err) { console.error('[DIDs] assign error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { description, trunkId, countryCode } = req.body;
    const fields = []; const vals = []; let i = 1;
    if (description !== undefined) { fields.push('description=$' + i); i++; vals.push(description); }
    if (trunkId !== undefined) { fields.push('trunk_id=$' + i); i++; vals.push(trunkId); }
    if (countryCode !== undefined) { fields.push('country_code=$' + i); i++; vals.push(countryCode); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id, req.tenantId);
    const result = await db.query('UPDATE did_numbers SET ' + fields.join(',') + ' WHERE id=′+i+′ANDtenantid=' + i + ' AND tenant_id=
′+i+′ANDtenanti​d=' + (i+1) + ' RETURNING *', vals);
    if (!result.rows[0]) return res.status(404).json({ error: 'DID not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.delete('/:id', requireRole('admin'), async (req, res) => {
try {
const result = await db.query('DELETE FROM did_numbers WHERE id=$1 AND tenant_id=$2 RETURNING id', [req.params.id, req.tenantId]);
if (!result.rows[0]) return res.status(404).json({ error: 'DID not found' });
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
module.exports = router;
