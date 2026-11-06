import { applyChildAppRestrictions, filterChildDashboardApps, isChildAppAllowed } from '../utils/childApps.js';
import {
  applyGrandparentAppRestrictions,
} from '../utils/grandparentAccess.js';
import { childScheduleNavParams, lekserNavParams, klassenNavParams } from '../utils/childNav.js';
import { groupChildAppItems } from './childAppGroups.js';
import { groupParentAppItems } from './parentAppGroups.js';
import { applyProtopShellApps, applyProtopShellSections } from './protopShell.js';
import { isOrganizationType } from '../utils/groupTypes.js';
import { companyTabAllowed, filterCompanyNav } from '../access/companyAccess.js';
import { lockCompanyNav } from '../access/companyModules.js';
import { normalizeSubUnits } from '../project/companyUnits.js';
import { PRICING_VISIBLE } from '../utils/billingMethods.js';

/**
 * Undermeny når Anbud er valgt. Nummereringen følger anskaffelsesløpet
 * frem til tilbudet. Når tilbudsarbeidet er ferdig, er neste ledd
 * Kontrakter i bedriftsmenyen, ikke et fjerde steg under Anbud.
 */
export const ANBUD_MENU = [
  { id: 'varsling', icon: 'notifications', label: '1.1 Anbudsvarsling' },
  { id: 'foresporsel', icon: 'mail-open', label: '1.2 Anbudsforespørsel' },
  { id: 'vurdering', icon: 'options', label: '2. Vurdering av aktuelle' },
  { id: 'tilbud', icon: 'document-text', label: '3. Tilbud' },
];

/** Prosess-steg i anbudsflaten. Innstillinger ligger utenfor nummereringen. */
export const ANBUD_PROCESS_IDS = ANBUD_MENU.map((item) => item.id);

export const ANBUD_SUBVIEW_IDS = [...ANBUD_PROCESS_IDS, 'innstillinger'];

export function defaultAnbudSubView(subView) {
  return ANBUD_SUBVIEW_IDS.includes(subView) ? subView : 'varsling';
}

export function anbudMenuTitle(subView) {
  if (subView === 'pipeline') return '3. Tilbud';
  if (subView === 'innstillinger') return 'Innstillinger';
  const row = ANBUD_MENU.find((item) => item.id === subView);
  return row?.label || 'Anbud';
}

/**
 * Moduler som hører til bedriften. Nye bedriftsmoduler legges her,
 * ikke blant de personlige punktene i Personlig.
 * Anbud har egen undermeny. Kunder og Kontrakter er fulle registre
 * i bedriftsmenyen; under Økonomi finnes tilsvarende punkter med økonomisk utsnitt.
 * Ansatte er et eget register: ansettelsen følger selskapet, CV-en følger personen.
 * Hamburgermeny og desktop-rail viser punktene i COMPANY_DRAWER_GROUPS.
 * Denne listen er fortsatt kilden for ruter, ikoner og tilgang.
 */
export function selskapMenuTitle(subView) {
  if (subView === 'underenheter') return 'Underenheter';
  if (subView === 'moduler') return 'Modulinnstillinger';
  if (subView === 'tilgang') return 'Tilgangsstyring';
  if (subView === 'tilknyttede') return 'Tilknyttede selskaper';
  if (subView === 'ai') return 'AI-abonnement';
  if (subView === 'innstillinger') return 'Bedriftsinnstillinger';
  if (subView === 'fravaerstyper' || subView === 'fridager' || subView === 'sykefravaer') return 'Fraværsinnstillinger';
  if (subView === 'kontoplan' || subView === 'regnskapskontoer') return 'Økonomiinnstillinger';
  // «Bedrift» i alt brukeren ser; «selskap» bare i juridisk sammenheng (UX-10).
  return 'Bedriften';
}

/**
 * Undermeny når Arbeid er valgt.
 * Timeliste er daglig føring. Timerapport er oversikt, import og organisering.
 * Samme timeliste ligger også under Personlig, låst til innlogget bruker.
 * Fravær og produktsalg ligger i egne menykategorier. Utlegg ligger under Økonomi;
 * arbeid/utlegg (den gamle Prosjektutlegg-siden) sender videre dit.
 * Produktivitet er eget hovedpunkt under Bedrift (samme rute: arbeid/produktivitet).
 * Prosjektfremdrift ligger ved siden av (arbeid/fremdrift).
 */
export const ARBEID_MENU = [
  { id: 'timeliste', icon: 'calendar', label: 'Timeliste' },
  { id: 'timerapport', icon: 'list', label: 'Timerapport' },
  { id: 'timesaldo', icon: 'hourglass', label: 'Timesaldo' },
  { id: 'godkjenning', icon: 'checkmark-done', label: 'Godkjenninger' },
];

/** Undersider som fortsatt åpnes via Arbeid-fanen, også når menyen ligger annet sted. */
export const ARBEID_ROUTE_IDS = [
  ...ARBEID_MENU.map((item) => item.id),
  'produktivitet',
  'fremdrift',
  'fravaer',
  'fravaersrapport',
  'planlagt',
  'fravaer-innstillinger',
  'utlegg',
  'salg',
];

export const ARBEID_SUBVIEW_IDS = ARBEID_ROUTE_IDS;

export function defaultArbeidSubView(subView) {
  return ARBEID_SUBVIEW_IDS.includes(subView) ? subView : 'timeliste';
}

export function arbeidMenuTitle(subView) {
  if (subView === 'fravaer') return 'Fraværsoversikt';
  if (subView === 'fravaersrapport') return 'Fraværsrapport';
  if (subView === 'planlagt') return 'Planlagt fravær';
  if (subView === 'fravaer-innstillinger') return 'Fraværsinnstillinger';
  if (subView === 'produktivitet') return 'Produktivitet';
  if (subView === 'fremdrift') return 'Prosjektfremdrift';
  // Den gamle adressen til Prosjektutlegg sender videre til Utlegg (UX-17).
  if (subView === 'utlegg') return 'Utlegg';
  if (subView === 'salg') return 'Produktsalg';
  const row = ARBEID_MENU.find((item) => item.id === subView);
  return row?.label || 'Timer';
}

export const FRAVAER_MENU = [
  { id: 'fravaer', icon: 'sunny', label: 'Fraværsoversikt' },
  { id: 'fravaersrapport', icon: 'bar-chart', label: 'Fraværsrapport' },
  { id: 'planlagt', icon: 'calendar-outline', label: 'Planlagt fravær' },
  {
    id: 'innstillinger',
    icon: 'settings-outline',
    label: 'Innstillinger',
    tab: 'arbeid',
    subView: 'fravaer-innstillinger',
  },
];

export const PRODUKT_MENU = [
  { id: 'salg', icon: 'cube', label: 'Produktsalg', tab: 'arbeid' },
  { id: 'produkter', icon: 'pricetag', label: 'Produkt', tab: 'okonomi' },
];

/**
 * Sider under Økonomi og fakturering.
 * Inntjening (med kunde-, prosjekt- og avtalesummer) ligger under Produktivitet og
 * inntjening i bedriftsmenyen. Siden åpnes fortsatt via økonomi-fanen.
 * Fulle registre ligger som egne punkter (Kunder, Kontrakter) i bedriftsmenyen.
 * I hamburgermeny og desktop-rail løftes sidene rett under gruppen, så
 * «Økonomi» ikke blir et ekstra nivå mellom gruppen og sidene.
 * Timerapport ligger under Arbeid. Produktkatalog ligger under Produkt.
 * Kjørebok er et eget punkt i bedriftsmenyen. Siden åpnes fortsatt via økonomi-fanen.
 */
