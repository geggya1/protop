/**
 * Moduler bedriften abonnerer på.
 * Dette ligger over tilgangsstyringen: en modul som er slått av, er av for alle,
 * uansett nivå. Bare administrator kan slå moduler av og på.
 *
 * Lagres på selskapet som `company.modules = { disabled: [...] }`.
 * Alt er aktivt til administrator slår noe av, så eldre bedrifter mister ingenting.
 */

/**
 * Moduler som kan slås av og på. Selskapsinnstillinger, Tilgangsstyring og
 * Modulinnstillinger er ikke med, så administrator ikke låser seg ute. `navIds` er menypunktene i companyNavItems.
 * `routes` er [fane, undersider]. Undersider null = hele fanen.
 */
export const COMPANY_MODULES = [
  {
    id: 'selskap',
    groupId: 'company-org',
    label: 'Selskap',
    icon: 'business',
    hint: 'Virksomhetsprofil med offentlig bedriftsinfo.',
    navIds: ['selskap'],
    routes: [['selskap', [null]]],
  },
  {
    id: 'underenheter',
    groupId: 'company-org',
    label: 'Underenheter',
    icon: 'git-network',
    hint: 'Underenheter og avdelinger.',
    navIds: ['underenheter'],
    routes: [['selskap', ['underenheter']], ['underenheter', null]],
  },
  {
    id: 'ansatte',
    groupId: 'company-people',
    label: 'Ansatte',
    icon: 'id-card',
    hint: 'Ansattregister og egen profil.',
    navIds: ['ansatte'],
    routes: [['ansatte', null]],
  },
  {
    id: 'hr',
    groupId: 'company-people',
    label: 'HR',
    icon: 'people-circle',
    hint: 'Personell, avtaler, lønn, oppfølging og rekruttering.',
    navIds: ['hr'],
    routes: [['hr', null]],
  },
  {
    id: 'fravaer',
    groupId: 'company-people',
    label: 'Fravær',
    icon: 'sunny',
    hint: 'Fraværsoversikt, rapport, planlagt fravær og fraværstyper.',
    navIds: ['fravaer'],
    routes: [
      ['arbeid', ['fravaer', 'fravaersrapport', 'planlagt', 'fravaer-innstillinger']],
      ['selskap', ['fravaerstyper', 'fridager']],
    ],
  },
  {
    id: 'arbeid',
    groupId: 'company-people',
    label: 'Timer / arbeid per ansatt',
    icon: 'time',
    hint: 'Timeliste, timerapport, timesaldo og godkjenninger.',
    navIds: ['arbeid'],
    routes: [['arbeid', ['timeliste', 'timerapport', 'timesaldo', 'godkjenning', null]]],
  },
  {
    id: 'kunder',
    groupId: 'company-customers',
    label: 'Kunder',
    icon: 'people',
    hint: 'Kunderegister med kontakter og historikk.',
    navIds: ['kunder'],
    routes: [['kunder', null]],
  },
  {
    id: 'anbud',
    groupId: 'company-tenders',
    label: 'Anbud',
    icon: 'megaphone',
    hint: 'Anbudsvarsling, forespørsler, vurdering og tilbud.',
    navIds: ['anbud'],
    routes: [['anbud', null]],
  },
  {
    id: 'kontrakt',
    groupId: 'company-customers',
    label: 'Kontrakt / avtale',
    icon: 'ribbon',
    hint: 'Kontrakter og avtaler med kunder.',
    navIds: ['kontrakt'],
    routes: [['kontrakt', null]],
  },
  {
    id: 'prosjekt',
    groupId: 'company-customers',
    label: 'Prosjekt',
    icon: 'business',
    hint: 'Prosjekter, skjema og sjekklister.',
    navIds: ['projects'],
    routes: [['projects', null]],
  },
  {
    id: 'produktivitet',
    groupId: 'company-productivity',
    label: 'Produktivitet',
    icon: 'stats-chart',
    hint: 'Produktivitet per ansatt og prosjekt, og prosjektfremdrift.',
    navIds: ['produktivitet', 'fremdrift'],
    routes: [['arbeid', ['produktivitet', 'fremdrift']]],
  },
  {
    id: 'inntjening',
    groupId: 'company-productivity',
    label: 'Inntjening',
    icon: 'analytics',
    hint: 'Inntjening med kunde- og avtalesummer.',
    navIds: ['okonomi-inntjening'],
    routes: [['okonomi', ['inntjening', 'kunder', 'avtaler']]],
  },
  {
    id: 'produkt',
    groupId: 'company-resources',
    label: 'Produkt',
    icon: 'cube',
    hint: 'Produktsalg og produktkatalog.',
    navIds: ['produkt'],
    routes: [['arbeid', ['salg']], ['okonomi', ['produkter']]],
  },
  {
    id: 'utstyr',
    groupId: 'company-resources',
    label: 'Utstyr',
    icon: 'file-tray-full',
    hint: 'Utstyrsregister og utstyrskalender.',
    navIds: ['utstyr'],
    routes: [['utstyr', null]],
  },
  {
    id: 'kjorebok',
    groupId: 'company-resources',
    label: 'Kjørebok',
    icon: 'car',
    hint: 'Kjøring i tjeneste med adresser og godtgjørelse.',
    navIds: ['kjorebok'],
    routes: [['okonomi', ['kjorebok']]],
  },
  {
    id: 'okonomi',
    groupId: 'company-finance',
    label: 'Økonomi og fakturering',
    icon: 'wallet',
    hint: 'Faktura, fakturagrunnlag, utlegg, indeksregulering og kontoplan.',
    navIds: ['okonomi'],
    routes: [
      ['okonomi', ['oversikt', 'faktura', 'fakturagrunnlag', 'utlegg', 'indeks', 'indekser', 'innstillinger', null]],
      ['arbeid', ['utlegg']],
      ['selskap', ['kontoplan', 'regnskapskontoer']],
    ],
  },
  {
    id: 'iso',
    groupId: 'company-quality',
    label: 'ISO / K-HMS',
    icon: 'shield-checkmark',
    hint: 'Ledelsessystem for kvalitet, miljø og HMS.',
    navIds: ['iso'],
    routes: [['iso', null]],
  },
];

