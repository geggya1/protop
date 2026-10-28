/**
 * Ren logikk for samtykker og godkjente vilkår (ingen Firebase eller lagring).
 * Brukes av appen og av serverfunksjonen recordConsent.
 */
import { DPA_VERSION, LEGAL_VERSION } from '../i18n/langs.js';

export function emptyConsents() {
  return {
    version: LEGAL_VERSION,
    termsAt: null,
    privacyAt: null,
    // Legacy fields kept for older clients reading the same doc
    gdprAt: null,
    dataAt: null,
    copyrightAt: null,
    marketingOptIn: false,
    marketingAt: null,
    language: null,
  };
}

export function consentsComplete(c) {
  if (!c || c.version !== LEGAL_VERSION) return false;
  if (c.termsAt && c.privacyAt) return true;
  // Accept legacy four-stamp packs only if somehow same version was written that way
  return !!(c.privacyAt && c.gdprAt && c.dataAt && c.copyrightAt);
}

/** Stamp privacy + terms for the current legal version. */
export function acceptedConsentRecord(language, existing, now = new Date()) {
  const at = now.toISOString();
  return {
    ...(existing || emptyConsents()),
    termsAt: at,
    privacyAt: at,
    gdprAt: at,
    dataAt: at,
    copyrightAt: at,
    language: language || existing?.language || null,
    version: LEGAL_VERSION,
  };
}

/**
 * Innlogget bruker som ikke har godtatt gjeldende versjon, verken på kontoen eller
 * på denne enheten. Appen ber om ny aksept, men stenger ikke brukeren ute.
 */
export function needsLegalUpdate(remote, local) {
  return !consentsComplete(remote) && !consentsComplete(local);
}

export const CONSENT_KINDS = ['terms', 'marketing', 'dpa'];

function clean(value, max = 40) {
  return String(value || '').replace(/[^\w.\-:]/g, '').slice(0, max);
}

/**
 * Én rad i samtykkeloggen. Versjonen kommer fra serveren sin egen kopi av
 * gjeldende versjon når klienten ikke sender en gyldig en.
 */
export function consentLogEntry(input, { uid } = {}) {
  const kind = CONSENT_KINDS.includes(input?.kind) ? input.kind : '';
  if (!uid || !kind) return null;
  const current = kind === 'dpa' ? DPA_VERSION : LEGAL_VERSION;
  const version = clean(input?.version, 20) || current;
  const entry = {
    uid,
    kind,
    version,
    current: version === current,
    accepted: kind === 'marketing' ? input?.accepted === true : input?.accepted !== false,
    language: clean(input?.language, 8) || null,
    platform: ['web', 'ios', 'android'].includes(input?.platform) ? input.platform : 'unknown',
  };
  if (kind === 'dpa') {
    const familyId = clean(input?.familyId, 80);
    if (!familyId) return null;
    entry.familyId = familyId;
  }
  return entry;
}
