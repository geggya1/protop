/**
 * Bedriftssider bruker samme heading som ukeplan-modulene:
 * pastellbånd, tekst til venstre, illustrasjon til høyre.
 * Telefon: båndet ligger i skall-chrome. Nettbrett og nettleser: bånd over innholdet.
 */
import {
  defaultAnbudSubView,
  defaultArbeidSubView,
  defaultHrSubView,
  defaultOkonomiSubView,
} from '../navigation/shellModules.js';
import { companyNavGroupId } from '../navigation/navTrail.js';

const t = (nb, en) => ({ nb, en });

/*
 * Fargen kommer fra menygruppen siden ligger i (src/modules/groupPalette.js), ikke fra
 * hver side. Da har HR, Økonomi og de andre modulene én farge på alle fanene, og samme
 * farge som i hjelpen (UX-06).
 */

export const COMPANY_HERO = {
  projects: {
    wideArt: true,
    name: 'Prosjekt',
    kicker: t('Prosjekt', 'Projects'),
    title: t('Oversikt over prosjektene', 'Project overview'),
    pitch: t(
      'Finn prosjektet, se avtalen og hold listen oppdatert.',
      'Find the project, see the agreement and keep the list current.',
    ),
  },
  ansatte: {
    wideArt: true,
    name: 'Ansatte og eksterne',
    kicker: t('Ansatte og eksterne', 'Employees and externals'),
    title: t('Folkene i bedriften', 'The people in the company'),
    pitch: t(
      'Register, CV og tilgang for medarbeiderne.',
      'Directory, CV and access for the people who work here.',
    ),
  },
  'hr-oversikt': {
    wideArt: true,
    name: 'HR',
    kicker: t('HR', 'HR'),
    title: t('Personal og rekruttering', 'People and recruiting'),
    pitch: t(
      'Oversikt over jubileum, oppfølging, lønn og søknader.',
      'Overview of anniversaries, follow-up, pay and applications.',
    ),
  },
  'hr-personell': {
    wideArt: true,
    name: 'Personell',
    kicker: t('HR', 'HR'),
    title: t('Personaloversikt', 'People overview'),
    pitch: t(
      'Ansatt dato, jubileum, fødselsdato og kontrakter.',
      'Hire date, anniversary, birthday and contracts.',
    ),
  },
  'hr-avtaler': {
    wideArt: true,
    name: 'Avtaler',
    kicker: t('HR', 'HR'),
    title: t('Ansettelsesavtaler', 'Employment contracts'),
    pitch: t(
      'Last opp, OCR-skann og lagre nøkkeldata på personen.',
      'Upload, OCR-scan and store key fields on the person.',
    ),
  },
  'arbeid-produktivitet': {
    wideArt: true,
    name: 'Produktivitet',
    kicker: t('Arbeid', 'Work'),
    title: t('Belegg og kapasitet', 'Utilisation and capacity'),
    pitch: t(
      'Planlegg prosjekt, stillingsstørrelse og ledig kapasitet uke for uke.',
      'Plan projects, position size and free capacity week by week.',
    ),
  },
  'arbeid-fremdrift': {
    wideArt: true,
    name: 'Prosjektfremdrift',
    kicker: t('Produktivitet', 'Productivity'),
    title: t('Prosjektfremdrift', 'Project progress'),
    pitch: t(
      'Planlagt periode fra prosjekt og avtale, og ukene det er ført timer.',
      'Planned period from project and agreement, and the weeks with logged hours.',
    ),
  },
  'hr-lonn': {
    wideArt: true,
    name: 'Lønn',
    kicker: t('HR', 'HR'),
    title: t('Lønn og justeringer', 'Pay and adjustments'),
    pitch: t(
      'Historikk, graf og plan for fremtidige justeringer.',
      'History, chart and planned future adjustments.',
    ),
  },
  'hr-oppfolging': {
    wideArt: true,
    name: 'Oppfølging',
    kicker: t('HR', 'HR'),
    title: t('Saker, samtaler og oppgaver', 'Cases, reviews and tasks'),
    pitch: t(
      'Medarbeidersamtaler, memo og tildelte gjøremål.',
      'Reviews, memos and assigned to-dos.',
    ),
  },
  'hr-compliance': {
    wideArt: true,
    name: 'Lovpålagt',
    kicker: t('HR', 'HR'),
    title: t('Lovpålagt per ansatt', 'Statutory per employee'),
    pitch: t(
      'Arbeidsavtale, oppfølging, verneutstyr og personvern per ansatt.',
      'Employment agreement, follow-up, protective equipment and privacy per employee.',
    ),
  },
  'hr-handbok': {
    wideArt: true,
    name: 'Personalhåndbok',
    kicker: t('HR', 'HR'),
    title: t('Personalhåndbok med lesebekreftelse', 'Staff handbook with read receipts'),
    pitch: t(
      'Kapitler, versjoner og hvem som har lest siste versjon.',
      'Chapters, versions and who has read the latest version.',
    ),
  },
  'hr-skjema': {
    wideArt: true,
    name: 'Skjemaer',
    kicker: t('HR', 'HR'),
    title: t('Personalskjema per ansatt', 'Staff forms per employee'),
    pitch: t(
      'Pårørende, taushetserklæring, nyansatt og medarbeidersamtale.',
      'Next of kin, confidentiality, onboarding and appraisals.',
    ),
  },
  'hr-rekruttering': {
    wideArt: true,
    name: 'Rekruttering',
    kicker: t('HR', 'HR'),
    title: t('Annonser og søknader', 'Jobs and applications'),
    pitch: t(
      'Registrer stillinger, vurder søkere og svar opp.',
      'Post jobs, evaluate applicants and reply.',
    ),
  },
  kunder: {
    wideArt: true,
    name: 'Kunder',
    kicker: t('Kunder', 'Customers'),
    title: t('Kunderegisteret', 'Customer register'),
    pitch: t(
      'Finn kunden, se avtaler og knytt prosjektet riktig.',
      'Find the customer, see agreements and link the project.',
    ),
  },
  kontrakt: {
    wideArt: true,
    name: 'Kontrakt / avtale',
    kicker: t('Kontrakt', 'Contract'),
    title: t('Avtaler og kontrakter', 'Agreements and contracts'),
    pitch: t(
      'Følg avtalen fra signering til prosjekt.',
      'Follow the agreement from signing through to the project.',
    ),
  },
  skjema: {
    wideArt: true,
    name: 'Skjema',
    kicker: t('Skjema', 'Forms'),
    title: t('Skjema til utfylling', 'Forms to fill in'),
    pitch: t(
      'Bygg, send og samle svar på ett sted.',
      'Build, send and collect answers in one place.',
    ),
  },
  iso: {
    wideArt: true,
    name: 'ISO',
    kicker: t('ISO', 'ISO'),
    title: t('Kvalitet, miljø og arbeidsmiljø', 'Quality, environment and safety'),
    pitch: t(
      'Prosedyrer og avvik for ISO 9001, 14001 og 45001.',
      'Procedures and deviations for ISO 9001, 14001 and 45001.',
    ),
  },
  timeliste: {
    wideArt: true,
    name: 'Timeliste',
    kicker: t('Time', 'Time'),
    title: t('Din timeliste', 'Your timesheet'),
    pitch: t(
      'Før egne timer på aktive prosjekter.',
      'Log your own hours on active projects.',
    ),
  },
  selskap: {
    wideArt: true,
    name: 'Selskap',
    kicker: t('Selskap', 'Company'),
    title: t('Bedriften', 'The company'),
    pitch: t(
      'Profil, logo og grunninnstillinger for selskapet.',
      'Profile, logo and the company basics.',
    ),
  },
  'selskap-tilgang': {
    wideArt: true,
    name: 'Tilgang',
    kicker: t('Selskap', 'Company'),
    title: t('Tilgang og rettigheter', 'Access and permissions'),
    pitch: t(
      'Se hvem som kan lese, endre og slette.',
      'See who can read, change and delete.',
    ),
  },
  underenheter: {
    wideArt: true,
    name: 'Underenheter',
    kicker: t('Selskap', 'Company'),
    title: t('Underenheter og konsern', 'Units and group'),
    pitch: t(
      'Se eierandeler, struktur og nøkkeltall.',
      'See ownership, structure and key figures.',
    ),
  },
  'anbud-varsling': {
    wideArt: true,
    name: 'Anbudsvarsling',
    kicker: t('Anbud', 'Tenders'),
    title: t('Anbudsvarsling', 'Tender alerts'),
    pitch: t(
      'Finn relevante anbud og hold deg oppdatert på muligheter i markedet.',
      'Find relevant tenders and stay current on opportunities in the market.',
    ),
  },
  'anbud-foresporsel': {
    wideArt: true,
    name: 'Anbudsforespørsel',
    kicker: t('Anbud', 'Tenders'),
    title: t('Anbudsforespørsel', 'Tender enquiry'),
    pitch: t(
      'Ta imot forespørselen og start tilbudsarbeidet.',
      'Receive the enquiry and start the bid.',
    ),
  },
  'anbud-vurdering': {
    wideArt: true,
    name: 'Vurdering',
    kicker: t('Anbud', 'Tenders'),
    title: t('Vurdering av aktuelle', 'Review the shortlist'),
    pitch: t(
      'Velg hvilke oppdrag dere går videre med.',
      'Choose which opportunities to pursue.',
    ),
  },
  'anbud-tilbud': {
    wideArt: true,
    name: 'Tilbud',
    kicker: t('Anbud', 'Tenders'),
    title: t('Tilbud', 'Bid'),
    pitch: t(
      'Skriv, send og følg tilbudet til avtale.',
      'Write, send and follow the bid through to an agreement.',
    ),
  },
  'arbeid-timeliste': {
    wideArt: true,
    name: 'Timeliste',
    kicker: t('Arbeid', 'Work'),
    title: t('Timeliste', 'Timesheet'),
    pitch: t(
      'Før timer på aktive prosjekter.',
      'Log hours on active projects.',
    ),
  },
  'arbeid-timerapport': {
    wideArt: true,
    name: 'Timerapport',
    kicker: t('Arbeid', 'Work'),
    title: t('Timerapport', 'Hours report'),
    pitch: t(
      'Se, importer og organiser timene.',
      'Review, import and organise the hours.',
    ),
  },
  'arbeid-timesaldo': {
    wideArt: true,
    name: 'Timesaldo',
    kicker: t('Arbeid', 'Work'),
    title: t('Timesaldo', 'Hour balance'),
    pitch: t(
      'Se saldoen for medarbeiderne.',
      'See the hour balance for the team.',
    ),
  },
  'arbeid-fravaer': {
    wideArt: true,
    name: 'Fraværsoversikt',
    kicker: t('Arbeid', 'Work'),
    title: t('Fraværs\u00adoversikt', 'Absence overview'),
    pitch: t(
      'Full oversikt over ferie, fravær og permisjoner for de ansatte.',
      'A full view of holiday, absence and leave for the team.',
    ),
  },
  'arbeid-fravaersrapport': {
    wideArt: true,
    name: 'Fraværsrapport',
    kicker: t('Arbeid', 'Work'),
    title: t('Fraværsrapport', 'Absence report'),
    pitch: t(
      'Dag for dag, med filter og import.',
      'Day by day, with filters and import.',
    ),
  },
  // Samme bånd og illustrasjon som Fraværsoversikt, med sidens egen tittel.
  'arbeid-fravaer-innstillinger': {
    wideArt: true,
    name: 'Fraværsinnstillinger',
    kicker: t('Arbeid', 'Work'),
    title: t('Fraværsinnstillinger', 'Absence settings'),
    pitch: t(
      'Fraværstyper, fridager og ferieplan for de ansatte.',
      'Absence types, days off and the holiday plan for the team.',
    ),
  },
  'arbeid-planlagt': {
    name: 'Planlagt fravær',
    kicker: t('Arbeid', 'Work'),
    title: t('Planlagt fravær', 'Planned absence'),
    pitch: t(
      'Se ferie og fravær som ligger frem i tid.',
      'See holiday and leave that is still ahead.',
    ),
  },
  'arbeid-salg': {
    wideArt: true,
    name: 'Produktsalg',
    kicker: t('Arbeid', 'Work'),
    title: t('Produktsalg', 'Product sales'),
    pitch: t(
      'Salg mot kunde, fra produktkatalogen og timelisten.',
      'Sales to customers, from the product catalog and the timesheet.',
    ),
  },
  'arbeid-godkjenning': {
    wideArt: true,
    name: 'Godkjenninger',
    kicker: t('Arbeid', 'Work'),
    title: t('Godkjenninger', 'Approvals'),
    pitch: t(
      'Kontroller låste timelister. Timene blir klare for fakturering først når de er godkjent.',
      'Review locked timesheets. Hours are ready to invoice only after approval.',
    ),
  },
  'okonomi-oversikt': {
    wideArt: true,
    name: 'Økonomi',
    kicker: t('Økonomi', 'Finance'),
    title: t('Økonomioversikt', 'Finance overview'),
    pitch: t(
      'Tallene som styrer bedriften, samlet.',
      'The figures that run the company, in one place.',
    ),
  },
  'okonomi-inntjening': {
    name: 'Inntjening',
    kicker: t('Produktivitet og inntjening', 'Productivity and earnings'),
    title: t('Inntjening', 'Earnings'),
    pitch: t(
      'Ansatte, innleide, kunder, prosjekt og avtaler. Lønn og timer kommer fra systemet.',
      'Employees, contractors, customers, projects and agreements. Salary and hours come from the system.',
    ),
  },
  // Kunder og Avtaler er faner i Inntjening, ikke egne sider (UX-17).
  'okonomi-kunder': {
    name: 'Inntjening',
    kicker: t('Produktivitet og inntjening', 'Productivity and earnings'),
    title: t('Inntjening', 'Earnings'),
    pitch: t(
      'Kunder: omsetning og utestående per kunde.',
      'Customers: revenue and outstanding amounts per customer.',
    ),
  },
  'okonomi-avtaler': {
    name: 'Inntjening',
    kicker: t('Produktivitet og inntjening', 'Productivity and earnings'),
    title: t('Inntjening', 'Earnings'),
    pitch: t(
      'Avtaler: beløp knyttet til avtalene.',
      'Agreements: amounts tied to the agreements.',
    ),
  },
  'okonomi-faktura': {
    wideArt: true,
    name: 'Faktura',
    kicker: t('Økonomi', 'Finance'),
    title: t('Faktura', 'Invoices'),
    pitch: t(
      'Importer, koble og følg fakturaene.',
      'Import, link and follow the invoices.',
    ),
  },
  'okonomi-fakturagrunnlag': {
    wideArt: true,
    name: 'Til fakturering',
    kicker: t('Økonomi', 'Finance'),
    title: t('Til fakturering', 'To be invoiced'),
    pitch: t(
      'Ufakturerte timer, utlegg, kjøring og salg per prosjekt. Godkjenn og lag fakturautkast.',
      'Uninvoiced hours, expenses, mileage and sales per project. Approve and create draft invoices.',
    ),
  },
  'okonomi-utlegg': {
    wideArt: true,
    name: 'Utlegg',
    kicker: t('Økonomi', 'Finance'),
    title: t('Utlegg', 'Expenses'),
    pitch: t(
      'Utlegg på prosjekt og interne utlegg på ett sted. Registrer, godkjenn og importer.',
      'Project expenses and internal expenses in one place. Register, approve and import.',
    ),
  },
  'okonomi-kjorebok': {
    wideArt: true,
    name: 'Kjørebok',
    kicker: t('Økonomi', 'Finance'),
    title: t('Kjørebok', 'Mileage'),
    pitch: t(
      'Velg prosjekt og bil. Rute, kilometer og kostnad fylles ut.',
      'Pick the project and car. Route, kilometres and cost are filled in.',
    ),
  },
  utstyr: {
    wideArt: true,
    name: 'Utstyr',
    kicker: t('Utstyr', 'Equipment'),
    title: t('Utstyr og lager', 'Equipment and stock'),
    pitch: t(
      'Se utstyret bedriften eier, og det du har privat. Registrer nytt, og reserver i kalenderen.',
      'See company equipment and your own. Register something new, and book it in the calendar.',
    ),
  },
  'okonomi-produkter': {
    wideArt: true,
    name: 'Produkter',
    kicker: t('Økonomi', 'Finance'),
    title: t('Produkter', 'Products'),
    pitch: t(
      'Produktkatalog og stykk-salg mot kunde og prosjekt.',
      'Product catalog and unit sales for customers and projects.',
    ),
  },
  'okonomi-indeks': {
    wideArt: true,
    name: 'Indeksregulering',
    kicker: t('Økonomi', 'Finance'),
    title: t('Indeksregulering', 'Index adjustment'),
    pitch: t(
      'Reguler avtaler etter avtalt indeks.',
      'Adjust agreements by the agreed index.',
    ),
  },
  'okonomi-indekser': {
    name: 'Indekser',
    kicker: t('Økonomi', 'Finance'),
    title: t('Indekser', 'Index series'),
    pitch: t(
      'Siste SSB-punkt for indeksene som er i bruk i avtalene.',
      'Latest Statistics Norway point for the indices used in agreements.',
    ),
  },
};