export const OKONOMI_MENU = [
  { id: 'oversikt', icon: 'home', label: 'Oversikt' },
  { id: 'faktura', icon: 'document-text', label: 'Faktura' },
  { id: 'fakturagrunnlag', icon: 'receipt', label: 'Til fakturering' },
  // Prosjektutlegg og interne utlegg på én side, med filteret Prosjekt / Internt / Alle (UX-17).
  { id: 'utlegg', icon: 'card', label: 'Utlegg' },
  { id: 'indeks', icon: 'trending-up', label: 'Indeksregulering' },
  { id: 'indekser', icon: 'stats-chart', label: 'Indekser' },
  { id: 'innstillinger', icon: 'settings-outline', label: 'Innstillinger' },
];

/** Undersider som åpnes via Økonomi-fanen, også når menyen ligger annet sted. */
export const OKONOMI_ROUTE_IDS = [
  ...OKONOMI_MENU
    .filter((item) => !item.tab || item.tab === 'okonomi')
    .map((item) => item.id),
  'inntjening',
  'kunder',
  'avtaler',
  'produkter',
  'kjorebok',
];

export const OKONOMI_SUBVIEW_IDS = OKONOMI_ROUTE_IDS;

export function defaultOkonomiSubView(subView) {
  return OKONOMI_SUBVIEW_IDS.includes(subView) ? subView : 'oversikt';
}

export function okonomiMenuTitle(subView) {
  if (subView === 'indeks') return 'Indeksregulering';
  if (subView === 'indekser') return 'Indekser';
  // Kunder og Avtaler er faner i Inntjening (UX-17).
  if (subView === 'kunder' || subView === 'avtaler') return 'Inntjening';
  if (subView === 'faktura') return 'Faktura';
  if (subView === 'fakturagrunnlag') return 'Til fakturering';
  if (subView === 'utlegg') return 'Utlegg';
  if (subView === 'kjorebok') return 'Kjørebok';
  if (subView === 'produkter') return 'Produkt';
  if (subView === 'innstillinger') return 'Økonomiinnstillinger';
  if (subView === 'inntjening') return 'Inntjening';
  return 'Økonomi';
}

/** Inntjening er eget hovedpunkt under Produktivitet og inntjening (rute: okonomi/inntjening). */
export const INNTJENING_NAV = { id: 'inntjening', icon: 'analytics', label: 'Inntjening' };

/**
 * Undermeny når HR er valgt.
 * Dedikert for leder/HR — ikke den ansattes egen Min side.
 * Sidene er ordnet i deler (group), som ISO: modulmenyen viser delene i første rad og sidene
 * i delen under (moduleTabs.js). Rekkefølgen her er rekkefølgen i menyen.
 */
export const HR_GROUPS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'personell', label: 'Personell' },
  { id: 'oppfolging', label: 'Oppfølging' },
  { id: 'rekruttering', label: 'Rekruttering' },
  { id: 'rutiner', label: 'Rutiner' },
];

export const HR_MENU = [
  { id: 'oversikt', icon: 'home', label: 'Oversikt', group: 'oversikt' },
  // Personell er kontrollsiden for egne ansatte: avtale, lønn, lovpålagt og oppfølging i én liste.
  // Ansattregisteret er egen modul (Ansatte) ved siden av HR, ikke en side her.
  { id: 'personell', icon: 'people', label: 'Personell', group: 'personell' },
  { id: 'oppfolging', icon: 'flag', label: 'Samtaler og saker', group: 'oppfolging' },
  { id: 'sykefravaer', icon: 'medkit', label: 'Sykefravær', group: 'oppfolging' },
  { id: 'undersokelse', icon: 'stats-chart', label: 'Medarbeiderundersøkelse', group: 'oppfolging' },
  { id: 'rekruttering', icon: 'megaphone', label: 'Rekruttering', group: 'rekruttering' },
  { id: 'arshjul', icon: 'calendar', label: 'Årshjul', group: 'rutiner' },
  { id: 'handbok', icon: 'book', label: 'Personalhåndbok', group: 'rutiner' },
  { id: 'skjema', icon: 'clipboard', label: 'Skjemaer', group: 'rutiner' },
];

export const HR_SUBVIEW_IDS = HR_MENU.map((item) => item.id);

// Avtaler, Lønn og Lovpålagt var egne sider. Nå er de kolonner og deler av Personell,
// så gamle lenker (årshjul, hjelp, oversikten) lander der.
export const HR_SUBVIEW_ALIASES = { avtaler: 'personell', lonn: 'personell', compliance: 'personell' };

export function defaultHrSubView(subView) {
  if (HR_SUBVIEW_ALIASES[subView]) return HR_SUBVIEW_ALIASES[subView];
  return HR_SUBVIEW_IDS.includes(subView) ? subView : 'oversikt';
}

export function hrMenuTitle(subView) {
  const row = HR_MENU.find((item) => item.id === subView);
  return row?.label || 'HR';
}

/** Ansatte: registeret over egne ansatte og personsidene. Egen modul, likestilt med HR. */
function ansatteNavItem() {
  return {
    id: 'ansatte',
    icon: 'id-card',
    label: 'Ansatte',
    action: { type: 'tab', tab: 'ansatte' },
  };
}

function hrNavItem() {
  return {
    id: 'hr',
    icon: 'people-circle',
    label: 'HR',
    action: { type: 'tab', tab: 'hr', subView: 'oversikt' },
    children: HR_MENU.map((item) => ({
      id: `hr-${item.id}`,
      icon: item.icon,
      label: item.label,
      action: { type: 'tab', tab: 'hr', subView: item.id },
    })),
  };
}

/**
 * Sider under ISO / K-HMS (ett integrert ledelsessystem for 9001, 14001 og 45001).
 * Gruppert som Styring, Operativt og Evaluering i menyen.
 */
export const ISO_MENU = [
  { id: 'oversikt', icon: 'speedometer-outline', label: 'Oversikt', group: 'Styring' },
  { id: 'prosesser', icon: 'git-network-outline', label: 'Prosesser', group: 'Styring' },
  { id: 'dokumenter', icon: 'document-text-outline', label: 'Dokumenter', group: 'Styring' },
  { id: 'skjema', icon: 'clipboard-outline', label: 'Skjemaer', group: 'Styring' },
  { id: 'krav', icon: 'list-outline', label: 'ISO-kravmatrise', group: 'Styring' },
  { id: 'lovkrav', icon: 'library-outline', label: 'Lovkrav og samsvar', group: 'Styring' },
  { id: 'kontekst', icon: 'compass-outline', label: 'Kontekst', group: 'Styring' },
  { id: 'organisasjon', icon: 'people-circle-outline', label: 'Organisasjon og roller', group: 'Styring' },
  { id: 'kommunikasjon', icon: 'megaphone-outline', label: 'Kommunikasjon', group: 'Styring' },
  { id: 'mal', icon: 'flag-outline', label: 'Mål og KPI', group: 'Styring' },
  { id: 'arshjul', icon: 'calendar-outline', label: 'Årshjul', group: 'Styring' },
  { id: 'avvik', icon: 'alert-circle-outline', label: 'Avvik og forbedring', group: 'Operativt' },
  { id: 'risiko', icon: 'warning-outline', label: 'Risiko', group: 'Operativt' },
  { id: 'miljo', icon: 'leaf-outline', label: 'Miljø', group: 'Operativt' },
  { id: 'hms', icon: 'medkit-outline', label: 'HMS', group: 'Operativt' },
  { id: 'prosjekt', icon: 'briefcase-outline', label: 'Prosjektkvalitet', group: 'Operativt' },
  { id: 'kompetanse', icon: 'school-outline', label: 'Kompetanse', group: 'Operativt' },
  { id: 'leverandorer', icon: 'cube-outline', label: 'Leverandører', group: 'Operativt' },
  { id: 'beredskap', icon: 'flash-outline', label: 'Beredskap', group: 'Operativt' },
  { id: 'revisjon', icon: 'search-outline', label: 'Internrevisjon', group: 'Evaluering' },
  { id: 'ledelse', icon: 'people-outline', label: 'Ledelsens gjennomgang', group: 'Evaluering' },
  { id: 'sertifisering', icon: 'ribbon-outline', label: 'Sertifisering', group: 'Evaluering' },
  { id: 'innstillinger', icon: 'settings-outline', label: 'Innstillinger', group: 'Innstillinger' },
];

