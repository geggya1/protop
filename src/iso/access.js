/**
 * Tilgang i ISO / K-HMS.
 * Bygger på ProTops tilgangsmatrise (ressursen «iso»), ikke egne brukere.
 *
 *   iso: Lese              → se publiserte prosesser/dokumenter, melde avvik, fylle ut skjema
 *   iso: Begrenset redig.  → behandle saker, registre, utkast til prosesser/dokumenter
 *   iso: Admin             → godkjenne/publisere, lukke saker, innstillinger
 *
 * Skjermede HMS-/personsaker styres i ISO-innstillingene (ikke i den felles tilgangsmatrisen):
 * personene på listen «Tilgang til skjermede saker», HMS-leder og systemansvarlig.
 * Objektbasert: den som meldte en skjermet sak, og den som er tildelt den, ser saken.
 */
import { text } from './core.js';

const RANK = { none: 0, see: 1, read: 2, write: 3, delete: 4 };

function rank(grants, resource) {
  return RANK[grants?.[resource]] || 0;
}

/** Hvem har særskilt tilgang til skjermede saker (fra ISO-innstillingene). */
export function restrictedUids(system) {
  const out = new Set();
  for (const p of system?.restrictedAccess || []) if (p?.uid) out.add(String(p.uid));
  for (const key of ['hse_manager', 'system_owner']) {
    const uid = system?.roleMap?.[key]?.uid;
    if (uid) out.add(String(uid));
  }
  return out;
}

export function isoCapabilities({ grants = null, bypass = false, uid = '', system = null } = {}) {
  const full = !!bypass || !grants;
  const iso = full ? 3 : rank(grants, 'iso');
  const named = !!uid && restrictedUids(system).has(String(uid));
  const restricted = full ? 3 : (named ? Math.max(2, iso) : 0);
  return {
    uid: text(uid, 128),
    view: iso >= 1,
    report: iso >= 1,
    manage: iso >= 2,
    admin: iso >= 3,
    restrictedView: restricted >= 1,
    restrictedManage: restricted >= 2,
  };
}

/** Kan brukeren se denne saken? Skjermede saker krever særskilt tilgang eller egen involvering. */
export function canSeeFinding(caps, finding) {
  if (!caps?.view || !finding) return false;
  if (!finding.restricted) return true;
  if (caps.restrictedView) return true;
  const uid = text(caps.uid, 128);
  if (!uid) return false;
  return finding.reportedByUid === uid
    || finding.assigneeUid === uid
    || (finding.actions || []).some((a) => a.ownerUid === uid);
}

export function canManageFinding(caps, finding) {
  if (!finding) return false;
  if (finding.restricted) return !!caps?.restrictedManage;
  return !!caps?.manage;
}

/** Lukking krever fagfullmakt: Admin på ISO, eller særskilt fullmakt for skjermede saker. */
export function canCloseFinding(caps, finding) {
  if (!finding) return false;
  if (finding.restricted) return !!caps?.restrictedManage && !!caps?.admin;
  return !!caps?.admin;
}

/**
 * Fjerner skjermede saker brukeren ikke har tilgang til.
 * Brukes før søk, filter, grafer og eksport — så antall ikke lekker via filtre.
 */
export function visibleFindings(caps, findings) {
  return (findings || []).filter((row) => canSeeFinding(caps, row));
}

/** Skjermede detaljer erstattes i lister/eksport når brukeren bare ser saken som involvert. */
export function redactFinding(caps, finding) {
  if (!finding?.restricted || caps?.restrictedView) return finding;
  return {
    ...finding,
    personalDetails: '',
    injuryDetails: '',
  };
}
