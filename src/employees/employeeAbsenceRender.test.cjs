/**
 * Fravær på ansattsiden: Rapport er en årstabell, Oversikt har Siste fravær
 * i eget felt til høyre på bred web. Rendres med RN-mock, så feil i JSX og
 * rekkefølge på konstanter kastes her.
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
  Image: host('Image'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  TextInput: host('TextInput'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

let layout = { width: 1800, hasRail: true, railWidth: 220, isDesktop: true };
let workspace = null;

function stub(name) {
  return { __esModule: true, default: function Stub() { return null; }, [name]: function Stub() { return null; } };
}

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
    if (id === '@expo/vector-icons') {
      return { Ionicons: function Ionicons() { return null; }, MaterialCommunityIcons: function Icon() { return null; } };
    }
    if (id === 'react-native-svg') return { __esModule: true, default: host('Svg'), Circle: host('Circle'), Rect: host('Rect') };
    if (id.endsWith('.png')) return 1;
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.includes('AppContext')) {
      return { useApp: () => ({ familyId: '', family: null, families: [], shellIntent: null, clearShellIntent() {} }) };
    }
    if (id.endsWith('src/theme')) return { useLayout: () => layout };
    if (id.includes('ModulePageBg')) return { useModuleHeroHosted: () => true };
    if (id.includes('useTimesheetWorkspace')) return { useTimesheetWorkspace: () => workspace };
    if (id.includes('useCompanyAccess')) return { useCompanyAccess: () => ({ ready: true }) };
    if (id.includes('access/companyAccess')) return { canImportList: () => false };
    if (id.includes('project/engine')) return { addAbsence: () => ({ ok: false }) };
    if (id.includes('project/storage')) return {};
    if (id.includes('absenceStorage') || id.includes('absenceImport') || id.includes('imports/review')) return {};
    if (id.includes('vacationPlanStorage')) return { loadVacationPlan: async () => null };
    if (id.includes('vacationPlanClient')) return { sweepVacationPlan: async () => null };
    if (id.includes('utils/media')) return { pickDocument: async () => null };
    if (id.includes('saveToast')) return { showSaveToast: () => {} };
    for (const name of [
      'BrandBusyOverlay', 'AbsenceImportReview', 'AbsencePeriodModal', 'VacationPlanPanel', 'RegisterVacationModal',
    ]) {
      if (id.includes(name)) return stub(name);
    }
    if (id.includes('ImportReview')) return stub('ImportResult');
    if (id.includes('CompanyAbsenceDesktop')) {
      return { ...stub('CompanyAbsenceDesktop'), AbsenceReportDesktop: () => null, PlannedAbsenceDesktop: () => null };
    }
    if (id.includes('CompanyAbsenceView')) return stub('CompanyAbsenceView');
    if (id === './AbsenceOverviewView') return { AbsenceOverviewScreen: () => null };
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const plainHooks = {
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useMemo(fn) { return fn(); },
  useEffect() {},
  useLayoutEffect() {},
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useContext() { return undefined; },
};

function withHooks(hooks, fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = hooks;
  try { return fn(); } finally { internals.H = previous; }
}

/** Rendrer på nytt med samme state, så knapper kan trykkes. */
function stateful(Component, props) {
  const states = [];
  let cursor = 0;
  const hooks = {
    ...plainHooks,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (update) => {
        states[index] = typeof update === 'function' ? update(states[index]) : update;
      }];
    },
  };
  return () => {
    cursor = 0;
    return withHooks(hooks, () => Component(props));
  };
}

function walk(node, visit, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit, depth));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number' || !React.isValidElement(node)) return;
  visit(node);
  if (typeof node.type === 'function') {
    walk(withHooks(plainHooks, () => node.type(node.props || {})), visit, depth + 1);
    return;
  }
  walk(node.props && node.props.children, visit, depth + 1);
}

function texts(tree) {
  const out = [];
  walk(tree, (element) => {
    if (typeof element.type !== 'string') return;
    const kids = element.props && element.props.children;
    for (const kid of Array.isArray(kids) ? kids : [kids]) {
      if (typeof kid === 'string' || typeof kid === 'number') out.push(String(kid));
    }
  });
  return out.join('\n');
}

function byId(tree, id) {
  let found = null;
  walk(tree, (element) => {
    if (!found && element.props && element.props.nativeID === id) found = element;
  });
  return found;
}

function inside(tree, outerId, innerId) {
  const outer = byId(tree, outerId);
  return !!outer && !!byId(outer, innerId);
}

