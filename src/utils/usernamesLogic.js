/** Pure username helpers (no Firebase). */

const CHILD_DOMAIN = '@weekplan.app';

export function slugName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16) || 'user';
}

export function suggestUsername(name) {
  const base = slugName(name);
  const n = Math.floor(10 + Math.random() * 89);
  return `${base}${n}`;
}

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '').replace(CHILD_DOMAIN, '');
}

export function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return u.length >= 3 && u.length <= 24 && /^[a-z0-9._-]+$/.test(u);
}

export function usernameToEmail(username) {
  const u = normalizeUsername(username);
  return `${u}${CHILD_DOMAIN}`;
}
