/** Skilleark på person-sider (ansatt-detalj). Timer, Fravær og Innstillinger har undersider. */
export const EMPLOYEE_DETAIL_TABS = [
  { id: 'home', label: 'Hovedside' },
  // Det personen selv må gjøre: dokumenter, HMS-kort, pårørende og oppgaver fra HR.
  { id: 'todo', label: 'Gjøremål' },
  { id: 'hours', label: 'Timer' },
  { id: 'absence', label: 'Fravær' },
  { id: 'files', label: 'Filer' },
  { id: 'expenses', label: 'Prosjektutlegg' },
  { id: 'earnings', label: 'Inntjening' },
  { id: 'settings', label: 'Innstillinger' },
  { id: 'cv', label: 'CV' },
];

/** Undersider per fane, som view-id i EmployeesScreen. Første tillatte åpnes fra fanen. */
export const EMPLOYEE_SUB_TABS = {
  hours: [
    { id: 'hours', label: 'Timeliste' },
    { id: 'report', label: 'Timerapport' },
    { id: 'saldo', label: 'Timesaldo' },
  ],
  absence: [
    { id: 'absence', label: 'Oversikt' },
    { id: 'overview', label: 'Rapport' },
  ],
  // Innstillinger: brukerkonto, ansettelsesdata, brukerinnstillingene og brukerloggen i samme meny øverst.
  // Rettighetene settes bare i Tilgangsstyring. Brukerkonto viser dem som en oppsummering.
  settings: [
    { id: 'settings', label: 'Brukerkonto' },
    { id: 'settingsEmployment', label: 'Ansettelsesdata' },
    { id: 'settingsGeneral', label: 'Generelt' },
    { id: 'settingsRate', label: 'Timepriser' },
    { id: 'settingsWork', label: 'Arbeidsforhold' },
    { id: 'settingsPassword', label: 'Endre passord' },
    { id: 'settingsNotify', label: 'Varslinger' },
    { id: 'settingsLog', label: 'Brukerlogg' },
  ],
};

/** Brukerinnstillingene under Innstillinger: view-id → del i EmployeeWorkViews. */
export const EMPLOYEE_SETTINGS_SUBS = {
  settingsGeneral: 'general',
  settingsRate: 'rate',
  settingsWork: 'work',
  settingsPassword: 'password',
  settingsNotify: 'notify',
};

/** view-state i EmployeesScreen → fanens id i skillearket. */
export function employeeViewToTab(view) {
  if (view === 'detail') return 'home';
  for (const [tab, subs] of Object.entries(EMPLOYEE_SUB_TABS)) {
    if (subs.some((sub) => sub.id === view)) return tab;
  }
  return view;
}

/** Fanens id → view-id-ene den dekker. */
export function employeeTabViews(tabId) {
  if (tabId === 'home') return ['detail'];
  return EMPLOYEE_SUB_TABS[tabId]?.map((sub) => sub.id) || [tabId];
}

export const PERSON_VIEWS = new Set([
  'detail', 'todo', 'overview', 'hours', 'report', 'files', 'absence', 'saldo', 'expenses', 'earnings', 'settings', 'cv',
  'settingsEmployment', 'settingsLog',
  ...Object.keys(EMPLOYEE_SETTINGS_SUBS),
]);

/** Undersider med eget rullefelt. De fyller området under chrome. */
export const PERSON_FILL_VIEWS = new Set([
  'hours', 'report', 'absence', 'saldo', 'expenses',
]);
