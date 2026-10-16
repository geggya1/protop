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
  return {
    ...(id ? { id } : {}),
    ...(style && Object.keys(style).length ? { style } : {}),
  };
}

const rnMock = {
  View: (props) => React.createElement('div', domProps(props), props?.children),
  Text: (props) => React.createElement('span', domProps(props), props?.children),
  ScrollView: (props) => React.createElement('div', domProps(props), props?.children),
  Pressable: (props) => React.createElement('button', { type: 'button', ...domProps(props) }, props?.children),
  TextInput: (props) => React.createElement('input', { placeholder: props?.placeholder, defaultValue: props?.value }),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Platform: { OS: 'web', select: (options) => options?.web || options?.default },
};

function mocked(id) {
  if (id === 'react') return React;
  if (id === 'react-native') return rnMock;
  if (id === '@expo/vector-icons') return { Ionicons: () => null };
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
  assert.match(html, /Åpne sjekkliste/);
  assert.match(html, /Aktive/);
  assert.match(html, /Deaktiverte/);
  assert.equal(html.includes('Intern ·'), false);
  assert.equal(html.includes('Ekstern ·'), false);
  assert.equal(html.includes('Aina Jespersen'), false);
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
{
  dashboardHtml = renderToStaticMarkup(React.createElement(HrDashboard, {
    colors,
    employees: dashboardEmployees,
    hr,
    canWrite: true,
    onPatch: () => {},
    onOpenPeople: () => {},
  }));
  const html = dashboardHtml;
  const internalAt = html.indexOf('Aktive ansatte');
  const externalAt = html.indexOf('Eksternt aktiv');
  assert.ok(internalAt >= 0, 'mangler Aktive ansatte');
  assert.ok(externalAt > internalAt, 'eksterne skal etter egne ansatte');
  assert.ok(html.indexOf('Geir Ove Andersen') > internalAt);
  assert.ok(html.indexOf('Geir Ove Andersen') < externalAt);
  assert.ok(html.indexOf('Daniel Edvard Wold') < externalAt);
  assert.ok(html.indexOf('Øyvind Granberg') > externalAt);
  assert.match(html, /id="hr-event-grid-internal"/);
  assert.match(html, /id="hr-event-grid-external"/);
  assert.match(html, /repeat\(auto-fill, minmax\(min\(100%, 420px\), 1fr\)\)/);
  assert.match(html, /Planlegg/);
  assert.equal(html.includes('Eksternt deaktivert'), false);
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
  fs.writeFileSync(path.join(previewDir, 'hr-avtaler.html'), page('Ansettelsesavtaler', avtalerHtml));
  fs.writeFileSync(path.join(previewDir, 'hr-lov-iso.html'), page('Lov og ISO', complianceHtml));
}

console.log('hr directory render ok');