export function companyHeroId(tab, moreSubView = null) {
  if (tab === 'projects') return 'projects';
  if (tab === 'ansatte') return 'ansatte';
  if (tab === 'hr') return `hr-${defaultHrSubView(moreSubView)}`;
  if (tab === 'kunder') return 'kunder';
  if (tab === 'kontrakt') return 'kontrakt';
  if (tab === 'skjema') return 'skjema';
  if (tab === 'iso') return 'iso';
  if (tab === 'timeliste') return 'timeliste';
  if (tab === 'underenheter') return 'underenheter';
  if (tab === 'selskap') {
    if (moreSubView === 'underenheter') return 'underenheter';
    if (moreSubView === 'tilgang') return 'selskap-tilgang';
    return 'selskap';
  }
  if (tab === 'anbud') return `anbud-${defaultAnbudSubView(moreSubView)}`;
  // Den gamle adressen til Prosjektutlegg viser Utlegg til skallet har sendt videre (UX-17).
  if (tab === 'arbeid' && moreSubView === 'utlegg') return 'okonomi-utlegg';
  if (tab === 'arbeid') return `arbeid-${defaultArbeidSubView(moreSubView)}`;
  if (tab === 'okonomi') return `okonomi-${defaultOkonomiSubView(moreSubView)}`;
  if (tab === 'utstyr') return 'utstyr';
  return null;
}

const ROUTE_PREFIXES = ['hr', 'anbud', 'arbeid', 'okonomi', 'selskap'];

/** Fane og underside for en bånd-id (motsatt vei av companyHeroId). */
export function companyHeroRoute(id) {
  const key = String(id || '');
  if (key === 'underenheter') return { tab: 'selskap', subView: 'underenheter' };
  // ISO har ett bånd for alle undersidene; oversikten er startsiden.
  if (key === 'iso') return { tab: 'iso', subView: 'oversikt' };
  const dash = key.indexOf('-');
  if (dash > 0 && ROUTE_PREFIXES.includes(key.slice(0, dash))) {
    return { tab: key.slice(0, dash), subView: key.slice(dash + 1) };
  }
  return { tab: key, subView: null };
}

/**
 * Menygruppen båndet hører til. Timeliste ligger øverst i menyen (personlig);
 * resten følger bedriftsmenyen. Ukjent side: tom streng.
 */
export function companyHeroGroup(id) {
  if (!COMPANY_HERO[id]) return '';
  if (id === 'timeliste') return 'personal';
  const { tab, subView } = companyHeroRoute(id);
  return companyNavGroupId(tab, subView) || companyNavGroupId(tab, null);
}
