import assert from 'node:assert/strict';

/**
 * Lightweight checks for invite identifier parsing helpers used by the
 * existing-user family invite flow. Firestore-backed lookups are covered
 * by manual/integration testing.
 */

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '').replace(/@weekplan\.app$/i, '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
}

function hasValidPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return false;
  if (raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }
  return raw.replace(/\D/g, '').length >= 8;
}

function classifyInviteIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { kind: 'empty' };
  if (raw.includes('@') && isValidEmail(raw)) {
    return { kind: 'email', value: raw.toLowerCase() };
  }
  if (hasValidPhone(raw)) return { kind: 'phone', value: raw.replace(/\s/g, '') };
  const u = normalizeUsername(raw);
  if (u.length >= 3 && /^[a-z0-9._-]+$/.test(u)) return { kind: 'username', value: u };
  if (raw.includes('@')) return { kind: 'invalid-email' };
  return { kind: 'invalid-username' };
}

assert.deepEqual(classifyInviteIdentifier('Ada@Example.com'), { kind: 'email', value: 'ada@example.com' });
assert.equal(classifyInviteIdentifier('+4791234567').kind, 'phone');
assert.equal(classifyInviteIdentifier('91234567').kind, 'phone');
assert.deepEqual(classifyInviteIdentifier('@geir.nord'), { kind: 'username', value: 'geir.nord' });
assert.deepEqual(classifyInviteIdentifier('geir.nord'), { kind: 'username', value: 'geir.nord' });
assert.equal(classifyInviteIdentifier('ab').kind, 'invalid-username');
assert.equal(classifyInviteIdentifier('not-an-email@').kind, 'invalid-email');
assert.equal(classifyInviteIdentifier('').kind, 'empty');

console.log('familyInvite.identifier.test.mjs: ok');
