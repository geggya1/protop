/**
 * Arbeidsavtalen og ansattkortet (DS-14).
 *
 * Ansattkortet er fasit for stilling, stillingsprosent, ansettelsesform og datoer. En ny avtale
 * fylles ut fra kortet, så HR ikke skriver det samme to ganger, og den lagrede avtalen er et
 * øyeblikksbilde av vilkårene. Endrer HR et av feltene i avtalen, går endringen til kortet, men
 * bare feltene som faktisk ble endret i denne redigeringen, og bare når avtalen er den aktive.
 * Da blir ikke en nyere verdi på kortet overskrevet av en eldre avtale.
 */

export const CARD_FIELDS = [
  { contract: 'positionTitle', card: 'title' },
  { contract: 'workPercent', card: 'workPercent', percent: true },
  // Ansettelsesformen hentes fra kortet, men skrives ikke tilbake: på kortet styrer den
  // personelltypen (innleid/ekstern) og dermed tilgangen.
  { contract: 'employmentType', card: 'employmentType', push: false },
  { contract: 'startDate', card: 'periodFrom', date: true },
  { contract: 'endDate', card: 'periodTo', date: true },
];

function text(value) {
  return value == null ? '' : String(value).trim();
}

function isoDate(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return raw;
}

function percent(value) {
  return text(value).replace(/[^\d.,]/g, '').replace(',', '.');
}

function fieldValue(field, value) {
  if (field.date) return isoDate(value);
  if (field.percent) return percent(value);
  return text(value);
}

function employeeName(employee) {
  const person = employee?.person || {};
  return [text(person.firstName), text(person.lastName)].filter(Boolean).join(' ');
}

/** Avtalefeltene slik de står på ansattkortet. Tomme felt er utelatt. */
export function contractFieldsFromEmployee(employee) {
  const company = employee?.company || {};
  const out = {};
  for (const field of CARD_FIELDS) {
    const value = fieldValue(field, company[field.card]);
    if (value) out[field.contract] = value;
  }
  const name = employeeName(employee);
  if (name) out.employeeName = name;
  return out;
}

/** Ny avtale: utkastet fylles fra ansattkortet der kortet har en verdi. */
export function contractDraftFromEmployee(draft, employee) {
  return { ...(draft || {}), ...contractFieldsFromEmployee(employee) };
}

/** Kortfeltene HR har endret i avtalen, fra utkastet slik det var da det ble åpnet. */
export function changedCardFields(initial = {}, draft = {}) {
  return CARD_FIELDS.filter((field) => (
    fieldValue(field, initial?.[field.contract]) !== fieldValue(field, draft?.[field.contract])
  ));
}

/**
 * Ansattkortet med endringene fra avtalen. `changed` er tom når kortet ikke skal lagres.
 * Navn settes bare når kortet mangler det, og beskrivelsen av arbeidet legges i kommentaren
 * bare når den er endret og ikke står der fra før.
 */
export function employeeWithContractChanges(employee, initial = {}, draft = {}) {
  const next = JSON.parse(JSON.stringify(employee || {}));
  if (!next.person) next.person = {};
  if (!next.company) next.company = {};
  const changed = [];
  for (const field of changedCardFields(initial, draft)) {
    if (field.push === false) continue;
    const value = fieldValue(field, draft[field.contract]);
    if (value === fieldValue(field, next.company[field.card])) continue;
    next.company[field.card] = value;
    changed.push(`company.${field.card}`);
  }
  const name = text(draft.employeeName);
  if (name && !text(next.person.firstName)) {
    const parts = name.split(/\s+/).filter(Boolean);
    next.person.firstName = parts[0] || '';
    next.person.lastName = parts.slice(1).join(' ');
    changed.push('person.firstName');
  }
  const role = text(draft.roleDescription);
  const comment = text(next.company.comment);
  if (role && role !== text(initial.roleDescription) && !comment.includes(role)) {
    next.company.comment = [comment, role].filter(Boolean).join('\n');
    changed.push('company.comment');
  }
  return { employee: next, changed };
}
