/**
 * Tilgang i bedriften.
 * Åtte standardnivåer ligger til grunn. Bedriften kan tilpasse hvert nivå,
 * og hver ansatt hører til nøyaktig ett nivå. En person kan i tillegg ha egne avvik.
 *
 * Rettighet per område er ett trinn: ikke se, se, lese, skrive/redigere, slette.
 * Høyere trinn inkluderer de under.
 */

export const ACCESS_RANKS = ['none', 'see', 'read', 'write', 'delete'];

const RANK_VALUE = { none: 0, see: 1, read: 2, write: 3, delete: 4 };

export const ACCESS_ACTIONS = [
  { id: 'see', label: 'Se' },
  { id: 'read', label: 'Lese' },
  { id: 'write', label: 'Skrive' },
  { id: 'delete', label: 'Slette' },
];

/**
 * Rettighetskatalog som speiler bedriftsmenyen.
 * Nye moduler, undersider og innstillinger legges her — da dukker de opp i
 * tilgangsstyringen og kan styre navigasjon via NAV_RESOURCE / RESOURCE_PARENT.
 */
export const ACCESS_GROUPS = [
  {
    id: 'company',
    label: 'Selskap og organisasjon',
    resources: [
      { id: 'companyPublic', label: 'Selskap / offentlig bedriftsinfo', hint: 'Navn, org.nr. og adresse.' },
      { id: 'companyProfile', label: 'Selskapsinnstillinger', hint: 'Logo, kontakt, næringskoder og bedriftsprofil.' },
      { id: 'accessControl', label: 'Tilgangsstyring', hint: 'Nivåer, personer og rettighetsmatrise.' },
      { id: 'units', label: 'Underenheter og avdelinger' },
    ],
  },
  {
    id: 'people',
    label: 'Ansatte og arbeidstid',
    resources: [
      { id: 'employees', label: 'Ansatte' },
      { id: 'ownProfile', label: 'Egen profil' },
      {
        id: 'hr',
        label: 'HR — oversikt',
        hint: 'HR-modul for leder. Vanlige ansatte ser delte poster på Min side.',
      },
      { id: 'hrPeople', label: 'HR — personell' },
      { id: 'hrAgreements', label: 'HR — avtaler' },
      { id: 'hrPayroll', label: 'HR — lønn' },
      { id: 'hrFollowup', label: 'HR — oppfølging' },
      { id: 'hrCompliance', label: 'HR — lov & ISO' },
      { id: 'hrRecruitment', label: 'HR — rekruttering' },
      { id: 'absence', label: 'Fraværsoversikt' },
      { id: 'absenceReport', label: 'Fraværsrapport' },
      { id: 'absencePlanned', label: 'Planlagt fravær' },
      { id: 'absenceSettings', label: 'Fraværsinnstillinger' },
      { id: 'hours', label: 'Timeliste (egne timer)' },
      { id: 'hoursOthers', label: 'Andres timer' },
      { id: 'hoursReport', label: 'Timerapport' },
      { id: 'hoursBalance', label: 'Timesaldo' },
      { id: 'hoursApproval', label: 'Godkjenninger' },
    ],
  },
  {
    id: 'customers',
    label: 'Kunder og oppdrag',
    resources: [
      { id: 'customers', label: 'Kunder' },
      { id: 'tenders', label: '1.1 Anbudsvarsling', hint: 'Anbudsvarsling.' },
      { id: 'tenderRequest', label: '1.2 Anbudsforespørsel' },
      { id: 'tenderReview', label: '2. Vurdering av aktuelle' },
      { id: 'offers', label: '3. Tilbud', hint: 'Tilbud i anbudsløpet.' },
      { id: 'tenderSettings', label: 'Anbudsinnstillinger' },
      { id: 'contracts', label: 'Kontrakt / avtale' },
      { id: 'projects', label: 'Prosjekt' },
      { id: 'assignedProjects', label: 'Tildelte prosjekt' },
      { id: 'forms', label: 'Skjema og sjekklister' },
    ],
  },
  {
    id: 'productivity',
    label: 'Produktivitet',
    resources: [
      { id: 'productivity', label: 'Produktivitet' },
    ],
  },
  {
    id: 'resources',
    label: 'Produkter og driftsressurser',
    resources: [
      { id: 'productSales', label: 'Produktsalg' },
      { id: 'products', label: 'Produktkatalog' },
      { id: 'equipment', label: 'Utstyr' },
      { id: 'mileage', label: 'Kjørebok' },
    ],
  },
  {
    id: 'economy',
    label: 'Økonomi og fakturering',
    resources: [
      {
        id: 'economy',
        label: 'Økonomi (hele modulen)',
        hint: 'Overordnet rettighet. Undersidene kan settes finere under.',
      },
      { id: 'economyOverview', label: 'Oversikt' },
      { id: 'economyEarnings', label: 'Inntjening' },
      { id: 'economyCustomers', label: 'Kundesummer' },
      { id: 'economyContracts', label: 'Avtalesummer' },
      { id: 'economyInvoices', label: 'Faktura' },
      { id: 'economyBilling', label: 'Fakturagrunnlag' },
      { id: 'economyExpenses', label: 'Utlegg' },
      { id: 'economyProjectExpenses', label: 'Prosjektutlegg' },
      { id: 'economyIndex', label: 'Indeksregulering' },
      { id: 'economyIndices', label: 'Indekser' },
      { id: 'economySettings', label: 'Økonomiinnstillinger' },
    ],
  },
  {
    id: 'quality',
    label: 'Kvalitet og styringssystem',
    resources: [
      { id: 'iso', label: 'ISO' },
    ],
  },
  {
    id: 'preview',
    label: 'Visning',
    resources: [
      {
        id: 'viewAs',
        label: 'Se som bruker',
        hint: 'Bytt bruker og se moduler og applikasjoner slik personen ser dem. Se: bare bedriftsinnstillinger. Lese eller høyere: alle moduler og apper.',
      },
    ],
  },
];

