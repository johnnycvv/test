const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/postgres');
const { auth } = require('../middleware/auth');
const ts = require('../middleware/tenantScope');
const { broadcast } = require('../services/websocketBus');

const router = express.Router();
router.use(auth, ts);

// ── Key management ────────────────────────────────────────────────────────────

// POST /api/chat/keys — register or update agent's ECDH public key
router.post('/keys', async (req, res) => {
  try {
    const { publicKeyJwk } = req.body;
    if (!publicKeyJwk) return res.status(400).json({ error: 'publicKeyJwk required' });

    await db.query(
      `INSERT INTO agent_keys (user_id, public_key_jwk, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET public_key_jwk=$2, updated_at=now()`,
      [req.user.userId, JSON.stringify(publicKeyJwk)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Chat] Key register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/chat/keys/:userId — fetch another agent's public key
router.get('/keys/:userId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ak.public_key_jwk, u.display_name
       FROM agent_keys ak
       JOIN users u ON u.id = ak.user_id
       WHERE ak.user_id = $1 AND u.tenant_id = $2`,
      [req.params.userId, req.tenantId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No key registered for this agent' });
    res.json({ publicKeyJwk: result.rows[0].public_key_jwk, displayName: result.rows[0].display_name });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Channels ──────────────────────────────────────────────────────────────────

// GET /api/chat/channels — list channels the agent is a member of
router.get('/channels', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cc.id, cc.type, cc.name, cc.created_at,
              json_agg(json_build_object('id', u.id, 'displayName', u.display_name)) AS members,
              (SELECT cm2.ciphertext FROM chat_messages cm2
               WHERE cm2.channel_id = cc.id AND cm2.deleted_at IS NULL
               ORDER BY cm2.sent_at DESC LIMIT 1) AS last_ciphertext,
              (SELECT cm2.sent_at FROM chat_messages cm2
               WHERE cm2.channel_id = cc.id AND cm2.deleted_at IS NULL
               ORDER BY cm2.sent_at DESC LIMIT 1) AS last_message_at,
              (SELECT COUNT(*) FROM chat_messages cm3
               LEFT JOIN chat_receipts cr ON cr.message_id = cm3.id AND cr.user_id = $1
               WHERE cm3.channel_id = cc.id AND cm3.sender_id != $1
               AND cr.read_at IS NULL AND cm3.deleted_at IS NULL) AS unread_count
       FROM chat_channels cc
       JOIN chat_members cme ON cme.channel_id = cc.id AND cme.user_id = $1
       JOIN chat_members cma ON cma.channel_id = cc.id
       JOIN users u ON u.id = cma.user_id
       WHERE cc.tenant_id = $2
       GROUP BY cc.id
       ORDER BY last_message_at DESC NULLS LAST`,
      [req.user.userId, req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Chat] channels error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat/channels/direct — open or get direct channel with another agent
router.post('/channels/direct', async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
    if (targetUserId === req.user.userId) return res.status(400).json({ error: 'Cannot chat with yourself' });

    // Verify target is in same tenant
    const target = await db.query(
      `SELECT id, display_name FROM users WHERE id=$1 AND tenant_id=$2 AND is_active=true`,
      [targetUserId, req.tenantId]
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'Agent not found' });

    // Check if direct channel already exists between these two users
    const existing = await db.query(
      `SELECT cc.id FROM chat_channels cc
       JOIN chat_members cm1 ON cm1.channel_id = cc.id AND cm1.user_id = $1
       JOIN chat_members cm2 ON cm2.channel_id = cc.id AND cm2.user_id = $2
       WHERE cc.type = 'direct' AND cc.tenant_id = $3`,
      [req.user.userId, targetUserId, req.tenantId]
    );

    if (existing.rows[0]) return res.json({ channelId: existing.rows[0].id, existing: true });

    // Create new direct channel
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const ch = await client.query(
        `INSERT INTO chat_channels (tenant_id, type, created_by) VALUES ($1,'direct',$2) RETURNING id`,
        [req.tenantId, req.user.userId]
      );
      const channelId = ch.rows[0].id;
      await client.query(
        `INSERT INTO chat_members (channel_id, user_id) VALUES ($1,$2),($1,$3)`,
        [channelId, req.user.userId, targetUserId]
      );
      await client.query('COMMIT');
      res.status(201).json({ channelId, existing: false });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Chat] direct channel error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat/channels/group — create group channel
router.post('/channels/group', async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name || !memberIds?.length) return res.status(400).json({ error: 'name and memberIds required' });

    const allIds = [...new Set([req.user.userId, ...memberIds])];

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const ch = await client.query(
        `INSERT INTO chat_channels (tenant_id, type, name, created_by) VALUES ($1,'group',$2,$3) RETURNING id`,
        [req.tenantId, name, req.user.userId]
      );
      const channelId = ch.rows[0].id;
      for (const uid of allIds) {
        await client.query(
          `INSERT INTO chat_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [channelId, uid]
        );
      }
      await client.query('COMMIT');

      await auditLog(req.tenantId, req.user.userId, 'group_created', channelId, null, req.ip);
      res.status(201).json({ channelId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

// GET /api/chat/channels/:id/messages — fetch message history (ciphertext only)
router.get('/channels/:id/messages', async (req, res) => {
  try {
    // Verify membership
    const member = await db.query(
      `SELECT 1 FROM chat_members WHERE channel_id=$1 AND user_id=$2`,
      [req.params.id, req.user.userId]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not a member of this channel' });

    const { before, limit = 50 } = req.query;
    const params = [req.params.id, parseInt(limit)];
    const beforeClause = before ? `AND cm.sent_at < $3` : '';
    if (before) params.push(before);

    const result = await db.query(
      `SELECT cm.id, cm.sender_id, cm.ciphertext, cm.iv,
              cm.ephemeral_public_key, cm.message_type,
              cm.sent_at, cm.edited_at,
              cm.deleted_at IS NOT NULL AS deleted,
              u.display_name AS sender_name,
              json_agg(json_build_object(
                'userId', cr.user_id,
                'readAt', cr.read_at
              )) FILTER (WHERE cr.user_id IS NOT NULL) AS receipts
       FROM chat_messages cm
       JOIN users u ON u.id = cm.sender_id
       LEFT JOIN chat_receipts cr ON cr.message_id = cm.id
       WHERE cm.channel_id = $1 ${beforeClause}
       GROUP BY cm.id, u.display_name
       ORDER BY cm.sent_at DESC
       LIMIT $2`,
      params
    );

    // Mark delivered
    const msgIds = result.rows.map(r => r.id);
    if (msgIds.length) {
      await db.query(
        `INSERT INTO chat_receipts (message_id, user_id, delivered_at)
         SELECT unnest($1::uuid[]), $2, now()
         ON CONFLICT (message_id, user_id) DO NOTHING`,
        [msgIds, req.user.userId]
      );
    }

    res.json(result.rows.reverse());
  } catch (err) {
    console.error('[Chat] messages error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat/channels/:id/messages — send encrypted message
router.post('/channels/:id/messages', async (req, res) => {
  try {
    const { ciphertext, iv, ephemeralPublicKey, messageType = 'text' } = req.body;
    if (!ciphertext || !iv) return res.status(400).json({ error: 'ciphertext and iv required' });

    // Verify membership
    const member = await db.query(
      `SELECT 1 FROM chat_members WHERE channel_id=$1 AND user_id=$2`,
      [req.params.id, req.user.userId]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not a member of this channel' });

    const msgId = uuidv4();
    await db.query(
      `INSERT INTO chat_messages (id, channel_id, sender_id, ciphertext, iv, ephemeral_public_key, message_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [msgId, req.params.id, req.user.userId, ciphertext, iv,
       ephemeralPublicKey ? JSON.stringify(ephemeralPublicKey) : null, messageType]
    );

    // Audit log — metadata only, never content
    await auditLog(req.tenantId, req.user.userId, 'message_sent', req.params.id, msgId, req.ip);

    // Broadcast to channel members via WebSocket (ciphertext only)
    broadcast(req.tenantId, {
      event: 'chat.message',
      channelId: req.params.id,
      messageId: msgId,
      senderId: req.user.userId,
      senderName: req.user.email,
      ciphertext,
      iv,
      ephemeralPublicKey,
      messageType,
      sentAt: new Date().toISOString(),
    });

    res.status(201).json({ messageId: msgId });
  } catch (err) {
    console.error('[Chat] send error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/chat/messages/:id/read — mark message as read
router.patch('/messages/:id/read', async (req, res) => {
  try {
    await db.query(
      `INSERT INTO chat_receipts (message_id, user_id, read_at)
       VALUES ($1,$2,now())
       ON CONFLICT (message_id, user_id) DO UPDATE SET read_at=now()`,
      [req.params.id, req.user.userId]
    );

    // Notify sender
    const msg = await db.query(`SELECT channel_id, sender_id FROM chat_messages WHERE id=$1`,[req.params.id]);
    if (msg.rows[0]) {
      broadcast(req.tenantId, {
        event: 'chat.read',
        messageId: req.params.id,
        channelId: msg.rows[0].channel_id,
        readBy: req.user.userId,
        readAt: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/chat/messages/:id — delete message (removes ciphertext too)
router.delete('/messages/:id', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE chat_messages SET deleted_at=now(), ciphertext='[deleted]', iv='[deleted]'
       WHERE id=$1 AND sender_id=$2 RETURNING channel_id`,
      [req.params.id, req.user.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Message not found or not yours' });

    await auditLog(req.tenantId, req.user.userId, 'message_deleted', result.rows[0].channel_id, req.params.id, req.ip);

    broadcast(req.tenantId, {
      event: 'chat.deleted',
      messageId: req.params.id,
      channelId: result.rows[0].channel_id,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat/typing — typing indicator (no content, metadata only)
router.post('/typing', async (req, res) => {
  try {
    const { channelId } = req.body;
    broadcast(req.tenantId, {
      event: 'chat.typing',
      channelId,
      userId: req.user.userId,
      ts: Date.now(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GDPR endpoints ────────────────────────────────────────────────────────────

// GET /api/chat/gdpr/audit — admin audit log
router.get('/gdpr/audit', async (req, res) => {
  try {
    if (!['admin','supervisor'].includes(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const result = await db.query(
      `SELECT cal.*, u.display_name AS actor_name
       FROM chat_audit_log cal
       LEFT JOIN users u ON u.id = cal.actor_id
       WHERE cal.tenant_id = $1
       ORDER BY cal.created_at DESC LIMIT 500`,
      [req.tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/chat/gdpr/retention — get retention policy
router.get('/gdpr/retention', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT retain_days FROM chat_retention_policy WHERE tenant_id=$1`, [req.tenantId]
    );
    res.json({ retainDays: result.rows[0]?.retain_days ?? 90 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/chat/gdpr/retention — update retention policy (admin)
router.patch('/gdpr/retention', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { retainDays } = req.body;
    if (!retainDays || retainDays < 1) return res.status(400).json({ error: 'retainDays must be >= 1' });
    await db.query(
      `INSERT INTO chat_retention_policy (tenant_id, retain_days)
       VALUES ($1,$2)
       ON CONFLICT (tenant_id) DO UPDATE SET retain_days=$2, updated_at=now()`,
      [req.tenantId, retainDays]
    );
    await auditLog(req.tenantId, req.user.userId, 'retention_policy_updated', null, null, req.ip);
    res.json({ ok: true, retainDays });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/chat/gdpr/my-data — GDPR right to erasure for own messages
router.delete('/gdpr/my-data', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE chat_messages SET deleted_at=now(), ciphertext='[erased]', iv='[erased]'
       WHERE sender_id=$1 AND deleted_at IS NULL`,
      [req.user.userId]
    );
    await auditLog(req.tenantId, req.user.userId, 'gdpr_erasure', null, null, req.ip);
    res.json({ ok: true, messagesErased: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function auditLog(tenantId, actorId, action, channelId, messageId, ip) {
  try {
    await db.query(
      `INSERT INTO chat_audit_log (tenant_id, actor_id, action, channel_id, message_id, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenantId, actorId, action, channelId || null, messageId || null, ip || null]
    );
  } catch {}
}

module.exports = router;
