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
let viewport = { width: 1280, height: 800 };

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
        useWindowDimensions: () => viewport,
        ScrollView: host('ScrollView'),
        Image: host('Image'),
      };
    }
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id === 'firebase/functions') return { httpsCallable: () => async () => ({ data: {} }) };
    if (id.startsWith('.')) {
      const fromDir = path.dirname(full);
      let resolved;
      try {
        resolved = require.resolve(id, { paths: [fromDir] });
      } catch (error) {
        const candidate = path.resolve(fromDir, id);
        const hit = ['.jsx', '.js'].map((ext) => candidate + ext).find((file) => fs.existsSync(file));
        if (!hit) throw error;
        resolved = hit;
      }
      if (resolved.endsWith(`${path.sep}firebase.js`)) return { functions: {} };
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
    if (typeof element.props?.value === 'string' && element.props.value) out.push(element.props.value);
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
      value: 1350,
      start: '2025-12-19',
      fields: {
        indexId: 'ppi-byggeteknisk',
        contractDate: '2025-12-19',
        standard: 'NS 8403',
        model: 'engang',
        regulationFrequency: 'quarter',
      },
      indexDraft: {
        indexId: 'ppi-byggeteknisk',
        model: 'engang',
        standard: 'NS 8403',
        contractDate: '2025-12-19',
        lines: [{ text: 'Timepris', unit: 'time', rate: '1350', quantity: '1', included: true }],
        terms: { frequency: 'quarter' },
      },
    },
  ],
  timeEntries: [{ projectId: 'p1', date: new Date().toISOString().slice(0, 10), hours: 8 }],
  series: {
    'ppi-byggeteknisk': {
      id: 'ppi-byggeteknisk',
      name: 'Byggeteknisk konsulentvirksomhet',
      table: '14335',
      frequency: 'quarter',
      points: [
        { period: '2025K4', value: 119.5 },
        { period: '2026K2', value: 122.9 },
      ],
      latest: { period: '2026K2', value: 122.9 },
    },
  },
}));
const lines = texts(tree);
const joined = lines.join('\n');
assert.match(joined, /#index-contract-list/);
assert.match(joined, /#index-preview/);
assert.match(joined, /#index-filters/);
assert.match(joined, /Indeksregulering/);
assert.match(joined, /Kan reguleres/);
assert.match(joined, /Venter på ny indeks/);
assert.match(joined, /Krever oppmerksomhet/);
assert.match(joined, /Regulert/);
assert.match(joined, /NS 8403/);
assert.equal(joined.includes('Løst prosjekt'), false);
assert.match(joined, /Åpne indeksbehandling/);
assert.match(joined, /Gå til avtalen/);
assert.ok(joined.indexOf('Åpne indeksbehandling') < joined.indexOf('Reguleringshistorikk'));
assert.ok(joined.indexOf('Gå til avtalen') < joined.indexOf('Reguleringshistorikk'));
assert.match(joined, /1 388,41 kr/);

function styleWidth(node, id) {
  let found = null;
  walk(node, (element) => {
    if (element.props && element.props.nativeID === id) {
      const style = element.props.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
      found = flat;
    }
  });
  return found;
}

const wideFilter = styleWidth(tree, 'index-status-kan_reguleres');
assert.equal(wideFilter.borderRadius, 8);
assert.equal(wideFilter.width, undefined);

viewport = { width: 390, height: 800 };
cache.clear();
const phone = withHooks(() => React.createElement(Desk, {
  projects: [
    { id: 'p1', name: 'Aktivt oppdrag', number: '100', status: 'aktiv' },
    { id: 'p2', name: 'Løst prosjekt', status: 'aktiv' },
  ],
  contracts: [],
  series: {},
}));
const phoneFilter = styleWidth(phone, 'index-status-oppmerksomhet');
assert.equal(phoneFilter.width, '48%');
assert.equal(phoneFilter.borderRadius, 8);
const phoneText = texts(phone).join('\n');
assert.match(phoneText, /Venter på ny indeks/);
assert.match(phoneText, /Krever oppmerksomhet/);
assert.doesNotMatch(phoneText, /Må vurderes/);

viewport = { width: 1280, height: 800 };
const Workspace = loadLocal(path.join(ROOT, 'screens/economy/IndexWorkspace.jsx')).default;
const workspaceProps = {
  contract: {
    id: 'k1',
    title: 'Breitorget · Prosjektleder',
    buyer: 'Breitorget AS',
    regulations: [{
      id: 'r1',
      before: 1350,
      after: 1388.41,
      increase: 38.41,
      fromPeriod: '2025K4',
      fromIndex: 119.5,
      toPeriod: '2026K2',
      toIndex: 122.9,
      effectiveFrom: '2026-10-18',
      letterPlain: 'Varsel om indeksregulering av timepriser\nNy pris 1 388,41 kr eks. mva',
    }],
  },
  draft: {
    supplier: 'Consult1 AS',
    buyer: 'Breitorget AS',
    title: 'Breitorget · Prosjektleder',
    standard: 'NS 8403',
    model: 'engang',
    indexId: 'ppi-byggeteknisk',
    contractDate: '2025-12-19',
    lines: [{ text: 'Timepris', unit: 'time', rate: '1350', quantity: '1' }],
    contactName: 'Victor Husebø',
    email: 'post@consult1.no',
  },
  customer: { email: 'post@consult1.no', contactName: 'Victor Husebø' },
  onClose: () => {},
  onSave: async () => ({ ok: true }),
};
for (const view of ['oversikt', 'beregning', 'brev', 'historikk']) {
  const workspace = withHooks(() => React.createElement(Workspace, { ...workspaceProps, initialView: view }));
  const workspaceText = texts(workspace).join('\n');
  assert.match(workspaceText, /#index-workspace-nav/);
  assert.match(workspaceText, /Oversikt/);
  assert.match(workspaceText, /Beregning/);
  assert.match(workspaceText, /Varselbrev/);
  assert.match(workspaceText, /Historikk/);
  if (view === 'oversikt') {
    assert.match(workspaceText, /#index-landing-status/);
    assert.match(workspaceText, /Kan ikke reguleres på nytt nå|Venter på ny indeks|Kan reguleres på nytt|Må vurderes/);
    assert.match(workspaceText, /Sist regulert/);
    assert.match(workspaceText, /Tidligere brev/);
    assert.match(workspaceText, /18\.10\.2026/);
    assert.equal(workspaceText.includes('#index-letter-preview'), false);
  }
  if (view === 'beregning') {
    assert.match(workspaceText, /Foreta en ny beregning/);
    assert.match(workspaceText, /Se over og godkjenn/);
    assert.match(workspaceText, /1\. Indeks og beregningsgrunnlag/);
  }
  if (view === 'brev') {
    assert.match(workspaceText, /Varsel og utsending/);
    assert.match(workspaceText, /Innstillinger/);
    assert.match(workspaceText, /Ingenting er opprettet|Lagret som utkast|Sendt/);
    assert.match(workspaceText, /post@consult1\.no/);
    assert.match(workspaceText, /Victor Husebø/);
    assert.equal(workspaceText.includes('#index-letter-preview'), false);
  }
  if (view === 'historikk') {
    assert.match(workspaceText, /Hendelseslogg/);
  }
  const navStyle = styleWidth(workspace, 'index-workspace-nav');
  assert.equal(navStyle.flexDirection, 'row');
}
console.log('index desk render ok');
