/**
 * Classify invite contact identifiers without exposing directory search UX.
 * Prefer e-post / telefon (GDPR); username is supported as a rare fallback.
 */

import { hasValidPhone, normalizePhone } from './phone';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
}

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '').replace(/@weekplan\.app$/i, '');
}

function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return u.length >= 3 && u.length <= 24 && /^[a-z0-9._-]+$/.test(u);
}

export function classifyInviteIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { kind: 'empty', value: '' };

  // @brukernavn (ikke e-post)
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
  if (u.length >= 3 && isValidUsername(u)) {
    return { kind: 'username', value: u };
  }
  if (u.length > 0 && u.length < 3) return { kind: 'invalid-username', value: u };
  return { kind: 'unknown', value: raw };
}

/** Unique lookup candidates from invite form fields (email, phone, optional identifier). */
export function inviteLookupCandidates({ email, phone, identifier, username } = {}) {
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

export function groupInviteCopy(groupType, familyName) {
  const type = String(groupType || 'family').toLowerCase();
  const name = String(familyName || '').trim();
  if (type === 'team') {
    return {
      title: 'Laginvitasjon',
      noun: 'laget',
      bodyName: name || 'et lag',
    };
  }
  if (type === 'classroom' || type === 'class') {
    return {
      title: 'Klasseinvitasjon',
      noun: 'klassen',
      bodyName: name || 'en klasse',
    };
  }
  if (type === 'platform') {
    return {
      title: 'Plattforminvitasjon',
      noun: 'plattformen',
      bodyName: name || 'en plattform',
    };
  }
  return {
    title: 'Familieinvitasjon',
    noun: 'familien',
    bodyName: name || 'en familie',
  };
}