export const ISO_SUBVIEW_IDS = ISO_MENU.map((item) => item.id);

export function defaultIsoSubView(subView) {
  return ISO_SUBVIEW_IDS.includes(subView) ? subView : 'oversikt';
}

export function isoMenuTitle(subView) {
  const row = ISO_MENU.find((item) => item.id === subView);
  return row && row.id !== 'oversikt' ? row.label : 'ISO / K-HMS';
}

/**
 * Møter: liste over møter, oppfølgingspunkter på tvers og bedriftens møtemaler.
 * Et åpent møte er en tilstand i siden, ikke en egen underside.
 */
/**
 * Innleie: innleide fra bemanningsforetak og eksterne. Egen modul, ikke HR, fordi de har en
 * annen arbeidsgiver. Her står det dere som innleier har ansvaret for (src/hr/hired.js).
 * Står i egen menygruppe, «Innleie og eksterne», så skillet mot egne ansatte er tydelig.
 * Timer er samme timeliste som under Ansatte, med bryter mellom eksterne og interne.
 */
export const INNLEIE_MENU = [
  { id: 'oversikt', icon: 'grid-outline', label: 'Oversikt' },
  { id: 'personell', icon: 'people-outline', label: 'Personell' },
  { id: 'leverandorer', icon: 'business-outline', label: 'Leverandørkontroll' },
  { id: 'timer', icon: 'time-outline', label: 'Timer' },
  { id: 'oppfolging', icon: 'happy-outline', label: 'Oppfølging' },
];

export const INNLEIE_SUBVIEW_IDS = INNLEIE_MENU.map((item) => item.id);

export function defaultInnleieSubView(subView) {
  // Den gamle HR-siden (hr/innleid) og lenker til «innleid» går til personellisten.
  if (subView === 'innleid') return 'personell';
  return INNLEIE_SUBVIEW_IDS.includes(subView) ? subView : 'oversikt';
}

export function innleieMenuTitle(subView) {
  const row = INNLEIE_MENU.find((item) => item.id === subView);
  return row && row.id !== 'oversikt' ? `Innleie · ${row.label}` : 'Innleie';
}

function innleieNavItem() {
  return {
    id: 'innleie',
    icon: 'swap-horizontal',
    label: 'Innleie',
    action: { type: 'tab', tab: 'innleie', subView: 'oversikt' },
    children: INNLEIE_MENU.map((item) => ({
      id: `innleie-${item.id}`,
      icon: item.icon,
      label: item.label,
      action: { type: 'tab', tab: 'innleie', subView: item.id },
    })),
  };
}

export const MOTER_MENU = [
  { id: 'oversikt', icon: 'calendar-outline', label: 'Møter' },
  { id: 'oppfolging', icon: 'checkbox-outline', label: 'Oppfølging' },
  { id: 'maler', icon: 'albums-outline', label: 'Møtemaler' },
];

export const MOTER_SUBVIEW_IDS = MOTER_MENU.map((item) => item.id);

export function defaultMoterSubView(subView) {
  return MOTER_SUBVIEW_IDS.includes(subView) ? subView : 'oversikt';
}

export function moterMenuTitle(subView) {
  const row = MOTER_MENU.find((item) => item.id === subView);
  return row && row.id !== 'oversikt' ? `Møter · ${row.label}` : 'Møter';
}

function moterNavItem() {
  return {
    id: 'moter',
    icon: 'people-circle',
    label: 'Møter',
    action: { type: 'tab', tab: 'moter', subView: 'oversikt' },
    children: MOTER_MENU.map((item) => ({
      id: `moter-${item.id}`,
      icon: item.icon,
      label: item.label,
      action: { type: 'tab', tab: 'moter', subView: item.id },
    })),
  };
}

function isoNavItem() {
  return {
    id: 'iso',
    icon: 'shield-checkmark',
    label: 'ISO / K-HMS',
    action: { type: 'tab', tab: 'iso', subView: 'oversikt' },
    children: ISO_MENU.map((item) => ({
      id: `iso-${item.id}`,
      icon: item.icon,
      label: item.label,
      action: { type: 'tab', tab: 'iso', subView: item.id },
    })),
  };
}

function okonomiNavChild(item) {
  const tab = item.tab || 'okonomi';
  const subView = item.subView || item.id;
  const child = {
    id: `okonomi-${item.id}`,
    icon: item.icon,
    label: item.label,
    action: { type: 'tab', tab, subView },
  };
  if (item.id === 'inntjening') {
    child.activeSubViews = ['inntjening', 'kunder', 'avtaler'];
  }
  return child;
}

function arbeidNavItem() {
  return {
    id: 'arbeid',
    icon: 'time',
    label: 'Timer',
    action: { type: 'tab', tab: 'arbeid', subView: 'timeliste' },
    children: ARBEID_MENU.map((item) => ({
      id: `arbeid-${item.id}`,
      icon: item.icon,
      label: item.label,
      action: { type: 'tab', tab: 'arbeid', subView: item.id },
    })),
  };
}

function fravaerNavItem() {
  return {
    id: 'fravaer',
    icon: 'sunny',
    label: 'Fravær',
    action: { type: 'tab', tab: 'arbeid', subView: 'fravaer' },
    children: FRAVAER_MENU.map((item) => ({
      id: `fravaer-${item.id}`,
      icon: item.icon,
      label: item.label,
      action: {
        type: 'tab',
        tab: item.tab || 'arbeid',
        subView: item.subView || item.id,
      },
    })),
  };
}

/**
 * Ansatt: det hver ansatt har for seg selv i bedriften. Alt er låst til innlogget bruker.
 * Min side, Gjøremål, Fravær og Utlegg er egen personside (tab ansatte), med siden som subView.
 * Timeliste er den personlige timelisten.
 */
export const ANSATT_SELF_VIEWS = {
  'min-side': 'detail',
  'mine-gjoremal': 'todo',
  'mitt-fravaer': 'absence',
  'mine-utlegg': 'expenses',
};

export const ANSATT_MENU = [
  { id: 'ansatt-minside', icon: 'person-circle', label: 'Min side', action: { type: 'tab', tab: 'ansatte', subView: 'min-side' } },
  { id: 'ansatt-gjoremal', icon: 'checkbox-outline', label: 'Gjøremål', action: { type: 'tab', tab: 'ansatte', subView: 'mine-gjoremal' } },
  { id: 'ansatt-timeliste', icon: 'time', label: 'Timeliste', action: { type: 'tab', tab: 'timeliste' } },
  { id: 'ansatt-fravaer', icon: 'sunny', label: 'Fravær', action: { type: 'tab', tab: 'ansatte', subView: 'mitt-fravaer' } },
  { id: 'ansatt-utlegg', icon: 'card', label: 'Utlegg', action: { type: 'tab', tab: 'ansatte', subView: 'mine-utlegg' } },
];

export function ansattSelfView(subView) {
  return ANSATT_SELF_VIEWS[subView] || null;
}

export function ansatteMenuTitle(subView) {
  const row = ANSATT_MENU.find((item) => item.action.tab === 'ansatte' && item.action.subView === subView);
  return row?.label || 'Ansatte';
}

