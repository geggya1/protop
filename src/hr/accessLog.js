/**
 * Innsynslogg for følsomme opplysninger (L-19, GDPR art. 5(2) og 32): hvem åpnet en annens
 * HR-mappe, lønn, fravær eller personnummer, og når. Ingen verdier logges.
 * Ren logikk; skrives og leses av serveren (functions/accessLog.js) i
 * families/{id}/accessLog, og vises for eier, administrator, Admin på HR og den det gjelder.
 */

export const ACCESS_KINDS = {
  hrFolder: 'HR-mappe',
  salary: 'Lønn',
  absence: 'Fravær',
  nationalId: 'Personnummer',
};

/** Samme person, samme opplysning og samme ansatt innen vinduet logges én gang. */
export const ACCESS_LOG_WINDOW_MS = 10 * 60 * 1000;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export function accessKindLabel(kind) {
  return ACCESS_KINDS[kind] || 'Opplysninger';
}

/** Gyldig hendelse fra klienten, eller null. employeeId er tom for lister over alle. */
export function normalizeAccessEvent(input = {}) {
  const kind = text(input?.kind, 40);
  if (!ACCESS_KINDS[kind]) return null;
  const employeeId = text(input?.employeeId, 120);
  if (employeeId.includes('/')) return null;
  return { kind, employeeId };
}

/** Dokument-id per vindu, så samme innsyn ikke gir mange rader (create feiler når den finnes). */
export function accessLogDocId({ actorUid, kind, employeeId = '' }, now = Date.now(), windowMs = ACCESS_LOG_WINDOW_MS) {
  const bucket = Math.floor(now / windowMs);
  const safe = (value) => text(value, 120).replace(/[^A-Za-z0-9_-]/g, '_');
  return [bucket, safe(actorUid), safe(kind), safe(employeeId) || 'alle'].join('_');
}

/** «28.10.2026 14:05 · Kari Leder · Lønn · Per Ansatt». */
export function accessLogLines(rows) {
  const pad = (value) => String(value).padStart(2, '0');
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const date = new Date(row?.at || '');
    const when = Number.isNaN(date.getTime())
      ? ''
      : `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return {
      id: text(row?.id, 200),
      when,
      who: text(row?.actorName) || 'Ukjent',
      what: accessKindLabel(row?.kind),
      whom: text(row?.employeeName) || (row?.employeeId ? 'Ansatt' : 'Alle ansatte'),
    };
  });
}

/** Klienten: første gang i vinduet for denne nøkkelen? Oppdaterer kartet. */
export function shouldSendAccess(seen, key, now = Date.now(), windowMs = ACCESS_LOG_WINDOW_MS) {
  if (seen.has(key) && now - seen.get(key) < windowMs) return false;
  seen.set(key, now);
  return true;
}
