Go to https://github.com/johnnycvv/test/edit/main/api/src/routes/dialler.js
Select all, delete, paste this:

const express  = require('express');
const multer   = require('multer');
const db       = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts       = require('../middleware/tenantScope');
const net      = require('net');
const router = express.Router();
router.use(auth, ts);
const diallerEngines = new Map();
function broadcast(tenantId, data) {
try {
const wss = global._wss;
if (wss) wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ tenantId, ...data })); });
} catch(e) {}
}
async function makeSIPCall(sipHost, sipUser, sipPass, callerId, toNumber) {
return new Promise((resolve) => {
const callId = Math.random().toString(36).substr(2, 16) + '@' + sipHost;
const tag = Math.random().toString(36).substr(2, 8);
const branch = 'z9hG4bK' + Math.random().toString(36).substr(2, 12);
const from = callerId || sipUser + '@' + sipHost;
let answered = false;
let callEnded = false;
let buffer = '';
let cseq = 1;
const socket = new net.Socket();
socket.setTimeout(30000);

socket.connect(5060, sipHost, () => {
  const invite = buildInvite(sipHost, sipUser, from, toNumber, callId, tag, branch, cseq, null, null);
  socket.write(invite);
});

socket.on('data', (data) => {
  buffer += data.toString();

  if (buffer.includes('SIP/2.0 401') || buffer.includes('SIP/2.0 407')) {
    const realm = buffer.match(/realm="([^"]+)"/)?.[1] || sipHost;
    const nonce = buffer.match(/nonce="([^"]+)"/)?.[1] || '';
    cseq++;
    const invite = buildInvite(sipHost, sipUser, from, toNumber, callId, tag, branch, cseq, realm, nonce, sipPass);
    buffer = '';
    socket.write(invite);
    return;
  }

  if (!answered && buffer.includes('SIP/2.0 200') && buffer.includes('INVITE')) {
    answered = true;
    const ack = 'ACK sip:' + toNumber + '@' + sipHost + ' SIP/2.0\r\nVia: SIP/2.0/TCP ' + sipHost + ';branch=' + branch + 'ack\r\nMax-Forwards: 70\r\nFrom: <sip:' + from + '>;tag=' + tag + '\r\nTo: <sip:' + toNumber + '@' + sipHost + '>\r\nCall-ID: ' + callId + '\r\nCSeq: ' + cseq + ' ACK\r\nContent-Length: 0\r\n\r\n';
    socket.write(ack);
    setTimeout(() => {
      if (!callEnded) {
        callEnded = true;
        const bye = 'BYE sip:' + toNumber + '@' + sipHost + ' SIP/2.0\r\nVia: SIP/2.0/TCP ' + sipHost + ';branch=' + branch + 'bye\r\nMax-Forwards: 70\r\nFrom: <sip:' + from + '>;tag=' + tag + '\r\nTo: <sip:' + toNumber + '@' + sipHost + '>\r\nCall-ID: ' + callId + '\r\nCSeq: ' + (cseq+1) + ' BYE\r\nContent-Length: 0\r\n\r\n';
        socket.write(bye);
        setTimeout(() => { socket.destroy(); resolve({ answered: true }); }, 1000);
      }
    }, 20000);
  }

  if (buffer.includes('SIP/2.0 486') || buffer.includes('SIP/2.0 603') || buffer.includes('SIP/2.0 404') || buffer.includes('SIP/2.0 480') || buffer.includes('SIP/2.0 503') || buffer.includes('SIP/2.0 403')) {
    callEnded = true;
    socket.destroy();
    resolve({ answered: false, failed: true });
  }
});

socket.on('timeout', () => { callEnded = true; socket.destroy(); resolve({ answered: false, timeout: true }); });
socket.on('error', (err) => { callEnded = true; resolve({ answered: false, error: err.message }); });
socket.on('close', () => { if (!callEnded) { callEnded = true; resolve({ answered: false }); } });
});
}
function buildInvite(sipHost, sipUser, from, toNumber, callId, tag, branch, cseq, realm, nonce, sipPass) {
const crypto = require('crypto');
let authHeader = '';
if (realm && nonce && sipPass) {
const ha1 = crypto.createHash('md5').update(sipUser + ':' + realm + ':' + sipPass).digest('hex');
const ha2 = crypto.createHash('md5').update('INVITE:sip:' + toNumber + '@' + sipHost).digest('hex');
const response = crypto.createHash('md5').update(ha1 + ':' + nonce + ':' + ha2).digest('hex');
authHeader = 'Authorization: Digest username="' + sipUser + '",realm="' + realm + '",nonce="' + nonce + '",uri="sip:' + toNumber + '@' + sipHost + '",response="' + response + '"\r\n';
}
const sdp = 'v=0\r\no=' + sipUser + ' 1 1 IN IP4 ' + sipHost + '\r\ns=CloudCall\r\nc=IN IP4 ' + sipHost + '\r\nt=0 0\r\nm=audio 8000 RTP/AVP 0 8\r\na=rtpmap:0 PCMU/8000\r\na=rtpmap:8 PCMA/8000\r\n';
return 'INVITE sip:' + toNumber + '@' + sipHost + ' SIP/2.0\r\nVia: SIP/2.0/TCP ' + sipHost + ';branch=' + branch + '\r\nMax-Forwards: 70\r\nFrom: <sip:' + from + '>;tag=' + tag + '\r\nTo: <sip:' + toNumber + '@' + sipHost + '>\r\nCall-ID: ' + callId + '\r\nCSeq: ' + cseq + ' INVITE\r\nContact: <sip:' + sipUser + '@' + sipHost + '>\r\n' + authHeader + 'Content-Type: application/sdp\r\nContent-Length: ' + sdp.length + '\r\n\r\n' + sdp;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.get('/campaigns', async (req, res) => {
try {
const result = await db.query('SELECT dc., (SELECT COUNT() FROM dialler_numbers dn WHERE dn.campaign_id = dc.id) AS total_numbers, q.name AS queue_name FROM dialler_campaigns dc LEFT JOIN queues q ON q.id = dc.press1_queue_id WHERE dc.tenant_id = $1 ORDER BY dc.created_at DESC', [req.tenantId]);
res.json(result.rows);
} catch (err) { console.error('[Dialler] campaigns error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.post('/campaigns', requireRole('admin', 'supervisor'), async (req, res) => {
try {
const { name, messageText, audioUrl, press1QueueId, trunkId, customSipHost, customSipUser, customSipPass, callerId, callsPerMinute } = req.body;
if (!name) return res.status(400).json({ error: 'Campaign name required' });
if (!messageText && !audioUrl) return res.status(400).json({ error: 'Message text or audio URL required' });
const result = await db.query('INSERT INTO dialler_campaigns (tenant_id, name, message_text, audio_url, press1_queue_id, trunk_id, custom_sip_host, custom_sip_user, custom_sip_pass, caller_id, calls_per_minute, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', [req.tenantId, name, messageText || null, audioUrl || null, press1QueueId || null, trunkId || null, customSipHost || null, customSipUser || null, customSipPass || null, callerId || null, callsPerMinute || 10, req.user.userId]);
res.status(201).json(result.rows[0]);
} catch (err) { console.error('[Dialler] create error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.post('/campaigns/:id/upload', requireRole('admin', 'supervisor'), upload.single('csv'), async (req, res) => {
try {
const campaign = await db.query('SELECT * FROM dialler_campaigns WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
if (!campaign.rows[0]) return res.status(404).json({ error: 'Campaign not found' });
if (campaign.rows[0].status !== 'ready') return res.status(400).json({ error: 'Can only upload to a ready campaign' });
if (!req.file) return res.status(400).json({ error: 'CSV file required' });
const csv = req.file.buffer.toString('utf8');
const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
const startIdx = lines[0] && !/^+?[\d\s()-]+$/.test(lines[0].split(',')[0]) ? 1 : 0;
const numbers = [];
for (const line of lines.slice(startIdx)) {
const parts = line.split(',');
const phone = parts[0].replace(/[\s-()]/g, '').trim();
if (!phone) continue;
const normalised = phone.startsWith('0') ? '+44' + phone.slice(1) : phone;
if (!/^+?\d{7,15}$/.test(normalised)) continue;
numbers.push({ phone: normalised, name: parts[1] ? parts[1].trim() : '' });
}
if (!numbers.length) return res.status(400).json({ error: 'No valid phone numbers found in CSV' });
await db.query('DELETE FROM dialler_numbers WHERE campaign_id=$1', [req.params.id]);
for (const n of numbers) {
await db.query('INSERT INTO dialler_numbers (campaign_id, phone_number, name) VALUES ($1,$2,$3)', [req.params.id, n.phone, n.name]);
}
await db.query('UPDATE dialler_campaigns SET total_numbers=$1 WHERE id=$2', [numbers.length, req.params.id]);
res.json({ ok: true, count: numbers.length });
} catch (err) { console.error('[Dialler] upload error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.get('/campaigns/:id/numbers', async (req, res) => {
try {
const result = await db.query('SELECT * FROM dialler_numbers WHERE campaign_id=$1 ORDER BY id LIMIT 200', [req.params.id]);
res.json(result.rows);
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.get('/campaigns/:id/stats', async (req, res) => {
try {
const result = await db.query('SELECT * FROM dialler_campaigns WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
res.json(result.rows[0]);
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.post('/campaigns/:id/start', requireRole('admin', 'supervisor'), async (req, res) => {
try {
const result = await db.query('SELECT dc.*, st.registrar, st.username AS trunk_user, st.password AS trunk_pass FROM dialler_campaigns dc LEFT JOIN sip_trunks st ON st.id = dc.trunk_id WHERE dc.id=$1 AND dc.tenant_id=$2', [req.params.id, req.tenantId]);
const campaign = result.rows[0];
if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
if (!['ready','paused'].includes(campaign.status)) return res.status(400).json({ error: 'Cannot start a ' + campaign.status + ' campaign' });
await db.query('UPDATE dialler_campaigns SET status='running', started_at=COALESCE(started_at,now()) WHERE id=$1', [req.params.id]);
broadcast(req.tenantId, { event: 'dialler.started', campaignId: req.params.id });
startDiallerEngine(req.params.id, req.tenantId, campaign);
res.json({ ok: true, message: 'Dialler started' });
} catch (err) { console.error('[Dialler] start error:', err.message); res.status(500).json({ error: 'Server error' }); }
});
router.post('/campaigns/:id/pause', requireRole('admin', 'supervisor'), async (req, res) => {
try {
await db.query('UPDATE dialler_campaigns SET status='paused' WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
const engine = diallerEngines.get(req.params.id);
if (engine) engine.paused = true;
broadcast(req.tenantId, { event: 'dialler.paused', campaignId: req.params.id });
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.post('/campaigns/:id/stop', requireRole('admin', 'supervisor'), async (req, res) => {
try {
await db.query('UPDATE dialler_campaigns SET status='stopped', completed_at=now() WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
const engine = diallerEngines.get(req.params.id);
if (engine) { engine.stopped = true; diallerEngines.delete(req.params.id); }
broadcast(req.tenantId, { event: 'dialler.stopped', campaignId: req.params.id });
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
router.delete('/campaigns/:id', requireRole('admin', 'supervisor'), async (req, res) => {
try {
const engine = diallerEngines.get(req.params.id);
if (engine) { engine.stopped = true; diallerEngines.delete(req.params.id); }
await db.query('DELETE FROM dialler_numbers WHERE campaign_id=$1', [req.params.id]);
await db.query('DELETE FROM dialler_campaigns WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
res.json({ ok: true });
} catch (err) { res.status(500).json({ error: 'Server error' }); }
});
function startDiallerEngine(campaignId, tenantId, campaign) {
if (diallerEngines.has(campaignId)) {
diallerEngines.get(campaignId).paused = false;
return;
}
const engine = { paused: false, stopped: false };
diallerEngines.set(campaignId, engine);
const intervalMs = Math.max(1000, Math.floor(60000 / (campaign.calls_per_minute || 10)));
const tick = async () => {
if (engine.stopped) return;
const statusResult = await db.query('SELECT status FROM dialler_campaigns WHERE id=$1', [campaignId]);
const status = statusResult.rows[0]?.status;
if (!status || status === 'stopped' || status === 'completed') { diallerEngines.delete(campaignId); return; }
if (engine.paused || status === 'paused') { setTimeout(tick, 2000); return; }
const numResult = await db.query('SELECT * FROM dialler_numbers WHERE campaign_id=$1 AND status=\'pending\' ORDER BY id LIMIT 1', [campaignId]);
if (!numResult.rows[0]) {
  await db.query('UPDATE dialler_campaigns SET status=\'completed\', completed_at=now() WHERE id=$1', [campaignId]);
  broadcast(tenantId, { event: 'dialler.completed', campaignId });
  diallerEngines.delete(campaignId);
  return;
}

const number = numResult.rows[0];
await db.query('UPDATE dialler_numbers SET status=\'calling\', called_at=now(), attempt_count=attempt_count+1 WHERE id=$1', [number.id]);
await db.query('UPDATE dialler_campaigns SET calls_made=calls_made+1 WHERE id=$1', [campaignId]);
broadcast(tenantId, { event: 'dialler.calling', campaignId, numberId: number.id, phone: number.phone_number, name: number.name });

let sipHost = campaign.custom_sip_host || campaign.registrar;
let sipUser = campaign.custom_sip_user || campaign.trunk_user;
let sipPass = campaign.custom_sip_pass || campaign.trunk_pass;
const callerId = campaign.caller_id;

if (!sipHost) {
  try {
    const tr = await db.query('SELECT registrar, username, password FROM sip_trunks WHERE tenant_id=$1 AND is_active=true ORDER BY created_at ASC LIMIT 1', [tenantId]);
    if (tr.rows[0]) { sipHost = tr.rows[0].registrar; sipUser = sipUser || tr.rows[0].username; sipPass = sipPass || tr.rows[0].password; }
  } catch(e) {}
}

if (sipHost) sipHost = sipHost.replace('wss://', '').replace('ws://', '').replace('sip:', '').split(':')[0];

if (!sipHost || !sipUser || !sipPass) {
  await db.query('UPDATE dialler_numbers SET status=\'failed\' WHERE id=$1', [number.id]);
  await db.query('UPDATE dialler_campaigns SET calls_failed=calls_failed+1 WHERE id=$1', [campaignId]);
  broadcast(tenantId, { event: 'dialler.failed', campaignId, numberId: number.id, reason: 'No SIP trunk' });
  setTimeout(tick, intervalMs);
  return;
}

try {
  console.log('[Dialler] Calling', number.phone_number, 'via', sipHost);
  const result = await makeSIPCall(sipHost, sipUser, sipPass, callerId, number.phone_number);
  if (result.answered) {
    await db.query('UPDATE dialler_numbers SET status=\'answered\' WHERE id=$1', [number.id]);
    await db.query('UPDATE dialler_campaigns SET calls_answered=calls_answered+1 WHERE id=$1', [campaignId]);
    broadcast(tenantId, { event: 'dialler.answered', campaignId, numberId: number.id, phone: number.phone_number });
  } else {
    await db.query('UPDATE dialler_numbers SET status=\'failed\' WHERE id=$1', [number.id]);
    await db.query('UPDATE dialler_campaigns SET calls_failed=calls_failed+1 WHERE id=$1', [campaignId]);
    broadcast(tenantId, { event: 'dialler.failed', campaignId, numberId: number.id, phone: number.phone_number });
  }
} catch (err) {
  console.error('[Dialler] Call error:', err.message);
  await db.query('UPDATE dialler_numbers SET status=\'failed\' WHERE id=$1', [number.id]);
  await db.query('UPDATE dialler_campaigns SET calls_failed=calls_failed+1 WHERE id=$1', [campaignId]);
}
setTimeout(tick, intervalMs);
};
tick();
}
module.exports = router;
