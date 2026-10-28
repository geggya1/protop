/**
 * Én definisjon av om en ansettelse er aktiv. Brukes av tilgang (resolveActorAccess,
 * accessAcl på serveren), lister og valg av medarbeider, og av callablen som
 * avslutter medlemskapet. Ingen avhengigheter, så både app, regler-speil og
 * Cloud Functions kan bruke den.
 *
 * Tilstander:
 *   active   – i arbeid
 *   leave    – permisjon (regnes som aktiv)
 *   ended    – «Ansatt til» er passert
 *   inactive – deaktivert / sluttet
 *   deleted  – i papirkurven
 */

function text(value) {
  return String(value ?? '').trim();
}

/** Status slik den er lagret, med eldre navn slått sammen. */
export function employmentStatusOf(employee) {
  const raw = text(employee?.company?.status).toLowerCase();
  if (!raw || raw === 'current') return 'active';
  if (raw === 'former') return 'inactive';
  if (raw === 'trash') return 'deleted';
  return raw;
}

/** dd.mm.åååå, åååå-mm-dd eller ISO-tid → åååå-mm-dd. */
function dateKey(value) {
  const raw = text(value);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nb = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (nb) return `${nb[3]}-${nb[2].padStart(2, '0')}-${nb[1].padStart(2, '0')}`;
  return '';
}

export function todayKey(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/** Siste arbeidsdag (åååå-mm-dd), eller ''. */
export function employmentEndDate(employee) {
  return dateKey(employee?.company?.periodTo);
}

export function employmentState(employee, { now = new Date() } = {}) {
  const status = employmentStatusOf(employee);
  if (status === 'deleted') return 'deleted';
  if (status === 'inactive') return 'inactive';
  const end = employmentEndDate(employee);
  // «Ansatt til» gjelder hele dagen. Dagen etter er ansettelsen avsluttet.
  if (end && end < todayKey(now)) return 'ended';
  if (status === 'leave') return 'leave';
  return 'active';
}

/** I arbeid eller i permisjon: kan logge inn, velges i lister og ha rettigheter. */
export function isActiveEmployee(employee, options) {
  const state = employmentState(employee, options);
  return state === 'active' || state === 'leave';
}

/** Deaktivert, sluttet (sluttdato passert) eller i papirkurven. */
export function employmentClosed(employee, options) {
  return !isActiveEmployee(employee, options);
}
