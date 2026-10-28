/**
 * Varslene for arbeidstid og hviletid vises på Timesaldo med ekte beregning.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as babel from '@babel/core';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new Map();

const host = (tag) => (props) => React.createElement(tag, props?.nativeID ? { id: props.nativeID } : null, props?.children);
const rnMock = {
  View: host('div'),
  Text: host('span'),
  TouchableOpacity: host('button'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'web', select: (options) => options?.web || options?.default },
};

function mocked(id) {
  if (id === 'react') return React;
  if (id === 'react-native') return rnMock;
  if (id === '@expo/vector-icons') return { Ionicons: () => null };
  return null;
}

function load(full) {
  if (cache.has(full)) return cache.get(full).exports;
  const out = babel.transformSync(fs.readFileSync(full, 'utf8'), {
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
    const resolved = Module._resolveFilename(id, mod);
    return resolved.endsWith('.js') || resolved.endsWith('.jsx') ? load(resolved) : require(resolved);
  };
  mod._compile(out.code, full);
  cache.set(full, mod);
  return mod.exports;
}

const WorkingTimeWarnings = load(path.join(ROOT, 'components/arbeid/WorkingTimeWarnings.jsx')).default;
const colors = { brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', danger: '#b42318' };

function day(date, hours, clockIn = '', clockOut = '') {
  return { employeeId: 'e1', projectId: 'p1', date, hours, clockIn, clockOut };
}

{
  // 11 t fem dager: overtid over 10 t på sju dager og over 48 t. Kveldsskift gir for kort døgnhvile.
  const entries = [
    day('2026-10-19', 11), day('2026-10-20', 11), day('2026-10-21', 11), day('2026-10-22', 11), day('2026-10-23', 11),
    day('2026-10-26', 9, '14:00', '23:00'), day('2026-10-27', 8, '07:00', '15:00'),
  ];
  const html = renderToStaticMarkup(React.createElement(WorkingTimeWarnings, {
    colors, entries, employeeId: 'e1', from: '2026-01-01', to: '2026-10-31',
  }));
  assert.match(html, /Arbeidstid og hviletid/);
  assert.match(html, /15:00 t overtid på sju dager/);
  assert.match(html, /AML § 10-6 \(4\)/);
  assert.match(html, /55:00 t arbeid på sju dager/);
  assert.match(html, /26\.10\.2026: lengste sammenhengende fri på 24 timer var 8:00 t/);
  assert.match(html, /AML § 10-8 \(1\)/);
  assert.match(html, /5 dager mangler klokkeslett/);
  assert.match(html, /id="working-time-warnings-overtime7d"/);
}

{
  // Ingen brudd, og timer uten klokkeslett.
  const html = renderToStaticMarkup(React.createElement(WorkingTimeWarnings, {
    colors, entries: [day('2026-10-19', 7.5)], employeeId: 'e1',
  }));
  assert.match(html, /Ingen timer over grensene i perioden/);
  assert.match(html, /Hviletiden kan ikke kontrolleres/);
  assert.equal(renderToStaticMarkup(React.createElement(WorkingTimeWarnings, { colors, entries: [], employeeId: '' })), '');
}

console.log('workingTimeRender.test.mjs: ok');
