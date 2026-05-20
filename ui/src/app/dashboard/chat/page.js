'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { chatApi } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  getOrCreateIdentityKeyPair,
  exportPublicKeyJwk,
  encryptMessage,
  safeDecrypt,
} from '@/lib/crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(d).toLocaleDateString();
}
function fmtTime(d) {
  return d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = 8 }) {
  return (
    <div className={`w-${size} h-${size} rounded-full bg-blue-900/50 border border-blue-800/30 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function EncryptedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-950/40 border border-emerald-900/30 text-emerald-500">
      <LockIcon /> E2EE
    </span>
  );
}

// ── Channel list sidebar ──────────────────────────────────────────────────────
function ChannelList({ channels, activeId, onSelect, onNewDirect, onNewGroup, user }) {
  return (
    <div className="flex flex-col h-full border-r border-[#2e3352]" style={{ background: '#13161f' }}>
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#2e3352]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-white">Agent Chat</h2>
          <EncryptedBadge />
        </div>
        <p className="text-xs text-slate-600">Messages are end-to-end encrypted</p>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2 border-b border-[#2e3352]">
        <button onClick={onNewDirect} className="flex-1 btn-secondary text-xs py-1.5 justify-center">
          + Direct
        </button>
        <button onClick={onNewGroup} className="flex-1 btn-secondary text-xs py-1.5 justify-center">
          + Group
        </button>
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto py-1">
        {channels.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-slate-600">No conversations yet.</p>
            <p className="text-xs text-slate-700 mt-1">Start a direct chat with a colleague.</p>
          </div>
        )}
        {channels.map(ch => {
          const otherMember = ch.members?.find(m => m.id !== user.id);
          const name = ch.type === 'direct' ? otherMember?.displayName : ch.name;
          return (
            <button
              key={ch.id}
              onClick={() => onSelect(ch)}
              className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-[#1a1d27] transition-colors text-left ${activeId === ch.id ? 'bg-blue-950/30 border-r-2 border-blue-500' : ''}`}
            >
              <Avatar name={name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-300 truncate">{name || 'Unknown'}</p>
                  <span className="text-xs text-slate-600 flex-shrink-0 ml-2">
                    {ch.last_message_at ? timeAgo(ch.last_message_at) : ''}
                  </span>
                </div>
                <p className="text-xs text-slate-600 truncate mt-0.5">
                  {ch.last_ciphertext ? (ch.last_ciphertext === '[deleted]' || ch.last_ciphertext === '[erased]' ? 'Message deleted' : '🔒 Encrypted message') : 'No messages yet'}
                </p>
              </div>
              {parseInt(ch.unread_count) > 0 && (
                <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
                  {ch.unread_count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isOwn, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const isDeleted = msg.deleted || msg.ciphertext === '[deleted]' || msg.ciphertext === '[erased]';

  return (
    <div className={`flex items-end gap-2 mb-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && <Avatar name={msg.sender_name} size={6} />}
      <div className={`max-w-xs lg:max-w-md relative group`}>
        {!isOwn && (
          <p className="text-xs text-slate-500 mb-1 px-1">{msg.sender_name}</p>
        )}
        <div
          className={`px-3 py-2 rounded-2xl text-sm leading-relaxed relative ${
            isOwn
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-[#22263a] border border-[#2e3352] text-slate-200 rounded-bl-sm'
          } ${isDeleted ? 'opacity-50 italic' : ''}`}
          onMouseEnter={() => setShowMenu(true)}
          onMouseLeave={() => setShowMenu(false)}
        >
          {isDeleted ? (
            <span className="text-xs">🗑 Message deleted</span>
          ) : msg.decrypted !== undefined ? (
            msg.decrypted !== null ? (
              <span>{msg.decrypted}</span>
            ) : (
              <span className="text-xs opacity-60 flex items-center gap-1">
                <LockIcon /> Unable to decrypt
              </span>
            )
          ) : (
            <span className="text-xs opacity-50 flex items-center gap-1 animate-pulse">
              <LockIcon /> Decrypting…
            </span>
          )}

          {/* Context menu */}
          {isOwn && !isDeleted && showMenu && (
            <button
              onClick={() => { onDelete(msg.id); setShowMenu(false); }}
              className="absolute -top-7 right-0 bg-[#1a1d27] border border-[#2e3352] rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-950/30 whitespace-nowrap"
            >
              Delete
            </button>
          )}
        </div>

        {/* Metadata */}
        <div className={`flex items-center gap-1 mt-1 px-1 ${isOwn ? 'justify-end' : ''}`}>
          <span className="text-xs text-slate-600">{fmtTime(msg.sent_at)}</span>
          {!isDeleted && (
            <span className="text-xs text-slate-700">
              <LockIcon />
            </span>
          )}
          {isOwn && msg.receipts?.some(r => r.readAt) && (
            <span className="text-xs text-blue-400">✓✓</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main chat pane ────────────────────────────────────────────────────────────
function ChatPane({ channel, user, ownKeyPair, typingUsers }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [peerKey,   setPeerKey]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);

  // Get peer's public key (for direct channels)
  useEffect(() => {
    if (!channel) return;
    setLoading(true); setMessages([]);

    const otherMember = channel.members?.find(m => m.id !== user.id);
    if (otherMember) {
      chatApi.getPeerKey(otherMember.id)
        .then(data => setPeerKey(data.publicKeyJwk))
        .catch(() => setPeerKey(null));
    }

    loadMessages();
  }, [channel?.id]);

  async function loadMessages() {
    if (!channel) return;
    try {
      const msgs = await chatApi.getMessages(channel.id);
      const decrypted = await Promise.all(msgs.map(async (msg) => {
        if (msg.deleted || !msg.ephemeral_public_key) return { ...msg, decrypted: null };
        const plain = await safeDecrypt(msg.ciphertext, msg.iv, msg.ephemeral_public_key, ownKeyPair);
        return { ...msg, decrypted: plain };
      }));
      setMessages(decrypted);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  // Receive new messages via WebSocket
  const handleNewMessage = useCallback(async (evt) => {
    if (evt.event !== 'chat.message' || evt.channelId !== channel?.id) return;
    if (evt.senderId === user.id) return; // own message already added optimistically

    const plain = await safeDecrypt(evt.ciphertext, evt.iv, evt.ephemeralPublicKey, ownKeyPair);
    setMessages(prev => [...prev, {
      id: evt.messageId,
      sender_id: evt.senderId,
      sender_name: evt.senderName,
      ciphertext: evt.ciphertext,
      iv: evt.iv,
      ephemeral_public_key: evt.ephemeralPublicKey,
      sent_at: evt.sentAt,
      decrypted: plain,
      receipts: [],
    }]);
    chatApi.markRead(evt.messageId).catch(() => {});
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [channel?.id, ownKeyPair, user.id]);

  const handleDeleted = useCallback((evt) => {
    if (evt.event !== 'chat.deleted' || evt.channelId !== channel?.id) return;
    setMessages(prev => prev.map(m =>
      m.id === evt.messageId ? { ...m, deleted: true, decrypted: null } : m
    ));
  }, [channel?.id]);

  useWebSocket(useCallback((evt) => {
    handleNewMessage(evt);
    handleDeleted(evt);
  }, [handleNewMessage, handleDeleted]));

  async function sendMessage() {
    if (!input.trim() || sending || !peerKey) return;
    setSending(true);
    const text = input.trim();
    setInput('');

    try {
      const encrypted = await encryptMessage(text, peerKey);
      // Optimistic UI
      const tempId = `temp_${Date.now()}`;
      setMessages(prev => [...prev, {
        id: tempId,
        sender_id: user.id,
        sender_name: user.displayName,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        ephemeral_public_key: encrypted.ephemeralPublicKey,
        sent_at: new Date().toISOString(),
        decrypted: text,
        receipts: [],
      }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

      await chatApi.sendMessage(channel.id, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        ephemeralPublicKey: encrypted.ephemeralPublicKey,
        messageType: 'text',
      });
    } catch (err) {
      console.error('Send failed:', err);
      setInput(text); // Restore on failure
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(msgId) {
    await chatApi.deleteMessage(msgId);
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, deleted: true, decrypted: null } : m
    ));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Typing indicator throttle
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => chatApi.sendTyping(channel.id).catch(() => {}), 500);
  }

  const otherMember  = channel?.members?.find(m => m.id !== user.id);
  const channelName  = channel?.type === 'direct' ? otherMember?.displayName : channel?.name;
  const isTyping     = typingUsers[channel?.id]?.filter(u => u !== user.id).length > 0;

  if (!channel) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-[#1a1d27] border border-[#2e3352] flex items-center justify-center mx-auto mb-4">
          <LockIcon />
        </div>
        <p className="text-sm font-medium text-slate-400">Select a conversation</p>
        <p className="text-xs text-slate-600 mt-1">All messages are end-to-end encrypted</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2e3352] flex-shrink-0" style={{ background: '#13161f' }}>
        <div className="flex items-center gap-3">
          <Avatar name={channelName} />
          <div>
            <p className="text-sm font-semibold text-white">{channelName}</p>
            <div className="flex items-center gap-1.5">
              <EncryptedBadge />
              <span className="text-xs text-slate-600">GDPR compliant · metadata logged only</span>
            </div>
          </div>
        </div>
        {!peerKey && (
          <span className="text-xs text-amber-500 bg-amber-950/30 border border-amber-900/40 rounded-lg px-2 py-1">
            ⚠ Peer hasn't registered encryption keys yet
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: '#0f1117' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-600">No messages yet.</p>
            <p className="text-xs text-slate-700 mt-1 flex items-center justify-center gap-1">
              <LockIcon /> Messages are end-to-end encrypted
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.sender_id === user.id}
              onDelete={deleteMessage}
            />
          ))
        )}

        {isTyping && (
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={otherMember?.displayName} size={6} />
            <div className="bg-[#22263a] border border-[#2e3352] rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-[#2e3352] flex-shrink-0" style={{ background: '#13161f' }}>
        {!peerKey ? (
          <div className="text-center py-2 text-xs text-slate-600">
            Waiting for peer to register encryption keys before sending is possible.
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <textarea
              className="input flex-1 resize-none text-sm py-2.5 min-h-[42px] max-h-32"
              placeholder="Type a message… (End-to-end encrypted)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className={`btn justify-center flex-shrink-0 h-10 w-10 rounded-xl p-0 ${input.trim() && !sending ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-[#22263a] text-slate-600'}`}
            >
              {sending ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        )}
        <p className="text-center text-xs text-slate-700 mt-2 flex items-center justify-center gap-1">
          <LockIcon /> AES-256-GCM encrypted · Server never sees plaintext · GDPR Article 25
        </p>
      </div>
    </div>
  );
}

// ── New direct chat modal ─────────────────────────────────────────────────────
function NewDirectModal({ agents, user, onOpen, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = agents.filter(a =>
    a.id !== user.id && a.display_name?.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="modal-bg">
      <div className="card w-full max-w-sm p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">New direct message</h2>
          <button onClick={onClose} className="btn-ghost p-1 text-slate-400">✕</button>
        </div>
        <input className="input mb-3 text-sm" placeholder="Search agents…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filtered.map(a => (
            <button key={a.id} onClick={() => onOpen(a.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#22263a] transition-colors">
              <Avatar name={a.display_name} />
              <div className="text-left">
                <p className="text-sm text-white font-medium">{a.display_name}</p>
                <p className="text-xs text-slate-500">{a.email}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-xs text-slate-600 py-4">No agents found</p>}
        </div>
      </div>
    </div>
  );
}

// ── GDPR panel ────────────────────────────────────────────────────────────────
function GdprPanel({ user, onClose }) {
  const [retainDays, setRetainDays] = useState(90);
  const [auditLog,   setAuditLog]   = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [erasing,    setErasing]    = useState(false);

  useEffect(() => {
    chatApi.getRetention().then(d => setRetainDays(d.retainDays));
    if (['admin','supervisor'].includes(user.role)) {
      chatApi.getAuditLog().then(setAuditLog);
    }
  }, []);

  async function saveRetention() {
    setSaving(true);
    await chatApi.setRetention(retainDays).catch(() => {});
    setSaving(false);
  }

  async function eraseMyData() {
    if (!confirm('This will permanently erase all your encrypted message content. This cannot be undone.')) return;
    setErasing(true);
    const result = await chatApi.eraseMyData().catch(() => ({ messagesErased: 0 }));
    alert(`${result.messagesErased} messages erased (GDPR Article 17 — Right to Erasure).`);
    setErasing(false);
    onClose();
  }

  return (
    <div className="modal-bg">
      <div className="card w-full max-w-2xl rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2e3352]">
          <h2 className="text-base font-semibold text-white">GDPR Data Controls</h2>
          <button onClick={onClose} className="btn-ghost p-1 text-slate-400">✕</button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">

          {/* Encryption info */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/30">
            <p className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
              <LockIcon /> End-to-end encryption active
            </p>
            <ul className="text-xs text-emerald-600 space-y-1">
              <li>• Messages encrypted with AES-256-GCM before leaving your device</li>
              <li>• ECDH P-256 key exchange — your private key never leaves this browser</li>
              <li>• Server stores only ciphertext, IV, and ephemeral public keys</li>
              <li>• Compliant with GDPR Article 25 (data protection by design)</li>
            </ul>
          </div>

          {/* Retention policy — admin only */}
          {user.role === 'admin' && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Message retention policy</h3>
              <div className="flex items-center gap-3">
                <input type="number" className="input w-28" value={retainDays} min={1} max={365}
                  onChange={e => setRetainDays(parseInt(e.target.value))} />
                <span className="text-sm text-slate-400">days</span>
                <button onClick={saveRetention} disabled={saving} className="btn-primary text-xs">
                  {saving ? 'Saving…' : 'Save policy'}
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Messages older than this are automatically purged. Required under GDPR Article 5(1)(e).
              </p>
            </div>
          )}

          {/* Right to erasure */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Right to erasure (Article 17)</h3>
            <p className="text-xs text-slate-500 mb-3">
              Permanently erase the ciphertext of all messages you have sent. Metadata (timestamps, channel IDs) is retained for audit compliance.
            </p>
            <button onClick={eraseMyData} disabled={erasing} className="btn-danger text-xs">
              {erasing ? 'Erasing…' : '🗑 Erase my message content'}
            </button>
          </div>

          {/* Audit log */}
          {['admin','supervisor'].includes(user.role) && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Audit log (metadata only)</h3>
              <div className="rounded-xl border border-[#2e3352] overflow-hidden max-h-48 overflow-y-auto">
                <table className="table text-xs">
                  <thead><tr><th>Time</th><th>Agent</th><th>Action</th></tr></thead>
                  <tbody>
                    {auditLog.map(log => (
                      <tr key={log.id}>
                        <td className="text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString([], { dateStyle:'short', timeStyle:'short' })}
                        </td>
                        <td className="text-slate-400">{log.actor_name}</td>
                        <td className="text-slate-300">{log.action}</td>
                      </tr>
                    ))}
                    {auditLog.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-slate-600 py-4">No audit events</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-700 mt-2">
                Audit log records who took action, when, and on which channel — never message content.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user } = useAuth();
  const [ownKeyPair,    setOwnKeyPair]    = useState(null);
  const [keyReady,      setKeyReady]      = useState(false);
  const [channels,      setChannels]      = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [agents,        setAgents]        = useState([]);
  const [showDirect,    setShowDirect]    = useState(false);
  const [showGdpr,      setShowGdpr]      = useState(false);
  const [typingUsers,   setTypingUsers]   = useState({});

  // Step 1: Init encryption keys
  useEffect(() => {
    async function initKeys() {
      try {
        const kp  = await getOrCreateIdentityKeyPair();
        const jwk = await exportPublicKeyJwk(kp);
        await chatApi.registerKey(jwk);
        setOwnKeyPair(kp);
        setKeyReady(true);
      } catch (err) {
        console.error('[Chat] Key init failed:', err);
      }
    }
    if (user) initKeys();
  }, [user]);

  // Load channels and agents
  useEffect(() => {
    if (!keyReady) return;
    chatApi.getChannels().then(setChannels).catch(() => {});
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/agents`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('cc_token')}` },
    }).then(r => r.json()).then(setAgents).catch(() => {});
  }, [keyReady]);

  // WebSocket — typing + channel refresh
  useWebSocket(useCallback(evt => {
    if (evt.event === 'chat.typing') {
      setTypingUsers(prev => {
        const users = prev[evt.channelId] || [];
        if (!users.includes(evt.userId)) {
          setTimeout(() => {
            setTypingUsers(p => ({
              ...p, [evt.channelId]: (p[evt.channelId] || []).filter(u => u !== evt.userId),
            }));
          }, 3000);
          return { ...prev, [evt.channelId]: [...users, evt.userId] };
        }
        return prev;
      });
    }
    if (evt.event === 'chat.message') {
      chatApi.getChannels().then(setChannels).catch(() => {});
    }
  }, []));

  async function openDirect(targetUserId) {
    setShowDirect(false);
    const { channelId } = await chatApi.openDirect(targetUserId);
    const updated = await chatApi.getChannels();
    setChannels(updated);
    setActiveChannel(updated.find(c => c.id === channelId));
  }

  if (!keyReady) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
        <p className="text-sm text-slate-400">Initialising encryption keys…</p>
        <p className="text-xs text-slate-600 mt-1">Generating ECDH P-256 key pair</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Channel list */}
      <div className="w-64 flex-shrink-0 flex flex-col">
        <ChannelList
          channels={channels}
          activeId={activeChannel?.id}
          onSelect={setActiveChannel}
          onNewDirect={() => setShowDirect(true)}
          onNewGroup={() => {}}
          user={user}
        />
        <div className="border-t border-[#2e3352] p-3" style={{ background: '#13161f' }}>
          <button
            onClick={() => setShowGdpr(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-[#1a1d27] hover:text-slate-300 transition-colors"
          >
            <LockIcon /> GDPR data controls
          </button>
        </div>
      </div>

      {/* Chat pane */}
      <ChatPane
        channel={activeChannel}
        user={user}
        ownKeyPair={ownKeyPair}
        typingUsers={typingUsers}
      />

      {/* Modals */}
      {showDirect && (
        <NewDirectModal agents={agents} user={user} onOpen={openDirect} onClose={() => setShowDirect(false)} />
      )}
      {showGdpr && <GdprPanel user={user} onClose={() => setShowGdpr(false)} />}
    </div>
  );
}