/** Synlig i bedriftsmenyen når selskapet har registrert underenheter/avdelinger. */
export function companyHasRegisteredUnits(company) {
  return normalizeSubUnits(company?.subUnits).length > 0;
}

/**
 * Bedriftsmeny. Underenheter ligger på samme nivå som Selskap, men bare når
 * det faktisk er registrert enheter på selskapsinnstillingene.
 */
export function companyNavItems({ includeUnderenheter = false } = {}) {
  const items = [
    {
      id: 'selskap',
      icon: 'business',
      label: 'Bedriften',
      action: { type: 'tab', tab: 'selskap' },
    },
  ];
  if (includeUnderenheter) {
    items.push({
      id: 'underenheter',
      icon: 'git-network',
      label: 'Underenheter',
      action: { type: 'tab', tab: 'selskap', subView: 'underenheter' },
    });
  }
  items.push(
    {
      id: 'selskapsinnstillinger',
      icon: 'settings-outline',
      label: 'Bedriftsinnstillinger',
      action: { type: 'tab', tab: 'selskap', subView: 'innstillinger' },
      activeSubViews: ['innstillinger', 'moduler', 'tilgang', 'tilknyttede', 'ai'],
      children: [
        {
          id: 'selskapsinnstillinger-moduler',
          icon: 'apps',
          label: 'Modulinnstillinger',
          action: { type: 'tab', tab: 'selskap', subView: 'moduler' },
        },
        {
          id: 'selskapsinnstillinger-tilgang',
          icon: 'key',
          label: 'Tilgangsstyring',
          action: { type: 'tab', tab: 'selskap', subView: 'tilgang' },
        },
        {
          id: 'selskapsinnstillinger-tilknyttede',
          icon: 'git-merge',
          label: 'Tilknyttede selskaper',
          action: { type: 'tab', tab: 'selskap', subView: 'tilknyttede' },
        },
        {
          id: 'selskapsinnstillinger-ai',
          icon: 'sparkles',
          label: 'AI-abonnement',
          action: { type: 'tab', tab: 'selskap', subView: 'ai' },
        },
      ],
    },
    ...ANSATT_MENU.map((item) => ({ ...item, action: { ...item.action } })),
    hrNavItem(),
    ansatteNavItem(),
    innleieNavItem(),
    fravaerNavItem(),
    arbeidNavItem(),
    {
      id: 'produktivitet',
      icon: 'stats-chart',
      label: 'Produktivitet',
      action: { type: 'tab', tab: 'arbeid', subView: 'produktivitet' },
    },
    {
      id: 'fremdrift',
      icon: 'reorder-four',
      label: 'Prosjektfremdrift',
      action: { type: 'tab', tab: 'arbeid', subView: 'fremdrift' },
    },
    okonomiNavChild(INNTJENING_NAV),
    { id: 'kunder', icon: 'people', label: 'Kunder', action: { type: 'tab', tab: 'kunder' } },
    {
      id: 'kundeundersokelse',
      icon: 'chatbox-ellipses',
      label: 'Kundeundersøkelse',
      action: { type: 'tab', tab: 'kunder', subView: 'undersokelse' },
    },
    {
      id: 'anbud',
      icon: 'megaphone',
      label: 'Anbud',
      action: { type: 'tab', tab: 'anbud', subView: 'varsling' },
      children: [
        ...ANBUD_MENU.map((item) => ({
          id: `anbud-${item.id}`,
          icon: item.icon,
          label: item.label,
          action: { type: 'tab', tab: 'anbud', subView: item.id },
        })),
        {
          id: 'anbud-innstillinger',
          icon: 'settings-outline',
          label: 'Innstillinger',
          action: { type: 'tab', tab: 'anbud', subView: 'innstillinger' },
        },
      ],
    },
    { id: 'kontrakt', icon: 'ribbon', label: 'Kontrakter', action: { type: 'tab', tab: 'kontrakt' } },
    { id: 'projects', icon: 'business', label: 'Prosjekt', action: { type: 'tab', tab: 'projects' } },
    moterNavItem(),
    {
      id: 'produkt',
      icon: 'cube',
      label: 'Produkt',
      action: { type: 'tab', tab: 'arbeid', subView: 'salg' },
      children: PRODUKT_MENU.map((item) => ({
        id: `produkt-${item.id}`,
        icon: item.icon,
        label: item.label,
        action: { type: 'tab', tab: item.tab, subView: item.id },
      })),
    },
    {
      id: 'utstyr',
      icon: 'file-tray-full',
      label: 'Utstyr',
      action: { type: 'tab', tab: 'utstyr' },
    },
    {
      id: 'kjorebok',
      icon: 'car',
      label: 'Kjørebok',
      action: { type: 'tab', tab: 'okonomi', subView: 'kjorebok' },
    },
    {
      id: 'okonomi',
      icon: 'wallet',
      label: 'Økonomi',
      action: { type: 'tab', tab: 'okonomi', subView: 'oversikt' },
      children: OKONOMI_MENU.map(okonomiNavChild),
    },
    isoNavItem(),
    // Skjema, sjekklister og avtalemaler for hele bedriften; ved ISO / K-HMS, ikke under Konto (UX-17).
    { id: 'skjema', icon: 'clipboard', label: 'Skjemabygger', action: { type: 'tab', tab: 'skjema' } },
  );
  return items;
}

/**
 * Bedriftsmenyen slik brukeren ser den: filtrert på tilgang, og med
 * deaktiverte moduler låst (synlige, men ikke klikkbare).
 */
export function companyMenuItems({
  includeUnderenheter = false,
  grants = null,
  modules = null,
  lockedNote = '',
} = {}) {
  const base = companyNavItems({ includeUnderenheter });
  const allowed = filterCompanyNav(base, grants);
  return lockCompanyNav(allowed, modules, lockedNote || undefined);
}

/**
 * Om Aktiverte moduler (Kalender, E-post, Oppgaver, Notat, Chat) vises inne i Bedriftsinnstillinger →
 * Modulinnstillinger i stedet for under Konto: i Bedrift, for den som kan åpne Modulinnstillinger.
 */
export function showsModulesInCompanySettings({ onCompany = false, companyGrants = null } = {}) {
  return !!onCompany && companyTabAllowed('selskap', 'moduler', companyGrants);
}

/** Mobilskuff og desktop-rail: rad med undermeny kan åpnes uten å velge raden. */
export function drawerHasSubmenuToggle(item) {
  return (item?.children || []).length > 0;
}

/**
 * Om undermenyen vises.
 * Et trykk på ekspanderen lagres i `overrides` og vinner over standarden.
 * Standard er åpen når raden eller en undermeny er valgt, og når raden er forceOpen.
 * Flere kategorier kan dele fane (f.eks. Arbeid / Fravær / Produkt), så vi
 * bruker aktiv undermeny — ikke bare fanen — for å unngå at alle åpnes samtidig.
 */
export function drawerSubmenuOpen(item, activeTab, overrides = {}, activeSubView = null) {
  if (!drawerHasSubmenuToggle(item)) return false;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, item.id)) {
    return !!overrides[item.id];
  }
  if (item.forceOpen) return true;
  return isNavItemActive(item, activeTab, activeSubView);
}

/**
 * Hovedgrupper i hamburgermeny og desktop-rail.
 * companyNavItems() er kilden for ruter, ikoner og tilgang.
 * Ikoner er Ionicons-navn (samme sett som øvrige menypunkter).
 * Punkter som ikke er nevnt i gruppene, legges etterpå og skal ikke skjules.
 * Menyen har to nivåer: gruppe → modul. Undersidene ligger i modulens vannrette meny (moduleTabsFor).
 */