export const ACCESS_RESOURCES = ACCESS_GROUPS.flatMap((group) => group.resources);
export const RESOURCE_IDS = ACCESS_RESOURCES.map((row) => row.id);

/** Undersider som arver fra en eldre/overordnet rettighet når egen verdi mangler i lagret policy. */
export const RESOURCE_PARENT = {
  accessControl: 'companyProfile',
  hrPeople: 'hr',
  hrAgreements: 'hr',
  hrPayroll: 'hr',
  hrFollowup: 'hr',
  hrCompliance: 'hr',
  hrRecruitment: 'hr',
  absence: 'hours',
  absenceReport: 'hours',
  absencePlanned: 'hours',
  absenceSettings: 'companyProfile',
  hoursReport: 'hours',
  hoursBalance: 'hours',
  hoursApproval: 'hours',
  productivity: 'hours',
  productSales: 'hours',
  products: 'economy',
  mileage: 'economy',
  economyOverview: 'economy',
  economyEarnings: 'economy',
  economyCustomers: 'economy',
  economyContracts: 'economy',
  economyInvoices: 'economy',
  economyBilling: 'economy',
  economyExpenses: 'economy',
  economyProjectExpenses: 'hours',
  economyIndex: 'economy',
  economyIndices: 'economy',
  economySettings: 'companyProfile',
  tenderRequest: 'tenders',
  tenderReview: 'tenders',
  tenderSettings: 'tenders',
};

export const HR_PAGE_RESOURCES = [
  'hr', 'hrPeople', 'hrAgreements', 'hrPayroll', 'hrFollowup', 'hrCompliance', 'hrRecruitment',
];

/**
 * Regnskapssider som gir innsyn i økonomidata.
 * Prosjektutlegg følger timer. Økonomiinnstillinger er egen innstillingsrettighet.
 */
export const ECONOMY_PAGE_RESOURCES = [
  'economy', 'economyOverview', 'economyEarnings', 'economyCustomers', 'economyContracts',
  'economyInvoices', 'economyBilling', 'economyExpenses',
  'economyIndex', 'economyIndices',
];

export const COMPANY_SETTINGS_RESOURCES = [
  'companyPublic',
  'companyProfile',
  'accessControl',
  'units',
  'absenceSettings',
  'economySettings',
  'tenderSettings',
];

export const ACCESS_LEVELS = [
  {
    id: 'regnskap_ekstern',
    order: 1,
    label: 'Regnskap eksternt',
    kind: 'external',
    section: 'external',
    summary: 'Lesetilgang på regnskap. Ikke fast ansatt.',
  },
  {
    id: 'innleie_ekstern',
    order: 2,
    label: 'Innleie eksternt',
    kind: 'innleid',
    section: 'external',
    summary: 'Kan skrive timer på tildelte prosjekt, og ser bare offentlig info om bedriften.',
  },
  {
    id: 'ansatt',
    order: 3,
    label: 'Ansatt',
    kind: 'staff',
    section: 'company',
    summary: 'Ser det som er tilgjengelig for ansatte, skriver timer, ser prosjekt, fyller ut sjekklister og styrer mye av egen profil.',
  },
  {
    id: 'tilbud',
    order: 4,
    label: 'Tilbud',
    kind: 'staff',
    section: 'company',
    summary: 'Skriver tilbud og leser anbud, kunder og prosjekt. Ikke økonomi og ikke bedriftsinnstillinger.',
  },
  {
    id: 'ansatt_andre_avdelinger',
    order: 5,
    label: 'Ansatt andre avdelinger',
    kind: 'staff',
    section: 'external',
    summary: 'Ser andre avdelinger, prosjekt og medarbeidere, og kan se andres timer. Skriver egne timer. Endrer ikke avdelingene.',
  },
  {
    id: 'avdelingsleder',
    order: 6,
    label: 'Avdelingsleder',
    kind: 'staff',
    section: 'company',
    summary: 'Administrerer og ser mer av bedriften, prosjekt, kunder og medarbeidere. Ikke økonomi.',
  },
  {
    id: 'leder',
    order: 7,
    label: 'Øverste leder',
    kind: 'staff',
    section: 'company',
    summary: 'Kan gjøre det meste, men ikke endre bedriftsprofil og grunninnstillinger.',
  },
  {
    id: 'administrator',
    order: 8,
    label: 'Administrator',
    kind: 'staff',
    section: 'company',
    summary: 'Kan gjøre alt, inkludert bedriftsprofil og grunninnstillinger.',
  },
];

export function accessLevelSections() {
  return [
    { id: 'company', levels: ACCESS_LEVELS.filter((level) => level.section === 'company') },
    { id: 'external', levels: ACCESS_LEVELS.filter((level) => level.section === 'external') },
  ];
}

export function accessSectionTitle(sectionId, companyName) {
  if (sectionId === 'external') return 'Eksternt';
  const name = String(companyName || '').replace(/\s+/g, ' ').trim() || 'bedriften';
  return `Ansatt i ${name}`;
}

export const ACCESS_LEVEL_LABELS = ACCESS_LEVELS.map((level) => level.label);

