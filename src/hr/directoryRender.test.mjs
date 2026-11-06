/**
 * Kjør personell-tabell, kontrolliste og avtale-skjema med ekte modell.
 * Tung Firebase-graf er stubbet. Bekrefter at navnebrikker ikke rendres,
 * og at OCR ligger skjult til «Registrer avtale».
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as babel from '@babel/core';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new Map();

function toCss(style) {
  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style || {});
  const css = {};
  const px = (value) => (typeof value === 'number' ? `${value}px` : value);
  const map = {
    flexDirection: 'flexDirection',
    flexWrap: 'flexWrap',
    alignItems: 'alignItems',
    justifyContent: 'justifyContent',
    flexGrow: 'flexGrow',
    flex: 'flex',
    gap: 'gap',
    fontWeight: 'fontWeight',
    fontSize: 'fontSize',
    lineHeight: 'lineHeight',
    color: 'color',
    backgroundColor: 'backgroundColor',
    borderColor: 'borderColor',
    borderWidth: 'borderWidth',
    borderBottomWidth: 'borderBottomWidth',
    borderRadius: 'borderRadius',
    padding: 'padding',
    paddingHorizontal: 'paddingLeft',
    paddingVertical: 'paddingTop',
    minWidth: 'minWidth',
    maxWidth: 'maxWidth',
    flexBasis: 'flexBasis',
    display: 'display',
    gridTemplateColumns: 'gridTemplateColumns',
    width: 'width',
    paddingRight: 'paddingRight',
    maxHeight: 'maxHeight',
    minHeight: 'minHeight',
    marginTop: 'marginTop',
  };
  for (const [key, cssKey] of Object.entries(map)) {
    if (flat[key] == null) continue;
    css[cssKey] = px(flat[key]);
  }
  if (flat.paddingHorizontal != null) css.paddingRight = px(flat.paddingHorizontal);
  if (flat.paddingVertical != null) css.paddingBottom = px(flat.paddingVertical);
  if (flat.borderBottomWidth) css.borderBottomStyle = 'solid';
  if (flat.borderWidth) css.borderStyle = 'solid';
  if (flat.flexDirection || flat.gap != null || flat.flex != null) {
    css.display = flat.display || 'flex';
    if (css.display !== 'grid') css.flexDirection = flat.flexDirection || 'column';
  }
  if (typeof flat.flexGrow === 'number') css.flexGrow = String(flat.flexGrow);
  return css;
}

function domProps(props) {
  const id = props?.nativeID;
  const style = toCss(props?.style);
  const label = props?.accessibilityLabel;
  return {
    ...(id ? { id } : {}),
    ...(label ? { 'aria-label': label } : {}),
    ...(style && Object.keys(style).length ? { style } : {}),
  };
}

const rnMock = {
  View: (props) => React.createElement('div', domProps(props), props?.children),
  Text: (props) => React.createElement('span', domProps(props), props?.children),
  ScrollView: (props) => React.createElement('div', domProps(props), props?.children),
  Pressable: (props) => React.createElement('button', { type: 'button', ...domProps(props) }, props?.children),
  Image: (props) => React.createElement('img', { src: props?.source?.uri, alt: props?.accessibilityLabel }),
  TextInput: (props) => React.createElement('input', { placeholder: props?.placeholder, defaultValue: props?.value }),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {}, absoluteFillObject: {} },
  Platform: { OS: 'web', select: (options) => options?.web || options?.default },
  TouchableOpacity: (props) => React.createElement('button', { type: 'button', ...domProps(props) }, props?.children),
  Modal: (props) => (props?.visible === false ? null : React.createElement('div', domProps(props), props?.children)),
  Dimensions: { get: () => ({ width: 390, height: 844, fontScale: 1, scale: 1 }) },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 1 }),
  Linking: { openURL: async () => {} },
};

function mocked(id) {
  if (id === 'react') return React;
  if (id === 'react-native') return rnMock;
  if (id === '@expo/vector-icons') return { Ionicons: () => null };
  if (id === 'react-native-svg') {
    const Svg = (props) => React.createElement('svg', null, props?.children);
    return { __esModule: true, default: Svg, Svg, Circle: () => React.createElement('circle') };
  }
  if (id.includes('employees/storage') || id.includes('utils/media') || id.includes('anbud/storage') || id.includes('firebase')) {
    return {
      saveEmployee: async () => {},
      pickDocument: async () => null,
      uploadFile: async () => '',
      DEFAULT_DOCUMENT_ACCEPT: '.pdf',
      loadAnbudState: async () => ({}),
      saveAnbudState: async () => {},
    };
  }
  if (id.includes('ui/saveToast')) return { showSaveToast: () => {} };
  // Kameraet til QR-skanning av HMS-kort lastes ikke i testen.
  if (id.includes('BarcodeScannerModal')) return { __esModule: true, default: () => null };
  // Kjøregodtgjørelse på lønnssiden leser prosjektstaten og satsene fra serveren.
  if (id.includes('mileage/EmployeeMileageCard')) return { __esModule: true, default: () => null };
  // Lønnsgrunnlaget leser innlogget bruker (useApp) og timelistene; det har egne tester.
  if (id.endsWith('HrPayrollSummary')) return { __esModule: true, default: () => null };
  if (id.includes('ThemeContext')) {
    return {
      useColors: () => ({
        brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2',
        card: '#fff', bg: '#F4F7FB', danger: '#b42318',
      }),
    };
  }
  if (id.includes('anbud/bidLibrary')) return { saveFormTemplate: () => ({ ok: true, state: {} }) };
  return null;
}

function resolveFrom(id, mod) {
  const candidates = [id];
  if (!path.extname(id)) candidates.push(`${id}.jsx`, `${id}.js`);
  let last;
  for (const candidate of candidates) {
    try {
      return Module._resolveFilename(candidate, mod);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

function load(full) {
  if (cache.has(full)) return cache.get(full).exports;
  const code = fs.readFileSync(full, 'utf8');
  const out = babel.transformSync(code, {
    filename: full,
    presets: [['babel-preset-expo', { jsxRuntime: 'classic' }]],
    plugins: [['@babel/plugin-transform-modules-commonjs', { lazy: false }]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
  });
  const mod = new Module(full);
  mod.filename = full;
  mod.paths = Module._nodeModulePaths(path.dirname(full));
  mod.require = (id) => {
    const hit = mocked(id);
    if (hit) return hit;
    const resolved = resolveFrom(id, mod);
    if (resolved.endsWith('.js') || resolved.endsWith('.jsx')) {
      return load(resolved);
    }
    return require(resolved);
  };
  mod._compile(out.code, full);
  cache.set(full, mod);
  return mod.exports;
}

function component(rel) {
  const loaded = load(path.join(ROOT, rel));
  return loaded.default || loaded;
}

const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2',
  card: '#fff', bg: '#F4F7FB', danger: '#b42318',
};

const employees = [
  {
    id: 'e1',
    person: { firstName: 'Ada', lastName: 'Nordmann', email: 'ada@protop.no', birthDate: '1990-05-04' },
    company: { status: 'active', personnelKind: 'staff', title: 'Rådgiver', periodFrom: '2018-03-01' },
  },
  {
    id: 'e2',
    person: { firstName: 'Bo', lastName: 'Ekstern' },
    company: { status: 'inactive', personnelKind: 'external', title: 'Innleid' },
  },
];

const hr = {
  contracts: [],
  salaries: [],
  reviews: [],
  cases: [],
  tasks: [],
  memos: [],
  files: [],
  compliance: [],
};

const HrPeople = component('screens/hr/HrPeople.jsx');
const HrControl = component('screens/hr/HrControl.jsx');
const HrContracts = component('screens/hr/HrContracts.jsx');
const HrDashboard = component('screens/hr/HrDashboard.jsx');
const localIsoDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const InnleiePeople = component('screens/innleie/InnleiePeople.jsx');
const InnleieDashboard = component('screens/innleie/InnleieDashboard.jsx');

const peopleProps = {
  colors,
  employees,
  hr,
  entries: [],
  onSelect: () => {},
  canWrite: true,
  onPatch: () => {},
  onSheet: () => {},
  familyId: 'fam',
  onSaveSalaries: () => {},
};

let peopleHtml = '';
let sheetHtml = '';
let controlHtml = '';
let avtalerHtml = '';
let complianceHtml = '';
let followHtml = '';

{
  peopleHtml = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: '',
    sheet: 'oversikt',
  }));
  const html = peopleHtml;
  // Kontrollsiden: avtale, lønn, lovpålagt og oppfølging i én liste.
  assert.match(html, /Lovpålagt/);
  assert.equal(html.includes('Sjekkliste'), false);
  assert.match(html, />Lønn</);
  assert.match(html, />Avtale</);
  assert.match(html, /Medarbeidersamtale/);
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Aktive · 1/);
  assert.match(html, /Deaktiverte · 0/);
  // Personell er egne ansatte. Innleide og eksterne ligger under Innleid personell.
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.includes('>Type<'), false);
  assert.equal(html.includes('Bo Ekstern'), false);
  assert.equal(html.includes('Skann og fyll ut'), false);
  assert.equal(html.includes('Hurtigregistrer'), false);
}

{
  sheetHtml = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: 'e1',
    sheet: 'avtale',
  }));
  const html = sheetHtml;
  assert.match(html, /Registrer avtale/);
  assert.match(html, /Ada Nordmann/);
  assert.equal(html.includes('Skann og fyll ut'), false);
  assert.equal(html.includes('Nøkkeldata'), false);
  assert.equal(html.includes('Bo Ekstern'), false);
}

{
  // Personellmappen har ikke lønn: ingen fane og ingen lønn i oversikten.
  const overview = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: 'e1',
    sheet: 'oversikt',
  }));
  assert.match(overview, /id="hr-sheet-compliance"/);
  assert.equal(overview.includes('hr-sheet-lonn'), false);
  assert.equal(overview.includes('Lønn'), false);
  assert.match(overview, /Lovpålagt/);

  // Åpnet fra Lønn-kolonnen: bare lønnen, og tilbake til listen.
  const salary = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: 'e1',
    sheet: 'lonn',
  }));
  assert.match(salary, /Til personellisten/);
  assert.equal(salary.includes('hr-sheet-avtale'), false);

  // Uten lønnsrettighet: ingen lønnskolonne, og lønnsfanen åpnes ikke.
  const noPayroll = { people: true, agreements: true, payroll: false, compliance: true };
  const listNoPay = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps, selectedId: '', sheet: 'oversikt', parts: noPayroll,
  }));
  assert.equal(listNoPay.includes('>Lønn<'), false);
  const sheetNoPay = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps, selectedId: 'e1', sheet: 'lonn', parts: noPayroll,
  }));
  assert.match(sheetNoPay, /id="hr-sheet-compliance"/);

  // Bare lønn (uten Personell): bare navn og lønn.
  const payOnly = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps, selectedId: '', sheet: 'oversikt',
    parts: { people: false, agreements: false, payroll: true, compliance: false },
  }));
  assert.match(payOnly, />Lønn</);
  assert.equal(payOnly.includes('Medarbeidersamtale'), false);
  assert.equal(payOnly.includes('>Avtale<'), false);
}

{
  // Lovpålagt-fanen: bare det HR eier, og kompetansen fra ISO som lesing.
  const html = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: 'e1',
    sheet: 'compliance',
    isoCompetence: {
      status: 'ready',
      rows: [
        { id: 'k1', title: 'HMS-introduksjon', status: 'gyldig', validTo: '' },
        { id: 'k2', title: 'Arbeidsmiljøopplæring', status: 'utlopt', validTo: '2025-01-31' },
      ],
    },
    onOpenIso: () => {},
  }));
  assert.match(html, /Lovpålagt/);
  assert.match(html, /Personverninformasjon gitt/);
  assert.match(html, /Verneutstyr utlevert/);
  assert.equal(html.includes('Kjenner avviksrutine'), false);
  assert.equal(html.includes('Kompetanse for rollen dokumentert'), false);
  assert.match(html, /id="hr-compliance-iso"/);
  assert.match(html, /1 av 2 krav er gyldige/);
  assert.match(html, /Utløpt · til 31\.01\.2025/);
  assert.match(html, /Åpne Kompetanse i ISO/);
  // Minimumskravene i AML § 14-6 settes fra avtalen, ikke ved avkrysning.
  assert.match(html, /id="hr-compliance-derived-aml_contract_minimum"/);
  assert.match(html, /Ingen aktiv arbeidsavtale\. Registrer den under Avtale/);
  // Øverst står hvor mange som mangler. Punktene står én gang, det som mangler først.
  assert.match(html, /id="hr-compliance-summary"/);
  assert.match(html, /Dette mangler: 4 av 4 påkrevde punkter/);
  assert.equal(html.includes('OK: 0/'), false);
  assert.equal((html.match(/>Skriftlig arbeidsavtale</g) || []).length, 1, 'punktet står bare én gang');
  assert.equal(html.includes('hr-compliance-gap-'), false, 'ingen egen liste over mangler i tillegg til punktene');
  const order = ['aml_written_contract', 'aml_contract_minimum', 'hms_card', 'gdpr_privacy_notice', 'aml_probation_documented']
    .map((id) => html.indexOf(`id="hr-compliance-item-${id}"`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'påkrevde mangler før punktene ved behov');
  assert.match(html, /Åpne Avtale/);
  // Avtalen følger det som er registrert under Avtale. Ingen avkrysning, ingen «Hent fra avtalen».
  assert.match(html, /id="hr-compliance-derived-aml_written_contract"/);
  assert.equal(html.includes('Hent fra avtalen'), false);
  assert.equal(html.includes('Marker alle påkrevde som OK'), false);
  assert.equal(html.includes('Arbeidsmiljøloven</span></button>'), false, 'ingen kildefilter');
  // Notatfeltet åpnes ved behov, ikke på hvert punkt.
  assert.equal(html.includes('Lagre notat'), false);
  assert.match(html, /Legg til notat/);
  // Forfalt kan ikke velges for hånd.
  assert.equal(html.includes('>Forfalt</span></button>'), false);

  // Avtale etter de gamle ni punktene: fortsatt ikke OK, og det står hva som mangler.
  const oldContract = {
    id: 'c1', employeeId: 'e1', status: 'active', startDate: '2020-01-01',
    employerName: 'A', employeeName: 'Ada', workplace: 'Oslo', positionTitle: 'Rådgiver',
    workPercent: '100', salaryAmount: '1', workHours: '37,5', noticePeriod: '3 mnd',
  };
  const partial = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    hr: { ...hr, contracts: [oldContract], compliance: [{ catalogId: 'aml_contract_minimum', employeeId: 'e1', status: 'ok' }] },
    selectedId: 'e1',
    sheet: 'compliance',
  }));
  assert.match(partial, /id="hr-compliance-state-aml_contract_minimum"[^>]*>Forfalt · påkrevd/);
  assert.match(partial, /Fyll ut i avtalen: .*Framgangsmåte ved opphør/);
  assert.match(partial, /Pensjon og andre trygdeordninger/);
  assert.match(partial, /id="hr-compliance-state-aml_written_contract"[^>]*>OK · påkrevd/);

  // HMS-kort: skann QR-koden eller registrer på personen, med varsel når kortet er utløpt.
  assert.match(html, /Gyldig HMS-kort/);
  assert.match(html, /id="hms-card-editor"/);
  assert.match(html, /Skann QR-koden/);
  assert.match(html, /Ta bilde av kortet/);
  assert.match(html, /Ikke aktuelt for denne personen/);
  const expired = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    hr: { ...hr, hmsCards: [{ employeeId: 'e1', number: 'HMS 42', validTo: '2020-01-31', qrUrl: 'https://hmskort.no/v/abc' }] },
    selectedId: 'e1',
    sheet: 'compliance',
  }));
  assert.match(expired, /id="hr-compliance-state-hms_card"[^>]*>Forfalt · påkrevd/);
  assert.match(expired, /HMS 42 · Utløpt 31\.01\.2020\. Bestill nytt kort på hmskort\.no/);
  assert.equal(expired.includes('hr-compliance-hms-alert'), false, 'utløpet står én gang, i statuslinjen');
  assert.match(expired, /Åpne kortet i HMS-kortregisteret/);

  // Bedrift utenfor bransjene med HMS-kort: punktet er «ved behov» og teller ikke.
  const office = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    hr: { ...hr, hmsRequired: false, hmsRule: { required: false, text: 'Kreves ikke etter bedriftens næringskode (62.010).' } },
    selectedId: 'e1',
    sheet: 'compliance',
  }));
  assert.match(office, /id="hr-compliance-state-hms_card"[^>]*>Mangler · ved behov/);
  assert.match(office, /Dette mangler: 3 av 3 påkrevde punkter/);
  assert.match(office, /Kreves ikke etter bedriftens næringskode \(62\.010\)\. Endres under HR → Lovpålagt\./);

  // Personverninformasjonen: ikke satt opp gir knapp til malen. Godkjent følger bekreftelsen.
  const noDoc = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    hr: { ...hr, privacyDoc: { state: 'none', published: false } },
    selectedId: 'e1',
    sheet: 'compliance',
    onOpenLibraryTemplate: () => {},
  }));
  assert.match(noDoc, /id="hr-compliance-privacy-setup"/);
  assert.match(noDoc, /Sett opp personverninformasjonen/);
  assert.match(noDoc, /nyansatte får oppgave med varsel/);
  const waiting = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    employees: employees.map((row) => (row.id === 'e1' ? { ...row, personUid: 'u1' } : row)),
    hr: { ...hr, privacyDoc: { state: 'published', published: true, revision: 2, acked: [], manual: [], ackedAt: {} } },
    selectedId: 'e1',
    sheet: 'compliance',
    onOpenLibraryTemplate: () => {},
  }));
  assert.match(waiting, /Venter på at personen leser og bekrefter versjon 2/);
  assert.equal(waiting.includes('hr-compliance-privacy-setup'), false);
  const confirmed = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    hr: { ...hr, privacyDoc: { state: 'published', published: true, revision: 2, acked: ['e1'], manual: [], ackedAt: { e1: '2026-10-29T08:00:00Z' } } },
    selectedId: 'e1',
    sheet: 'compliance',
  }));
  assert.match(confirmed, /id="hr-compliance-state-gdpr_privacy_notice"[^>]*>OK · påkrevd/);
  assert.match(confirmed, /Har lest og bekreftet versjon 2 29\.10\.2026/);

  // Uten tilgang til ISO: bare henvisningen, ingen knapp.
  const plain = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: 'e1',
    sheet: 'compliance',
  }));
  assert.match(plain, /følges opp i ISO \/ K-HMS → Kompetanse/);
  assert.equal(plain.includes('Åpne Kompetanse i ISO'), false);
}

{
  // Personell er kontrollsiden: lønn, avtale og lovpålagt i samme liste, med delene under.
  const withHired = [
    ...employees,
    {
      id: 'e3',
      person: { firstName: 'Aina', lastName: 'Jespersen' },
      company: { status: 'active', personnelKind: 'external', title: 'Regnskap' },
    },
  ];
  controlHtml = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps, employees: withHired, selectedId: '', sheet: 'oversikt', company: { name: 'Test AS', orgnr: '' },
  }));
  avtalerHtml = controlHtml;
  complianceHtml = controlHtml;
  const html = controlHtml;
  assert.match(html, /id="hr-people"/);
  assert.match(html, />Lønn</);
  assert.match(html, />Avtale</);
  assert.match(html, /Ingen avtale/);
  assert.match(html, /Ikke satt/);
  // Lønnskartlegging fordelt på kjønn (ARP) under listen.
  assert.match(html, /id="hr-pay-gap"/);
  assert.match(html, /Lønnskartlegging fordelt på kjønn/);
  assert.match(html, /Ingen ansatte har både registrert lønn og kjønn ennå/);
  // HMS-kort og oversiktsliste for byggeplass.
  assert.match(html, /id="hr-hms-cards"/);
  assert.match(html, /HMS-kort og oversiktsliste/);
  assert.match(html, /Last ned oversiktsliste \(CSV\)/);
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.includes('Aina Jespersen'), false);
  assert.equal(html.includes('Bo Ekstern'), false);

  const staff = ['K1', 'K2', 'K3', 'M1', 'M2', 'M3'].map((id) => ({
    id,
    person: { firstName: id, lastName: 'Test', gender: id.startsWith('K') ? 'Kvinne' : 'Mann' },
    company: { status: 'active', personnelKind: 'staff', title: 'Ingeniør' },
  }));
  const pay = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: '',
    sheet: 'oversikt',
    employees: staff,
    hr: {
      ...hr,
      salaries: staff.map((row, i) => ({ id: `s${i}`, employeeId: row.id, kind: 'actual', effectiveDate: '2026-01-01', annualAmount: row.id.startsWith('K') ? 630000 : 700000 })),
    },
  }));
  assert.match(pay, /Kvinners lønn av menns/);
  assert.match(pay, /Ingeniør/);
  assert.match(pay, /90 %/);

  // Uten lønns- og lovpålagt-rettighet: ingen lønnskartlegging og ingen HMS-kort.
  const peopleOnly = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps, selectedId: '', sheet: 'oversikt',
    parts: { people: true, agreements: false, payroll: false, compliance: false },
  }));
  assert.equal(peopleOnly.includes('id="hr-pay-gap"'), false);
  assert.equal(peopleOnly.includes('id="hr-hms-cards"'), false);
}

{
  followHtml = renderToStaticMarkup(React.createElement(HrControl, {
    colors,
    page: 'oppfolging',
    employees: [
      ...employees,
      {
        id: 'e3',
        person: { firstName: 'Aina', lastName: 'Jespersen' },
        company: { status: 'active', personnelKind: 'external', title: 'Regnskap' },
      },
    ],
    hr,
    entries: [],
    onOpenEmployee: () => {},
  }));
  const html = followHtml;
  // Oppfølging gjelder egne ansatte. Innleide følges opp under Innleid personell.
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Siste samtale/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.match(html, /Innleid personell/);
  assert.equal(html.includes('id="hr-follow-external"'), false);
  assert.equal(html.includes('Aina Jespersen'), false);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
}

let hiredHtml = '';
let hiredSheetHtml = '';
let innleieDashHtml = '';
{
  // Innleid personell: egen liste med lovkrav for innleie, ikke egne ansattes Lovpålagt.
  const hiredEmployees = [
    ...employees,
    {
      id: 'e3',
      person: { firstName: 'Aina', lastName: 'Jespersen' },
      company: { status: 'active', personnelKind: 'innleid', title: 'Tømrer' },
    },
    {
      id: 'e4',
      person: { firstName: 'Rolf', lastName: 'Regnskap' },
      company: { status: 'active', personnelKind: 'external', title: 'Regnskap' },
    },
  ];
  const hiredProps = {
    colors,
    employees: hiredEmployees,
    hr,
    onSelect: () => {},
    onSheet: () => {},
    canWrite: true,
    onPatch: () => {},
    familyId: 'fam',
  };
  hiredHtml = renderToStaticMarkup(React.createElement(InnleiePeople, { ...hiredProps, notices: [], selectedId: '' }));
  const html = hiredHtml;
  assert.match(html, /id="hr-hired"/);
  assert.match(html, /Aina Jespersen/);
  assert.match(html, /Rolf Regnskap/);
  assert.equal(html.includes('Ada Nordmann'), false, 'egne ansatte står ikke her');
  assert.match(html, /id="innleie-status-active"/);
  assert.match(html, /id="innleie-status-inactive"/);
  assert.match(html, /1 innleid · 1 ekstern/);
  assert.match(html, /7 lovkrav mangler/);
  assert.equal(html.includes('Ansettelsesavtale'), false);
  assert.equal(html.includes('Medarbeidersamtale'), false);

  hiredSheetHtml = renderToStaticMarkup(React.createElement(InnleiePeople, {
    ...hiredProps, selectedId: 'e3', sheet: 'krav', notices: [{ employeeId: 'e3', fromDate: localIsoDate(), toDate: localIsoDate(), note: '' }],
  }));
  const sheet = hiredSheetHtml;
  assert.match(sheet, /Til innleid personell/);
  assert.match(sheet, /Borte/);
  assert.match(sheet, /id="hr-hired-summary"/);
  assert.match(sheet, /7 lovkrav mangler/);
  assert.match(sheet, /id="hr-hired-level-law"/);
  assert.match(sheet, /id="hr-hired-level-advice"/);
  assert.match(sheet, /Lovlig grunnlag for innleien/);
  assert.match(sheet, /Bemanningsforetaket er registrert hos Arbeidstilsynet/);
  assert.match(sheet, /Gyldig HMS-kort/);
  assert.match(sheet, /Skriftlig avtale med leverandøren/);
  // Kompakt: detaljene (lovtekst, knapper) vises først når linjen åpnes.
  assert.equal(sheet.includes('hr-hired-detail-'), false);
  assert.equal(sheet.includes('AML § 14-12a'), false);
  assert.equal(sheet.includes('Skriftlig arbeidsavtale'), false, 'arbeidsavtalen er bemanningsforetakets ansvar');
  assert.equal(sheet.includes('Databehandleravtale'), false, 'gjelder eksterne, ikke innleide');

  const ext = renderToStaticMarkup(React.createElement(InnleiePeople, { ...hiredProps, notices: [], selectedId: 'e4', sheet: 'krav' }));
  assert.match(ext, /Databehandleravtale/);
  assert.equal(ext.includes('Lovlig grunnlag for innleien'), false);

  // Saker og oppgaver uten medarbeidersamtaler.
  const follow = renderToStaticMarkup(React.createElement(InnleiePeople, { ...hiredProps, notices: [], selectedId: 'e3', sheet: 'oppfolging' }));
  assert.match(follow, /id="hr-follow-tab-cases"/);
  assert.equal(follow.includes('hr-follow-tab-reviews'), false);

  // Oversikten i Innleie.
  innleieDashHtml = renderToStaticMarkup(React.createElement(InnleieDashboard, {
    colors, employees: hiredEmployees, hr, notices: [{ employeeId: 'e3', fromDate: localIsoDate(), toDate: localIsoDate(), note: 'Kurs' }],
  }));
  assert.match(innleieDashHtml, /id="innleie-kpis"/);
  assert.match(innleieDashHtml, /Borte i dag/);
  assert.match(innleieDashHtml, /id="innleie-away"/);
  assert.match(innleieDashHtml, /Kurs/);
  assert.match(innleieDashHtml, /id="innleie-gaps"/);
  assert.match(innleieDashHtml, /id="innleie-person-e3"/);
  assert.equal(innleieDashHtml.includes('Ada Nordmann'), false);

  // En egen ansatt åpnes ikke her, og en innleid åpnes ikke i personellmappen.
  const wrong = renderToStaticMarkup(React.createElement(InnleiePeople, { ...hiredProps, notices: [], selectedId: 'e1', sheet: 'krav' }));
  assert.match(wrong, /id="hr-hired"/);
  const wrongPeople = renderToStaticMarkup(React.createElement(HrPeople, { ...peopleProps, employees: hiredEmployees, selectedId: 'e3', sheet: 'oversikt' }));
  assert.match(wrongPeople, /id="hr-people"/);
}

{
  const html = renderToStaticMarkup(React.createElement(HrContracts, {
    colors,
    employees,
    hr,
    canWrite: true,
    onPatch: () => {},
    familyId: 'fam',
    lockedEmployeeId: 'e1',
  }));
  assert.match(html, /Registrer avtale/);
  assert.equal(html.includes('Skann og fyll ut'), false);
}

function isoIn(days, yearsBack = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear() - yearsBack;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const dashboardEmployees = [
  {
    id: 'staff-a',
    person: { firstName: 'Geir Ove', lastName: 'Andersen', birthDate: isoIn(18, 40) },
    company: { status: 'active', personnelKind: 'staff', periodFrom: isoIn(22, 3), title: 'Rådgiver' },
  },
  {
    id: 'staff-b',
    person: { firstName: 'Daniel Edvard', lastName: 'Wold', birthDate: isoIn(40, 35) },
    company: { status: 'active', personnelKind: 'staff', periodFrom: isoIn(12, 5), title: 'Konsulent' },
  },
  {
    id: 'ext-a',
    person: { firstName: 'Øyvind', lastName: 'Granberg', birthDate: isoIn(4, 32) },
    company: { status: 'active', personnelKind: 'external', periodFrom: isoIn(6, 2), title: 'Innleid' },
  },
];

let dashboardHtml = '';
let linkedHtml = '';
let caseHtml = '';
{
  dashboardHtml = renderToStaticMarkup(React.createElement(HrDashboard, {
    colors,
    employees: dashboardEmployees,
    hr,
    canWrite: true,
    onPatch: () => {},
    onOpenPeople: () => {},
    onOpenFollowUp: () => {},
    kin: {
      missing: dashboardEmployees.map((employee) => ({ employee, task: null })),
      busy: false,
      remindNow: async () => 0,
    },
  }));
  const html = dashboardHtml;
  const staffAt = html.indexOf('id="hr-dash-staff"');
  const externalAt = html.indexOf('id="hr-dash-external"');
  assert.ok(staffAt >= 0, 'mangler egne ansatte');
  assert.ok(externalAt > staffAt, 'eksterne skal etter egne ansatte');
  const staffPart = html.slice(0, externalAt);
  const externalPart = html.slice(externalAt);
  assert.ok(html.indexOf('Geir Ove Andersen') > staffAt);
  assert.ok(staffPart.includes('Daniel Edvard Wold'));
  assert.equal(html.includes('Øyvind Granberg'), false, 'innleide og eksterne vises i Innleie, ikke i HR');
  assert.match(externalPart, /Følges opp i Innleie/);
  assert.equal(externalPart.includes('Geir Ove Andersen'), false);
  assert.match(html, /aria-label="Egne ansatte: 2"/, 'eksterne telles ikke som ansatte');
  assert.match(html, /id="hr-event-list"/);
  assert.match(html, /id="hr-kin"/);
  assert.match(staffPart, /2 ansatte mangler pårørende/, 'pårørende gjelder egne ansatte');
  assert.match(html, /id="hr-kpis"/);
  assert.match(html, /repeat\(auto-fill, minmax\(min\(100%, max\(300px, calc\(\(100% - 32px\) \/ 3\)\)\), 1fr\)\)/);
  assert.match(html, /Planlegg/);
  assert.match(externalPart, /1 innleid eller ekstern er aktiv/);
}

{
  linkedHtml = renderToStaticMarkup(React.createElement(HrDashboard, {
    colors,
    employees: dashboardEmployees,
    hr: {
      ...hr,
      cases: [{
        id: 'case-jubilee',
        employeeId: 'staff-b',
        title: 'Planlegg jubileum: 3-årsjubileum',
        status: 'open',
        dueDate: '2026-11-01',
        description: 'Daniel Edvard Wold · 3-årsjubileum',
        assigneeName: 'Geir',
        taskId: 'task-1',
      }],
    },
    canWrite: true,
    onPatch: () => {},
    onOpenCase: () => {},
    onOpenFollowUp: () => {},
  }));
  assert.match(linkedHtml, /id="hr-case-case-jubilee"/);
  assert.match(linkedHtml, /Planlegg jubileum: 3-årsjubileum/);
  assert.match(linkedHtml, /oppgave til Geir/);
  assert.match(linkedHtml, /Daniel Edvard Wold/);
}

{
  caseHtml = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    selectedId: 'e1',
    sheet: 'oppfolging',
    focusCaseId: 'case-1',
    assigneeName: 'Geir',
    hr: {
      ...hr,
      cases: [{
        id: 'case-1',
        employeeId: 'e1',
        title: 'Planlegg jubileum: 3-årsjubileum',
        status: 'open',
        dueDate: '2026-11-01',
        description: 'Ada Nordmann · 3-årsjubileum',
        assigneeName: 'Geir',
        taskId: 'task-9',
      }],
    },
  }));
  assert.match(caseHtml, /id="hr-case-detail"/);
  assert.match(caseHtml, /Åpne oppgave/);
  assert.match(caseHtml, /id="hr-open-task"/);
  assert.match(caseHtml, /Ansvar Geir/);
  assert.match(caseHtml, /Ada Nordmann/);
}

// HR bruker modulmenyen i skallet (ModuleTabs), som de andre modulene (UX-19).
const ModuleTabs = component('components/ModuleTabs.jsx');
const { moduleTabsFor } = load(path.join(ROOT, 'src/navigation/moduleTabs.js'));
const sectionLabels = ['Oversikt', 'Ansatte', 'Oppfølging', 'Rekruttering', 'Rutiner'];

let phoneNavHtml = '';
let phoneSheetHtml = '';
{
  // HR har deler som ISO: første rad er delene, andre rad sidene i delen du står i.
  phoneNavHtml = renderToStaticMarkup(React.createElement(ModuleTabs, {
    menu: moduleTabsFor('hr', 'lonn'),
    onSelect: () => {},
  }));
  for (const label of sectionLabels) assert.match(phoneNavHtml, new RegExp(label));
  assert.match(phoneNavHtml, /id="module-tab-del-ansatte"/);
  // Ansattregisteret (HR › Ansatte) er første side i delen.
  // Avtaler, Lønn og Lovpålagt er samlet i Personell.
  assert.match(phoneNavHtml, /Ansatte \(2 sider\)/);
  for (const id of ['ansatte', 'personell']) {
    assert.match(phoneNavHtml, new RegExp(`id="module-tab-hr-${id}"`));
  }
  // Sidene i de andre delene står ikke i andre rad.
  assert.equal(phoneNavHtml.includes('module-tab-hr-sykefravaer'), false);
  assert.equal(phoneNavHtml.includes('module-tab-hr-handbok'), false);
}

{
  // Oversikt er en del med én side: ingen andre rad.
  phoneSheetHtml = renderToStaticMarkup(React.createElement(ModuleTabs, {
    menu: moduleTabsFor('hr', 'oversikt'),
    onSelect: () => {},
  }));
  assert.match(phoneSheetHtml, /id="module-tab-del-oversikt"/);
  assert.equal(phoneSheetHtml.includes('module-tab-hr-personell'), false);
}

const previewDir = '/opt/cursor/artifacts';
if (fs.existsSync(previewDir)) {
  const page = (title, body) => `<!doctype html><html lang="nb"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { margin: 0; font-family: "Segoe UI", sans-serif; background: #f4f7fb; color: #152033; }
  main { max-width: 1100px; margin: 24px auto; }
  div { box-sizing: border-box; }
  button { font: inherit; background: transparent; cursor: pointer; text-align: left; }
</style></head><body><main>${body}</main></body></html>`;
  fs.writeFileSync(path.join(previewDir, 'hr-personell.html'), page('Personell', peopleHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-avtale.html'), page('Avtale', sheetHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-personell-kontroll.html'), page('Personell', controlHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-oversikt.html'), page('HR-oversikt', dashboardHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-oppfolging-sak.html'), page('Oppfølgingssak', linkedHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-sak-detalj.html'), page('Sak', caseHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-oppfolging.html'), page('Oppfølging', followHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-innleid.html'), page('Innleid personell', hiredHtml));
  fs.writeFileSync(path.join(previewDir, 'innleie-oversikt.html'), page('Innleie', innleieDashHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-innleid-krav.html'), page('Krav', hiredSheetHtml));
}

console.log('hr directory render ok');
