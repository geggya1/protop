/**
 * Personvern for et selskap: databehandleravtalen og selskapets valg.
 * Ren logikk uten Firebase. Brukes av appen og av Cloud Functions.
 *
 * Lagres på selskapsdokumentet (families/{id}):
 *   company.dpaAcceptance = { version, acceptedAt, acceptedAtClient, acceptedByUid, acceptedByName }
 */
import { DPA_VERSION } from '../i18n/langs.js';

/** Eier eller administrator kan godta databehandleravtalen for bedriften. */
export function canAcceptDpa(family, uid) {
  if (!uid || !family) return false;
  if (family.ownerUid === uid || family.ownerId === uid) return true;
  return Array.isArray(family.adminUids) && family.adminUids.includes(uid);
}

export function dpaAcceptance(company) {
  const row = company?.dpaAcceptance;
  return row && typeof row === 'object' && row.version ? row : null;
}

/** Godtatt i gjeldende versjon. */
export function dpaAccepted(company, version = DPA_VERSION) {
  return dpaAcceptance(company)?.version === version;
}

/** Aksepten slik den lagres. Servertiden (acceptedAt) legges på av den som skriver. */
export function dpaAcceptanceRecord({ uid, name = '', now = new Date() } = {}) {
  return {
    version: DPA_VERSION,
    acceptedAtClient: now.toISOString(),
    acceptedByUid: String(uid || ''),
    acceptedByName: String(name || '').trim().slice(0, 120),
  };
}

function acceptedDate(row) {
  if (typeof row?.acceptedAt?.toDate === 'function') return row.acceptedAt.toDate();
  const raw = row?.acceptedAtClient;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** «Godtatt 27. okt. 2026 av Kari Nordmann · versjon 1.0.0», eller tom streng. */
export function dpaAcceptedLabel(company) {
  const row = dpaAcceptance(company);
  if (!row) return '';
  const date = acceptedDate(row);
  const when = date
    ? date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const who = row.acceptedByName ? `av ${row.acceptedByName}` : '';
  return ['Godtatt', when, who].filter(Boolean).join(' ') + ` · versjon ${row.version}`;
}

/*
 * Selskapets valg (company.privacy). Begge er på når ingenting er lagret, slik at
 * selskaper som finnes fra før, virker som før til en administrator slår dem av.
 *   company.privacy.usageLog — brukslogg av innlogging, aktivitet og sidevisninger
 *   company.privacy.ai       — AI-funksjoner (Google Gemini) i bedriftsmodulene
 */
export function companyPrivacySettings(company) {
  const raw = company?.privacy && typeof company.privacy === 'object' ? company.privacy : {};
  return { usageLog: raw.usageLog !== false, ai: raw.ai !== false };
}

export function companyUsageLogEnabled(company) {
  return companyPrivacySettings(company).usageLog;
}

export function companyAiAllowed(company) {
  return companyPrivacySettings(company).ai;
}

export const AI_OFF_MESSAGE = 'AI-funksjoner er slått av for bedriften. En administrator kan slå dem på under Selskapsinnstillinger → Personvern.';

/**
 * AI-kallet når bedriften tillater AI. Ellers en funksjon som feiler med forklaringen,
 * så skjermene viser feilen eller faller tilbake til lokal lesing som før.
 */
export function companyAiCall(company, call) {
  if (companyAiAllowed(company)) return call;
  return async () => {
    const err = new Error(AI_OFF_MESSAGE);
    err.code = 'failed-precondition';
    throw err;
  };
}

/** Ny company.privacy med ett valg endret. */
export function withCompanyPrivacy(company, key, value) {
  return { ...(company?.privacy || {}), [key]: value === true };
}

/** Brukslogg slettes etter 90 dager. */
export const USAGE_RETENTION_DAYS = 90;

/** Aktivitetslogging, som bedriften kan slå av. Timer og invitasjoner er endringsspor og logges alltid. */
export const ACTIVITY_USAGE_TYPES = ['login', 'active', 'navigation'];

export function usageEventAllowed(company, type) {
  if (!ACTIVITY_USAGE_TYPES.includes(String(type || ''))) return true;
  return companyUsageLogEnabled(company);
}

/** Eldste tidspunkt (ISO) som fortsatt er innenfor lagringstiden. */
export function usageCutoffIso(now = new Date(), days = USAGE_RETENTION_DAYS) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Hendelser eldre enn lagringstiden vises ikke (og slettes av serveren). */
export function withinUsageRetention(events, now = new Date(), days = USAGE_RETENTION_DAYS) {
  const cutoff = usageCutoffIso(now, days);
  return (Array.isArray(events) ? events : []).filter((row) => String(row?.at || '') >= cutoff);
}

/** Teksten de ansatte og den som ser loggen, skal få. */
export function usageLogNotice(company) {
  const keep = `Loggen slettes etter ${USAGE_RETENTION_DAYS} dager.`;
  if (!companyUsageLogEnabled(company)) {
    return `Bedriften har slått av logging av innlogging, aktivitet og sidevisninger. Endringer i timer og sendte invitasjoner logges fortsatt. ${keep}`;
  }
  return 'ProTop logger innlogging, aktivitet og sidevisninger i bedriften med tidspunkt, IP-adresse og nettleser, '
    + `og i tillegg endringer i timer og sendte invitasjoner. ${keep} `
    + 'Bedriften kan slå av loggen under Selskapsinnstillinger → Personvern, og skal informere de ansatte om den.';
}
