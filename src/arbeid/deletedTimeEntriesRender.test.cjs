/**
 * Godkjenninger → Slettede timer: listen viser hvem, når, prosjekt og beskrivelse, og
 * «Gjenopprett» bare for slettinger som kan gjenopprettes og ikke allerede er det.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', bg: '#F4F7FB', danger: '#b42318',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  TextInput: host('TextInput'),
  ActivityIndicator: host('ActivityIndicator'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
};

const uiMock = {
  __esModule: true,
  Card: ({ title, subtitle, children }) => React.createElement('Card', null, title, subtitle, children),
  Badge: ({ label }) => React.createElement('Badge', { label }, label),
  Button: (props) => React.createElement('Button', props, props.label),
  showSaveError() {},
  showSaveToast() {},
  useConfirm: () => async () => true,
  space: { xxs: 4, xs: 8, sm: 12, md: 16 },
  radius: { control: 8, card: 12 },
  type: { body: {}, bodyStrong: {}, label: {}, caption: {} },
};

function loadJsx(rel) {
  const full = path.join(ROOT, rel);
  const code = fs.readFileSync(full, 'utf8');
  const out = babel.transformSync(code, {
    filename: full,
    presets: [['babel-preset-expo', { jsxRuntime: 'classic' }]],
    plugins: [['@babel/plugin-transform-modules-commonjs', { lazy: false }]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
  });
  const m = new Module(full);
  m.filename = full;
  m.paths = Module._nodeModulePaths(path.dirname(full));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '../../src/ui') return uiMock;
    if (id.includes('context/ThemeContext')) return { __esModule: true, useColors: () => colors };
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

/** Tegner treet (funksjonskomponenter kalles) og samler tekst og knapper. */
function walk(node, out = { text: [], buttons: [], badges: [] }, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, out, depth));
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.text.push(String(node));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  if (typeof node.type === 'function') return walk(node.type(node.props || {}), out, depth + 1);
  if (node.type === 'Button') out.buttons.push(node.props);
  if (node.type === 'Badge') out.badges.push(node.props.label);
  return walk(node.props && node.props.children, out, depth + 1);
}

(async () => {
  const { DeletedTimeEntriesList } = loadJsx('screens/arbeid/DeletedTimeEntries.jsx');
  const { deletionRows } = await import(path.join(ROOT, 'src/arbeid/timeEntryRestore.js'));
  const { deletedTimeEntryRecord } = await import(path.join(ROOT, 'src/arbeid/timeEntryHistory.js'));

  const full = {
    ...deletedTimeEntryRecord(
      { id: 't1', employeeId: 'e1', projectId: 'p1', date: '2026-10-19', hours: 7.5, description: 'Montering tak' },
      { actor: { uid: 'u1', name: 'Leder Lise' }, at: '2026-10-21T09:00:00.000Z', reason: 'Dobbeltført' },
    ),
    id: 'd1',
  };
  const done = { entryId: 't2', employeeId: 'e2', projectId: 'p1', date: '2026-10-18', hours: 4, at: '2026-10-20T08:00:00Z', byName: 'Kari' };
  const broken = { entryId: 't3', hours: 2, at: '2026-10-22T08:00:00Z', byName: 'Ola' };
  const rows = deletionRows([full, done, broken], {
    restored: new Set(['t2']),
    employees: [{ id: 'e1', name: 'Aina Jespersen' }, { id: 'e2', name: 'Kari Nordmann' }],
    projects: [{ id: 'p1', number: '1001', name: 'Bygg A' }],
  });

  const restored = [];
  const tree = walk(React.createElement(DeletedTimeEntriesList, {
    colors, total: rows.length, rows, onRestore: (row) => restored.push(row.entryId),
  }));
  const text = tree.text.join('\n');
  assert.match(text, /Slettede timer/);
  assert.match(text, /Aina Jespersen · 19\.10\.2026 · 7,5 t/);
  assert.match(text, /1001 Bygg A · Montering tak/);
  assert.match(text, /Slettet 21\.10\.2026 \d\d:00 av Leder Lise \(Dobbeltført\)/);
  assert.match(text, /Kari Nordmann/);

  // Én knapp: den hele slettingen. Den gjenopprettede har merke, den uten data har «Mangler data».
  const restoreButtons = tree.buttons.filter((b) => b.label === 'Gjenopprett');
  assert.equal(restoreButtons.length, 1);
  assert.equal(restoreButtons[0].nativeID, 'gjenopprett-t1');
  assert.match(restoreButtons[0].accessibilityLabel, /Aina Jespersen/);
  restoreButtons[0].onPress();
  assert.deepEqual(restored, ['t1']);
  assert.deepEqual(tree.badges.sort(), ['Gjenopprettet', 'Mangler data']);

  // Tom logg.
  const empty = walk(React.createElement(DeletedTimeEntriesList, { colors, total: 0, rows: [] })).text.join('\n');
  assert.match(empty, /Ingen timer er slettet/);

  // Mens en gjenoppretting pågår, kan ikke en annen startes.
  const busyTree = walk(React.createElement(DeletedTimeEntriesList, {
    colors, total: 2, rows: [rows[1], { ...rows[1], key: 'x', entryId: 'tx', restored: false }], busy: rows[1].key,
  }));
  const other = busyTree.buttons.find((b) => b.nativeID === 'gjenopprett-tx');
  assert.equal(other.disabled, true);

  // Søkefeltet vises først når listen er lang, og «Vis alle» når den er kuttet.
  const many = walk(React.createElement(DeletedTimeEntriesList, { colors, total: 30, rows: [], more: 30 }));
  assert.ok(many.buttons.some((b) => b.label === 'Vis alle 30'));

  console.log('deletedTimeEntriesRender: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
