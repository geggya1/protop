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

function loadJsx(rel, { phone = false } = {}) {
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
    if (id.includes('AppContext')) {
      return {
        useApp: () => ({
          requestShellTab() {},
          shellIntent: null,
          clearShellIntent() {},
        }),
      };
    }
    if (id.includes('/theme')) {
      return {
        useLayout: () => (phone
          ? { width: 390, isPhone: true, hasRail: false, railWidth: 0, isDesktop: false }
          : { width: 1280, isPhone: false, hasRail: true, railWidth: 240, isDesktop: true }),
        colors,
      };
    }
    if (id.includes('ModulePageBg')) return { useModuleHeroHosted: () => true };
    if (id.includes('AbsenceOrganizePanel')) {
      return {
        __esModule: true,
        default: function AbsenceOrganizePanel(props) {
          return React.createElement('View', { nativeID: 'absence-organize-panel' }, React.createElement('View', {
            nativeID: 'absence-organize-close',
            onPress: props.onClose,
          }));
        },
      };
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

function walk(node, visit, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return;
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

function deepRender(node) {
  let count = 0;
  walk(node, () => { count += 1; });
  return count;
}

function nativeIds(node) {
  const ids = [];
  walk(node, (element) => {
    const id = element.props && element.props.nativeID;
    if (id) ids.push(id);
  });
  return ids;
}

function hostTag(node, id) {
  let found = '';
  walk(node, (element) => {
    if (element.props && element.props.nativeID === id && typeof element.type === 'string') found = element.type;
  });
  return found;
}

function assertRenders(label, element) {
  const nodes = deepRender(element);
  assert.ok(nodes > 0, `${label} produced empty tree`);
  return nodes;
}

function collectText(node, depth = 0, out = []) {
  if (depth > 40 || node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, depth, out));
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  if (typeof node.type === 'function') {
    collectText(withHooks(() => node.type(node.props || {})), depth + 1, out);
    return out;
  }
  collectText(node.props && node.props.children, depth + 1, out);
  return out;
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
  const element = React.createElement(CompanyAbsenceDesktop, {
    employees, names, absences, adjustments: [], fullDayHours: 7.5, today, canChooseEmployee: true,
  });
  const nodes = assertRenders('CompanyAbsenceDesktop', element);
  assert.ok(nodes > 100, `overview too small: ${nodes}`);
  const text = collectText(element).join('\n');
  assert.match(text, /Borte i perioden/);
  assert.match(text, /På ferie/);
  assert.doesNotMatch(text, /På ferie nå/);
  assert.match(text, /periode-midten|Dag/);
  assert.match(text, /Ada/);
  assert.match(text, /Bjørn/);
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
  const element = React.createElement(AbsenceReportDesktop, {
    employees, names, absences, canChooseEmployee: true, canImport: true, absenceCount: absences.length,
  });
  const nodes = assertRenders('AbsenceReportDesktop', element);
  assert.ok(nodes > 40, `report too small: ${nodes}`);
  const ids = nativeIds(element);
  assert.ok(ids.includes('absence-report-table'));
  assert.ok(ids.includes('absence-report-select-all'));
  assert.ok(ids.includes('absence-report-select-a1'));
  assert.ok(ids.includes('absence-report-select-a2'));
  assert.ok(ids.includes('absence-filter-toggle'));
  assert.ok(ids.includes('fravaer-report-settings'));
  assert.equal(ids.includes('absence-report-delete-selected'), false);
  assert.equal(ids.includes('fravaer-import'), false);
  assert.equal(ids.includes('fravaer-clear-imported'), false);
  assert.equal(ids.includes('absence-organize-panel'), false);
  const text = collectText(element).join('\n');
  assert.match(text, /Filtrer/);
  assert.doesNotMatch(text, /Importer/);
  assert.doesNotMatch(text, /Tøm import/);
  assert.equal(hostTag(element, 'fravaersrapport'), 'View');
}

{
  const phoneUi = loadJsx('screens/arbeid/CompanyAbsenceDesktop.jsx', { phone: true });
  const many = Array.from({ length: 40 }, (_, index) => ({
    id: `d${index}`,
    employeeId: 'e1',
    type: 'syk_melding',
    date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
    hours: 7.5,
    status: 'registrert',
  }));
  const element = React.createElement(phoneUi.AbsenceReportDesktop, {
    employees, names, absences: many, canChooseEmployee: true, canImport: true, absenceCount: many.length,
  });
  assertRenders('AbsenceReportDesktop phone', element);
  assert.equal(hostTag(element, 'fravaersrapport'), 'ScrollView');
  const ids = nativeIds(element);
  assert.ok(ids.includes('absence-report-table'));
  assert.ok(ids.includes('absence-report-select-d0'));
  assert.ok(ids.includes('absence-report-select-d39'));
}

{
  const ids = nativeIds(React.createElement(AbsenceReportDesktop, {
    employees, names, absences, canChooseEmployee: false, canImport: false,
  }));
  assert.equal(ids.includes('absence-report-select-all'), false);
  assert.equal(ids.includes('absence-report-select-a1'), false);
  assert.ok(ids.includes('absence-filter-toggle'));
  assert.equal(ids.includes('fravaer-report-settings'), false);
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

function expandTree(node, depth = 0) {
  if (depth > 50 || node == null || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map((child) => expandTree(child, depth));
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expandTree(node.type(node.props || {}), depth + 1);
  const children = node.props && node.props.children;
  if (children == null) return node;
  return React.cloneElement(node, node.props, expandTree(children, depth));
}

function findByNativeId(node, nativeID, depth = 0) {
  if (depth > 50 || node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByNativeId(child, nativeID, depth);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'string' || typeof node === 'number' || !React.isValidElement(node)) return null;
  if (node.props && node.props.nativeID === nativeID) return node;
  return findByNativeId(node.props && node.props.children, nativeID, depth + 1);
}

function idsOf(node) {
  const ids = [];
  const visit = (current, depth = 0) => {
    if (depth > 50 || current == null || typeof current === 'boolean') return;
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, depth));
      return;
    }
    if (typeof current === 'string' || typeof current === 'number' || !React.isValidElement(current)) return;
    if (current.props && current.props.nativeID) ids.push(current.props.nativeID);
    visit(current.props && current.props.children, depth + 1);
  };
  visit(node);
  return ids;
}

function interactiveRender(element) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const states = [];
  let cursor = 0;
  let tree = null;

  function rerender() {
    cursor = 0;
    const previous = internals.H;
    internals.H = {
      useState(initial) {
        const index = cursor++;
        if (!Object.prototype.hasOwnProperty.call(states, index)) {
          states[index] = typeof initial === 'function' ? initial() : initial;
        }
        return [states[index], (update) => {
          const next = typeof update === 'function' ? update(states[index]) : update;
          if (Object.is(next, states[index])) return;
          states[index] = next;
          rerender();
        }];
      },
      useMemo(fn) { return fn(); },
      useEffect() {},
      useLayoutEffect() {},
      useRef(value) {
        const index = cursor++;
        if (!Object.prototype.hasOwnProperty.call(states, index)) states[index] = { current: value };
        return states[index];
      },
      useCallback(fn) { return fn; },
      useContext() { return undefined; },
    };
    try {
      tree = expandTree(element.type(element.props || {}));
    } finally {
      internals.H = previous;
    }
  }

  rerender();
  return {
    ids() { return idsOf(tree); },
    press(nativeID) {
      const node = findByNativeId(tree, nativeID);
      assert.ok(node, `fant ikke ${nativeID}`);
      assert.equal(typeof node.props.onPress, 'function', `${nativeID} mangler onPress`);
      node.props.onPress();
    },
  };
}

