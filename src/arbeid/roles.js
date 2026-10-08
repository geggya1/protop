/** Prosjektroller og tilgang for Arbeid-modulen. */

export const PROJECT_ROLES = [
  'Prosjektleder',
  'Prosjektmedlem',
  'SHA-koordinator',
  'Byggeleder',
  'Kontrollør',
  'Annet',
];

export const ABSENCE_TYPES = [
  { id: 'ferie', label: 'Ferie' },
  { id: 'sykdom', label: 'Sykdom' },
  { id: 'permisjon', label: 'Permisjon' },
  { id: 'avspasering', label: 'Avspasering' },
  { id: 'annet', label: 'Annet fravær' },
];

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
