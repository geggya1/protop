/**
 * Hvem som kan lese hvilket fravær i en bedrift (L-02, helseopplysninger).
 * Samme vurdering som absenceForAll i firestore.rules: eier, administratorer, HR (Lese på
 * et HR-område), Begrenset redigering på Andres timer og Admin på Fraværsoversikt eller
 * Fraværsrapport ser alle.
 * Andre ser bare sitt eget fravær, og spørringen må da filtrere på egen ansattpost.
 * Mangler tilgangsspeilet (accessAcl), kan appen ikke lese noe fravær før speilet er laget.
 *
 * Ren modul – brukes av absenceStorage.js, timeliste-skjermene og tester.
 */
import { allows, allowsHr } from '../access/companyAccess.js';
import { aclIsFresh } from '../iso/aclSync.js';
import { isOrganizationType } from '../utils/groupTypes.js';

function text(value) {
  return String(value ?? '').trim();
}

/** Rettighetene gir fravær (og årsak) for alle ansatte. */
export function absenceGrantsSeeAll(grants) {
  return allows(grants, 'hoursOthers', 'read')
    || allows(grants, 'absence', 'write')
    || allows(grants, 'absenceReport', 'write')
    || allowsHr(grants, 'see');
}

export function isGroupAdminOf(family, uid) {
  const id = text(uid);
  if (!id || !family) return false;
  return family.ownerUid === id || family.ownerId === id
    || (Array.isArray(family.adminUids) && family.adminUids.includes(id));
}

/**
 * { all: true } = alt fravær i gruppen. { all: false, employeeId } = bare egen ansattpost
 * (tom når speilet mangler eller personen ikke er koblet til en post).
 */
export function absenceScopeFor({ family, uid, acl = null, now = new Date() } = {}) {
  if (!family || !isOrganizationType(family.type)) return { all: true, employeeId: '' };
  if (isGroupAdminOf(family, uid)) return { all: true, employeeId: '' };
  if (!aclIsFresh(acl, now)) return { all: false, employeeId: '' };
  if (absenceGrantsSeeAll(acl.grants || {})) return { all: true, employeeId: '' };
  return { all: false, employeeId: text(acl.employeeId) };
}

/**
 * Datovinduet som faktisk kan hentes. null = ingenting å hente (en annens fravær, eller
 * egen post er ukjent). Uten full tilgang filtreres det alltid på egen ansattpost.
 */
export function scopedAbsenceRange(scope, range = {}) {
  if (!scope || scope.all) return { ...range };
  const own = text(scope.employeeId);
  const wanted = text(range.employeeId);
  if (!own || (wanted && wanted !== own)) return null;
  return { ...range, employeeId: own };
}
