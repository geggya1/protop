/** Prosjektroller og tilgang for Arbeid-modulen. */

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
  return employees.find((row) => row.personUid === uid && row.company?.status !== 'former') || null;
}

export function employeeDisplayName(employee) {
  if (!employee) return '';
  const first = String(employee.person?.firstName || '').trim();
  const last = String(employee.person?.lastName || '').trim();
  return [first, last].filter(Boolean).join(' ') || employee.company?.email || 'Uten navn';
}

/**
 * Filtrer aktive medarbeidere for Velg medarbeider-listen.
 * Søker i navn, rolle, tittel, ansattnummer og e-post.
 */
export function filterEmployeesForPicker(employees, query = '') {
  const active = (Array.isArray(employees) ? employees : [])
    .filter((row) => row?.company?.status !== 'former');
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return active;
  return active.filter((row) => {
    const hay = [
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
    return tokens.every((token) => hay.includes(token));
  });
}
