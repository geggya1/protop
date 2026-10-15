/**
 * Runtime regression: actually invoke CompanyAbsenceDesktop / AbsenceReportDesktop /
 * PlannedAbsenceDesktop with mocked RN host components so missing symbols
 * (PAGE_STEP, TABLE_MIN_FALLBACK, undefined styles, broken JSX) throw here —
 * not only as a source-text match.
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
  card: '#fff', bg: '#F4F7FB', sunken: '#F3F6FA', danger: '#b42318',
};

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
  Modal: function Modal(props) {
    return props && props.visible ? React.createElement('Modal', props, props.children) : null;
  },
  TextInput: host('TextInput'),
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

const svgMock = {
  __esModule: true,
  default: host('Svg'),
  Circle: host('Circle'),
  Rect: host('Rect'),
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
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return orig(id);
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id === 'react-native-svg') return svgMock;
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.includes('/theme')) {
      return {
        useLayout: () => ({ width: 1280, isPhone: false, hasRail: true, railWidth: 240, isDesktop: true }),
        colors,
      };
    }
    if (id.includes('ModulePageBg')) return { useModuleHeroHosted: () => true };
    if (id.includes('AbsenceOrganizePanel')) {
      return { __esModule: true, default: function AbsenceOrganizePanel() { return null; } };
    }
    return orig(id);
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
  useContext() { return undefined; },
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'React 19 client internals missing');
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

function deepRender(node, depth = 0) {
  if (depth > 40) return 0;
  if (node == null || typeof node === 'boolean') return 0;
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + deepRender(child, depth), 0);
  if (typeof node === 'string' || typeof node === 'number') return 1;
  if (!React.isValidElement(node)) return 0;
  if (typeof node.type === 'function') {
    const rendered = withHooks(() => node.type(node.props || {}));
    return 1 + deepRender(rendered, depth + 1);
  }
  const children = node.props && node.props.children;
  return 1 + (children !== undefined ? deepRender(children, depth + 1) : 0);
}

function assertRenders(label, element) {
  const nodes = deepRender(element);
  assert.ok(nodes > 0, `${label} produced empty tree`);
  return nodes;
}

const {
  CompanyAbsenceDesktop,
  AbsenceReportDesktop,
  PlannedAbsenceDesktop,
} = loadJsx('screens/arbeid/CompanyAbsenceDesktop.jsx');

const employees = [
  { id: 'e1', name: 'Ada', company: { status: 'active', personnelKind: 'staff' } },
  { id: 'e2', name: 'Bjørn', company: { status: 'active', personnelKind: 'staff' } },
];
const names = { e1: 'Ada', e2: 'Bjørn' };
const today = '2026-10-15';
const absences = [
  { id: 'a1', employeeId: 'e1', type: 'ferie', date: today, hours: 7.5, status: 'godkjent' },
  { id: 'a2', employeeId: 'e2', type: 'syk_melding', date: '2026-10-16', hours: 7.5, status: 'registrert' },
  { id: 'a3', employeeId: 'e1', type: 'ferie', date: '2026-11-01', hours: 7.5, status: 'planlagt' },
];

{
  const nodes = assertRenders('CompanyAbsenceDesktop', React.createElement(CompanyAbsenceDesktop, {
    employees, names, absences, adjustments: [], fullDayHours: 7.5, today, canChooseEmployee: true,
  }));
  assert.ok(nodes > 100, `overview too small: ${nodes}`);
}

{
  const nodes = assertRenders('CompanyAbsenceDesktop employee', React.createElement(CompanyAbsenceDesktop, {
    employees, names, employeeId: 'e1', absences, adjustments: [], fullDayHours: 7.5, today, canChooseEmployee: true,
  }));
  assert.ok(nodes > 50, `employee pane too small: ${nodes}`);
}

{
  assertRenders('CompanyAbsenceDesktop empty', React.createElement(CompanyAbsenceDesktop, {
    employees: [], names: {}, absences: [], adjustments: [], fullDayHours: 7.5, today, canChooseEmployee: true,
  }));
}

{
  const nodes = assertRenders('AbsenceReportDesktop', React.createElement(AbsenceReportDesktop, {
    employees, names, absences, canChooseEmployee: true, canImport: true, absenceCount: absences.length,
  }));
  assert.ok(nodes > 40, `report too small: ${nodes}`);
}

{
  assertRenders('AbsenceReportDesktop empty', React.createElement(AbsenceReportDesktop, {
    employees: [], names: {}, absences: [], canChooseEmployee: false,
  }));
}

{
  assertRenders('PlannedAbsenceDesktop', React.createElement(PlannedAbsenceDesktop, {
    employees, names, absences, adjustments: [], fullDayHours: 7.5, today, canChooseEmployee: true,
  }));
}

{
  assertRenders('CompanyAbsenceDesktop unknown type', React.createElement(CompanyAbsenceDesktop, {
    employees,
    names,
    absences: [{ id: 'x', employeeId: 'e1', type: 'totally_unknown', date: today, hours: 3 }],
    adjustments: [],
    fullDayHours: 7.5,
    today,
    canChooseEmployee: true,
    error: 'demo',
  }));
}

console.log('absenceDesktopRender.test.cjs: ok');
