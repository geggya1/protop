/**
 * Tilgang i ISO / K-HMS.
 * Bygger på ProTops tilgangsmatrise (ressursen «iso»), ikke egne brukere.
 *
 *   iso: Lese              → se publiserte prosesser/dokumenter, melde avvik, fylle ut skjema
 *   iso: Begrenset redig.  → behandle saker, registre, utkast til prosesser/dokumenter
 *   iso: Admin             → godkjenne/publisere, lukke saker, innstillinger
 *
 * Skjermede HMS-/personsaker: bare personer som er uttrykkelig ført opp på listen
 * «Tilgang til skjermede saker». Objektbasert: den som meldte en skjermet sak, og den
 * som er tildelt den eller eier et tiltak, ser saken. Alt håndheves også i Firestore-reglene.
 */
import { text } from './core.js';

const RANK = { none: 0, see: 1, read: 2, write: 3, delete: 4 };

function rank(grants, resource) {
  return RANK[grants?.[resource]] || 0;
}

/**
 * Hvem har særskilt tilgang til skjermede saker: bare personer som er uttrykkelig ført
 * opp i ISO-innstillingene (families/{id}/isoRestricted/main). Ingen får det automatisk
 * fordi de er eier, administrator, HMS-leder eller systemansvarlig.
 */
export function restrictedUids(grants) {
  const out = new Set();
  for (const uid of grants?.uids || []) if (uid) out.add(String(uid));
  for (const p of grants?.people || []) if (p?.uid) out.add(String(p.uid));
  return out;
}

/**
 * Rettigheter i ISO. Mangler tilgangsdata, gis ingen tilgang (fail-closed).
 * bypass = selskapets eier (som i resten av ProTop). serverIso = nivået Firestore-reglene
 * faktisk håndhever (accessAcl); er det lavere, brukes det så knapper ikke lover mer enn serveren tillater.
 */
export function isoCapabilities({ grants = null, bypass = false, uid = '', restricted = null, serverIso = null } = {}) {
  let iso = bypass ? 3 : (grants ? rank(grants, 'iso') : 0);
  if (iso > 3) iso = 3;
  if (serverIso != null && Number.isFinite(Number(serverIso))) iso = Math.min(iso, Number(serverIso));
  const listed = !!uid && restrictedUids(restricted).has(String(uid));
  return {
    uid: text(uid, 128),
    view: iso >= 1,
    report: iso >= 1,
    manage: iso >= 2,
    admin: iso >= 3,
    owner: !!bypass,
    restrictedListed: listed,
    restrictedView: listed && iso >= 1,
    restrictedManage: listed && iso >= 2,
    canGrantRestricted: !!bypass || (listed && iso >= 3),
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
    || (finding.involvedUids || []).includes(uid)
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

/** Minste ISO-nivå hver rolle trenger for å gjøre jobben (1 lese, 2 begrenset redigering, 3 admin). */
export const ROLE_MIN_ISO = {
  system_owner: 3, quality_manager: 3, top_management: 3, hse_manager: 2, process_owner: 2,
  project_manager: 2, manager: 2, internal_auditor: 2, safety_rep: 1,
};

const RANK_LABEL = ['Ingen', 'Lese', 'Begrenset redigering', 'Admin'];

/**
 * Oppstartskontroll av roller: har personene som har fått en ISO-rolle, nivået rollen krever
 * i tilgangsmatrisen? Gir aldri tilgang selv – viser bare hva som mangler. Særskilt tilgang til
 * skjermede saker følger ikke av noen rolle.
 */
export function roleAccessCheck(roleMap, rankFor) {
  const rows = [];
  for (const [role, need] of Object.entries(ROLE_MIN_ISO)) {
    const person = roleMap?.[role];
    if (!person?.name) continue;
    const has = person.uid ? Number(rankFor(person.uid)) || 0 : null;
    rows.push({
      role,
      person,
      need,
      has,
      needLabel: RANK_LABEL[need],
      hasLabel: has == null ? 'Ikke koblet til bruker' : RANK_LABEL[has],
      ok: has != null && has >= need,
    });
  }
  return rows;
}
