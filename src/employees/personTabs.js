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
  // Innstillinger: en meny til venstre (på mobil en oversikt) med én side per seksjon.
  // Rettighetene settes bare i Tilgangsstyring. Tilgang og rettigheter viser dem som en oppsummering.
  settings: [
    { id: 'settingsOverview', group: 'overview', color: '#0284c7', label: 'Oversikt', icon: 'grid-outline', hint: 'Alle innstillingene for personen samlet' },
    { id: 'settingsProfile', group: 'me', color: '#0284c7', label: 'Min profil', icon: 'person-circle-outline', hint: 'Bilde, navn, stilling og kontakt' },
    { id: 'settingsPersonal', group: 'me', color: '#4f46e5', label: 'Personopplysninger', icon: 'id-card-outline', hint: 'Fødselsdato, adresse og personnummer' },
    { id: 'settingsKin', group: 'me', color: '#db2777', label: 'Pårørende', icon: 'people-outline', hint: 'Nærmeste pårørende og barn' },
    { id: 'settingsEmployment', group: 'work', color: '#7c3aed', label: 'Ansettelsesforhold', icon: 'briefcase-outline', hint: 'Ansettelsestype, lønnsform, stillingsprosent og periode' },
    { id: 'settingsWork', group: 'work', color: '#0891b2', label: 'Arbeidstid', icon: 'time-outline', hint: 'Ukeplan og perioder med egen arbeidstid' },
    { id: 'settingsGeneral', group: 'work', color: '#16a34a', label: 'Timeføring og produktivitet', icon: 'stats-chart-outline', hint: 'Regler for timelisten, mål for faktureringsgrad og timepris' },
    { id: 'settingsHms', group: 'work', color: '#d97706', label: 'HMS og dokumentasjon', icon: 'shield-checkmark-outline', hint: 'HMS-kort og dokumenter som skal leses eller signeres' },
    { id: 'settings', group: 'system', color: '#475569', label: 'Konto og sikkerhet', icon: 'lock-closed-outline', hint: 'Brukerkonto, invitasjon og passord' },
    { id: 'settingsNotify', group: 'system', color: '#ea580c', label: 'Varslinger', icon: 'notifications-outline', hint: 'Varsler om timeliste og godkjenning' },
    { id: 'settingsAccess', group: 'system', color: '#e11d48', label: 'Tilgang og rettigheter', icon: 'key-outline', hint: 'Nivå i Tilgangsstyring og AI-assistent' },
    { id: 'settingsAdmin', group: 'system', color: '#0f766e', label: 'Administrasjon', icon: 'construct-outline', hint: 'Brukerlogg, tagger, papirkurv og avslutning' },
  ],
};

/**
 * Gruppene i Innstillinger, i rekkefølge. Seksjonene over har `group` og en egen farge (`color`),
 * så menyen og oversikten kan vise dem gruppert med fargede ikoner.
 */
export const SETTINGS_GROUPS = [
  { id: 'me', label: 'Om meg', icon: 'person-outline', hint: 'Profil, personopplysninger og pårørende' },
  { id: 'work', label: 'Arbeid', icon: 'briefcase-outline', hint: 'Ansettelse, arbeidstid, timeføring og HMS' },
  { id: 'system', label: 'Konto og system', icon: 'settings-outline', hint: 'Konto, varsler, tilgang og administrasjon' },
];

/** Brukerinnstillingene under Innstillinger: view-id → del i EmployeeWorkViews. */
export const EMPLOYEE_SETTINGS_SUBS = {
  settingsWork: 'work',
  settingsGeneral: 'general',
  settingsNotify: 'notify',
};

/**
 * Eldre undersider som nå er en del av en seksjon. Lenker og bokmerker til dem
 * åpner seksjonen der innholdet står.
 */
export const PERSON_VIEW_ALIASES = {
  settingsRate: 'settingsGeneral',
  settingsPassword: 'settings',
  settingsLog: 'settingsAdmin',
};

export function normalizePersonView(view) {
  return PERSON_VIEW_ALIASES[view] || view;
}

/** Seksjonen i Innstillinger for en view-id, eller null. */
export function settingsSection(view) {
  const id = normalizePersonView(view);
  return EMPLOYEE_SUB_TABS.settings.find((row) => row.id === id) || null;
}

/** view-state i EmployeesScreen → fanens id i skillearket. */
export function employeeViewToTab(view) {
  if (view === 'detail') return 'home';
  view = normalizePersonView(view);
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
  'detail', 'todo', 'overview', 'hours', 'report', 'files', 'absence', 'saldo', 'expenses', 'earnings', 'cv',
  ...EMPLOYEE_SUB_TABS.settings.map((row) => row.id),
]);

/** Undersider med eget rullefelt. De fyller området under chrome. */
export const PERSON_FILL_VIEWS = new Set([
  'hours', 'report', 'absence', 'saldo', 'expenses',
]);
