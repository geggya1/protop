/**
 * Cryptographically strong join-code helpers shared by family/team/classroom/platforms.
 * Prefer exact getDoc(joinCodes/{code}) — never list the collection.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function randomBytes(n) {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint8Array(n);
    globalThis.crypto.getRandomValues(buf);
    return buf;
  }
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) buf[i] = Math.floor(Math.random() * 256);
  return buf;
}

/** Normalize user-entered codes. */
export function normalizeJoinCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Generate a join code (default 8 chars ≈ 32^8 ≈ 1.1e12 space).
 * @param {number} [length=8]
 */
export function generateSecureJoinCode(length = 8) {
  const len = Math.max(8, Math.min(12, Number(length) || 8));
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isValidJoinCodeFormat(code) {
  const c = normalizeJoinCode(code);
  return c.length >= 8 && c.length <= 12 && /^[A-Z0-9]+$/.test(c);
}
