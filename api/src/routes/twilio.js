const express = require('express');
const { auth } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');

const router = express.Router();
router.use(auth, ts);

function twilio() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const key = process.env.TWILIO_API_KEY;
  const sec = process.env.TWILIO_API_SECRET;
  if (!sid || !key || !sec) throw new Error('Twilio credentials not configured');
  return require('twilio')(key, sec, { accountSid: sid });
}

// POST /api/twilio/token — generate Twilio Access Token for agent browser client
router.post('/token', async (req, res) => {
  try {
    const Twilio        = require('twilio');
    const AccessToken   = Twilio.jwt.AccessToken;
    const VoiceGrant    = AccessToken.VoiceGrant;

    const accountSid  = process.env.TWILIO_ACCOUNT_SID;
    const apiKey      = process.env.TWILIO_API_KEY;
    const apiSecret   = process.env.TWILIO_API_SECRET;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

    if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
      return res.status(503).json({ error: 'Twilio not configured on this server' });
    }

    // Identity must be unique per agent — use userId
    const identity = `agent_${req.user.userId.replace(/-/g, '')}`;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });

    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity,
      ttl: 3600, // 1 hour
    });
    token.addGrant(voiceGrant);

    res.json({ token: token.toJwt(), identity });
  } catch (err) {
    console.error('[Twilio] token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/twilio/voice — TwiML webhook called by Twilio when a call comes in or agent dials out
router.post('/voice', express.urlencoded({ extended: false }), (req, res) => {
  const { To, From, CallSid, Direction } = req.body;
  const VoiceResponse = require('twilio').twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const queueName = process.env.TWILIO_DEFAULT_QUEUE || 'default';

  if (Direction === 'inbound' || !To?.startsWith('client:')) {
    // Inbound call — put in queue
    const dial = twiml.dial({ timeout: 30, record: 'record-from-answer' });
    dial.queue({ waitUrl: 'https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical' }, queueName);
  } else {
    // Outbound — agent is dialling a number
    const dial = twiml.dial({
      callerId: process.env.TWILIO_CALLER_ID || From,
      record: 'record-from-answer',
      timeout: 30,
    });
    // To is the number the agent typed (e.g. +441234567890)
    dial.number(To);
  }

  res.type('text/xml').send(twiml.toString());
});

// POST /api/twilio/status — call status webhook (updates CDR)
router.post('/status', express.urlencoded({ extended: false }), async (req, res) => {
  const { CallSid, CallStatus, CallDuration, To, From } = req.body;
  console.log(`[Twilio] Call ${CallSid} status: ${CallStatus} duration: ${CallDuration}s`);
  // CDR update happens via the existing cdrService triggered by agent hangup
  res.sendStatus(204);
});

module.exports = router;
