const express = require('express');
const db = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const router = express.Router();
router.use(auth, ts);
router.get('/', async (req, res) => {
try {
const { limit = 100, offset = 0, status, direction } = req.query;
let q = 'SELECT * FROM sip_call_log WHERE tenant_id = $1';
const vals = [req.tenantId];
let i = 2;
if (status) { q += ' AND status = $' + i; i++; vals.push(status); }
if (direction) { q += ' AND direction = $' + i; i++; vals.push(direction); }
q += ' ORDER BY created_at DESC LIMIT $' + i + ' OFFSET $' + (i+1);
vals.push(parseInt(limit), parseInt(offset));
const result = await db.query(q, vals);
const count = await db.query('SELECT COUNT(*) FROM sip_call_log WHERE tenant_id = $1', [req.tenantId]);
res.json({ logs: result.rows, total: parseInt(count.rows[0].count) });
} catch (err) { console.error('[SipLog]', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.delete('/clear', requireRole('admin'), async (req, res) => {
try {
await db.query('DELETE FROM sip_call_log WHERE tenant_id = $1', [req.tenantId]);
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
module.exports = router;
