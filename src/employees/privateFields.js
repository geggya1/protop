/**
 * Skjermede felt på en ansatt (L-03): personnummer, pårørende og bedriftens interne kommentar.
 * De lagres i families/{id}/employeesPrivate/{ansatt-id}, ikke på selve ansattposten, så de
 * ikke strømmes til alle som åpner Ansatte. Den ansatte selv, eier, administratorer og HR med
 * Begrenset redigering på Personell kan lese dem (firestore.rules).
 *
 * Eldre poster kan fortsatt ha verdiene på posten. De leses som reserve og flyttes når noen
 * med rett lagrer personen. Ren modul – brukes av storage.js og tester.
 */

export const PRIVATE_EMPLOYEE_PATHS = [
  'person.nationalId',
  'person.kinName',
  'person.kinPhone',
  'person.kinEmail',
  'person.kinNote',
  'company.comment',
];

function text(value) {
  return String(value ?? '').trim();
}

function read(source, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), source);
}

function has(source, path) {
  const [group, key] = String(path).split('.');
  const bag = source?.[group];
  return !!bag && typeof bag === 'object' && Object.prototype.hasOwnProperty.call(bag, key);
}

function write(target, path, value) {
  const [group, key] = String(path).split('.');
  const bag = target[group] && typeof target[group] === 'object' ? { ...target[group] } : {};
  bag[key] = value;
  target[group] = bag;
}

/** Posten uten skjermede felt, og den skjermede delen ({ person, company }). */
export function splitEmployeePrivate(row) {
  const main = { ...(row || {}) };
  const secret = {};
  for (const path of PRIVATE_EMPLOYEE_PATHS) {
    write(secret, path, text(read(row, path)));
    if (main[path.split('.')[0]]) write(main, path, '');
  }
  return { main, secret };
}

/**
 * Legg de skjermede verdiene på posten. Et felt i employeesPrivate vinner; finnes det ikke
 * der, brukes en eldre verdi på selve posten.
 */
export function withEmployeePrivate(row, secret) {
  if (!row || !secret || typeof secret !== 'object') return row;
  const next = { ...row };
  for (const path of PRIVATE_EMPLOYEE_PATHS) {
    if (has(secret, path)) write(next, path, text(read(secret, path)));
  }
  return next;
}

export function hasPrivateValues(source) {
  return PRIVATE_EMPLOYEE_PATHS.some((path) => !!text(read(source, path)));
}

/** De skjermede feltene som er endret fra a til b, som { person: {...}, company: {...} }. */
export function privatePatch(a, b) {
  const patch = {};
  for (const path of PRIVATE_EMPLOYEE_PATHS) {
    const next = text(read(b, path));
    if (next !== text(read(a, path))) write(patch, path, next);
  }
  return patch;
}

/** Eldre verdier på posten står urørt (rå, slik de er lagret) når den skjermede delen ikke kan leses. */
export function keepStoredPrivate(main, stored) {
  const next = { ...(main || {}) };
  for (const path of PRIVATE_EMPLOYEE_PATHS) {
    if (has(stored, path)) write(next, path, read(stored, path));
  }
  return next;
}

/** Kopien på enheten: uten skjermede felt (ikke personnummer i nettleseren). */
export function withoutPrivate(row) {
  return splitEmployeePrivate(row).main;
}
