const express = require('express');
const router = express.Router();
const db = require('../db/postgres');
const { auth } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');

router.use(auth, ts);

// GET /api/sip/credentials — returns SIP credentials for the agent's tenant
// The agent uses these to register their JsSIP UA directly with the SIP trunk
router.get('/credentials', async (req, res) => {
  try {
    // Get the primary/active SIP trunk for this tenant
    const result = await db.query(
      `SELECT st.registrar, st.username, st.password, st.realm,
              st.proxy, st.display_name, st.expires,
              u.display_name AS agent_name, u.extension, u.sip_username, u.sip_password
       FROM sip_trunks st
       JOIN users u ON u.tenant_id = st.tenant_id
       WHERE st.tenant_id = $1
         AND st.is_active = true
         AND u.id = $2
       ORDER BY st.created_at ASC
       LIMIT 1`,
      [req.tenantId, req.user.userId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'No active SIP trunk configured for this account. Ask your administrator to add a SIP trunk in the dashboard.' });
    }

    const row = result.rows[0];

    // Build WebSocket URI from registrar
    // Most SIP providers support wss:// on port 443 or 5061
    const registrar = row.registrar;
    const wsUri = registrar.startsWith('wss://') || registrar.startsWith('ws://')
      ? registrar
      : `wss://${registrar}`;

    res.json({
      wsUri,
      sipUri: `sip:${row.sip_username || row.username}@${registrar.replace(/^wss?:\/\//, '')}`,
      username: row.sip_username || row.username,
      password: row.sip_password || row.password,
      realm: row.realm || registrar.replace(/^wss?:\/\//, '').split(':')[0],
      displayName: row.agent_name,
      extension: row.extension,
      expires: row.expires || 300,
    });
  } catch (err) {
    console.error('[SIP] credentials error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
