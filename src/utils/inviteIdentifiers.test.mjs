import assert from 'node:assert/strict';

/** Mirror of src/utils/inviteIdentifiers.js + phone helpers for Node tests. */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
}

function normalizePhone(phone, fallbackDial = '+47') {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : '';
  }
  const digits = String(phone || '').replace(/\D/g, '');
  const dialDigits = String(fallbackDial || '+47').replace(/\D/g, '');
  if (!digits) return '';
  return `+${dialDigits}${digits}`;
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

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '').replace(/@weekplan\.app$/i, '');
}

function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return u.length >= 3 && u.length <= 24 && /^[a-z0-9._-]+$/.test(u);
}

function classifyInviteIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { kind: 'empty', value: '' };
  if (raw.startsWith('@') && !raw.slice(1).includes('@')) {
    const u = normalizeUsername(raw);
    if (u.length >= 3 && isValidUsername(u)) return { kind: 'username', value: u };
    return { kind: 'invalid-username', value: u || raw };
  }
  if (raw.includes('@')) {
    if (isValidEmail(raw)) return { kind: 'email', value: raw.toLowerCase() };
    return { kind: 'invalid-email', value: raw };
  }
  const phoneNorm = normalizePhone(raw);
  if (hasValidPhone(phoneNorm) || hasValidPhone(raw)) {
    return { kind: 'phone', value: phoneNorm || raw.replace(/\s/g, '') };
  }
  const u = normalizeUsername(raw);
  if (u.length >= 3 && isValidUsername(u)) return { kind: 'username', value: u };
  if (u.length > 0 && u.length < 3) return { kind: 'invalid-username', value: u };
  return { kind: 'unknown', value: raw };
}

function inviteLookupCandidates({ email, phone, identifier, username } = {}) {
  const list = [
    String(identifier || '').trim(),
    String(email || '').trim(),
    String(phone || '').trim(),
    String(username || '').trim(),
  ].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function groupInviteCopy(groupType, familyName) {
  const type = String(groupType || 'family').toLowerCase();
  const name = String(familyName || '').trim();
  if (type === 'team') return { title: 'Laginvitasjon', noun: 'laget', bodyName: name || 'et lag' };
  if (type === 'classroom' || type === 'class') {
    return { title: 'Klasseinvitasjon', noun: 'klassen', bodyName: name || 'en klasse' };
  }
  if (type === 'platform') {
    return { title: 'Plattforminvitasjon', noun: 'plattformen', bodyName: name || 'en plattform' };
  }
  return { title: 'Familieinvitasjon', noun: 'familien', bodyName: name || 'en familie' };
}

assert.deepEqual(classifyInviteIdentifier('Ada@Example.com'), { kind: 'email', value: 'ada@example.com' });
assert.equal(classifyInviteIdentifier('+47 912 34 567').kind, 'phone');
assert.match(classifyInviteIdentifier('+4791234567').value, /^\+4791234567$/);
assert.equal(classifyInviteIdentifier('91234567').kind, 'phone');
assert.deepEqual(classifyInviteIdentifier('@geir.nord'), { kind: 'username', value: 'geir.nord' });
assert.equal(classifyInviteIdentifier('ab').kind, 'invalid-username');
assert.equal(classifyInviteIdentifier('not-an-email@').kind, 'invalid-email');
assert.equal(classifyInviteIdentifier('').kind, 'empty');

assert.deepEqual(
  inviteLookupCandidates({ email: 'a@b.no', phone: '+4791234567', identifier: 'a@b.no' }),
  ['a@b.no', '+4791234567'],
);

assert.equal(groupInviteCopy('team', 'Ski').title, 'Laginvitasjon');
assert.equal(groupInviteCopy('classroom', '5A').title, 'Klasseinvitasjon');
assert.equal(groupInviteCopy('family', 'Andersen').title, 'Familieinvitasjon');
assert.match(groupInviteCopy('team', 'Ski').bodyName, /Ski/);

console.log('inviteIdentifiers.test.mjs: ok');