const ROLE_TO_LEVEL = [
  ['administrator', 'administrator'],
  ['admin', 'administrator'],
  ['hovedadministrator', 'administrator'],
  ['overste leder', 'leder'],
  ['daglig leder', 'leder'],
  ['leder', 'leder'],
  ['avdelingsleder', 'avdelingsleder'],
  ['ansatt andre avdelinger', 'ansatt_andre_avdelinger'],
  ['ansatt andre avdeling', 'ansatt_andre_avdelinger'],
  ['andre avdelinger', 'ansatt_andre_avdelinger'],
  ['tilbud', 'tilbud'],
  ['regnskap eksternt', 'regnskap_ekstern'],
  ['regnskap ekstern', 'regnskap_ekstern'],
  ['regnskap', 'regnskap_ekstern'],
  ['innleie eksternt', 'innleie_ekstern'],
  ['innleie ekstern', 'innleie_ekstern'],
  ['innleie', 'innleie_ekstern'],
  ['innleid', 'innleie_ekstern'],
  ['ansatt', 'ansatt'],
  ['medarbeider', 'ansatt'],
  ['bruker', 'ansatt'],
];

function blankGrants() {
  const grants = {};
  for (const id of RESOURCE_IDS) grants[id] = 'none';
  return grants;
}

function fill(partial) {
  return { ...blankGrants(), ...partial };
}

/** Timer, fravær, produktivitet og nærliggende undersider. */
function hoursSurface(rank) {
  return {
    hours: rank,
    hoursReport: rank,
    hoursBalance: rank,
    hoursApproval: rank,
    absence: rank,
    absenceReport: rank,
    absencePlanned: rank,
    productivity: rank,
    productSales: rank,
    economyProjectExpenses: rank,
  };
}

/** Økonomisider som tidligere lå under én economy-rettighet. */
function economySurface(rank) {
  return {
    economy: rank,
    economyOverview: rank,
    economyEarnings: rank,
    economyCustomers: rank,
    economyContracts: rank,
    economyInvoices: rank,
    economyBilling: rank,
    economyExpenses: rank,
    economyIndex: rank,
    economyIndices: rank,
    mileage: rank,
    products: rank,
  };
}

/** HR-undersider følger HR-modulen. */
function hrSurface(rank) {
  return {
    hr: rank,
    hrPeople: rank,
    hrAgreements: rank,
    hrPayroll: rank,
    hrFollowup: rank,
    hrCompliance: rank,
    hrRecruitment: rank,
  };
}

/** Anbudssteg som tidligere lå under tenders. */
function tenderSurface(rank) {
  return {
    tenders: rank,
    tenderRequest: rank,
    tenderReview: rank,
    tenderSettings: rank,
  };
}

/** Innstillinger som tidligere krevde companyProfile. */
function settingsFromProfile(rank) {
  return {
    companyProfile: rank,
    accessControl: rank,
    absenceSettings: rank,
    economySettings: rank,
  };
}

const STANDARD = {
  regnskap_ekstern: fill({
    companyPublic: 'read',
    ownProfile: 'read',
    ...economySurface('read'),
  }),
  innleie_ekstern: fill({
    companyPublic: 'read',
    assignedProjects: 'read',
    ownProfile: 'read',
    ...hoursSurface('write'),
    equipment: 'see',
  }),
  ansatt: fill({
    companyPublic: 'read',
    units: 'see',
    employees: 'read',
    ownProfile: 'write',
    forms: 'write',
    projects: 'read',
    assignedProjects: 'read',
    ...hoursSurface('write'),
    equipment: 'read',
    iso: 'read',
  }),
  tilbud: fill({
    companyPublic: 'read',
    units: 'see',
    employees: 'read',
    ownProfile: 'write',
    customers: 'read',
    ...tenderSurface('read'),
    offers: 'write',
    contracts: 'read',
    forms: 'write',
    projects: 'read',
    assignedProjects: 'read',
    ...hoursSurface('write'),
    equipment: 'read',
    iso: 'read',
  }),
  ansatt_andre_avdelinger: fill({
    companyPublic: 'read',
    units: 'read',
    employees: 'read',
    ownProfile: 'write',
    forms: 'write',
    projects: 'read',
    assignedProjects: 'read',
    ...hoursSurface('write'),
    hoursOthers: 'see',
    equipment: 'read',
    iso: 'read',
  }),
  avdelingsleder: fill({
    companyPublic: 'read',
    ...settingsFromProfile('read'),
    units: 'write',
    employees: 'write',
    ownProfile: 'write',
    ...hrSurface('read'),
    customers: 'write',
    ...tenderSurface('read'),
    offers: 'read',
    contracts: 'read',
    forms: 'write',
    projects: 'write',
    assignedProjects: 'write',
    ...hoursSurface('write'),
    hoursOthers: 'write',
    equipment: 'write',
    iso: 'write',
  }),
  leder: fill({
    companyPublic: 'read',
    ...settingsFromProfile('read'),
    units: 'read',
    employees: 'delete',
    ownProfile: 'write',
    ...hrSurface('delete'),
    customers: 'delete',
    ...tenderSurface('delete'),
    offers: 'delete',
    contracts: 'delete',
    forms: 'delete',
    projects: 'delete',
    assignedProjects: 'delete',
    ...hoursSurface('delete'),
    hoursOthers: 'delete',
    equipment: 'delete',
    iso: 'delete',
    ...economySurface('delete'),
    viewAs: 'write',
  }),
  administrator: fill(
    Object.fromEntries(RESOURCE_IDS.map((id) => [id, 'delete'])),
  ),
};

