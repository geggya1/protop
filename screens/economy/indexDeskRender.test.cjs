/**
 * Rendrer indekssiden og sjekker at avtaleskuffen er åpen og kommer før
 * prosjekter uten avtale, med utropstegn på aktivt prosjekt.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2',
  card: '#fff', bg: '#F4F7FB', danger: '#b42318', placeholder: '#8B95A6', brandSoft: '#E8F6FE',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const cache = new Map();

function loadLocal(full) {
  if (cache.has(full)) return cache.get(full).exports;
  const out = babel.transformSync(fs.readFileSync(full, 'utf8'), {
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
  cache.set(full, m);
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') {
      return {
        View: host('View'),
        Text: host('Text'),
        TextInput: host('TextInput'),
        TouchableOpacity: host('TouchableOpacity'),
        StyleSheet: { create: (styles) => styles },
      };
    }
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.startsWith('.')) {
      const resolved = require.resolve(id, { paths: [path.dirname(full)] });
      if (resolved.includes(`${path.sep}src${path.sep}`) || resolved.includes(`${path.sep}screens${path.sep}`) || resolved.includes(`${path.sep}components${path.sep}`)) {
        return loadLocal(resolved);
      }
    }
    return m.constructor._load(id, m, false);
  };
  m._compile(out.code, full);
  return m.exports;
}

const dispatcher = {
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value, () => {}];
  },
  useMemo(fn) { return fn(); },
  useEffect() {},
  useLayoutEffect() {},
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = dispatcher;
  try { return fn(); } finally { internals.H = previous; }
}

function walk(node, visit, depth = 0) {
  if (depth > 30 || node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit, depth));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') return;
  if (!React.isValidElement(node)) return;
  visit(node);
  if (typeof node.type === 'function') {
    walk(withHooks(() => node.type(node.props || {})), visit, depth + 1);
    return;
  }
  walk(node.props && node.props.children, visit, depth + 1);
}

function texts(node) {
  const out = [];
  walk(node, (element) => {
    const children = element.props && element.props.children;
    if (typeof children === 'string') out.push(children);
    if (element.props && element.props.nativeID) out.push(`#${element.props.nativeID}`);
    if (element.props && element.props.accessibilityLabel) out.push(`@${element.props.accessibilityLabel}`);
  });
  return out;
}

const Desk = loadLocal(path.join(ROOT, 'screens/economy/EconomyDesk.jsx')).default;
const tree = withHooks(() => React.createElement(Desk, {
  projects: [
    { id: 'p1', name: 'Aktivt oppdrag', number: '100', status: 'aktiv' },
    { id: 'p2', name: 'Løst prosjekt', status: 'aktiv' },
  ],
  contracts: [
    {
      id: 'k1',
      title: 'NS 8403',
      projectId: 'p1',
      buyer: 'Oslo kommune',
      kind: 'oppdrag',
      value: 1000,
      start: '2024-01-01',
      fields: { indexId: 'ppi-byggeteknisk', contractDate: '2024-01-01' },
    },
  ],
  timeEntries: [{ projectId: 'p1', date: new Date().toISOString().slice(0, 10), hours: 8 }],
  dueById: {
    k1: { due: true, reason: 'Ny indeks er publisert siden forrige regulering.', indexId: 'ppi-byggeteknisk', table: '14335' },
  },
}));
const lines = texts(tree);
const joined = lines.join('\n');
assert.ok(joined.indexOf('#index-group-with-agreement') < joined.indexOf('#index-group-without-agreement'));
assert.match(joined, /Prosjekter med avtale/);
assert.match(joined, /Aktivt oppdrag/);
assert.match(joined, /Ny indeks er publisert/);
assert.match(joined, /Prosjekter uten avtale/);
assert.equal(joined.includes('Løst prosjekt'), false);
console.log('index desk render ok');
