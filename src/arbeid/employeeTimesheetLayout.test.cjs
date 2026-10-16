/**
 * Timer under Ansatte skal fylle samme bredde som timelisten,
 * og bruke samme ArbeidScreen (samme prosjektfilter).
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');

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
    if (id === 'react-native') {
      return {
        View: (props) => React.createElement('View', props, props.children),
        Text: (props) => React.createElement('Text', props, props.children),
        TouchableOpacity: (props) => React.createElement('TouchableOpacity', props, props.children),
        StyleSheet: {
          create: (styles) => styles,
          hairlineWidth: 1,
        },
      };
    }
    if (id === '@expo/vector-icons') return { Ionicons: () => null };
    if (id.includes('/theme')) return { useLayout: () => ({ isPhone: false }) };
    if (id.includes('employees/model')) {
      return {
        cardSubtitle: () => 'Prosjektleder',
        displayName: () => 'Anders Rolandsen',
        statusLabel: () => 'Aktiv',
      };
    }
    if (id.includes('personTabs')) {
      return { EMPLOYEE_DETAIL_TABS: [{ id: 'hours', label: 'Timer' }], employeeViewToTab: () => 'hours' };
    }
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

function walk(node, visit) {
  if (node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (!React.isValidElement(node)) return;
  visit(node);
  if (typeof node.type === 'function') walk(node.type(node.props), visit);
  else walk(node.props && node.props.children, visit);
}

const { default: EmployeePersonChrome } = loadJsx('screens/employees/EmployeePersonChrome.jsx');
const tree = React.createElement(EmployeePersonChrome, {
  employee: { id: 'e1', company: { status: 'active' } },
  colors: { ink: '#111', muted: '#666', brand: '#1099F4', line: '#ddd', card: '#fff', danger: '#b00' },
  fill: true,
  activeTab: 'hours',
  siblings: [],
  children: React.createElement('Timesheet', { nativeID: 'employee-hours-slot' }),
});

let sheetParentStyle = null;
walk(tree, (node) => {
  const kids = node.props && node.props.children;
  const list = Array.isArray(kids) ? kids : [kids];
  if (list.some((child) => child && child.props && child.props.nativeID === 'employee-hours-slot')) {
    sheetParentStyle = node.props.style;
  }
});

const flat = (style) => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style || {}));
const parent = flat(sheetParentStyle);
assert.equal(parent.flex, 1);
assert.equal(parent.gap, 0);
assert.equal(parent.paddingHorizontal, undefined);

const screen = fs.readFileSync(path.join(ROOT, 'screens/employees/EmployeesScreen.jsx'), 'utf8');
assert.match(screen, /hoursHostFill/);
assert.match(screen, /<ArbeidScreen lockedEmployeeId=\{selected\.id\} embedded \/>/);
assert.match(screen, /const hoursFill = view === 'hours'/);
assert.doesNotMatch(screen, /hoursPage:[^}]*maxWidth/);
assert.match(screen, /hoursHostFill: \{ flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' \}/);

console.log('employeeTimesheetLayout.test.cjs: ok');
