const express  = require('express');
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');
const ts       = require('../middleware/tenantScope');
const { broadcast } = require('../services/websocketBus');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(auth, ts);
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
// Active dialler engines per campaign
const diallerEngines = new Map();

// ── GET /api/dialler/campaigns ────────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT dc.*, q.name AS queue_name,
              (SELECT COUNT(*) FROM dialler_numbers dn WHERE dn.campaign_id = dc.id) AS total_numbers
       FROM dialler_campaigns dc
       LEFT JOIN queues q ON q.id = dc.press1_queue_id
       WHERE dc.tenant_id = $1
       ORDER BY dc.created_at DESC`,
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Dialler] campaigns error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/dialler/campaigns ───────────────────────────────────────────────
router.post('/campaigns', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const {
      name, messageText, audioUrl, press1QueueId,
      trunkId, customSipHost, customSipUser, customSipPass,
      callerId, callsPerMinute
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Campaign name required' });
    if (!messageText && !audioUrl) return res.status(400).json({ error: 'Message text or audio URL required' });

    const result = await db.query(
      `INSERT INTO dialler_campaigns
         (tenant_id, name, message_text, audio_url, press1_queue_id, trunk_id,
          custom_sip_host, custom_sip_user, custom_sip_pass, caller_id,
          calls_per_minute, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.tenantId, name, messageText || null, audioUrl || null,
        press1QueueId || null, trunkId || null,
        customSipHost || null, customSipUser || null, customSipPass || null,
        callerId || null, callsPerMinute || 10, req.user.userId
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Dialler] create campaign error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/dialler/campaigns/:id/upload ────────────────────────────────────
router.post('/campaigns/:id/upload', upload.single('csv'), async (req, res) => {
  try {
    const campaign = await db.query(
      `SELECT * FROM dialler_campaigns WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenantId]
    );
    if (!campaign.rows[0]) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.rows[0].status !== 'ready') {
      return res.status(400).json({ error: 'Can only upload to a ready campaign' });
    }

    if (!req.file) return res.status(400).json({ error: 'CSV file required' });

    const csv = req.file.buffer.toString('utf8');
    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);

    // Skip header row if it contains non-numeric first column
    const startIdx = lines[0] && !/^\+?[\d\s()-]+$/.test(lines[0].split(',')[0]) ? 1 : 0;
    const dataLines = lines.slice(startIdx);

    const numbers = [];
    for (const line of dataLines) {
      const cols = line.split(',').map(c => c.trim().replace(/['"]/g, ''));
      const phone = cols[0];
      if (!phone || phone.length < 7) continue;
      // Normalise to E.164 if starts with 0 (UK)
      const normalised = phone.startsWith('0') ? '+44' + phone.slice(1) : phone;
      numbers.push({ phone: normalised, name: cols[1] || null });
    }

    if (!numbers.length) return res.status(400).json({ error: 'No valid phone numbers found in CSV' });

    // Clear existing numbers for this campaign
    await db.query(`DELETE FROM dialler_numbers WHERE campaign_id=$1`, [req.params.id]);

    // Batch insert
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const n of numbers) {
        await client.query(
          `INSERT INTO dialler_numbers (campaign_id, phone_number, name) VALUES ($1,$2,$3)`,
          [req.params.id, n.phone, n.name]
        );
      }
      await client.query(
        `UPDATE dialler_campaigns SET total_numbers=$1 WHERE id=$2`,
        [numbers.length, req.params.id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK'); throw err;
    } finally { client.release(); }

    res.json({ ok: true, numbersLoaded: numbers.length, preview: numbers.slice(0, 5) });
  } catch (err) {
    console.error('[Dialler] upload error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dialler/campaigns/:id/numbers ────────────────────────────────────
router.get('/campaigns/:id/numbers', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM dialler_numbers WHERE campaign_id=$1 ORDER BY id LIMIT 200`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/dialler/campaigns/:id/start ─────────────────────────────────────
router.post('/campaigns/:id/start', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT dc.*, q.name AS queue_name FROM dialler_campaigns dc
       LEFT JOIN queues q ON q.id = dc.press1_queue_id
       WHERE dc.id=$1 AND dc.tenant_id=$2`,
      [req.params.id, req.tenantId]
    );
    const campaign = result.rows[0];
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!['ready','paused'].includes(campaign.status)) {
      return res.status(400).json({ error: `Cannot start a ${campaign.status} campaign` });
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM dialler_numbers WHERE campaign_id=$1 AND status='pending'`,
      [req.params.id]
    );
    if (parseInt(countResult.rows[0].count) === 0) {
      return res.status(400).json({ error: 'No pending numbers to dial' });
    }

    await db.query(
      `UPDATE dialler_campaigns SET status='running', started_at=COALESCE(started_at,now()) WHERE id=$1`,
      [req.params.id]
    );

    broadcast(req.tenantId, { event: 'dialler.started', campaignId: req.params.id });

    // Start the dialler engine
    startDiallerEngine(req.params.id, req.tenantId, campaign);

    res.json({ ok: true, message: 'Dialler started' });
  } catch (err) {
    console.error('[Dialler] start error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/dialler/campaigns/:id/pause ─────────────────────────────────────
router.post('/campaigns/:id/pause', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await db.query(
      `UPDATE dialler_campaigns SET status='paused' WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenantId]
    );
    // Signal engine to pause
    const engine = diallerEngines.get(req.params.id);
    if (engine) engine.paused = true;

    broadcast(req.tenantId, { event: 'dialler.paused', campaignId: req.params.id });
    res.json({ ok: true, message: 'Dialler paused' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/dialler/campaigns/:id/stop ──────────────────────────────────────
router.post('/campaigns/:id/stop', requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    await db.query(
      `UPDATE dialler_campaigns SET status='stopped', completed_at=now() WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, req.tenantId]
    );
    const engine = diallerEngines.get(req.params.id);
    if (engine) { engine.stopped = true; diallerEngines.delete(req.params.id); }

    broadcast(req.tenantId, { event: 'dialler.stopped', campaignId: req.params.id });
    res.json({ ok: true, message: 'Dialler stopped' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dialler/campaigns/:id/stats ──────────────────────────────────────
router.get('/campaigns/:id/stats', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='pending')     AS pending,
         COUNT(*) FILTER (WHERE status='calling')     AS calling,
         COUNT(*) FILTER (WHERE status='answered')    AS answered,
         COUNT(*) FILTER (WHERE status='transferred') AS transferred,
         COUNT(*) FILTER (WHERE status='failed')      AS failed,
         COUNT(*) FILTER (WHERE status='no_answer')   AS no_answer,
         COUNT(*) FILTER (WHERE status='busy')        AS busy,
         COUNT(*)                                      AS total
       FROM dialler_numbers WHERE campaign_id=$1`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Twilio webhook — called when dialled number answers ───────────────────────
router.post('/twiml/:numberId', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { numberId } = req.params;
    const { CallStatus, CallSid } = req.body;

    // Get number + campaign
    const result = await db.query(
      `SELECT dn.*, dc.message_text, dc.audio_url, dc.press1_queue_id, dc.tenant_id
       FROM dialler_numbers dn
       JOIN dialler_campaigns dc ON dc.id = dn.campaign_id
       WHERE dn.id = $1`,
      [numberId]
    );
    const num = result.rows[0];
    if (!num) { res.type('text/xml').send('<Response><Hangup/></Response>'); return; }

    // Update answered
    await db.query(
      `UPDATE dialler_numbers SET status='answered', answered_at=now(), call_sid=$1 WHERE id=$2`,
      [CallSid, numberId]
    );
    await db.query(
      `UPDATE dialler_campaigns SET calls_answered=calls_answered+1 WHERE id=$1`,
      [num.campaign_id]
    );

    broadcast(num.tenant_id, {
      event: 'dialler.answered',
      campaignId: num.campaign_id,
      numberId,
      phone: num.phone_number,
    });

    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
      numDigits: 1,
      action: `${process.env.APP_URL}/api/dialler/keypress/${numberId}`,
      timeout: 10,
    });

    if (num.audio_url) {
      gather.play(num.audio_url);
    } else {
      gather.say({ voice: 'Polly.Amy', language: 'en-GB' }, num.message_text || 'Press 1 to speak with an agent.');
    }

    // If no key pressed — hangup
    twiml.hangup();

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('[Dialler] twiml error:', err.message);
    res.type('text/xml').send('<Response><Hangup/></Response>');
  }
});

// ── Twilio webhook — keypress handler ─────────────────────────────────────────
router.post('/keypress/:numberId', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { Digits } = req.body;
    const { numberId } = req.params;

    const result = await db.query(
      `SELECT dn.*, dc.press1_queue_id, dc.tenant_id
       FROM dialler_numbers dn
       JOIN dialler_campaigns dc ON dc.id = dn.campaign_id
       WHERE dn.id = $1`,
      [numberId]
    );
    const num = result.rows[0];

    const VoiceResponse = require('twilio').twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    if (Digits === '1' && num?.press1_queue_id) {
      // Transfer to queue
      await db.query(
        `UPDATE dialler_numbers SET status='transferred', transferred_at=now() WHERE id=$1`,
        [numberId]
      );
      await db.query(
        `UPDATE dialler_campaigns SET calls_transferred=calls_transferred+1 WHERE id=$1`,
        [num.campaign_id]
      );

      broadcast(num.tenant_id, {
        event: 'dialler.transferred',
        campaignId: num.campaign_id,
        numberId,
        phone: num.phone_number,
      });

      // Dial into the queue
      const dial = twiml.dial({ timeout: 30 });
      dial.queue(num.press1_queue_id);
    } else {
      twiml.say({ voice: 'Polly.Amy', language: 'en-GB' }, 'Thank you. Goodbye.');
      twiml.hangup();
    }

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('[Dialler] keypress error:', err.message);
    res.type('text/xml').send('<Response><Hangup/></Response>');
  }
});

// ── Dialler engine — paces calls ─────────────────────────────────────────────
function startDiallerEngine(campaignId, tenantId, campaign) {
  if (diallerEngines.has(campaignId)) {
    // Resume existing engine
    const engine = diallerEngines.get(campaignId);
    engine.paused = false;
    return;
  }

  const engine = { paused: false, stopped: false };
  diallerEngines.set(campaignId, engine);

  const intervalMs = Math.max(1000, Math.floor(60000 / (campaign.calls_per_minute || 10)));

  const tick = async () => {
    if (engine.stopped) return;

    // Check campaign status
    const statusResult = await db.query(
      `SELECT status FROM dialler_campaigns WHERE id=$1`, [campaignId]
    );
    const status = statusResult.rows[0]?.status;
    if (!status || status === 'stopped' || status === 'completed') {
      diallerEngines.delete(campaignId);
      return;
    }

    if (engine.paused || status === 'paused') {
      setTimeout(tick, 2000);
      return;
    }

    // Get next pending number
    const numResult = await db.query(
      `SELECT * FROM dialler_numbers
       WHERE campaign_id=$1 AND status='pending'
       ORDER BY id LIMIT 1`,
      [campaignId]
    );

    if (!numResult.rows[0]) {
      // All numbers dialled — complete
      await db.query(
        `UPDATE dialler_campaigns SET status='completed', completed_at=now() WHERE id=$1`,
        [campaignId]
      );
      broadcast(tenantId, { event: 'dialler.completed', campaignId });
      diallerEngines.delete(campaignId);
      return;
    }

    const number = numResult.rows[0];

    // Mark as calling
    await db.query(
      `UPDATE dialler_numbers SET status='calling', called_at=now(), attempt_count=attempt_count+1 WHERE id=$1`,
      [number.id]
    );
    await db.query(
      `UPDATE dialler_campaigns SET calls_made=calls_made+1 WHERE id=$1`,
      [campaignId]
    );

    broadcast(tenantId, {
      event: 'dialler.calling',
      campaignId,
      numberId: number.id,
      phone: number.phone_number,
      name: number.name,
    });

    // Make the call via Twilio
    try {
      const accountSid  = process.env.TWILIO_ACCOUNT_SID;
      const apiKey      = process.env.TWILIO_API_KEY;
      const apiSecret   = process.env.TWILIO_API_SECRET;

      if (accountSid && apiKey && apiSecret) {
        const twilio = require('twilio')(apiKey, apiSecret, { accountSid });
        const callerId = campaign.caller_id || process.env.TWILIO_CALLER_ID;
        const twimlUrl = `${process.env.APP_URL}/api/dialler/twiml/${number.id}`;

        await twilio.calls.create({
          to:   number.phone_number,
          from: callerId,
          url:  twimlUrl,
          statusCallback: `${process.env.APP_URL}/api/dialler/status/${number.id}`,
          statusCallbackMethod: 'POST',
          machineDetection: 'Enable',
          timeout: 30,
        });
      } else {
        // Simulate for dev/testing
        console.log(`[Dialler] SIMULATED call to ${number.phone_number}`);
        setTimeout(async () => {
          await db.query(
            `UPDATE dialler_numbers SET status='no_answer' WHERE id=$1 AND status='calling'`,
            [number.id]
          );
          broadcast(tenantId, { event: 'dialler.no_answer', campaignId, numberId: number.id });
        }, 3000);
      }
    } catch (err) {
      console.error('[Dialler] Twilio call failed:', err.message);
      await db.query(
        `UPDATE dialler_numbers SET status='failed' WHERE id=$1`,
        [number.id]
      );
      await db.query(
        `UPDATE dialler_campaigns SET calls_failed=calls_failed+1 WHERE id=$1`,
        [campaignId]
      );
    }

    setTimeout(tick, intervalMs);
  };

  setTimeout(tick, 500);
}

// ── Call status webhook ────────────────────────────────────────────────────────
router.post('/status/:numberId', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { CallStatus } = req.body;
    const { numberId } = req.params;

    const statusMap = {
      'no-answer': 'no_answer',
      'busy':      'busy',
      'failed':    'failed',
      'canceled':  'failed',
    };

    if (statusMap[CallStatus]) {
      const result = await db.query(
        `UPDATE dialler_numbers SET status=$1 WHERE id=$2 AND status='calling' RETURNING campaign_id`,
        [statusMap[CallStatus], numberId]
      );
      if (result.rows[0] && statusMap[CallStatus] === 'failed') {
        await db.query(
          `UPDATE dialler_campaigns SET calls_failed=calls_failed+1 WHERE id=$1`,
          [result.rows[0].campaign_id]
        );
      }
    }
    res.sendStatus(204);
  } catch (err) {
    res.sendStatus(204);
  }
});

// ── DELETE campaign ────────────────────────────────────────────────────────────
router.delete('/campaigns/:id', requireRole('admin'), async (req, res) => {
  try {
    const engine = diallerEngines.get(req.params.id);
    if (engine) { engine.stopped = true; diallerEngines.delete(req.params.id); }
    await db.query(`DELETE FROM dialler_campaigns WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
