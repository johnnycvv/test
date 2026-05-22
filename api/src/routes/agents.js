// GET /api/agents/:id/sip-config — get SIP credentials for Zoiper/Linphone QR
router.get('/:id/sip-config', requireRole('admin', 'supervisor'), async (req, res) => {
try {
const agentResult = await db.query(
SELECT u.display_name, u.extension, u.sip_username, u.sip_password,               st.registrar, st.username AS trunk_user, st.password AS trunk_pass,               st.realm, st.ws_uri        FROM users u        LEFT JOIN sip_trunks st ON st.tenant_id = u.tenant_id AND st.is_active = true        WHERE u.id = $1 AND u.tenant_id = $2        ORDER BY st.created_at ASC        LIMIT 1,
[req.params.id, req.tenantId]
);
const agent = agentResult.rows[0];
if (!agent) return res.status(404).json({ error: 'Agent not found' });
if (!agent.registrar) {
return res.status(404).json({ error: 'No active SIP trunk configured. Go to Dashboard → SIP Trunks and add one first.' });
}
const username = agent.sip_username || agent.trunk_user;
const password = agent.sip_password || agent.trunk_pass;
const server   = agent.registrar.replace(/^wss?:///, '').split(':')[0];
const realm    = agent.realm || server;
if (!username || !password) {
return res.status(400).json({ error: 'Agent has no SIP credentials. Set them in the Agents page.' });
}
res.json({
username, password, server, realm, transport: 'tls',
displayName: agent.display_name, extension: agent.extension,
sipUri: sip:${username}:${password}@${server};transport=tls,
});
} catch (err) {
console.error('[Agents] sip-config error:', err.message);
res.status(500).json({ error: 'Server error' });
}
});
module.exports = router;