export const COMPANY_DRAWER_GROUPS = [
  {
    // Det hver ansatt ser for seg selv. Står først, så vanlige ansatte har sitt øverst.
    id: 'company-me',
    label: 'Ansatt',
    icon: 'person',
    itemIds: ANSATT_MENU.map((item) => item.id),
  },
  {
    id: 'company-org',
    label: 'Bedrift og organisasjon',
    icon: 'business',
    itemIds: ['selskap', 'underenheter', 'selskapsinnstillinger'],
  },
  {
    id: 'company-people',
    label: 'Ansatte og arbeidstid',
    icon: 'people',
    // HR er samlesiden. Ansatte (registeret og personsidene) står ved siden av.
    itemIds: ['hr', 'ansatte', 'fravaer', 'arbeid'],
  },
  {
    // Innleide og eksterne har en annen arbeidsgiver. Egen gruppe, atskilt fra egne ansatte.
    id: 'company-hired',
    label: 'Innleie og eksterne',
    icon: 'swap-horizontal',
    itemIds: ['innleie'],
  },
  {
    id: 'company-quality',
    label: 'Kvalitet og styringssystem',
    icon: 'shield-checkmark',
    itemIds: ['iso', 'skjema'],
  },
  {
    id: 'company-productivity',
    label: 'Produktivitet og inntjening',
    icon: 'stats-chart',
    itemIds: ['produktivitet', 'fremdrift', 'okonomi-inntjening'],
  },
  {
    id: 'company-finance',
    label: 'Økonomi og fakturering',
    icon: 'wallet',
    itemIds: ['okonomi'],
  },
  {
    id: 'company-resources',
    label: 'Produkter og driftsressurser',
    icon: 'cube',
    itemIds: ['produkt', 'utstyr', 'kjorebok'],
  },
  {
    id: 'company-tenders',
    label: 'Anbud',
    icon: 'megaphone',
    itemIds: ['anbud'],
  },
  {
    id: 'company-customers',
    label: 'Kunder og oppdrag',
    icon: 'briefcase',
    itemIds: ['kunder', 'kundeundersokelse', 'kontrakt', 'projects'],
    processOrder: true,
    // Sidene har ingen undersider. De står som faner seg imellom, så sidene har samme meny som HR.
    tabs: true,
  },
  {
    id: 'company-meetings',
    label: 'Møter og referat',
    icon: 'people-circle',
    itemIds: ['moter'],
  },
];

/**
 * Modulen slik menyen viser den: uten undermeny. Undersidene beholdes som `pages`, så modulen
 * markeres aktiv på alle sine sider. Søketreff (forceOpen) beholder undermenyen, så søk finner sidene.
 */
function drawerModule(item) {
  if (!item?.children?.length || item.forceOpen) return item;
  // Bare én side tilgjengelig (f.eks. Utlegg for innleide): vis siden, ikke modulen.
  if (item.children.length === 1 && !item.children[0].children?.length) return item.children[0];
  const { children, ...rest } = item;
  return { ...rest, pages: children };
}

export function groupCompanyDrawerItems(items) {
  const pool = new Map();
  for (const item of items || []) {
    if (!item) continue;
    pool.set(item.id, item);
  }

  const used = new Set();
  const grouped = [];
  for (const def of COMPANY_DRAWER_GROUPS) {
    const children = [];
    for (const id of def.itemIds) {
      if (!pool.has(id) || used.has(id)) continue;
      used.add(id);
      children.push(drawerModule(pool.get(id)));
    }
    if (!children.length) continue;
    grouped.push({
      id: def.id,
      label: def.label,
      icon: def.icon,
      processOrder: !!def.processOrder,
      group: true,
      children,
    });
  }

  for (const [id, item] of pool) {
    if (!used.has(id)) grouped.push(drawerModule(item));
  }
  return grouped;
}

export function drawerGroupOpen(group, activeTab, overrides = {}, activeSubView = null) {
  if (!group?.group) return false;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, group.id)) {
    return !!overrides[group.id];
  }
  return (group.children || []).some((child) => isNavItemActive(child, activeTab, activeSubView));
}

/**
 * Trykk på en gruppe i menyen. Bare én gruppe står åpen om gangen: åpnes en, lukkes de andre
 * (også gruppen med aktiv side), så menyen ikke blir lang. Lukkes en åpen gruppe, står resten lukket.
 */
export function toggleDrawerGroup(overrides, group, groups, activeTab, activeSubView = null) {
  if (!group?.group) return overrides || {};
  if (drawerGroupOpen(group, activeTab, overrides, activeSubView)) {
    return { ...(overrides || {}), [group.id]: false };
  }
  const next = {};
  for (const item of groups || []) {
    if (item?.group && item.id !== group.id) next[item.id] = false;
  }
  next[group.id] = true;
  return next;
}

/** Etter navigering skal gruppen som inneholder aktiv side være utvidet igjen. */
export function releaseClosedActiveGroups(overrides, items, activeTab, activeSubView) {
  let changed = false;
  const next = { ...(overrides || {}) };
  for (const group of groupCompanyDrawerItems(items)) {
    if (!group.group) continue;
    const active = (group.children || []).some((child) => isNavItemActive(child, activeTab, activeSubView));
    if (active && next[group.id] === false) {
      delete next[group.id];
      changed = true;
    }
  }
  return changed ? next : (overrides || {});
}

/** Etter navigering skal modulen som inneholder aktiv side være utvidet igjen. */
export function releaseClosedActiveSubmenus(overrides, items, activeTab, activeSubView) {
  let changed = false;
  const next = { ...(overrides || {}) };
  const walk = (list) => {
    for (const item of list || []) {
      if (item.group) {
        walk(item.children);
        continue;
      }
      if (next[item.id] === false && isNavItemActive(item, activeTab, activeSubView)) {
        delete next[item.id];
        changed = true;
      }
      walk(item.children);
    }
  };
  walk(items);
  return changed ? next : (overrides || {});
}

function collectNavIds(item, ids) {
  ids.push(item.id);
  for (const child of item.children || []) collectNavIds(child, ids);
}

function companyAllowIds() {
  const ids = [];
  for (const item of companyNavItems({ includeUnderenheter: true })) collectNavIds(item, ids);
  return ids;
}

/**
 * Tablet-rail bruker id `friends` direkte. Venner ligger som Mer-underside,
 * samme vei som skuff og bunnmeny.
 */
export function normalizeShellSelection(id, subView = null) {
  if (id === 'friends') return { tab: 'more', subView: 'friends' };
  // Registeret lå før som HR › Ansatte. Gamle lenker går til modulen Ansatte.
  if (id === 'hr' && subView === 'ansatte') return { tab: 'ansatte', subView: null };
  return { tab: id, subView: subView || null };
}

export function isNavItemActive(item, activeTab, activeSubView) {
  const action = item?.action;
  if (!action || action.type !== 'tab') return false;
  const kids = item.children?.length ? item.children : (item.pages || []);
  if (kids.length && kids.some((child) => isNavItemActive(child, activeTab, activeSubView))) {
    return true;
  }
  if (action.tab !== activeTab) return false;
  if (item.activeSubViews?.length) {
    return item.activeSubViews.includes(activeSubView || null);
  }
  if (action.tab === 'more' || action.subView) {
    return (action.subView || null) === (activeSubView || null);
  }
  // Blad uten subView (f.eks. Selskap-profil) skal ikke markeres aktiv på undersider.
  return !activeSubView;
}

/**
 * Parent "Gjøremål" opens chore management for a child. Chores are child-only
 * in the shell (the chores tab redirects parents to Home), and ChoreSettings is
 * per-child, so we target the family's first active child — the same path the
 * chores/rewards screen uses. Returns null when there is no child to manage.
 */
export function parentChoresAction(familyId, firstKid) {
  if (!familyId || !firstKid) return null;
  return { type: 'nav', screen: 'ChoreSettings', params: { familyId, child: firstKid } };
}

