/**
 * Bedriftssider bruker samme heading som ukeplan-modulene:
 * pastellbånd, tekst til venstre, illustrasjon til høyre.
 * Telefon: båndet ligger i skall-chrome. Nettbrett og nettleser: bånd over innholdet.
 */
import {
  defaultAnbudSubView,
  defaultArbeidSubView,
  defaultOkonomiSubView,
} from '../navigation/shellModules.js';

const t = (nb, en) => ({ nb, en });

const BLUE = { bg: '#E5F6FE', bg2: '#f7fbff', accent: '#1099F4' };
const LAVENDER = { bg: '#f1e9ff', bg2: '#faf7ff', accent: '#7c3aed' };
const MINT = { bg: '#e7f7ee', bg2: '#f5fcf8', accent: '#15803d' };
const CYAN = { bg: '#e6f5fb', bg2: '#f4fbfe', accent: '#0284c7' };
const SAND = { bg: '#f4efe6', bg2: '#fbf8f2', accent: '#b45309' };
const SLATE = { bg: '#e8eef6', bg2: '#f7f9fc', accent: '#1d4ed8' };

export const COMPANY_HERO = {
  projects: {
    ...BLUE,
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
    ...BLUE,
    wideArt: true,
    name: 'Ansatte',
    kicker: t('Ansatte', 'People'),
    title: t('Folkene i bedriften', 'The people in the company'),
    pitch: t(
      'Register, CV og tilgang for medarbeiderne.',
      'Directory, CV and access for the people who work here.',
    ),
  },
  kunder: {
    ...BLUE,
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
    ...BLUE,
    name: 'Kontrakt / avtale',
    kicker: t('Kontrakt', 'Contract'),
    title: t('Avtaler og kontrakter', 'Agreements and contracts'),
    pitch: t(
      'Følg avtalen fra signering til prosjekt.',
      'Follow the agreement from signing through to the project.',
    ),
  },
  skjema: {
    ...LAVENDER,
    name: 'Skjema',
    kicker: t('Skjema', 'Forms'),
    title: t('Skjema til utfylling', 'Forms to fill in'),
    pitch: t(
      'Bygg, send og samle svar på ett sted.',
      'Build, send and collect answers in one place.',
    ),
  },
  iso: {
    ...MINT,
    name: 'ISO',
    kicker: t('ISO', 'ISO'),
    title: t('Kvalitet, miljø og arbeidsmiljø', 'Quality, environment and safety'),
    pitch: t(
      'Prosedyrer og avvik for ISO 9001, 14001 og 45001.',
      'Procedures and deviations for ISO 9001, 14001 and 45001.',
    ),
  },
  timeliste: {
    ...CYAN,
    name: 'Timeliste',
    kicker: t('Time', 'Time'),
    title: t('Din timeliste', 'Your timesheet'),
    pitch: t(
      'Før egne timer på aktive prosjekter.',
      'Log your own hours on active projects.',
    ),
  },
  selskap: {
    ...SLATE,
    name: 'Selskap',
    kicker: t('Selskap', 'Company'),
    title: t('Bedriften', 'The company'),
    pitch: t(
      'Profil, logo og grunninnstillinger for selskapet.',
      'Profile, logo and the company basics.',
    ),
  },
  'selskap-tilgang': {
    ...SLATE,
    name: 'Tilgang',
    kicker: t('Selskap', 'Company'),
    title: t('Tilgang og rettigheter', 'Access and permissions'),
    pitch: t(
      'Se hvem som kan lese, endre og slette.',
      'See who can read, change and delete.',
    ),
  },
  underenheter: {
    ...SLATE,
    name: 'Underenheter',
    kicker: t('Selskap', 'Company'),
    title: t('Underenheter og konsern', 'Units and group'),
    pitch: t(
      'Se eierandeler, struktur og nøkkeltall.',
      'See ownership, structure and key figures.',
    ),
  },
  'anbud-varsling': {
    ...BLUE,
    name: 'Anbudsvarsling',
    kicker: t('Anbud', 'Tenders'),
    title: t('Anbudsvarsling', 'Tender alerts'),
    pitch: t(
      'Følg kunngjøringer som passer bedriften.',
      'Follow notices that fit the company.',
    ),
  },
  'anbud-foresporsel': {
    ...BLUE,
    name: 'Anbudsforespørsel',
    kicker: t('Anbud', 'Tenders'),
    title: t('Anbudsforespørsel', 'Tender enquiry'),
    pitch: t(
      'Ta imot forespørselen og start tilbudsarbeidet.',
      'Receive the enquiry and start the bid.',
    ),
  },
  'anbud-vurdering': {
    ...BLUE,
    name: 'Vurdering',
    kicker: t('Anbud', 'Tenders'),
    title: t('Vurdering av aktuelle', 'Review the shortlist'),
    pitch: t(
      'Velg hvilke oppdrag dere går videre med.',
      'Choose which opportunities to pursue.',
    ),
  },
  'anbud-tilbud': {
    ...BLUE,
    name: 'Tilbud',
    kicker: t('Anbud', 'Tenders'),
    title: t('Tilbud', 'Bid'),
    pitch: t(
      'Skriv, send og følg tilbudet til avtale.',
      'Write, send and follow the bid through to an agreement.',
    ),
  },
  'arbeid-timeliste': {
    ...CYAN,
    name: 'Timeliste',
    kicker: t('Arbeid', 'Work'),
    title: t('Timeliste', 'Timesheet'),
    pitch: t(
      'Før timer på aktive prosjekter.',
      'Log hours on active projects.',
    ),
  },
  'arbeid-timerapport': {
    ...CYAN,
    name: 'Timerapport',
    kicker: t('Arbeid', 'Work'),
    title: t('Timerapport', 'Hours report'),
    pitch: t(
      'Se, importer og organiser timene.',
      'Review, import and organise the hours.',
    ),
  },
  'arbeid-timesaldo': {
    ...CYAN,
    name: 'Timesaldo',
    kicker: t('Arbeid', 'Work'),
    title: t('Timesaldo', 'Hour balance'),
    pitch: t(
      'Se saldoen for medarbeiderne.',
      'See the hour balance for the team.',
    ),
  },
  'arbeid-fravaer': {
    ...SAND,
    name: 'Fraværsoversikt',
    kicker: t('Arbeid', 'Work'),
    title: t('Fraværsoversikt', 'Absence overview'),
    pitch: t(
      'Ferie, sykdom og permisjon for de ansatte.',
      'Holiday, sick leave and leave for the team.',
    ),
  },
  'arbeid-fravaersrapport': {
    ...SAND,
    name: 'Fraværsrapport',
    kicker: t('Arbeid', 'Work'),
    title: t('Fraværsrapport', 'Absence report'),
    pitch: t(
      'Dag for dag, med filter og import.',
      'Day by day, with filters and import.',
    ),
  },
  'arbeid-planlagt': {
    ...SAND,
    name: 'Planlagt fravær',
    kicker: t('Arbeid', 'Work'),
    title: t('Planlagt fravær', 'Planned absence'),
    pitch: t(
      'Se ferie og fravær som ligger frem i tid.',
      'See holiday and leave that is still ahead.',
    ),
  },
  'arbeid-utlegg': {
    ...CYAN,
    name: 'Prosjektutlegg',
    kicker: t('Arbeid', 'Work'),
    title: t('Prosjektutlegg', 'Project expenses'),
    pitch: t(
      'Utlegg som hører til prosjektet.',
      'Expenses that belong to the project.',
    ),
  },
  'arbeid-salg': {
    ...CYAN,
    name: 'Mine produktsalg',
    kicker: t('Arbeid', 'Work'),
    title: t('Mine produktsalg', 'My product sales'),
    pitch: t(
      'Salg du har registrert på prosjektene.',
      'Sales you have recorded on the projects.',
    ),
  },
  'arbeid-godkjenning': {
    ...CYAN,
    name: 'Godkjenninger',
    kicker: t('Arbeid', 'Work'),
    title: t('Godkjenninger', 'Approvals'),
    pitch: t(
      'Timer og fravær som venter på godkjenning.',
      'Hours and absence waiting for approval.',
    ),
  },
  'okonomi-oversikt': {
    ...MINT,
    name: 'Økonomi',
    kicker: t('Økonomi', 'Finance'),
    title: t('Økonomioversikt', 'Finance overview'),
    pitch: t(
      'Tallene som styrer bedriften, samlet.',
      'The figures that run the company, in one place.',
    ),
  },
  'okonomi-kunder': {
    ...MINT,
    name: 'Kundesummer',
    kicker: t('Økonomi', 'Finance'),
    title: t('Kundesummer', 'Customer totals'),
    pitch: t(
      'Omsetning og utestående per kunde.',
      'Revenue and outstanding amounts per customer.',
    ),
  },
  'okonomi-avtaler': {
    ...MINT,
    name: 'Avtalesummer',
    kicker: t('Økonomi', 'Finance'),
    title: t('Avtalesummer', 'Agreement totals'),
    pitch: t(
      'Beløp knyttet til avtalene.',
      'Amounts tied to the agreements.',
    ),
  },
  'okonomi-faktura': {
    ...MINT,
    name: 'Faktura',
    kicker: t('Økonomi', 'Finance'),
    title: t('Faktura', 'Invoices'),
    pitch: t(
      'Importer, koble og følg fakturaene.',
      'Import, link and follow the invoices.',
    ),
  },
  'okonomi-fakturagrunnlag': {
    ...MINT,
    name: 'Fakturagrunnlag',
    kicker: t('Økonomi', 'Finance'),
    title: t('Fakturagrunnlag', 'Billing basis'),
    pitch: t(
      'Timer og poster klare til fakturering.',
      'Hours and lines ready to invoice.',
    ),
  },
  'okonomi-utlegg': {
    ...MINT,
    name: 'Utlegg',
    kicker: t('Økonomi', 'Finance'),
    title: t('Utlegg', 'Expenses'),
    pitch: t(
      'Utlegg som skal viderefaktureres eller bokføres.',
      'Expenses to recharge or book.',
    ),
  },
  'okonomi-kjorebok': {
    ...MINT,
    name: 'Kjørebok',
    kicker: t('Økonomi', 'Finance'),
    title: t('Kjørebok', 'Mileage'),
    pitch: t(
      'Yrkeskjøring, bom og parkering.',
      'Business driving, tolls and parking.',
    ),
  },
  'okonomi-produkter': {
    ...MINT,
    name: 'Produkter',
    kicker: t('Økonomi', 'Finance'),
    title: t('Produkter', 'Products'),
    pitch: t(
      'Varer og salg som hører til økonomien.',
      'Products and sales that belong in finance.',
    ),
  },
  'okonomi-indeks': {
    ...MINT,
    name: 'Indeksregulering',
    kicker: t('Økonomi', 'Finance'),
    title: t('Indeksregulering', 'Index adjustment'),
    pitch: t(
      'Reguler avtaler etter avtalt indeks.',
      'Adjust agreements by the agreed index.',
    ),
  },
};

export function companyHeroId(tab, moreSubView = null) {
  if (tab === 'projects') return 'projects';
  if (tab === 'ansatte') return 'ansatte';
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
  if (tab === 'arbeid') return `arbeid-${defaultArbeidSubView(moreSubView)}`;
  if (tab === 'okonomi') return `okonomi-${defaultOkonomiSubView(moreSubView)}`;
  return null;
}
