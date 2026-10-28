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
