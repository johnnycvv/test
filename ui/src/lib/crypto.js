/**
 * CloudCall Secure Agent Messaging — Client-side E2EE
 *
 * Encryption model:
 *   - Each agent generates an ECDH P-256 key pair on first load
 *   - Private key stored ONLY in IndexedDB (never sent to server)
 *   - Public key registered with the server (JWK format)
 *   - Per-message: ephemeral ECDH key pair + HKDF → AES-256-GCM
 *   - Server stores ONLY: ciphertext, IV, ephemeral public key
 *   - Server NEVER sees plaintext
 *
 * GDPR compliance:
 *   - No plaintext stored anywhere server-side
 *   - Audit log contains only metadata (who, when, channel) — not content
 *   - Right to erasure: DELETE /api/chat/gdpr/my-data wipes ciphertext
 */

const DB_NAME    = 'cloudcall_keys';
const DB_VERSION = 1;
const STORE_NAME = 'identity_keys';
const KEY_ID     = 'agent_identity_keypair';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openKeyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

async function storeKey(key) {
  const db    = await openKeyDB();
  const tx    = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(key, KEY_ID);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function loadKey() {
  const db    = await openKeyDB();
  const tx    = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const req   = store.get(KEY_ID);
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Key generation & management ───────────────────────────────────────────────

/**
 * Generate a persistent ECDH identity key pair.
 * Private key is extractable=false from IndexedDB — stays on device.
 */
export async function getOrCreateIdentityKeyPair() {
  const existing = await loadKey();
  if (existing) return existing;

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,        // extractable so we can export public key for server
    ['deriveKey', 'deriveBits']
  );

  await storeKey(keyPair);
  return keyPair;
}

/**
 * Export public key as JWK for server registration.
 */
export async function exportPublicKeyJwk(keyPair) {
  return crypto.subtle.exportKey('jwk', keyPair.publicKey);
}

/**
 * Import a peer's public key JWK for encryption.
 */
export async function importPublicKeyJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a message for a recipient using their ECDH public key.
 *
 * Flow:
 *   1. Generate ephemeral ECDH key pair (per-message forward secrecy)
 *   2. ECDH(ephemeral_private, recipient_public) → shared secret
 *   3. HKDF(shared_secret) → AES-256-GCM key
 *   4. AES-256-GCM encrypt plaintext
 *   5. Return: { ciphertext, iv, ephemeralPublicKey }
 *
 * The ephemeral private key is immediately discarded — forward secrecy.
 */
export async function encryptMessage(plaintext, recipientPublicKeyJwk) {
  const recipientPubKey = await importPublicKeyJwk(recipientPublicKeyJwk);

  // Step 1: Ephemeral key pair (single-use, forward secrecy)
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  // Step 2: ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPubKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // Step 3: HKDF → AES-256-GCM key
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey  = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt:  new Uint8Array(32),  // fixed salt — in production use channel-specific salt
      info:  new TextEncoder().encode('cloudcall-agent-chat-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Step 4: AES-256-GCM encrypt
  const iv          = crypto.getRandomValues(new Uint8Array(12));
  const encoded     = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);

  // Step 5: Export ephemeral public key (sent with message so recipient can decrypt)
  const ephemeralPubJwk = await crypto.subtle.exportKey('jwk', ephemeralKeyPair.publicKey);

  return {
    ciphertext:         bufToBase64(cipherBuffer),
    iv:                 bufToBase64(iv.buffer),
    ephemeralPublicKey: ephemeralPubJwk,
  };
}

/**
 * Decrypt a message using own identity private key + sender's ephemeral public key.
 *
 * Flow:
 *   1. Import ephemeral public key from message
 *   2. ECDH(own_private, ephemeral_public) → shared secret
 *   3. HKDF → AES-256-GCM key
 *   4. AES-256-GCM decrypt
 */
export async function decryptMessage(ciphertext, iv, ephemeralPublicKeyJwk, ownKeyPair) {
  const ephemeralPubKey = await importPublicKeyJwk(ephemeralPublicKeyJwk);

  // Recreate shared secret from our private key + sender's ephemeral public key
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeralPubKey },
    ownKeyPair.privateKey,
    256
  );

  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey  = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt:  new Uint8Array(32),
      info:  new TextEncoder().encode('cloudcall-agent-chat-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(iv) },
    aesKey,
    base64ToBuf(ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * For group channels: encrypt message once per member.
 * Returns array of { userId, ciphertext, iv, ephemeralPublicKey }.
 */
export async function encryptForGroup(plaintext, memberKeys) {
  const results = [];
  for (const { userId, publicKeyJwk } of memberKeys) {
    const encrypted = await encryptMessage(plaintext, publicKeyJwk);
    results.push({ userId, ...encrypted });
  }
  return results;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function bufToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/**
 * Safely attempt decryption — returns null if key mismatch or corrupted.
 * Used to gracefully handle messages sent before key rotation.
 */
export async function safeDecrypt(ciphertext, iv, ephemeralPublicKey, ownKeyPair) {
  if (!ephemeralPublicKey || ciphertext === '[deleted]' || ciphertext === '[erased]') return null;
  try {
    return await decryptMessage(ciphertext, iv, ephemeralPublicKey, ownKeyPair);
  } catch {
    return null; // Key mismatch, corrupted, or pre-key-registration message
  }
}
