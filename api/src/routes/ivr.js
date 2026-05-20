const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');

const router = express.Router();
router.use(auth, ts);

router.get('/', async (req, res) => {
  try {
    const menus = await req.db.find('ivr_menus');
    res.json(menus);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const menu = await req.db.findOne('ivr_menus', req.params.id);
    if (!menu) return res.status(404).json({ error: 'Not found' });
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, greetingText, timeoutSeconds, maxRetries, options } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const menu = await req.db.insert('ivr_menus', {
      name,
      greeting_text: greetingText || '',
      timeout_seconds: timeoutSeconds || 10,
      max_retries: maxRetries || 3,
      options: JSON.stringify(options || []),
    });
    res.status(201).json(menu);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, greetingText, timeoutSeconds, options } = req.body;
    const fields = {};
    if (name !== undefined)           fields.name = name;
    if (greetingText !== undefined)   fields.greeting_text = greetingText;
    if (timeoutSeconds !== undefined) fields.timeout_seconds = timeoutSeconds;
    if (options !== undefined)        fields.options = JSON.stringify(options);

    const updated = await req.db.update('ivr_menus', req.params.id, fields);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const ok = await req.db.delete('ivr_menus', req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
