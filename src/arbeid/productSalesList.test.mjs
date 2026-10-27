/**
 * Produktsalg-tabellen viser katalogsalg, søk, sortering, eksport,
 * prosjektlenke, lås på fakturert salg, sider og tomtilstand.
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

function domProps(props) {
  const id = props?.nativeID;
  const extra = {};
  if (props?.placeholder) extra.placeholder = props.placeholder;
  if (props?.value != null) extra.defaultValue = props.value;
  if (props?.accessibilityLabel) extra['aria-label'] = props.accessibilityLabel;
  return { ...(id ? { id } : {}), ...extra };
}

const rnMock = {
  View: (props) => React.createElement('div', domProps(props), props?.children),
  Text: (props) => React.createElement('span', domProps(props), props?.children),
  ScrollView: (props) => React.createElement('div', domProps(props), props?.children),
  TouchableOpacity: (props) => React.createElement('button', { type: 'button', ...domProps(props) }, props?.children),
  Pressable: (props) => React.createElement('button', { type: 'button', ...domProps(props) }, props?.children),
  TextInput: (props) => React.createElement('input', domProps(props)),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
};
const iconMock = {
  Ionicons: (props) => React.createElement('i', { 'data-icon': props?.name }),
};
const pickerMock = {
  __esModule: true,
  default: (props) => React.createElement('select', { 'aria-label': props?.accessibilityLabel }),
};

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
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return iconMock;
    if (id.endsWith('components/OptionPicker')) return pickerMock;
    const resolved = resolveFrom(id, mod);
    if (resolved.endsWith('.js') || resolved.endsWith('.jsx')) return load(resolved);
    return require(resolved);
  };
  mod._compile(out.code, full);
  cache.set(full, mod);
  return mod.exports;
}

const { ProductSalesList } = load(path.join(ROOT, 'screens/arbeid/ProductSalesList.jsx'));
const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2',
  card: '#fff', bg: '#F4F7FB', sunken: '#F3F6FA', placeholder: '#94a3b8',
};
const sale = {
  id: 'sal-1',
  date: '2026-10-16',
  name: 'Hansker',
  sku: 'H-1',
  quantity: 2,
  unit: 'stk',
  customerName: 'CONSULT1 AS',
  projectNumber: '42',
  projectName: 'Verksted',
  amountInclVat: 300,
  status: 'draft',
};

const filled = renderToStaticMarkup(React.createElement(ProductSalesList, {
  colors,
  rows: [sale],
  totalCount: 1,
  query: '',
  status: '',
}));
assert.match(filled, /produktsalg-search/);
assert.match(filled, /Søk i produkt, varenr, kunde, prosjekt eller dato/);
assert.match(filled, /produktsalg-table/);
assert.match(filled, /Hansker/);
assert.match(filled, /CONSULT1 AS/);
assert.match(filled, /#42/);
assert.match(filled, /Utkast/);
assert.match(filled, /1 salg/);

const empty = renderToStaticMarkup(React.createElement(ProductSalesList, {
  colors,
  rows: [],
  totalCount: 0,
}));
assert.match(empty, /Ingen produktsalg er registrert ennå/);
assert.match(empty, /selges til en kunde/);
assert.doesNotMatch(empty, /produktsalg-table/);

const missed = renderToStaticMarkup(React.createElement(ProductSalesList, {
  colors,
  rows: [],
  totalCount: 4,
  query: 'mangler',
}));
assert.match(missed, /Ingen produktsalg treffer søket/);
assert.match(missed, /0 av 4/);

// Sorterbare kolonner, eksport, prosjektlenke og lås på fakturert salg.
const invoiced = { ...sale, id: 'sal-2', name: 'Fremleie', projectId: 'prj-42', status: 'invoiced', invoiceId: 'inv-1', amountInclVat: 1000 };
const rich = renderToStaticMarkup(React.createElement(ProductSalesList, {
  colors,
  rows: [sale, invoiced],
  totalCount: 2,
  sort: { key: 'amount', dir: 'asc' },
  onSort: () => {},
  onOpen: () => {},
  onOpenProject: () => {},
  onExport: () => {},
  counts: { all: 2, draft: 1, approved: 0, invoiced: 1 },
  filterOptions: { projects: [{ id: 'id:prj-42', label: '#42 Verksted' }], customers: [] },
}));
for (const key of ['date', 'name', 'quantity', 'customer', 'project', 'employee', 'amount', 'status']) {
  assert.match(rich, new RegExp(`produktsalg-sort-${key}`), `kolonnen ${key} skal kunne sorteres`);
}
assert.match(rich, /data-icon="arrow-up"/, 'aktiv sortering viser pil');
assert.match(rich, /produktsalg-eksport/);
assert.match(rich, /Eksporter til Excel/);
assert.match(rich, /produktsalg-prosjekt-sal-2/, 'koblet prosjekt er en lenke');
assert.doesNotMatch(rich, /produktsalg-prosjekt-sal-1/, 'prosjekt uten id er bare tekst');
assert.match(rich, /data-icon="lock-closed-outline"/, 'fakturert rad viser lås');
assert.match(rich, /Fakturert/);
assert.match(rich, /Filtrer på prosjekt/);
assert.match(rich, /2 salg/);

// Sider: bare de første radene tegnes.
const many = Array.from({ length: 5 }, (_, index) => ({ ...sale, id: `sal-m${index}` }));
const paged = renderToStaticMarkup(React.createElement(ProductSalesList, {
  colors,
  rows: many,
  totalCount: 5,
  limit: 2,
  onMore: () => {},
  onShowAll: () => {},
}));
assert.match(paged, /produktsalg-row-sal-m1/);
assert.doesNotMatch(paged, /produktsalg-row-sal-m2/);
assert.match(paged, /Viser 2 av 5/);
assert.match(paged, /Vis flere/);
assert.match(paged, /Vis alle/);

// Smal skjerm: kort i stedet for bred tabell.
const phone = renderToStaticMarkup(React.createElement(ProductSalesList, {
  colors,
  rows: [sale],
  totalCount: 1,
  narrow: true,
}));
assert.match(phone, /produktsalg-row-sal-1/);
assert.doesNotMatch(phone, /produktsalg-sort-date/);

console.log('productSalesList.test.mjs ok');