export function foldAccess(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levelById(id) {
  return ACCESS_LEVELS.find((level) => level.id === id) || null;
}

export function canonicalLevelId(value) {
  const raw = String(value || '').trim();
  return levelById(raw)?.id || '';
}

export function levelIdFromRoleLabel(value) {
  const folded = foldAccess(value);
  if (!folded) return '';
  const hit = ROLE_TO_LEVEL.find(([label]) => label === folded);
  return hit ? hit[1] : '';
}

export function standardGrants(levelId) {
  const source = STANDARD[levelId] || blankGrants();
  return { ...source };
}

export function rankValue(rank) {
  return RANK_VALUE[rank] || 0;
}

export function allows(grants, resource, action) {
  const need = action === 'see' || action === 'read' || action === 'write' || action === 'delete'
    ? action
    : 'see';
  return rankValue(grants?.[resource]) >= rankValue(need);
}

/** Direkte rettighet, ellers overordnet ressurs (for eldre policy og samlet modulrettighet). */
export function allowsEffective(grants, resource, action) {
  if (allows(grants, resource, action)) return true;
  const parent = RESOURCE_PARENT[resource];
  if (!parent || parent === resource) return false;
  return allows(grants, parent, action);
}

export function allowsAny(grants, resources, action) {
  return (resources || []).some((id) => allowsEffective(grants, id, action));
}

export function allowsEconomy(grants, action) {
  return allowsAny(grants, ECONOMY_PAGE_RESOURCES, action);
}

export function allowsHr(grants, action) {
  return allowsAny(grants, HR_PAGE_RESOURCES, action);
}

export function hrResourceForSubView(subView) {
  const map = {
    oversikt: 'hr',
    personell: 'hrPeople',
    avtaler: 'hrAgreements',
    lonn: 'hrPayroll',
    oppfolging: 'hrFollowup',
    compliance: 'hrCompliance',
    rekruttering: 'hrRecruitment',
  };
  return map[subView] || 'hr';
}

export function economyResourceForSubView(subView) {
  const map = {
    oversikt: 'economyOverview',
    inntjening: 'economyEarnings',
    kunder: 'economyCustomers',
    avtaler: 'economyContracts',
    faktura: 'economyInvoices',
    fakturagrunnlag: 'economyBilling',
    utlegg: 'economyExpenses',
    indeks: 'economyIndex',
    indekser: 'economyIndices',
    innstillinger: 'economySettings',
    produkter: 'products',
    kjorebok: 'mileage',
  };
  return map[subView] || 'economy';
}

export function checksFromGrant(grant) {
  const value = rankValue(grant);
  return {
    see: value >= 1,
    read: value >= 2,
    write: value >= 3,
    delete: value >= 4,
  };
}

export function toggleGrant(current, action, on) {
  const checks = checksFromGrant(current);
  if (action === 'see' || action === 'read' || action === 'write' || action === 'delete') {
    checks[action] = !!on;
  }
  if (on) {
    if (action === 'delete') checks.write = checks.read = checks.see = true;
    if (action === 'write') checks.read = checks.see = true;
    if (action === 'read') checks.see = true;
  } else if (action === 'see') {
    checks.read = checks.write = checks.delete = false;
  } else if (action === 'read') {
    checks.write = checks.delete = false;
  } else if (action === 'write') {
    checks.delete = false;
  }
  if (checks.delete) return 'delete';
  if (checks.write) return 'write';
  if (checks.read) return 'read';
  if (checks.see) return 'see';
  return 'none';
}

export function grantsEqual(left, right) {
  return RESOURCE_IDS.every((id) => (left?.[id] || 'none') === (right?.[id] || 'none'));
}

export function levelGrants(policy, levelId) {
  const grants = standardGrants(levelId);
  const saved = policy?.levels?.[levelId];
  if (!saved || typeof saved !== 'object') return grants;
  for (const id of RESOURCE_IDS) {
    if (ACCESS_RANKS.includes(saved[id])) grants[id] = saved[id];
  }
  // Eldre lagrede nivå har ofte bare overordnet nøkkel. Fyll undersider som ikke
  // er lagret eksplisitt, så utvidet katalog ikke mister tilpasset tilgang.
  for (const [child, parent] of Object.entries(RESOURCE_PARENT)) {
    if (!RESOURCE_IDS.includes(child) || !RESOURCE_IDS.includes(parent)) continue;
    if (ACCESS_RANKS.includes(saved[child])) continue;
    if (!ACCESS_RANKS.includes(saved[parent])) continue;
    grants[child] = saved[parent];
  }
  return grants;
}

export function normalizeAccessPolicy(raw) {
  const levels = {};
  for (const level of ACCESS_LEVELS) {
    const grants = levelGrants(raw, level.id);
    const standard = standardGrants(level.id);
    if (!grantsEqual(grants, standard)) levels[level.id] = grants;
  }
  return { version: 1, levels };
}

export function compactPolicy(policy) {
  return normalizeAccessPolicy(policy);
}

export function levelIsCustom(policy, levelId) {
  return !grantsEqual(levelGrants(policy, levelId), standardGrants(levelId));
}

export function setLevelGrant(policy, levelId, resourceId, grant) {
  if (!levelById(levelId) || !RESOURCE_IDS.includes(resourceId)) return normalizeAccessPolicy(policy);
  const nextRank = ACCESS_RANKS.includes(grant) ? grant : 'none';
  const levels = {};
  for (const level of ACCESS_LEVELS) {
    levels[level.id] = levelGrants(policy, level.id);
  }
  levels[levelId] = { ...levels[levelId], [resourceId]: nextRank };
  return normalizeAccessPolicy({ version: 1, levels });
}

export function resetLevel(policy, levelId) {
  const levels = { ...(policy?.levels || {}) };
  delete levels[levelId];
  return normalizeAccessPolicy({ version: 1, levels });
}

export function normalizeOverrides(raw) {
  const overrides = {};
  if (!raw || typeof raw !== 'object') return overrides;
  for (const id of RESOURCE_IDS) {
    if (ACCESS_RANKS.includes(raw[id])) overrides[id] = raw[id];
  }
  return overrides;
}

export function applyOverrides(base, overrides) {
  const next = { ...base };
  const clean = normalizeOverrides(overrides);
  for (const id of RESOURCE_IDS) {
    if (clean[id]) next[id] = clean[id];
  }
  return next;
}

export function compactOverrides(base, effective) {
  const diff = {};
  for (const id of RESOURCE_IDS) {
    const rank = ACCESS_RANKS.includes(effective?.[id]) ? effective[id] : base?.[id] || 'none';
    if (rank !== (base?.[id] || 'none')) diff[id] = rank;
  }
  return diff;
}

export function placedLevelId(employee) {
  const explicit = canonicalLevelId(employee?.company?.accessLevel);
  if (explicit) return explicit;
  return levelIdFromRoleLabel(employee?.company?.accessRole);
}

/** Kjente nivå-id-er i fast rekkefølge. Ukjente verdier faller bort. */
export function normalizeEmployeeLevelIds(values) {
  const raw = Array.isArray(values) ? values : [];
  return ACCESS_LEVELS
    .map((level) => level.id)
    .filter((id) => raw.some((value) => canonicalLevelId(value) === id || levelIdFromRoleLabel(value) === id));
}

/**
 * Nivåene som er krysset av. Eldre poster har bare ett accessLevel,
 * og det brukes til listen er lagret på nytt.
 */
export function employeeLevelIds(employee) {
  const company = employee?.company || {};
  if (Array.isArray(company.accessLevels)) return normalizeEmployeeLevelIds(company.accessLevels);
  const single = placedLevelId(employee);
  return single ? [single] : [];
}

/** Legg til eller ta bort ett nivå uten å endre personelltype. */
export function withToggledLevel(employee, levelId, checked) {
  const level = levelById(canonicalLevelId(levelId));
  if (!level || !employee) return employee;
  const current = employeeLevelIds(employee);
  const ids = checked
    ? ACCESS_LEVELS.filter((row) => current.includes(row.id) || row.id === level.id).map((row) => row.id)
    : current.filter((id) => id !== level.id);
  const primary = levelById(ids[ids.length - 1]);
  return {
    ...employee,
    company: {
      ...(employee.company || {}),
      accessLevels: ids,
      accessLevel: primary?.id || '',
      accessRole: primary?.label || '',
    },
  };
}

export function grantsForLevelIds(policy, levelIds) {
  const ids = normalizeEmployeeLevelIds(levelIds);
  if (!ids.length) return blankGrants();
  const merged = blankGrants();
  for (const id of ids) {
    const grants = levelGrants(policy, id);
    for (const resourceId of RESOURCE_IDS) {
      if (rankValue(grants[resourceId]) > rankValue(merged[resourceId])) merged[resourceId] = grants[resourceId];
    }
  }
  return merged;
}

export function suggestedLevelId(employee) {
  if (placedLevelId(employee)) return '';
  const kind = employee?.company?.personnelKind;
  if (kind === 'innleid') return 'innleie_ekstern';
  if (kind === 'external' || employee?.company?.external === true) return 'regnskap_ekstern';
  return '';
}

export function effectiveLevelId(employee) {
  return placedLevelId(employee) || suggestedLevelId(employee) || 'ansatt';
}

export function hoursOnAssignedOnly(grants) {
  return allows(grants, 'hours', 'write') && !allows(grants, 'projects', 'see');
}

export function alignCompanyEmployment(company) {
  const next = { ...company };
  const level = levelById(next.accessLevel);
  if (!level) return next;
  const employment = String(next.employmentType || '');
  if (level.kind === 'external') {
    next.personnelKind = 'external';
    next.external = true;
    if (!employment || /^fast ansatt$/i.test(employment)) next.employmentType = 'Ekstern';
  } else if (level.kind === 'innleid') {
    next.personnelKind = 'innleid';
    next.external = false;
    if (!employment || /^fast ansatt$/i.test(employment)) next.employmentType = 'Innleid';
  }
  return next;
}

function employmentStatus(employee) {
  return String(employee?.company?.status || 'active');
}

export function grantsForEmployee(policy, employee) {
  const status = employmentStatus(employee);
  if (status === 'inactive' || status === 'deleted' || status === 'former') {
    return blankGrants();
  }
  const ids = employeeLevelIds(employee);
  const base = ids.length
    ? grantsForLevelIds(policy, ids)
    : levelGrants(policy, effectiveLevelId(employee));
  return applyOverrides(base, employee?.company?.accessOverrides);
}

export function resolveActorAccess({ policy, employees, uid, bypass = false } = {}) {
  if (bypass) {
    const grants = standardGrants('administrator');
    return {
      levelId: 'administrator',
      grants,
      employee: null,
      placed: true,
      customized: false,
      hoursOnAssignedOnly: false,
      bypass: true,
    };
  }
  const linked = (employees || []).find((row) => (
    row?.personUid
    && row.personUid === uid
    && employmentStatus(row) !== 'deleted'
  )) || null;
  if (linked && (employmentStatus(linked) === 'inactive' || employmentStatus(linked) === 'former')) {
    const grants = blankGrants();
    return {
      levelId: '',
      grants,
      employee: linked,
      placed: false,
      customized: false,
      hoursOnAssignedOnly: false,
      bypass: false,
    };
  }
  const ids = linked ? employeeLevelIds(linked) : [];
  const levelId = ids.length ? ids[ids.length - 1] : (linked ? effectiveLevelId(linked) : 'ansatt');
  const base = ids.length ? grantsForLevelIds(policy, ids) : levelGrants(policy, levelId);
  const grants = linked ? applyOverrides(base, linked.company?.accessOverrides) : base;
  const overrides = normalizeOverrides(linked?.company?.accessOverrides);
  return {
    levelId,
    grants,
    employee: linked,
    placed: linked ? !!placedLevelId(linked) : false,
    customized: Object.keys(overrides).length > 0,
    hoursOnAssignedOnly: hoursOnAssignedOnly(grants),
    bypass: false,
  };
}

export function accountDeactivated(employee) {
  const status = employmentStatus(employee);
  return status === 'inactive' || status === 'deleted' || status === 'former';
}

export function parseDropId(value) {
  const parts = String(value || '').split(':');
  if (parts[0] === 'level' && parts[1]) return { kind: 'level', levelId: parts[1] };
  if (parts[0] === 'status' && parts[1] && (parts[2] === 'active' || parts[2] === 'inactive')) {
    return { kind: 'status', levelId: parts[1], status: parts[2] };
  }
  return null;
}

/** Hva et slipp gjør med personen. Null når slippunktet ikke endrer noe. */
export function personDropChange(employee, dropId) {
  const drop = parseDropId(dropId);
  if (!drop || !employee) return null;
  if (drop.levelId !== 'unplaced' && !levelById(drop.levelId)) return null;
  const placed = placedLevelId(employee) || '';
  const deactivated = accountDeactivated(employee);
  const setLevel = drop.levelId !== 'unplaced' && drop.levelId !== placed;
  const clearLevel = drop.levelId === 'unplaced' && placed !== '';
  const activate = drop.kind === 'status' && drop.status === 'active' && deactivated;
  const deactivate = drop.kind === 'status' && drop.status === 'inactive' && !deactivated;
  if (!setLevel && !clearLevel && !activate && !deactivate) return null;
  return { levelId: setLevel ? drop.levelId : '', clearLevel, activate, deactivate };
}

export function groupEmployeesByLevel(employees) {
  const buckets = Object.fromEntries(ACCESS_LEVELS.map((level) => [level.id, []]));
  const unplaced = [];
  for (const employee of employees || []) {
    const placed = placedLevelId(employee);
    if (placed && buckets[placed]) buckets[placed].push(employee);
    else unplaced.push(employee);
  }
  return { buckets, unplaced };
}

const COMPANY_TAB_RESOURCE = {
  selskap: 'companyPublic',
  underenheter: 'units',
  ansatte: 'employees',
  hr: 'hr',
  kunder: 'customers',
  anbud: 'tenders',
  kontrakt: 'contracts',
  skjema: 'forms',
  projects: 'projects',
  iso: 'iso',
  okonomi: 'economy',
  utstyr: 'equipment',
};

/** Meny-id → rettighetsressurs. Foreldre uten egen rad dekkes i navItemAllowed. */
const NAV_RESOURCE = {
  selskap: 'companyPublic',
  underenheter: 'units',
  selskapsinnstillinger: 'companyProfile',
  'selskapsinnstillinger-tilgang': 'accessControl',
  tilgang: 'accessControl',
  ansatte: 'employees',
  hr: 'hr',
  'hr-oversikt': 'hr',
  'hr-personell': 'hrPeople',
  'hr-avtaler': 'hrAgreements',
  'hr-lonn': 'hrPayroll',
  'hr-oppfolging': 'hrFollowup',
  'hr-compliance': 'hrCompliance',
  'hr-rekruttering': 'hrRecruitment',
  'fravaer-fravaer': 'absence',
  'fravaer-fravaersrapport': 'absenceReport',
  'fravaer-planlagt': 'absencePlanned',
  'fravaer-innstillinger': 'absenceSettings',
  'arbeid-timeliste': 'hours',
  'arbeid-timerapport': 'hoursReport',
  'arbeid-timesaldo': 'hoursBalance',
  'arbeid-godkjenning': 'hoursApproval',
  produktivitet: 'productivity',
  kunder: 'customers',
  'anbud-varsling': 'tenders',
  'anbud-foresporsel': 'tenderRequest',
  'anbud-vurdering': 'tenderReview',
  'anbud-tilbud': 'offers',
  'anbud-innstillinger': 'tenderSettings',
  kontrakt: 'contracts',
  projects: 'projects',
  'produkt-salg': 'productSales',
  'produkt-produkter': 'products',
  utstyr: 'equipment',
  kjorebok: 'mileage',
  'okonomi-oversikt': 'economyOverview',
  'okonomi-inntjening': 'economyEarnings',
  'okonomi-kunder': 'economyCustomers',
  'okonomi-avtaler': 'economyContracts',
  'okonomi-faktura': 'economyInvoices',
  'okonomi-fakturagrunnlag': 'economyBilling',
  'okonomi-utlegg': 'economyExpenses',
  'okonomi-prosjektutlegg': 'economyProjectExpenses',
  'okonomi-indeks': 'economyIndex',
  'okonomi-indekser': 'economyIndices',
  'okonomi-innstillinger': 'economySettings',
  skjema: 'forms',
  iso: 'iso',
};

export const COMPANY_TAB_IDS = [
  'selskap', 'underenheter', 'ansatte', 'hr', 'kunder', 'anbud', 'kontrakt',
  'skjema', 'projects', 'arbeid', 'utstyr', 'iso', 'okonomi',
];

function hoursAllowed(grants) {
  return allowsEffective(grants, 'hours', 'see') || allowsEffective(grants, 'hoursOthers', 'see');
}

function seeResource(grants, resource) {
  return allowsEffective(grants, resource, 'see');
}

function readResource(grants, resource) {
  return allowsEffective(grants, resource, 'read');
}

export function companyTabAllowed(tab, subView, grants) {
  if (!grants) return true;
  if (tab === 'selskap' && subView === 'underenheter') return seeResource(grants, 'units');
  if (tab === 'selskap' && subView === 'tilgang') return readResource(grants, 'accessControl');
  if (tab === 'selskap' && subView === 'innstillinger') return readResource(grants, 'companyProfile');
  if (tab === 'selskap' && (subView === 'fravaerstyper' || subView === 'fridager')) {
    return readResource(grants, 'absenceSettings');
  }
  if (tab === 'selskap' && (subView === 'kontoplan' || subView === 'regnskapskontoer')) {
    return readResource(grants, 'economySettings');
  }
  if (tab === 'underenheter') return seeResource(grants, 'units');
  if (tab === 'utstyr') {
    return seeResource(grants, 'equipment')
      || seeResource(grants, 'projects')
      || seeResource(grants, 'assignedProjects')
      || hoursAllowed(grants);
  }
  if (tab === 'arbeid' && subView === 'fravaer-innstillinger') {
    return readResource(grants, 'absenceSettings');
  }
  if (tab === 'arbeid' && subView === 'produktivitet') return seeResource(grants, 'productivity');
  if (tab === 'arbeid' && subView === 'salg') return seeResource(grants, 'productSales');
  if (tab === 'arbeid' && subView === 'utlegg') return seeResource(grants, 'economyProjectExpenses');
  if (tab === 'arbeid' && (subView === 'fravaer' || subView === 'fravaersrapport' || subView === 'planlagt')) {
    const map = {
      fravaer: 'absence',
      fravaersrapport: 'absenceReport',
      planlagt: 'absencePlanned',
    };
    return seeResource(grants, map[subView]);
  }
  if (tab === 'arbeid' && subView === 'timeliste') return seeResource(grants, 'hours') || hoursAllowed(grants);
  if (tab === 'arbeid' && subView === 'timerapport') return seeResource(grants, 'hoursReport');
  if (tab === 'arbeid' && subView === 'timesaldo') return seeResource(grants, 'hoursBalance');
  if (tab === 'arbeid' && subView === 'godkjenning') return seeResource(grants, 'hoursApproval');
  if (tab === 'arbeid') {
    return hoursAllowed(grants)
      || seeResource(grants, 'productivity')
      || seeResource(grants, 'productSales')
      || seeResource(grants, 'economyProjectExpenses')
      || seeResource(grants, 'absence')
      || seeResource(grants, 'absenceReport')
      || seeResource(grants, 'absencePlanned')
      || readResource(grants, 'absenceSettings');
  }
  if (tab === 'okonomi') {
    if (subView === 'innstillinger') return readResource(grants, 'economySettings');
    if (subView === 'kjorebok') return seeResource(grants, 'mileage');
    if (subView === 'produkter') return seeResource(grants, 'products');
    // Prosjektutlegg åpnes via arbeid-fanen; alene skal den ikke åpne økonomi-fanen.
    if (subView) return seeResource(grants, economyResourceForSubView(subView));
    return allowsEconomy(grants, 'see')
      || seeResource(grants, 'mileage')
      || seeResource(grants, 'products')
      || readResource(grants, 'economySettings');
  }
  if (tab === 'hr') {
    return seeResource(grants, hrResourceForSubView(subView || 'oversikt'));
  }
  if (tab === 'anbud') {
    if (subView === 'avtale' || subView === 'avrop') {
      return seeResource(grants, 'offers') || seeResource(grants, 'tenders') || seeResource(grants, 'contracts');
    }
    if (subView === 'tilbud' || subView === 'pipeline') return seeResource(grants, 'offers');
    if (subView === 'innstillinger') {
      return seeResource(grants, 'tenderSettings') || seeResource(grants, 'offers');
    }
    if (subView === 'foresporsel') return seeResource(grants, 'tenderRequest');
    if (subView === 'vurdering') return seeResource(grants, 'tenderReview');
    if (subView === 'varsling') return seeResource(grants, 'tenders');
    return seeResource(grants, 'tenders')
      || seeResource(grants, 'tenderRequest')
      || seeResource(grants, 'tenderReview')
      || seeResource(grants, 'offers');
  }
  const resource = COMPANY_TAB_RESOURCE[tab];
  if (!resource) return true;
  return seeResource(grants, resource);
}

function navItemAllowed(id, grants) {
  if (id === 'anbud-innstillinger') {
    return seeResource(grants, 'tenderSettings') || seeResource(grants, 'offers');
  }
  if (id === 'utstyr') {
    return seeResource(grants, 'equipment')
      || seeResource(grants, 'projects')
      || seeResource(grants, 'assignedProjects')
      || hoursAllowed(grants);
  }
  if (id === 'fravaer') {
    return seeResource(grants, 'absence')
      || seeResource(grants, 'absenceReport')
      || seeResource(grants, 'absencePlanned')
      || readResource(grants, 'absenceSettings');
  }
  if (id === 'arbeid') {
    return seeResource(grants, 'hours')
      || seeResource(grants, 'hoursReport')
      || seeResource(grants, 'hoursBalance')
      || seeResource(grants, 'hoursApproval')
      || hoursAllowed(grants);
  }
  if (id === 'produkt') {
    return seeResource(grants, 'productSales') || seeResource(grants, 'products');
  }
  if (id === 'anbud') {
    return seeResource(grants, 'tenders')
      || seeResource(grants, 'tenderRequest')
      || seeResource(grants, 'tenderReview')
      || seeResource(grants, 'offers')
      || seeResource(grants, 'tenderSettings');
  }
  if (id === 'hr') {
    return allowsHr(grants, 'see');
  }
  if (id === 'okonomi') {
    return allowsEconomy(grants, 'see')
      || seeResource(grants, 'mileage')
      || seeResource(grants, 'products')
      || seeResource(grants, 'economyProjectExpenses')
      || readResource(grants, 'economySettings');
  }
  if (id === 'selskapsinnstillinger') {
    return readResource(grants, 'companyProfile') || readResource(grants, 'accessControl');
  }
  const resource = NAV_RESOURCE[id] || COMPANY_TAB_RESOURCE[id];
  if (!resource) return true;
  if (resource === 'accessControl' || resource === 'companyProfile'
    || resource === 'absenceSettings' || resource === 'economySettings') {
    return readResource(grants, resource);
  }
  return seeResource(grants, resource);
}

function filterCompanyNavItem(item, grants) {
  const rawChildren = item.children || [];
  const children = rawChildren
    .map((child) => filterCompanyNavItem(child, grants))
    .filter(Boolean);
  const self = navItemAllowed(item.id, grants);
  if (!self && children.length === 0) return null;
  if (!self) return null;
  if (!item.children) return item;
  const next = { ...item, children };
  const currentSub = item.action?.subView;
  const currentTab = item.action?.tab;
  const childStillThere = children.some((child) => (
    child.action?.tab === currentTab && child.action?.subView === currentSub
  ));
  const first = children[0];
  if (currentSub && first && !childStillThere) {
    next.action = {
      ...item.action,
      tab: first.action?.tab || item.action.tab,
      subView: first.action?.subView,
    };
  }
  return next;
}

export function filterCompanyNav(items, grants) {
  if (!grants) return items || [];
  return (items || []).map((item) => filterCompanyNavItem(item, grants)).filter(Boolean);
}

export function loadingGrants() {
  return { ...blankGrants(), companyPublic: 'read' };
}

/**
 * Hvem som kan bytte bruker.
 * Ingen: funksjonen er av.
 * companySettings: bare se hva den valgte brukeren ser av bedriftsinnstillinger.
 * all: se alle moduler og applikasjoner slik brukeren ser dem.
 * Administrator og øverste leder har all som standard. Lavere nivå kan få see eller read.
 */
export function viewAsCapability(grants, { bypass = false } = {}) {
  if (bypass) return 'all';
  const rank = rankValue(grants?.viewAs);
  if (rank >= rankValue('read')) return 'all';
  if (rank >= rankValue('see')) return 'companySettings';
  return 'none';
}

export function effectiveViewAsScope(capability, lens) {
  if (capability !== 'all' && capability !== 'companySettings') return 'none';
  if (capability === 'companySettings') return 'companySettings';
  return lens === 'companySettings' ? 'companySettings' : 'all';
}

export function resourcesInViewAsScope(scope) {
  if (scope === 'companySettings') return COMPANY_SETTINGS_RESOURCES;
  if (scope === 'all') return RESOURCE_IDS.filter((id) => id !== 'viewAs');
  return [];
}

export function grantsForViewAs(actorGrants, targetGrants, scope) {
  const actor = { ...(actorGrants || standardGrants('administrator')) };
  if ((scope !== 'companySettings' && scope !== 'all') || !targetGrants) return actor;
  const next = { ...actor };
  for (const id of resourcesInViewAsScope(scope)) {
    next[id] = ACCESS_RANKS.includes(targetGrants[id]) ? targetGrants[id] : 'none';
  }
  next.viewAs = ACCESS_RANKS.includes(actor.viewAs) ? actor.viewAs : 'none';
  return next;
}

export function resolveViewAsAccess({ actor, targetEmployee, policy, lens = 'all' } = {}) {
  const bypass = !!actor?.bypass;
  const capability = viewAsCapability(actor?.grants, { bypass });
  const alive = !!targetEmployee && employmentStatus(targetEmployee) !== 'deleted';
  const scope = alive ? effectiveViewAsScope(capability, lens) : 'none';
  if (scope === 'none') {
    return {
      active: false,
      capability,
      scope: 'none',
      grants: bypass ? null : (actor?.grants || loadingGrants()),
      employee: null,
    };
  }
  const targetGrants = grantsForEmployee(policy, targetEmployee);
  const actorGrants = bypass ? standardGrants('administrator') : actor.grants;
  return {
    active: true,
    capability,
    scope,
    grants: grantsForViewAs(actorGrants, targetGrants, scope),
    employee: targetEmployee,
  };
}

export function viewAsLocks(preview, resource) {
  return !!preview?.active && resourcesInViewAsScope(preview.scope).includes(resource);
}

/**
 * Synlighet i forhåndsvisning er skjæringspunktet av innlogget bruker og valgt bruker.
 * Skriving og sletting er av, så visningen ikke opptrer som den andre.
 * Områder utenfor valgt omfang følger den innloggede brukeren.
 */
export function viewAsAllows({ preview, actor, bypass = false, resource, action } = {}) {
  if (!preview?.active) return bypass ? true : allowsEffective(actor?.grants, resource, action);
  const actorOk = bypass ? true : allowsEffective(actor?.grants, resource, action);
  if (!viewAsLocks(preview, resource)) return actorOk;
  if (action === 'write' || action === 'delete') return false;
  return actorOk && allowsEffective(preview.grants, resource, action);
}
