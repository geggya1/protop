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
  assert.match(html, /Sjekkliste/);
  assert.match(html, /Ansettelsesavtale/);
  assert.match(html, /Medarbeidersamtale/);
  assert.match(html, /Fakturerbarhet/);
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.match(html, /Intern/);
  assert.match(html, /Ekstern/);
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
  assert.match(html, /Mangler · Ingen aktiv arbeidsavtale/);

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
  assert.match(partial, /Forfalt · Settes fra avtalen\. Mangler: .*Framgangsmåte ved opphør/);
  assert.match(partial, /Pensjon og andre trygdeordninger/);

  // HMS-kort: registreres på personen, med varsel når kortet er utløpt.
  assert.match(html, /Gyldig HMS-kort/);
  assert.match(html, /id="hr-compliance-hms-card"/);
  assert.match(html, /Registrer kortnummer og utløpsdato under/);
  assert.match(html, /Ikke aktuelt: arbeider ikke på byggeplass/);
  const expired = renderToStaticMarkup(React.createElement(HrPeople, {
    ...peopleProps,
    hr: { ...hr, hmsCards: [{ employeeId: 'e1', number: 'HMS 42', validTo: '2020-01-31' }] },
    selectedId: 'e1',
    sheet: 'compliance',
  }));
  assert.match(expired, /Forfalt · HMS 42 · Utløpt 31\.01\.2020/);
  assert.match(expired, /HMS-kortet er utløpt \(31\.01\.2020\)\. Bestill nytt kort\./);

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
  controlHtml = renderToStaticMarkup(React.createElement(HrControl, {
    colors,
    page: 'lonn',
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
  const html = controlHtml;
  assert.match(html, /Gjeldende lønn/);
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Mangler/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.includes('Aina Jespersen'), false);
  assert.equal(html.includes('Bo Ekstern'), false);
}

{
  avtalerHtml = renderToStaticMarkup(React.createElement(HrControl, {
    colors,
    page: 'avtaler',
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
  const html = avtalerHtml;
  assert.match(html, /Ansettelsesavtaler/);
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.includes('Aina Jespersen'), false);
}

{
  complianceHtml = renderToStaticMarkup(React.createElement(HrControl, {
    colors,
    page: 'compliance',
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
  const html = complianceHtml;
  assert.match(html, /Sjekkliste for egne ansatte/);
  assert.match(html, /Ada Nordmann/);
  assert.match(html, /Skriftlig arbeidsavtale/);
  // HMS-kort og oversiktsliste for byggeplass under sjekklisten.
  assert.match(html, /id="hr-hms-cards"/);
  assert.match(html, /HMS-kort og oversiktsliste/);
  assert.match(html, /Ingen HMS-kort er utløpt/);
  assert.match(html, /Last ned oversiktsliste \(CSV\)/);
  assert.match(html, /Åpne sjekkliste/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.includes('Aina Jespersen'), false);
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
  const staffAt = html.indexOf('Ada Nordmann');
  const sectionAt = html.indexOf('id="hr-follow-external"');
  const externalAt = html.indexOf('Aina Jespersen');
  assert.ok(staffAt >= 0 && sectionAt > staffAt && externalAt > sectionAt);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.match(html, /Egen oppfølging/);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.slice(0, sectionAt).includes('Siste samtale'), true);
  assert.equal(html.slice(sectionAt).includes('Siste samtale'), false);
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
  assert.equal(staffPart.includes('Øyvind Granberg'), false, 'eksterne skal ikke blandes inn hos egne ansatte');
  assert.ok(externalPart.includes('Øyvind Granberg'));
  assert.equal(externalPart.includes('Geir Ove Andersen'), false);
  assert.match(html, /aria-label="Egne ansatte: 2"/, 'eksterne telles ikke som ansatte');
  assert.match(html, /id="hr-event-list"/);
  assert.match(html, /id="hr-kin"/);
  assert.match(staffPart, /2 ansatte mangler pårørende/, 'pårørende gjelder egne ansatte');
  assert.match(html, /id="hr-kpis"/);
  assert.match(html, /repeat\(auto-fill, minmax\(min\(100%, max\(300px, calc\(\(100% - 32px\) \/ 3\)\)\), 1fr\)\)/);
  assert.match(html, /Planlegg/);
  assert.match(externalPart, /Aktive eksterne/);
  assert.match(externalPart, /Følg opp/);
  assert.equal(html.includes('Deaktiverte eksterne'), false);
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

const HrSectionNav = component('screens/hr/HrSectionNav.jsx');
const sectionLabels = ['Oversikt', 'Personell', 'Avtaler', 'Lønn', 'Oppfølging', 'Lovpålagt', 'Rekruttering'];

let phoneNavHtml = '';
let phoneSheetHtml = '';
let desktopNavHtml = '';
{
  phoneNavHtml = renderToStaticMarkup(React.createElement(HrSectionNav, {
    colors,
    page: 'oversikt',
    isPhone: true,
    onChange: () => {},
  }));
  assert.match(phoneNavHtml, /id="hr-section-picker"/);
  assert.match(phoneNavHtml, /Bytt seksjon, Oversikt/);
  assert.match(phoneNavHtml, /Oversikt/);
  assert.equal(phoneNavHtml.includes('id="hr-tabs"'), false);
  for (const label of sectionLabels.slice(1)) {
    assert.equal(phoneNavHtml.includes(label), false, `lukket mobilmeny skal ikke vise ${label}`);
  }
}

{
  phoneSheetHtml = renderToStaticMarkup(React.createElement(HrSectionNav, {
    colors,
    page: 'oversikt',
    isPhone: true,
    sheetOpen: true,
    onChange: () => {},
  }));
  assert.match(phoneSheetHtml, /id="hr-section-picker"/);
  assert.match(phoneSheetHtml, /Seksjon/);
  for (const label of sectionLabels) {
    assert.match(phoneSheetHtml, new RegExp(label.replace('&', '&amp;')));
  }
  assert.match(phoneSheetHtml, /id="hr-section-personell"/);
  assert.match(phoneSheetHtml, /id="hr-section-rekruttering"/);
}

{
  desktopNavHtml = renderToStaticMarkup(React.createElement(HrSectionNav, {
    colors,
    page: 'personell',
    isPhone: false,
    onChange: () => {},
  }));
  assert.match(desktopNavHtml, /id="hr-tabs"/);
  assert.equal(desktopNavHtml.includes('id="hr-section-picker"'), false);
  for (const label of sectionLabels) {
    assert.match(desktopNavHtml, new RegExp(label.replace('&', '&amp;')));
  }
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
  fs.writeFileSync(path.join(previewDir, 'hr-lonn-kontroll.html'), page('Lønn', controlHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-oversikt.html'), page('HR-oversikt', dashboardHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-oppfolging-sak.html'), page('Oppfølgingssak', linkedHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-sak-detalj.html'), page('Sak', caseHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-avtaler.html'), page('Ansettelsesavtaler', avtalerHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-lovpalagt.html'), page('Lovpålagt', complianceHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-oppfolging.html'), page('Oppfølging', followHtml));
}

console.log('hr directory render ok');
