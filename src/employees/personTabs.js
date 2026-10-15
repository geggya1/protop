/** Skilleark på person-sider (ansatt-detalj). */
export const EMPLOYEE_DETAIL_TABS = [
  { id: 'home', label: 'Hovedside' },
  { id: 'overview', label: 'Oversikt' },
  { id: 'hours', label: 'Timer' },
  { id: 'report', label: 'Timerapport' },
  { id: 'files', label: 'Filer' },
  { id: 'absence', label: 'Fraværsoversikt' },
  { id: 'saldo', label: 'Timesaldo' },
  { id: 'expenses', label: 'Prosjektutlegg' },
  { id: 'settings', label: 'Innstillinger' },
  { id: 'cv', label: 'CV' },
];

/** view-state i EmployeesScreen → fanens id i skillearket. */
export function employeeViewToTab(view) {
  if (view === 'detail') return 'home';
  return view;
}

export const PERSON_VIEWS = new Set([
  'detail', 'overview', 'hours', 'report', 'files', 'absence', 'saldo', 'expenses', 'settings', 'cv',
]);