/**
 * Full module catalog for shell drawer + Mer hub + child dashboard.
 * action: { type: 'tab', tab, subView? } | { type: 'nav', screen, params? } | { type: 'fn', id }
 *
 * asChild = true when viewing as child (own account or parent acting as child).
 * Parent-only modules are hidden in that case.
 */

export function buildShellModules({
  t,
  asChild,
  asParent,
  isSuperAdmin,
  familyId,
  family = null,
  canImport,
  hasKids,
  childForSchedule,
  aiEnabled = true,
  allowedApps = null,
  showChildRestrictions = false,
  firstKid = null,
  isGrandparent = false,
  grandparentModules = null,
  companyGrants = null,
  companyModules = null,
  companyModuleNote = '',
}) {
  const sections = [];

  const mainItems = [
    { id: 'home', icon: 'home', label: t('tabs.home'), action: { type: 'tab', tab: 'home' } },
    { id: 'chat', icon: 'chatbubbles', label: t('tabs.chat'), action: { type: 'tab', tab: 'chat' } },
  ];
  // Venner blant hurtigvalg i Personlig. ProTop viser modulen uten familiekobling.
  mainItems.push({
    id: 'friends', icon: 'people', label: t('apps.friends'),
    action: { type: 'tab', tab: 'more', subView: 'friends' },
  });
  mainItems.push(
    { id: 'plan', icon: 'calendar', label: t('tabs.plan'), action: { type: 'tab', tab: 'plan' } },
  );
  mainItems.push({
    id: 'mail', icon: 'mail', label: t('tabs.mail'),
    action: { type: 'tab', tab: 'mail' },
  });
  mainItems.push(
    { id: 'stars', icon: 'checkbox', label: t('tabs.tasks'), action: { type: 'tab', tab: 'stars' } },
  );
  // Barn: Gjøremål blant hurtigvalg i Personlig (ikke under Familien).
  if (asChild) {
    mainItems.push({
      id: 'chores', icon: 'star', label: t('tabs.chores'),
      action: { type: 'tab', tab: 'chores' },
    });
  }
  mainItems.push(
    { id: 'notes', icon: 'document-text', label: t('tabs.notes'), action: { type: 'tab', tab: 'notes' } },
  );
  // Egen timeliste under Personlig. I en bedrift ligger den under Bedrift › Ansatt i stedet.
  if (!asChild && !isOrganizationType(family?.type)) {
    mainItems.push({
      id: 'timeliste',
      icon: 'time',
      label: 'Timeliste',
      action: { type: 'tab', tab: 'timeliste' },
    });
  }

  sections.push({
    id: 'main',
    title: t('shell.main'),
    items: mainItems,
  });

  const tools = [];

  tools.push(
    { id: 'books', icon: 'library', label: t('tabs.books'), action: { type: 'tab', tab: 'more', subView: 'books' } },
  );

  if (asParent && !isGrandparent) {
    tools.push({
      id: 'matcoach', icon: 'nutrition', label: t('apps.matcoach'),
      action: { type: 'tab', tab: 'more', subView: 'matcoach' },
    });
    tools.push({
      id: 'shop', icon: 'cart', label: t('tabs.shop'),
      action: { type: 'tab', tab: 'more', subView: 'shop' },
    });
    tools.push({
      id: 'meals', icon: 'restaurant', label: t('apps.meals'),
      action: { type: 'tab', tab: 'more', subView: 'meals' },
    });
    tools.push({
      id: 'recipes', icon: 'book', label: t('apps.recipes'),
      action: { type: 'tab', tab: 'more', subView: 'recipes' },
    });
    tools.push({
      id: 'pantry', icon: 'cube', label: t('apps.pantry'),
      action: { type: 'tab', tab: 'more', subView: 'pantry' },
    });
  }

  tools.push({
    id: 'wishes', icon: 'gift', label: t('tabs.wishes'),
    action: { type: 'tab', tab: 'more', subView: 'wishes' },
  });

  if (familyId) {
    tools.push({
      id: 'games', icon: 'game-controller', label: t('apps.games'),
      action: { type: 'tab', tab: 'more', subView: 'games' },
    });
    tools.push({
      id: 'scratchMap', icon: 'earth', label: t('apps.scratchMap'),
      action: { type: 'tab', tab: 'more', subView: 'scratchMap' },
    });
    tools.push({
      id: 'reiseplanlegger', icon: 'airplane', label: t('apps.reiseplanlegger'),
      action: { type: 'tab', tab: 'more', subView: 'reiseplanlegger' },
    });
    tools.push({
      id: 'familyTree', icon: 'git-network', label: t('apps.familyTree'),
      action: { type: 'tab', tab: 'more', subView: 'familyTree' },
    });
    tools.push({
      id: 'rememberDates', icon: 'alarm', label: t('apps.rememberDates'),
      action: { type: 'tab', tab: 'more', subView: 'rememberDates' },
    });
    tools.push({
      id: 'activities', icon: 'fitness', label: t('tabs.activities'),
      action: { type: 'tab', tab: 'more', subView: 'activities' },
    });
    tools.push({
      id: 'location', icon: 'navigate', label: t('apps.location'),
      action: { type: 'tab', tab: 'more', subView: 'location' },
    });
    tools.push({
      id: 'documents', icon: 'folder-open', label: t('apps.documents'),
      action: { type: 'tab', tab: 'more', subView: 'documents' },
    });
    tools.push({
      id: 'albums', icon: 'images', label: t('apps.albums'),
      action: { type: 'tab', tab: 'more', subView: 'albums' },
    });
    tools.push({
      id: 'wall', icon: 'newspaper', label: t('apps.wall'),
      action: { type: 'tab', tab: 'more', subView: 'wall' },
    });
    tools.push({
      id: 'childDrawings', icon: 'color-palette', label: t('apps.childDrawings'),
      action: { type: 'tab', tab: 'more', subView: 'childDrawings' },
    });
    tools.push({
      id: 'holdings', icon: 'car', label: t('apps.holdings'),
      action: { type: 'tab', tab: 'more', subView: 'holdings' },
    });
    tools.push({
      id: 'boligmappa', icon: 'home-outline', label: t('apps.boligmappa'),
      action: { type: 'tab', tab: 'more', subView: 'boligmappa' },
    });
  }

  if (asParent && familyId && !isGrandparent) {
    tools.push({
      id: 'hospitality', icon: 'key', label: t('apps.hospitality'),
      action: { type: 'tab', tab: 'more', subView: 'hospitality' },
    });
  }

  // AI-assistenten åpnes via Chat («Chat med AI»), ikke som egen app i menyen.

  if (asParent && hasKids && !isGrandparent) {
    tools.push({
      id: 'progress', icon: 'stats-chart', label: t('apps.progress'),
      action: { type: 'tab', tab: 'more', subView: 'progress' },
    });
  }

  if (asParent) {
    sections.push(...groupParentAppItems(tools, t));
  } else if (asChild) {
    sections.push(...groupChildAppItems(tools, t));
  } else {
    sections.push({ id: 'tools', title: t('shell.apps'), items: tools });
  }

  if (asChild && childForSchedule) {
    const skoleItems = buildChildSkoleApps({
      t,
      familyId,
      child: childForSchedule,
      aiEnabled,
      allowedApps,
      canEdit: true,
    }).map(({ id, icon, label, action }) => ({ id, icon, label, action }));

    if (skoleItems.length > 0) {
      // Sett Skole rett etter Personlig, før app-mappene.
      const insertAt = Math.max(1, sections.findIndex((s) => s.id === 'main') + 1);
      sections.splice(insertAt, 0, {
        id: 'skole',
        title: t('shell.school'),
        items: skoleItems,
      });
    }
  }

  const accountItems = [];

  if (showChildRestrictions && childForSchedule) {
    accountItems.push({
      id: 'restrictions',
      icon: 'lock-closed',
      label: t('settings.appsAndAccess'),
      highlight: true,
      action: {
        type: 'nav',
        screen: 'ChildSettings',
        params: { familyId, child: childForSchedule, focus: 'restrictions' },
      },
    });
  }

  accountItems.push({
    id: 'settings', icon: 'settings', label: t('tabs.settings'),
    action: asChild && childForSchedule
      ? { type: 'nav', screen: 'ChildSettings', params: { familyId, child: childForSchedule } }
      : { type: 'tab', tab: 'more', subView: 'settings' },
  });

  accountItems.push({
    id: 'help',
    icon: 'help-circle',
    label: t('help.title'),
    action: { type: 'tab', tab: 'more', subView: 'help' },
  });

  const onCompany = isOrganizationType(family?.type);
  if (asParent && !isGrandparent) {
    // I Bedrift ligger Aktiverte moduler sammen med bedriftens moduler i Modulinnstillinger for den som
    // har den siden, så samme ting ikke har to steder (UX-17). Andre ser den her som før.
    if (!showsModulesInCompanySettings({ onCompany, companyGrants })) {
      accountItems.push({
        id: 'moduleAccess',
        icon: 'apps-outline',
        label: t('apps.moduleAccess'),
        action: { type: 'tab', tab: 'more', subView: 'moduleAccess' },
      });
    }
    accountItems.push({
      id: 'legal', icon: 'shield-checkmark', label: t('apps.privacy'),
      action: { type: 'tab', tab: 'more', subView: 'legal' },
    });
    if (isSuperAdmin && PRICING_VISIBLE) {
      accountItems.push({
        id: 'subscription', icon: 'card', label: t('group.subscription'),
        action: { type: 'tab', tab: 'more', subView: 'subscription' },
      });
    }
  } else if (asParent && isGrandparent) {
    accountItems.push({
      id: 'legal', icon: 'shield-checkmark', label: t('apps.privacy'),
      action: { type: 'tab', tab: 'more', subView: 'legal' },
    });
  }

  sections.push({ id: 'account', title: t('shell.account'), items: accountItems });

  if (onCompany) {
    const accountAt = sections.findIndex((section) => section.id === 'account');
    const includeUnderenheter = companyHasRegisteredUnits(family?.company);
    const companySection = {
      id: 'company',
      title: t('shell.company'),
      items: companyMenuItems({
        includeUnderenheter,
        grants: companyGrants,
        modules: companyModules,
        lockedNote: companyModuleNote,
      }),
    };
    if (accountAt >= 0) sections.splice(accountAt, 0, companySection);
    else sections.push(companySection);
  }

  const visible = asChild
    ? applyChildAppRestrictions(sections, allowedApps)
    : isGrandparent
      ? applyGrandparentAppRestrictions(sections, grandparentModules)
      : sections;
  const extraIds = asChild ? [] : ['timeliste'];
  if (onCompany) extraIds.push(...companyAllowIds());
  return applyProtopShellSections(visible, extraIds);
}

