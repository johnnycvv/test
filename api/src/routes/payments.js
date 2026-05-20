const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db/postgres');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
const APP_URL       = process.env.APP_URL || 'http://localhost:3000';
const STRIPE_WHSEC  = process.env.STRIPE_WEBHOOK_SECRET;
const PROMO_CODES   = { '150': 150 };
const FULL_PRICE    = 500;

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// POST /api/payments/create-checkout
router.post('/create-checkout', async (req, res) => {
  try {
    const { email, companyName, promoCode } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const existing = await db.query(
      `SELECT id FROM payment_sessions WHERE email=$1 AND status='paid' LIMIT 1`,
      [email.toLowerCase()]
    );
    if (existing.rows[0]) return res.status(409).json({ error: 'Account already exists for this email — please log in.' });

    const promo      = promoCode ? PROMO_CODES[promoCode.trim().toUpperCase()] : null;
    const amountGbp  = promo ?? FULL_PRICE;

    const s = stripe();
    const session = await s.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'CloudCall — Platform Access Licence',
            description: promoCode ? `Promo rate (code: ${promoCode.toUpperCase()})` : 'Full platform access',
          },
          unit_amount: amountGbp * 100,
        },
        quantity: 1,
      }],
      metadata: { email: email.toLowerCase(), companyName: companyName || '', promoCode: promoCode || '' },
      success_url: `${APP_URL}/payment-pending?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/paywall?cancelled=1`,
      expires_at:  Math.floor(Date.now() / 1000) + 86400,
    });

    await db.query(
      `INSERT INTO payment_sessions (email,company_name,stripe_session_id,amount_gbp,promo_code)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (stripe_session_id) DO NOTHING`,
      [email.toLowerCase(), companyName||null, session.id, amountGbp, promoCode||null]
    );

    res.json({ checkoutUrl: session.url, sessionId: session.id, amountGbp });
  } catch (err) {
    console.error('[Payments] create-checkout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/status/:sessionId
router.get('/status/:sessionId', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT status,email,temp_password FROM payment_sessions WHERE stripe_session_id=$1`,
      [req.params.sessionId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Session not found' });
    const ps = r.rows[0];
    res.json({ status: ps.status, email: ps.email, tempPassword: ps.status==='paid' ? ps.temp_password : undefined });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/payments/webhook  (Stripe — raw body)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = STRIPE_WHSEC
      ? stripe().webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WHSEC)
      : JSON.parse(req.body.toString());
  } catch (err) { return res.status(400).send('Webhook error'); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      const r = await db.query(`SELECT * FROM payment_sessions WHERE stripe_session_id=$1`,[session.id]);
      if (r.rows[0] && r.rows[0].status !== 'paid') await activateAccount(r.rows[0], session);
    }
  }
  if (event.type === 'charge.refunded') {
    await db.query(
      `UPDATE payment_sessions SET status='refunded' WHERE stripe_payment_intent=$1`,
      [event.data.object.payment_intent]
    );
  }
  res.json({ received: true });
});

async function activateAccount(ps, stripeSession) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const tr = await client.query(`INSERT INTO tenants (name,plan) VALUES ($1,'pro') RETURNING *`,[ps.company_name||ps.email]);
    const tenant = tr.rows[0];
    const tempPass = Math.random().toString(36).slice(-8) + 'C1!';
    const hash     = await bcrypt.hash(tempPass, 12);
    const sipU     = `100_${tenant.id.slice(0,8)}`;
    const sipP     = Math.random().toString(36).slice(-10);
    await client.query(
      `INSERT INTO users (tenant_id,email,password_hash,role,display_name,extension,sip_username,sip_password)
       VALUES ($1,$2,$3,'admin',$4,'100',$5,$6)`,
      [tenant.id, ps.email, hash, ps.company_name||'Admin', sipU, sipP]
    );
    await client.query(
      `UPDATE payment_sessions SET status='paid',paid_at=now(),tenant_id=$1,temp_password=$2,
       stripe_customer_id=$3,stripe_payment_intent=$4 WHERE id=$5`,
      [tenant.id, tempPass, stripeSession?.customer||null, stripeSession?.payment_intent||null, ps.id]
    );
    await client.query('COMMIT');
    console.log(`[Payments] Account activated: ${ps.email}`);
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

// GET /api/payments/admin/sessions
router.get('/admin/sessions', auth, requireRole('admin'), async (req, res) => {
  try {
    if (req.user.tenantId) return res.status(403).json({ error: 'Platform admin only' });
    const r = await db.query(
      `SELECT ps.*,t.name AS tenant_name FROM payment_sessions ps
       LEFT JOIN tenants t ON t.id=ps.tenant_id ORDER BY ps.created_at DESC LIMIT 500`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/payments/admin/sessions/:id
router.patch('/admin/sessions/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    if (req.user.tenantId) return res.status(403).json({ error: 'Platform admin only' });
    const { status } = req.body;
    if (!['refunded','expired'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const r = await db.query(`UPDATE payment_sessions SET status=$1 WHERE id=$2 RETURNING *`,[status,req.params.id]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
