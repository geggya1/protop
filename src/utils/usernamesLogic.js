/** Pure username helpers (no Firebase). */

import { LEGACY_SYNTHETIC_DOMAIN } from './legacyNames.js';

/** Brukernavn-kontoer får en e-post på dette domenet i Firebase Auth. Det sendes aldri e-post dit. */
export const SYNTHETIC_DOMAIN = '@konto.protop.no';
const SYNTHETIC_DOMAINS = [SYNTHETIC_DOMAIN, LEGACY_SYNTHETIC_DOMAIN];

function syntheticDomainOf(email) {
  const lower = String(email || '').trim().toLowerCase();
  return SYNTHETIC_DOMAINS.find((domain) => lower.endsWith(domain)) || null;
}

export function isSyntheticEmail(email) {
  return !!syntheticDomainOf(email);
}

/** Brukernavnet i en brukernavn-e-post. Andre adresser kommer tilbake uendret. */
export function stripSyntheticDomain(email) {
  const value = String(email || '').trim();
  const domain = syntheticDomainOf(value);
  return domain ? value.slice(0, -domain.length) : value;
}

/** Kontoer laget før ProTop logger inn med det gamle domenet. */
export function legacyLoginEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value.endsWith(SYNTHETIC_DOMAIN) ? `${value.slice(0, -SYNTHETIC_DOMAIN.length)}${LEGACY_SYNTHETIC_DOMAIN}` : null;
}

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
  return stripSyntheticDomain(String(raw || '').trim().toLowerCase().replace(/^@/, ''));
}

export function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return u.length >= 3 && u.length <= 24 && /^[a-z0-9._-]+$/.test(u);
}

export function usernameToEmail(username) {
  const u = normalizeUsername(username);
  return `${u}${SYNTHETIC_DOMAIN}`;
}