/**
 * Skole-apper for barnets Skole-mappe / -helside.
 */
export function buildChildSkoleApps({
  t,
  familyId,
  child,
  aiEnabled = true,
  allowedApps = null,
  canEdit = false,
}) {
  const skoleApps = [];

  if (familyId && child && isChildAppAllowed(allowedApps, 'week-plan')) {
    skoleApps.push({
      id: 'week-plan',
      icon: 'today',
      label: t('tabs.weeklyPlan'),
      sub: t('shellSub.overview'),
      action: {
        type: 'nav',
        screen: 'ChildSchedule',
        params: childScheduleNavParams({ familyId, child, canEdit: !!canEdit }),
      },
    });
  }

  if (familyId && child && isChildAppAllowed(allowedApps, 'lekser')) {
    skoleApps.push({
      id: 'lekser',
      icon: 'book',
      label: t('tabs.lekser'),
      sub: t('shellSub.weekHomework'),
      action: {
        type: 'nav',
        screen: 'Lekser',
        params: lekserNavParams({ familyId, child, canEdit: !!canEdit }),
      },
    });
  }

  if (isChildAppAllowed(allowedApps, 'mattehjelp')) {
    skoleApps.push({
      id: 'mattehjelp',
      icon: 'rocket',
      label: t('tabs.mattehjelp') || 'Lær skole',
      sub: t('shellSub.learningPlay') || 'Øv med spill og oppdrag',
      action: { type: 'nav', screen: 'Mattehjelp', params: child ? { child, familyId } : undefined },
    });
  }

  if (aiEnabled !== false && isChildAppAllowed(allowedApps, 'leksehjelp')) {
    skoleApps.push({
      id: 'leksehjelp',
      icon: 'school',
      label: t('tabs.leksehjelp'),
      sub: t('shellSub.stepByStep'),
      action: { type: 'nav', screen: 'Leksehjelp', params: child ? { child, familyId } : undefined },
    });
  }

  if (familyId && child && isChildAppAllowed(allowedApps, 'klassen')) {
    skoleApps.push({
      id: 'klassen',
      icon: 'people',
      label: t('tabs.klassen'),
      sub: t('shellSub.classInfo'),
      action: {
        type: 'nav',
        screen: 'Klassen',
        params: klassenNavParams({ familyId, child }),
      },
    });
  }

  return skoleApps;
}

/**
 * Flat list / mapper for child dashboard grid (all child-facing modules).
 * Mapper har type: 'folder' og nested `apps` — åpnes som helside.
 */