export const COMPANY_MODULE_IDS = COMPANY_MODULES.map((row) => row.id);

export function companyModuleById(id) {
  return COMPANY_MODULES.find((row) => row.id === id) || null;
}

export function normalizeCompanyModules(raw) {
  const list = Array.isArray(raw?.disabled) ? raw.disabled : [];
  return { disabled: COMPANY_MODULE_IDS.filter((id) => list.includes(id)) };
}

export function isCompanyModuleActive(state, id) {
  if (!companyModuleById(id)) return true;
  return !normalizeCompanyModules(state).disabled.includes(id);
}

export function setCompanyModuleActive(state, id, on) {
  const disabled = normalizeCompanyModules(state).disabled.filter((row) => row !== id);
  if (!on && companyModuleById(id)) disabled.push(id);
  return normalizeCompanyModules({ disabled });
}

export function activeCompanyModuleCount(state) {
  return COMPANY_MODULE_IDS.filter((id) => isCompanyModuleActive(state, id)).length;
}

/** Modulen en meny-id hører til, eller null for innstillingssidene. */
export function companyModuleForNav(navId) {
  return COMPANY_MODULES.find((row) => row.navIds.includes(navId)) || null;
}

/** Modulen en fane og underside hører til, eller null for innstillingssidene. */
export function companyModuleForRoute(tab, subView = null) {
  const sub = subView || null;
  return COMPANY_MODULES.find((row) => row.routes.some(([routeTab, subs]) => (
    routeTab === tab && (subs === null || subs.includes(sub))
  ))) || null;
}

/** Deaktivert modul for ruten, eller null når ruten er åpen. */
export function lockedCompanyModule(state, tab, subView = null) {
  const row = companyModuleForRoute(tab, subView);
  if (!row) return null;
  return isCompanyModuleActive(state, row.id) ? null : row;
}

function lockItem(item, note) {
  const next = { ...item, locked: true, lockedNote: note };
  if (item.children) next.children = item.children.map((child) => lockItem(child, note));
  return next;
}

/**
 * Menypunkt for deaktiverte moduler blir stående, men låst.
 * Undersider låses også, så Økonomi-sidene som løftes opp i hamburgermenyen
 * ser like ut som modulen de hører til.
 */
export function lockCompanyNav(items, state, note = 'Ikke aktivert') {
  return (items || []).map((item) => {
    const row = companyModuleForNav(item.id);
    if (row && !isCompanyModuleActive(state, row.id)) return lockItem(item, note);
    return item;
  });
}

/** Kort linje under låste menypunkter. */
export function moduleLockedLabel(adminNames = []) {
  const names = (adminNames || []).filter(Boolean);
  if (!names.length) return 'Ikke aktivert · kontakt administrator';
  return `Ikke aktivert · kontakt ${names.slice(0, 2).join(' eller ')}`;
}

/** Kontaktlinje på låst side. */
export function moduleContactNote(adminNames = []) {
  const names = (adminNames || []).filter(Boolean);
  if (!names.length) return 'Kontakt administrator for å aktivere modulen.';
  if (names.length === 1) return `Kontakt administrator ${names[0]} for å aktivere modulen.`;
  const head = names.slice(0, -1).join(', ');
  return `Kontakt administrator ${head} eller ${names[names.length - 1]} for å aktivere modulen.`;
}
