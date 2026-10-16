/**
 * Produktsalg-tabellen viser katalogsalg, søk og tomtilstand.
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
  TextInput: (props) => React.createElement('input', domProps(props)),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
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