const thisYear = new Date().getFullYear();
const lastYear = thisYear - 1;
const people = [
  { id: 'e1', person: { firstName: 'Anders', lastName: 'Rolandsen' }, company: { status: 'active' } },
  { id: 'e2', person: { firstName: 'Berit', lastName: 'Ås' }, company: { status: 'active' } },
];
const absences = [
  { id: 'a1', employeeId: 'e1', type: 'ferie', date: `${thisYear}-07-14`, hours: 7.5, status: 'godkjent' },
  { id: 'a2', employeeId: 'e1', type: 'ferie', date: `${thisYear}-07-15`, hours: 7.5, status: 'godkjent', description: 'Sommer' },
  { id: 'a3', employeeId: 'e1', type: 'ferie', date: `${lastYear}-07-16`, hours: 7.5, status: 'godkjent' },
  { id: 'a4', employeeId: 'e2', type: 'ferie', date: `${thisYear}-07-14`, hours: 7.5, status: 'godkjent' },
];
workspace = {
  ready: true,
  lockedId: 'e1',
  linked: null,
  employees: people,
  state: { absences, absenceAdjustments: [], timeEntries: [], timesheetLocks: [{ employeeId: 'e1', throughDate: '2026-01-01' }], fullDayHours: 7.5 },
};

// Rapport: årstabell, ingen timeliste-kort.
{
  const { MyOverviewScreen } = loadJsx('screens/arbeid/AbsenceScreens.jsx');
  const render = stateful(MyOverviewScreen, { lockedEmployeeId: 'e1', embedded: true });
  let tree = render();
  let body = texts(tree);
  assert.ok(byId(tree, 'fravaer-rapport-tabell'), 'tabell mangler');
  assert.match(body, new RegExp(`Sum ${thisYear}`));
  assert.match(body, /Timer med lønn/);
  assert.match(body, /Beskrivelse/);
  assert.match(body, /Sommer/);
  assert.match(body, /Feriedager til gode/);
  assert.match(body, /Timer denne måneden/);
  assert.doesNotMatch(body, /Timeliste/);
  assert.doesNotMatch(body, /Låst til/);
  assert.doesNotMatch(body, /Medarbeider/);
  // Bare valgt år: to dager for e1, ikke fjorårets eller kollegaens.
  assert.match(body, /2 dager · 15:00 timer/);
  assert.equal(body.includes(`16.07.${lastYear}`), false);
  // Kun ett år om gangen: neste år er sperret, forrige finnes.
  assert.equal(byId(tree, 'fravaer-rapport-aar-neste').props.disabled, true);
  assert.equal(byId(tree, 'fravaer-rapport-aar-forrige').props.disabled, false);
  byId(tree, 'fravaer-rapport-aar-forrige').props.onPress();
  tree = render();
  body = texts(tree);
  assert.match(body, new RegExp(`Sum ${lastYear}`));
  assert.match(body, /1 dag · 7:30 timer/);
  assert.equal(byId(tree, 'fravaer-rapport-aar-forrige').props.disabled, true);
}

// Oversikt: Siste fravær til høyre på bred web, under på smal skjerm.
{
  const { AbsenceOverviewView } = loadJsx('screens/arbeid/AbsenceOverviewView.jsx');
  const { buildAbsenceDashboard } = require('../arbeid/absenceDashboard.js');
  const today = `${thisYear}-10-27`;
  const dashboard = buildAbsenceDashboard({
    employees: [people[0]],
    employeeId: 'e1',
    absences,
    adjustments: [],
    fullDayHours: 7.5,
    today,
    names: { e1: 'Anders Rolandsen' },
  });
  const props = {
    embedded: true,
    employees: [{ id: 'e1', name: 'Anders Rolandsen' }],
    employeeId: 'e1',
    dashboard,
    showKpis: false,
  };

  layout = { width: 1800, hasRail: true, railWidth: 220, isDesktop: true };
  let tree = withHooks(plainHooks, () => AbsenceOverviewView(props));
  assert.ok(byId(tree, 'fravaer-siste'), 'Siste fravær mangler');
  assert.equal(byId(tree, 'fravaer-siste').props.style.width, 420);
  let body = texts(tree);
  assert.match(body, /Siste fravær/);
  // Én ansatt: ingen Ansatt-kolonne i tabellen.
  assert.match(body, /Dato\nType\nTidsrom\nStatus/);
  assert.doesNotMatch(body, /Dato\nAnsatt/);

  layout = { width: 1000, hasRail: true, railWidth: 200, isDesktop: false };
  tree = withHooks(plainHooks, () => AbsenceOverviewView(props));
  assert.notEqual(byId(tree, 'fravaer-siste').props.style.width, 420);
  assert.equal(inside(tree, 'fravaer-siste', 'fravaer-se-alle'), true);
}

console.log('employeeAbsenceRender.test.cjs: ok');