export function buildChildDashboardApps({
  t,
  familyId,
  child,
  aiEnabled = true,
  taskMeta,
  eventCount = 0,
  allowedApps = null,
  canEdit = false,
}) {
  const skoleApps = buildChildSkoleApps({ t, familyId, child, aiEnabled, allowedApps, canEdit });

  const apps = [
    {
      id: 'stars',
      icon: 'checkbox',
      label: t('tabs.tasks'),
      sub: t('shellSub.deadline'),
      action: { type: 'tab', tab: 'stars' },
    },
    {
      id: 'chores',
      icon: 'star',
      label: t('tabs.chores'),
      sub: taskMeta || t('shellSub.today'),
      action: { type: 'tab', tab: 'chores' },
    },
    {
      id: 'skole',
      type: 'folder',
      icon: 'school',
      label: t('apps.school'),
      sub: skoleApps.map((a) => a.label).join(' · ') || t('shellSub.schoolApps'),
      apps: skoleApps,
      action: {
        type: 'nav',
        screen: 'SchoolFolder',
        params: { child, familyId },
      },
    },
    {
      id: 'plan',
      icon: 'calendar',
      label: t('tabs.plan'),
      sub: t('shellSub.nToday', { n: eventCount }),
      action: { type: 'tab', tab: 'plan' },
    },
  ];

  // Husk dato erstatter Chat på forsiden; FamilieSpill foran øvrige katalog-apper.
  if (familyId) {
    apps.push({
      id: 'rememberDates',
      icon: 'alarm',
      label: t('apps.rememberDates'),
      sub: t('shellSub.countdown'),
      action: { type: 'tab', tab: 'more', subView: 'rememberDates' },
    });
  }

  apps.push(
    {
      id: 'notes',
      icon: 'document-text',
      label: t('tabs.notes'),
      sub: t('shellSub.writeRecordAi'),
      action: { type: 'tab', tab: 'notes' },
    },
    {
      id: 'books',
      icon: 'library',
      label: t('tabs.books'),
      sub: t('shellSub.books'),
      action: { type: 'tab', tab: 'more', subView: 'books' },
    },
    {
      id: 'wishes',
      icon: 'gift',
      label: t('tabs.wishes'),
      sub: t('shellSub.gifts'),
      action: { type: 'tab', tab: 'more', subView: 'wishes' },
    },
  );

  if (familyId) {
    apps.push({
      id: 'games',
      icon: 'game-controller',
      label: t('apps.games'),
      sub: t('shellSub.playTogether'),
      action: { type: 'tab', tab: 'more', subView: 'games' },
    });
    apps.push({
      id: 'friends',
      icon: 'people',
      label: t('apps.friends'),
      sub: t('friend.friendLabel'),
      action: { type: 'tab', tab: 'more', subView: 'friends' },
    });
  }

  // Chat ligger i katalogen utenfor dashbordets 3×3. AI åpnes via Chat.

  apps.push({
    id: 'chat',
    icon: 'chatbubbles',
    label: t('tabs.chat'),
    sub: t('shellSub.messages'),
    action: { type: 'tab', tab: 'chat' },
  });

  if (familyId) {
    apps.push({
      id: 'scratchMap',
      icon: 'earth',
      label: t('apps.scratchMap'),
      sub: t('shellSub.travels'),
      action: { type: 'tab', tab: 'more', subView: 'scratchMap' },
    });
    apps.push({
      id: 'reiseplanlegger',
      icon: 'airplane',
      label: t('apps.reiseplanlegger'),
      sub: t('shellSub.holidays'),
      action: { type: 'tab', tab: 'more', subView: 'reiseplanlegger' },
    });
    apps.push({
      id: 'familyTree',
      icon: 'git-network',
      label: t('apps.familyTree'),
      sub: t('shellSub.relatives'),
      action: { type: 'tab', tab: 'more', subView: 'familyTree' },
    });
    apps.push({
      id: 'activities',
      icon: 'fitness',
      label: t('tabs.activities'),
      sub: t('shellSub.training'),
      action: { type: 'tab', tab: 'more', subView: 'activities' },
    });
    apps.push({
      id: 'location',
      icon: 'navigate',
      label: t('shellSub.position'),
      sub: t('shellSub.family'),
      action: { type: 'tab', tab: 'more', subView: 'location' },
    });
    apps.push({
      id: 'documents',
      icon: 'folder-open',
      label: t('apps.documents'),
      sub: t('shellSub.files'),
      action: { type: 'tab', tab: 'more', subView: 'documents' },
    });
  }

  return applyProtopShellApps(filterChildDashboardApps(apps, allowedApps));
}

/** Foreldre-dashboard — samme stilrene grid som barn (uten «Mer»). */
export function buildParentDashboardApps({
  t,
  familyId,
  eventCount = 0,
  hasKids = false,
  firstKid = null,
}) {
  const apps = [
    {
      id: 'plan',
      icon: 'calendar',
      label: t('tabs.plan'),
      sub: t('shellSub.nToday', { n: eventCount }),
      action: { type: 'tab', tab: 'plan' },
    },
    {
      id: 'mail',
      icon: 'mail',
      label: t('tabs.mail'),
      sub: t('shellSub.outlook'),
      action: { type: 'tab', tab: 'mail' },
    },
    {
      id: 'stars',
      icon: 'checkbox',
      label: t('tabs.tasks'),
      sub: t('shellSub.deadline'),
      action: { type: 'tab', tab: 'stars' },
    },
  ];

  // Husk dato / FamilieSpill foran Chat i katalogen (AI åpnes via Chat).
  if (familyId) {
    apps.push(
      {
        id: 'rememberDates',
        icon: 'alarm',
        label: t('apps.rememberDates'),
        sub: t('shellSub.countdown'),
        action: { type: 'tab', tab: 'more', subView: 'rememberDates' },
      },
      {
        id: 'games',
        icon: 'game-controller',
        label: t('apps.games'),
        sub: t('shellSub.playTogether'),
        action: { type: 'tab', tab: 'more', subView: 'games' },
      },
      {
        id: 'friends',
        icon: 'people',
        label: t('apps.friends'),
        sub: t('friend.friendLabel'),
        action: { type: 'tab', tab: 'more', subView: 'friends' },
      },
    );
  }

  apps.push(
    {
      id: 'notes',
      icon: 'document-text',
      label: t('tabs.notes'),
      sub: t('shellSub.family'),
      action: { type: 'tab', tab: 'notes' },
    },
    {
      id: 'shop',
      icon: 'cart',
      label: t('tabs.shop'),
      sub: t('shellSub.shopping'),
      action: { type: 'tab', tab: 'more', subView: 'shop' },
    },
    {
      id: 'matcoach',
      icon: 'nutrition',
      label: t('apps.matcoach'),
      sub: t('shellSub.weeklyPlanAi'),
      action: { type: 'tab', tab: 'more', subView: 'matcoach' },
    },
    {
      id: 'meals',
      icon: 'restaurant',
      label: t('apps.meals'),
      sub: t('shellSub.weeklyPlan'),
      action: { type: 'tab', tab: 'more', subView: 'meals' },
    },
    {
      id: 'recipes',
      icon: 'book',
      label: t('apps.recipes'),
      sub: t('shellSub.dishes'),
      action: { type: 'tab', tab: 'more', subView: 'recipes' },
    },
    {
      id: 'pantry',
      icon: 'cube',
      label: t('apps.pantry'),
      sub: t('shellSub.pantry'),
      action: { type: 'tab', tab: 'more', subView: 'pantry' },
    },
    {
      id: 'wishes',
      icon: 'gift',
      label: t('tabs.wishes'),
      sub: t('shellSub.gifts'),
      action: { type: 'tab', tab: 'more', subView: 'wishes' },
    },
    {
      id: 'books',
      icon: 'library',
      label: t('tabs.books'),
      sub: t('shellSub.books'),
      action: { type: 'tab', tab: 'more', subView: 'books' },
    },
    {
      id: 'chat',
      icon: 'chatbubbles',
      label: t('tabs.chat'),
      sub: t('shellSub.messages'),
      action: { type: 'tab', tab: 'chat' },
    },
  );

  if (familyId) {
    apps.push({
      id: 'scratchMap',
      icon: 'earth',
      label: t('apps.scratchMap'),
      sub: t('shellSub.travels'),
      action: { type: 'tab', tab: 'more', subView: 'scratchMap' },
    });
    apps.push({
      id: 'reiseplanlegger',
      icon: 'airplane',
      label: t('apps.reiseplanlegger'),
      sub: t('shellSub.holidays'),
      action: { type: 'tab', tab: 'more', subView: 'reiseplanlegger' },
    });
    apps.push({
      id: 'familyTree',
      icon: 'git-network',
      label: t('apps.familyTree'),
      sub: t('shellSub.relatives'),
      action: { type: 'tab', tab: 'more', subView: 'familyTree' },
    });
    apps.push({
      id: 'activities',
      icon: 'fitness',
      label: t('tabs.activities'),
      sub: t('shellSub.training'),
      action: { type: 'tab', tab: 'more', subView: 'activities' },
    });
    apps.push({
      id: 'location',
      icon: 'navigate',
      label: t('shellSub.position'),
      sub: t('shellSub.family'),
      action: { type: 'tab', tab: 'more', subView: 'location' },
    });
    apps.push({
      id: 'documents',
      icon: 'folder-open',
      label: t('apps.documents'),
      sub: t('shellSub.files'),
      action: { type: 'tab', tab: 'more', subView: 'documents' },
    });
  }

  if (hasKids) {
    apps.push({
      id: 'progress',
      icon: 'stats-chart',
      label: t('shellSub.progressShort'),
      sub: t('shellSub.theKids'),
      action: { type: 'tab', tab: 'more', subView: 'progress' },
    });
  }

  return applyProtopShellApps(apps);
}
