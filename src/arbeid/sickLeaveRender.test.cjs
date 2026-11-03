/**
 * Runtime-sjekk: rendrer egenmeldingsskjemaet og HR → Sykefravær med mockede
 * RN-komponenter, så manglende symboler eller ødelagt JSX feiler her.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = { brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', bg: '#F4F7FB' };

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  ActivityIndicator: host('ActivityIndicator'),
  Modal: function Modal(props) {
    return props && props.visible ? React.createElement('Modal', props, props.children) : null;
  },
  StyleSheet: { create: (s) => s, hairlineWidth: 1 },
  Platform: { OS: 'web', select: (o) => o && (o.web || o.default) },
};

const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const employees = [
  { id: 'e1', personUid: 'u1', person: { firstName: 'Ola', lastName: 'Nordmann', gender: 'mann' }, company: { status: 'active', periodFrom: '2024-01-01', workPercent: '100' }, extras: { childCare: { children: 2 } } },
  { id: 'e2', personUid: 'u2', person: { firstName: 'Kari', lastName: 'Nordmann' }, company: { status: 'active', periodFrom: '2024-01-01' } },
];
const absences = [
  { id: 'a1', employeeId: 'e1', date: iso, hours: 7.5, type: 'egenmelding' },
  { id: 'a2', employeeId: 'e2', date: iso, hours: 7.5, type: 'sykt_barn' },
];
const cases = [
  { id: 'c1', employeeId: 'e1', employeeName: 'Ola Nordmann', kind: 'doctor', fromDate: '2026-01-05', toDate: '2026-03-31', percent: 100, status: 'innmeldt', followUp: {}, history: [] },
];

function loadJsx(rel) {
  const full = path.join(ROOT, rel);
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
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: () => null };
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.includes('AppContext')) return { useApp: () => ({ user: { uid: 'boss', displayName: 'Leder' }, family: {} }) };
    if (id.includes('useTimesheetWorkspace')) {
      return {
        useTimesheetWorkspace: () => ({
          state: { absences, redDays: [], fullDayHours: 7.5, absenceTypes: [] },
          setState() {},
          employees,
          manager: true,
          uid: 'boss',
          workspaceId: 'co1',
        }),
      };
    }
    if (id.includes('useSickLeave')) {
      return {
        useSickLeave: () => ({
          rules: require(path.join(ROOT, 'src/arbeid/sickLeave.js')).normalizeSickRules({}),
          cases,
          denials: [],
          error: '',
          save: async (row) => row,
          setRules() {},
          setDenials() {},
        }),
      };
    }
    if (id.includes('project/storage') || id.includes('sickStorage') || id.includes('employees/storage')) return {};
    if (id.includes('saveToast')) return { showSaveToast() {} };
    if (id.endsWith('/CheckBox')) return { __esModule: true, default: host('CheckBox') };
    if (id.endsWith('/IsoDateField') || id.endsWith('./IsoDateField')) return { __esModule: true, default: host('IsoDateField') };
    if (id.includes('SickNoteModal')) return loadJsx('components/arbeid/SickNoteModal.jsx');
    if (id === './HrShared') {
      const title = ({ title: t, subtitle }) => React.createElement('Text', null, [t, subtitle].filter(Boolean).join(' '));
      return {
        HrCard: host('HrCard'), HrButton: host('HrButton'), HrChip: host('HrChip'), HrField: host('HrField'),
        RowLink: host('RowLink'), EmptyHint: ({ text: t }) => React.createElement('Text', null, t), HrSectionTitle: title,
      };
    }
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

let tabOverride = 'behandling';
const dispatcher = {
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value === 'behandling' ? tabOverride : value, () => {}];
  },
  useMemo: (fn) => fn(),
  useEffect() {},
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  useContext: () => undefined,
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

function collect(node, out = { text: [], ids: [] }, depth = 0) {
  if (depth > 60 || node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, out, depth));
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.text.push(String(node));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  if (node.props?.nativeID) out.ids.push(node.props.nativeID);
  if (typeof node.props?.label === 'string') out.text.push(node.props.label);
  if (typeof node.type === 'function') {
    collect(withHooks(() => node.type(node.props || {})), out, depth + 1);
    return out;
  }
  collect(node.props && node.props.children, out, depth + 1);
  return out;
}

// Egenmeldingsskjemaet
{
  const SickNoteModal = loadJsx('components/arbeid/SickNoteModal.jsx').default;
  const { text, ids } = collect(React.createElement(SickNoteModal, {
    visible: true,
    colors,
    employee: employees[0],
    absences,
    rules: {},
    initial: { kind: 'self', fromDate: iso, toDate: iso },
  }));
  const all = text.join(' ');
  assert.ok(ids.includes('egenmelding-skjema'));
  assert.ok(ids.includes('egenmelding-send'));
  assert.match(all, /Meld sykefravær/);
  assert.match(all, /Egenmelding siste 12 måneder/);
  assert.match(all, /Inntil 3 kalenderdager/);
  assert.match(all, /arbeidsufør på grunn av sykdom/);
  const child = collect(React.createElement(SickNoteModal, {
    visible: true, colors, employee: employees[0], absences, rules: {}, initial: { kind: 'child', fromDate: iso },
  })).text.join(' ');
  assert.match(child, /Omsorgsdager/);
  assert.match(child, /av 10 dager brukt/);
}

// HR → Sykefravær: behandling, korttidsfravær, kvoter og regler
{
  const Cards = loadJsx('screens/hr/HrSickCases.jsx').default;
  const { text, ids } = collect(React.createElement(Cards, { colors, canWrite: true }));
  const all = text.join(' ');
  for (const id of ['hr-sick-queue', 'hr-sick-frequent', 'hr-sick-quotas', 'hr-sick-rules', 'hr-sick-case-c1']) assert.ok(ids.includes(id), id);
  for (const pattern of [
    /Egenmelding og sykmelding/, /Sykmelding · 05\.01\.2026 – 31\.03\.2026/, /Godkjenn/,
    /Hyppig korttidsfravær/, /Omsorgsdager \d{4}: 0 av 10/, /antall barn er ikke registrert/,
    /Krev skriftlig skjema/, /Utvidet egenmelding/,
  ]) assert.match(all, pattern, String(pattern));
  // Sykedagen i dag mangler skjema. Egenmelding kreves bare fra lanseringen 01.01.2027.
  if (iso >= '2027-01-01') assert.match(all, /Sykedager uten skjema/);
  else assert.doesNotMatch(all, /Sykedager uten skjema/);
}

console.log('sickLeaveRender ok');
