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
const syncLazyScreen = require('../../tests/helpers/syncLazyScreen.cjs');
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
    if (id.includes('ui/lazyScreen')) return syncLazyScreen(mod.require);
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


/*
 * Innleie og eksterne: sidene tegnes uten Firebase. Oversikten, Leverandørkontroll og
 * Oppfølging, og Ansatte-listen med bare egne ansatte.
 */
const InnleieDashboard = component('screens/innleie/InnleieDashboard.jsx');
const InnleieSuppliers = component('screens/innleie/InnleieSuppliers.jsx');
const InnleieFollowUp = component('screens/innleie/InnleieFollowUp.jsx');
const EmployeeDirectory = component('components/employees/EmployeeDirectory.jsx');
const TimesheetEmployeePicker = component('components/arbeid/TimesheetEmployeePicker.jsx');

const people = [
  { id: 'own', person: { firstName: 'Ada', lastName: 'Egen' }, company: { status: 'active', personnelKind: 'staff' } },
  { id: 'inn', person: { firstName: 'Ivar', lastName: 'Innleid' }, company: { status: 'active', personnelKind: 'innleid', periodFrom: '2023-06-01' } },
  { id: 'ext', person: { firstName: 'Eva', lastName: 'Ekstern' }, company: { status: 'active', personnelKind: 'external', periodFrom: '2025-01-01', periodTo: '2027-01-01' } },
  { id: 'old', person: { firstName: 'Olav', lastName: 'Ferdig' }, company: { status: 'inactive', personnelKind: 'innleid' } },
];
const hr = {
  compliance: [],
  hmsCards: [],
  cases: [],
  suppliers: [{ id: 's1', name: 'Bemanning AS', kind: 'bemanning', employeeIds: ['inn'] }],
  hiredFollowUps: [{ id: 'f1', employeeId: 'ext', kind: 'trivsel', score: 4, date: new Date().toISOString().slice(0, 10) }],
};

{
  const html = renderToStaticMarkup(React.createElement(InnleieDashboard, { colors, employees: people, hr, notices: [] }));
  assert.match(html, /id="innleie-kpis"/);
  assert.match(html, /id="innleie-kpi-trivsel"/);
  assert.match(html, /id="innleie-duration"/);
  assert.match(html, /Ivar Innleid/);
  assert.match(html, /tre år/, 'innleid i over tre år gir varsel');
  assert.match(html, /id="innleie-mix"/);
  assert.match(html, /Bemanning AS/);
  assert.match(html, /Ikke koblet til leverandør/);
  assert.match(html, /id="innleie-followup-card"/);
  assert.equal(html.includes('Ada Egen'), false, 'egne ansatte står ikke i Innleie');
}

{
  const list = renderToStaticMarkup(React.createElement(InnleieSuppliers, { colors, employees: people, hr, canWrite: true, onPatch: () => {} }));
  assert.match(list, /id="innleie-suppliers"/);
  assert.match(list, /id="innleie-supplier-new"/);
  assert.match(list, /id="innleie-supplier-s1"/);
  assert.match(list, /lovkrav mangler/);
  const empty = renderToStaticMarkup(React.createElement(InnleieSuppliers, { colors, employees: people, hr: { suppliers: [] }, canWrite: false, onPatch: () => {} }));
  assert.match(empty, /Ingen leverandører ennå/);
  assert.equal(empty.includes('innleie-supplier-new'), false, 'uten skrivetilgang: ingen ny-knapp');
}

{
  const list = renderToStaticMarkup(React.createElement(InnleieFollowUp, { colors, employees: people, hr, canWrite: true, onPatch: () => {}, selectedId: '' }));
  assert.match(list, /id="innleie-followup"/);
  assert.match(list, /id="innleie-followup-due"/);
  assert.match(list, /id="innleie-followup-ext"/);
  assert.match(list, /id="innleie-followup-inn"/);
  assert.equal(list.includes('innleie-followup-own'), false);
  const sheet = renderToStaticMarkup(React.createElement(InnleieFollowUp, { colors, employees: people, hr, canWrite: true, onPatch: () => {}, selectedId: 'ext' }));
  assert.match(sheet, /id="innleie-followup-sheet"/);
  assert.match(sheet, /id="innleie-trivsel-scale"/);
  assert.match(sheet, /Trivsel 4\/5/);
}

{
  // Ansatte: bare egne ansatte, og en lenke til de innleide.
  const html = renderToStaticMarkup(React.createElement(EmployeeDirectory, {
    rows: people, companyName: 'Firma AS', colors, ownOnly: true,
    externalNote: React.createElement('span', { id: 'hired-note' }, 'lenke'),
    renderPerson: (row) => React.createElement('span', { key: row.id }, row.person.firstName),
  }));
  assert.match(html, /id="employees-section-company"/);
  assert.equal(html.includes('employees-section-external'), false);
  assert.match(html, /id="hired-note"/);
  const both = renderToStaticMarkup(React.createElement(EmployeeDirectory, {
    rows: people, companyName: 'Firma AS', colors,
    renderPerson: (row) => React.createElement('span', { key: row.id }, row.person.firstName),
  }));
  assert.match(both, /id="employees-section-external"/, 'tilgangsstyringen viser fortsatt begge');
}

{
  // Timer for innleide: bryter mellom eksterne og interne, én gruppe om gangen.
  const props = { colors, employees: people, companyName: 'Firma AS', query: '', onQueryChange: () => {}, onSelect: () => {} };
  const ext = renderToStaticMarkup(React.createElement(TimesheetEmployeePicker, { ...props, scope: 'external' }));
  assert.match(ext, /id="timesheet-scope"/);
  assert.match(ext, /id="timesheet-pick-section-external"/);
  assert.equal(ext.includes('timesheet-pick-section-company'), false);
  const own = renderToStaticMarkup(React.createElement(TimesheetEmployeePicker, { ...props, scope: 'company' }));
  assert.match(own, /id="timesheet-pick-section-company"/);
  assert.equal(own.includes('timesheet-pick-section-external'), false);
  const today = renderToStaticMarkup(React.createElement(TimesheetEmployeePicker, props));
  assert.equal(today.includes('timesheet-scope'), false, 'under Ansatte: begge gruppene som før');
  assert.match(today, /id="timesheet-pick-section-external"/);
}

console.log('innleie render ok');
