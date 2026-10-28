/** Prosjektroller og tilgang for Arbeid-modulen. */

import {
  employeeActivityTab,
  employeeDirectoryBucket,
  isActiveEmployee,
} from '../employees/model.js';

export const PROJECT_ROLES = [
  'Prosjektleder',
  'Prosjektmedlem',
  'SHA-koordinator',
  'Byggeleder',
  'Kontrollør',
  'Annet',
];

export { ABSENCE_TYPES, absenceTypeById, absencePickerTypes } from './absenceCatalog.js';

export const TIME_ENTRY_STATUS = [
  { id: 'registrert', label: 'Registrert' },
  { id: 'godkjent', label: 'Godkjent' },
  { id: 'låst', label: 'Låst' },
];

/** Standard arbeidsinnstillinger på prosjekt. */
export function defaultWorkSettings(input = {}) {
  return {
    showInAllTimesheets: !!input.showInAllTimesheets,
    allowSelfJoin: input.allowSelfJoin !== false,
    requireDescription: input.requireDescription !== false,
    showEstimatedHours: !!input.showEstimatedHours,
    notifyOnOverrun: !!input.notifyOnOverrun,
  };
}

/**
 * Kan brukeren styre andres timer / godkjenne?
 * Admin, eller ansatt med accessRole Leder/Administrator.
 */
export function canManageTimesheets({ isAdmin, employee } = {}) {
  if (isAdmin) return true;
  const role = String(employee?.company?.accessRole || '').toLowerCase();
  return role === 'leder' || role === 'administrator';
}

/** Finn ansattkobling for innlogget bruker. */
export function findLinkedEmployee(employees, uid) {
  if (!uid || !Array.isArray(employees)) return null;
  return employees.find((row) => row.personUid === uid && isActiveEmployee(row)) || null;
}

export function employeeDisplayName(employee) {
  if (!employee) return '';
  const first = String(employee.person?.firstName || '').trim();
  const last = String(employee.person?.lastName || '').trim();
  return [first, last].filter(Boolean).join(' ') || employee.company?.email || 'Uten navn';
}

/** E-post vist i komprimert personvalg (selskap først). */
export function employeePickerEmail(employee) {
  return String(employee?.company?.email || employee?.person?.email || '').trim();
}

function pickerSearchHaystack(row) {
  return [
    employeeDisplayName(row),
    row.person?.firstName,
    row.person?.middleName,
    row.person?.lastName,
    row.company?.accessRole,
    row.company?.title,
    row.company?.externalEmployeeNumber,
    row.person?.email,
    row.company?.email,
  ].join(' ').toLowerCase();
}

export function matchEmployeePickerQuery(row, query = '') {
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = pickerSearchHaystack(row);
  return tokens.every((token) => hay.includes(token));
}

/**
 * Filtrer aktive medarbeidere for Velg medarbeider-listen.
 * Søker i navn, rolle, tittel, ansattnummer og e-post.
 * includeClosed: rapporter og historikk tar med deaktiverte og sluttede, men ikke papirkurven.
 */
export function filterEmployeesForPicker(employees, query = '', { includeClosed = false } = {}) {
  const active = (Array.isArray(employees) ? employees : []).filter((row) => (
    includeClosed ? !!row && employeeActivityTab(row) !== 'trash' : isActiveEmployee(row)
  ));
  if (!String(query || '').trim()) return active;
  return active.filter((row) => matchEmployeePickerQuery(row, query));
}

function sortPickerRows(rows) {
  return [...rows].sort((a, b) => (
    employeeDisplayName(a).localeCompare(employeeDisplayName(b), 'nb')
  ));
}

/**
 * Grupper medarbeidere for steg-1 / bytte-person i timelisten.
 * Intern/ekstern + aktive/deaktiverte (som Ansatt-siden), uten papirkurv.
 */
export function groupEmployeesForTimesheetPicker(employees, query = '') {
  const company = { active: [], inactive: [] };
  const external = { active: [], inactive: [] };
  for (const row of Array.isArray(employees) ? employees : []) {
    const tab = employeeActivityTab(row);
    if (tab === 'trash') continue;
    if (!matchEmployeePickerQuery(row, query)) continue;
    const bucket = employeeDirectoryBucket(row);
    if (bucket === 'trash') continue;
    const section = bucket === 'external' ? external : company;
    if (tab === 'inactive') section.inactive.push(row);
    else section.active.push(row);
  }
  return {
    company: { active: sortPickerRows(company.active), inactive: sortPickerRows(company.inactive) },
    external: { active: sortPickerRows(external.active), inactive: sortPickerRows(external.inactive) },
  };
}
