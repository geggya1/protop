/**
 * Prosjektutlegg skal rendre filter og import, uten den åpne medarbeider-rekka.
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

const people = [
  { id: 'a', person: { firstName: 'Aina', lastName: 'Jespersen' } },
  { id: 'b', person: { firstName: 'Anas', lastName: 'Elbakri' } },
];
let workspace = {
  workspaceId: 'co',
  lockedId: '',
  employees: people,
  state: { expenses: [], projects: [] },
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

let screenWidth = 1280;
const rnMock = {
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
  useWindowDimensions: () => ({ width: screenWidth, height: 800 }),
};

const companyData = require('../company/companyDataTesting.js').companyDataHooks();

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
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    // Felles rapporttabell rendres ekte, så kolonner og telefonkort testes med skjermen.
    if (id.includes('components/table/ReportTable')) return loadJsx('components/table/ReportTable.jsx');
    if (id.includes('ui/InlineError')) return { __esModule: true, default: function InlineError() { return null; } };
    if (id.includes('ui/Skeleton')) {
      const Skeleton = function Skeleton() { return null; };
      Skeleton.Table = function SkeletonTable() { return React.createElement('Skeleton', { nativeID: 'skeleton-table' }); };
      return { __esModule: true, default: Skeleton };
    }
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.endsWith('src/theme')) return { useLayout: () => ({ width: 800 }) };
    if (id.includes('ModulePageBg')) return { useModuleHeroHosted: () => false };
    if (id.includes('components/Breadcrumb')) return { __esModule: true, default: function Breadcrumb() { return null; } };
    if (id.includes('useTimesheetWorkspace')) {
      return { useTimesheetWorkspace: () => workspace };
    }
    // Admin på prosjektutlegg: import vises (canImportList).
    if (id.includes('useCompanyAccess')) {
      return { useCompanyAccess: () => ({ ready: true, canAdmin: () => true, canEdit: () => true, canRead: () => true }) };
    }
    if (id.includes('anbud/storage')) return { loadAnbudState: async () => ({ customers: [] }) };
    if (id.includes('CompanyDataContext')) return companyData;
    if (id.includes('expenseStorage')) {
      return {
        isExternalExpense: () => false,
        loadProjectExpenses: async () => [],
        mergeExpenseLists: (...lists) => lists.flat(),
        saveProjectExpenses: async () => ({ saved: 0 }),
      };
    }
    if (id.includes('utils/media')) return { pickDocument: async () => null };
    if (id.includes('saveToast')) return { showSaveToast: () => {} };
    if (id.includes('ExpenseImportReview')) return { __esModule: true, default: function ExpenseImportReview() { return null; } };
    if (id.includes('components/OptionPicker')) {
      // Felles velger: vis valgt etikett som tekst, slik feltet gjør.
      return {
        __esModule: true,
        CHIP_LIMIT: 4,
        default: function OptionPicker(props) {
          const hit = (props.options || []).find((row) => (row && typeof row === 'object' ? row.id : row) === props.value);
          const label = hit ? (typeof hit === 'object' ? hit.label : hit) : props.placeholder;
          return React.createElement('OptionPicker', props, label || null);
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
    const props = element.props || {};
    if (props.placeholder) out.push(String(props.placeholder));
    const kids = props.children;
    if (typeof kids === 'string') out.push(kids);
    if (Array.isArray(kids)) {
      kids.forEach((child) => { if (typeof child === 'string') out.push(child); });
    }
  });
  return out.join('\n');
}

const screen = loadJsx('screens/economy/ProjectExpensesScreen.jsx');
const tree = withHooks(() => React.createElement(screen.ProjectExpensesScreen, {}));
const body = texts(tree);
assert.match(body, /Prosjektutlegg/);
assert.match(body, /Importer fra fil/);
assert.match(body, /Filtrer medarbeider/);
assert.match(body, /Filtrer kunde/);
assert.match(body, /Filtrer prosjekt/);
assert.match(body, /Nyeste dato/);
assert.equal(body.includes('Aina'), false);
assert.equal(body.includes('Anas'), false);
const ids = [];
walk(tree, (element) => {
  if (element.props && element.props.nativeID) ids.push(element.props.nativeID);
});
assert.ok(ids.includes('prosjektutlegg'));
assert.ok(ids.includes('expense-import-open'));
assert.ok(ids.includes('expense-filters'));

// Ansattsiden: utlegg personen har registrert på prosjekt, også importerte uten kobling.
const expense = (id, extra) => ({
  id, date: '2026-10-01', description: `Utlegg ${id}`, amountInclVat: 100, projectName: 'Bygg', ...extra,
});
workspace = {
  ...workspace,
  lockedId: 'a',
  state: {
    projects: [],
    expenses: [
      expense('egen', { employeeId: 'a', employeeName: 'Aina Jespersen' }),
      expense('kollega', { employeeId: 'b', employeeName: 'Anas Elbakri' }),
      expense('navn', { employeeName: 'Jespersen, Aina' }),
      expense('ukjent', {}),
    ],
  },
};
const mine = texts(withHooks(() => React.createElement(screen.ProjectExpensesScreen, { lockedEmployeeId: 'a', embedded: true })));
assert.match(mine, /Utlegg egen/);
assert.match(mine, /Utlegg navn/);
assert.doesNotMatch(mine, /Utlegg kollega/);
assert.doesNotMatch(mine, /Utlegg ukjent/);
assert.doesNotMatch(mine, /Medarbeider/);
assert.doesNotMatch(mine, /Filtrer medarbeider/);

// Bred skjerm: felles rapporttabell med sorterbar overskrift og sum. Ingen fast bredde på 980 px.
const source = fs.readFileSync(path.join(ROOT, 'screens/economy/ProjectExpensesScreen.jsx'), 'utf8');
assert.equal(source.includes('minWidth: 980'), false);
const wideIds = [];
walk(withHooks(() => React.createElement(screen.ProjectExpensesScreen, { lockedEmployeeId: 'a', embedded: true })), (element) => {
  if (element.props && element.props.nativeID) wideIds.push(element.props.nativeID);
});
assert.ok(wideIds.includes('expense-table-head'), 'tabellhode på bred skjerm');
assert.ok(wideIds.includes('expense-table-sum'), 'sumlinje');

// Telefon (390 px): kort med beskrivelse som tittel, dato og beløp, uten tabellhode.
screenWidth = 390;
const phoneTree = withHooks(() => React.createElement(screen.ProjectExpensesScreen, { lockedEmployeeId: 'a', embedded: true }));
const phoneIds = [];
walk(phoneTree, (element) => {
  if (element.props && element.props.nativeID) phoneIds.push(element.props.nativeID);
});
assert.equal(phoneIds.includes('expense-table-head'), false, 'ingen tabell på telefon');
assert.ok(phoneIds.includes('expense-table'));
const phoneText = texts(phoneTree);
assert.match(phoneText, /Utlegg egen/);
assert.match(phoneText, /01\.10\.2026/);
assert.doesNotMatch(phoneText, /Utlegg kollega/);
screenWidth = 1280;
console.log('projectExpensesScreen.test.cjs ok');