{
  let imported = 0;
  let cleared = 0;
  const ui = interactiveRender(React.createElement(AbsenceReportDesktop, {
    employees,
    names,
    absences,
    canChooseEmployee: true,
    canImport: true,
    absenceCount: absences.length,
    onImport: () => { imported += 1; },
    onClearImported: () => { cleared += 1; },
  }));
  assert.equal(ui.ids().includes('absence-filter-sheet'), false);
  assert.equal(ui.ids().includes('fravaer-settings-menu'), false);

  ui.press('absence-filter-toggle');
  assert.ok(ui.ids().includes('absence-filter-sheet'));
  assert.ok(ui.ids().includes('absence-organize-panel'));
  assert.equal(ui.ids().includes('fravaer-settings-menu'), false);

  ui.press('absence-organize-close');
  assert.equal(ui.ids().includes('absence-filter-sheet'), false);

  ui.press('fravaer-report-settings');
  assert.ok(ui.ids().includes('fravaer-import'));
  assert.ok(ui.ids().includes('fravaer-clear-imported'));
  assert.equal(ui.ids().includes('absence-filter-sheet'), false);

  ui.press('fravaer-import');
  assert.equal(imported, 1);
  assert.equal(ui.ids().includes('fravaer-settings-menu'), false);

  ui.press('fravaer-report-settings');
  ui.press('fravaer-clear-imported');
  assert.equal(cleared, 1);
  assert.equal(ui.ids().includes('fravaer-clear-imported'), false);

  ui.press('absence-filter-toggle');
  ui.press('fravaer-report-settings');
  assert.equal(ui.ids().includes('absence-filter-sheet'), false);
  assert.ok(ui.ids().includes('fravaer-settings-menu'));
  ui.press('fravaer-settings-dismiss');
  assert.equal(ui.ids().includes('fravaer-settings-menu'), false);
}

console.log('absenceDesktopRender.test.cjs: ok');
