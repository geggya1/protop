/** Personer som følger opp oppdraget fysisk: interne, eksterne eller nye. */

import { isActiveEmployee } from './customers.js';
import { displayName, employeeEmails } from '../employees/model.js';
import { kindOf } from '../employees/employmentFlags.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeAssignees(input) {
  const rows = Array.isArray(input) ? input : [];
  return rows.map((row, index) => {
    const source = row?.source === 'intern' || row?.source === 'ekstern' ? row.source : 'ny';
    const name = text(row?.name).slice(0, 80);
    const email = text(row?.email).slice(0, 80);
    const phone = text(row?.phone).slice(0, 40);
    if (!name && !email && !phone) return null;
    return {
      id: text(row?.id).slice(0, 40) || `oppfolging_${index + 1}`,
      source,
      employeeId: text(row?.employeeId).slice(0, 80),
      name,
      email,
      phone,
    };
  }).filter(Boolean).slice(0, 12);
}

export function assigneeKind(employee) {
  const bucket = kindOf(employee);
  return bucket === 'external' || bucket === 'innleid' ? 'ekstern' : 'intern';
}

/** Aktive ansatte med kontaktdata, klare til å velges som oppfølging. */
export function followUpChoices(employees = []) {
  return (Array.isArray(employees) ? employees : [])
    .filter((row) => row && isActiveEmployee(row))
    .map((row) => ({
      id: text(row.id),
      name: displayName(row),
      email: employeeEmails(row)[0] || '',
      phone: text(row.person?.phone),
      kind: assigneeKind(row),
    }))
    .filter((row) => row.id && row.name && row.name !== 'Uten navn');
}

export function assigneeFromChoice(choice) {
  if (!choice?.id && !choice?.name) return null;
  return normalizeAssignees([{
    id: `oppfolging_${choice.id || Date.now()}`,
    source: choice.kind === 'ekstern' ? 'ekstern' : 'intern',
    employeeId: choice.id || '',
    name: choice.name,
    email: choice.email,
    phone: choice.phone,
  }])[0] || null;
}
