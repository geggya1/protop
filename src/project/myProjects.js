/**
 * Prosjekter som «hører til» en ansatt uten Admin på Prosjekt:
 * deltaker (Team), prosjektleder (navnet i «Leder») eller timer ført på prosjektet.
 */

function text(value) {
  return String(value ?? '').trim();
}

function fold(value) {
  return text(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/** Navnevarianter: fullt navn og fornavn + etternavn (uten mellomnavn). */
export function employeeNameKeys(employee) {
  const person = employee?.person || {};
  const first = fold(person.firstName).split(' ')[0] || '';
  const last = fold(person.lastName);
  const full = fold([person.firstName, person.middleName, person.lastName].filter(Boolean).join(' '));
  const keys = new Set([full, first && last ? `${first} ${last}` : ''].filter(Boolean));
  return keys;
}

export function myProjectIds(state, employee) {
  const id = text(employee?.id);
  const out = new Set();
  if (!id) return out;
  for (const row of state?.members || []) {
    if (text(row.employeeId) === id && row.active !== false) out.add(row.projectId);
  }
  for (const row of state?.timeEntries || []) {
    if (text(row.employeeId) === id && text(row.projectId)) out.add(row.projectId);
  }
  const names = employeeNameKeys(employee);
  if (names.size) {
    for (const project of state?.projects || []) {
      if (names.has(fold(project.manager))) out.add(project.id);
    }
  }
  return out;
}
