/**
 * Min side (EmployeeHome): flisene øverst, kortene og at hver knapp fører til riktig sted.
 * Rendres uten nettleser: lagring, bilder og Gjøremål-kortet er byttet ut med enkle stubber.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const cache = new Map();
let layoutWidth = 1400;

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  Pressable: host('Pressable'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
  Linking: { openURL: async (url) => { opened.push(url); } },
};
const opened = [];

function load(full) {
  if (cache.has(full)) return cache.get(full);
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
    if (id === 'react-native-svg') return { __esModule: true, default: host('Svg'), Circle: host('Circle') };
    if (id.endsWith('components/StorageImage')) return { __esModule: true, default: host('StorageImage') };
    if (id.endsWith('arbeid/absenceStorage')) return { loadAbsences: async () => [], mergeAbsenceLists: (...l) => l.flat() };
    if (id.endsWith('economy/timeEntryStorage')) return { loadTimeEntries: async () => [] };
    if (id.endsWith('arbeid/absenceCatalog')) return { resolveAbsenceTypes: () => [] };
    if (id.endsWith('project/companyAlias')) return { aliasSourceIds: () => [] };
    if (id.endsWith('hr/billable')) return { ownCompanyMatcher: () => () => false };
    if (id === './EmployeeTodo') return { __esModule: true, default: host('EmployeeTodo') };
    if (id.startsWith('.')) {
      const resolved = path.resolve(path.dirname(full), id);
      const file = ['', '.js', '.jsx'].map((ext) => `${resolved}${ext}`).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      return load(file);
    }
    return orig(id);
  };
  m._compile(out.code, full);
  cache.set(full, m.exports);
  return m.exports;
}

// Bredden måles med onLayout; i testen er den fast (useState(0) gir layoutWidth).
const dispatcher = {
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value === 0 ? layoutWidth : value, () => {}];
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
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

function walk(node, visit, depth = 0) {
  if (depth > 80 || node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit, depth));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    visit(null, String(node));
    return;
  }
  if (!React.isValidElement(node)) return;
  visit(node, null);
  const next = typeof node.type === 'function' && node.type.name !== 'Host'
    ? withHooks(() => node.type(node.props || {}))
    : node.props && node.props.children;
  walk(next, visit, depth + 1);
}

function render(element) {
  const texts = [];
  const ids = new Set();
  const buttons = [];
  const todos = [];
  walk(withHooks(() => element), (node, str) => {
    if (str != null) { texts.push(str); return; }
    if (node.props?.nativeID) ids.add(node.props.nativeID);
    if (node.type?.name === 'Host' && node.props && 'onPress' in node.props) {
      buttons.push({ id: node.props.nativeID || '', onPress: node.props.onPress, disabled: !!node.props.disabled, label: node.props.accessibilityLabel || '' });
    }
    if (node.type === 'EmployeeTodo' || (node.props && node.props.variant === 'card' && 'onCount' in node.props)) todos.push(node.props);
  });
  return { text: texts.join('\n'), ids, buttons, todos };
}

const colors = {
  brand: '#0284c7', brandSoft: '#e0f2fe', ink: '#111', muted: '#667', line: '#ddd', card: '#fff', sunken: '#f4f4f5',
  bg: '#fafafa', success: '#16a34a', successSoft: '#dcfce7', successInk: '#166534', warn: '#d97706', warnInk: '#92400e',
  starSoft: '#fef3c7', danger: '#dc2626', dangerSoft: '#fee2e2', dangerInk: '#991b1b', accent: '#db2777', onBrand: '#fff',
};

const { default: EmployeeHome } = load(path.join(ROOT, 'screens/employees/EmployeeHome.jsx'));

const employee = {
  id: 'e1',
  person: { firstName: 'Ada', lastName: 'Nordmann', phone: '900 00 000', email: 'ada@example.com' },
  company: { title: 'Prosjektleder', workPercent: 100 },
};
const hits = [];
const on = (name) => (arg) => hits.push(arg === undefined ? name : `${name}:${arg}`);
const props = {
  employee,
  colors,
  companyId: 'c1',
  company: {},
  projectState: {},
  projects: [],
  showWork: true,
  showTodo: true,
  own: true,
  shortcuts: [{ id: 'hours', label: 'Før timer', icon: 'time-outline', color: '#7c3aed', onPress: on('shortcut-hours') }],
  profilePct: 75,
  onEditProfile: on('edit'),
  onOpenTodo: on('todo'),
  onOpenAbsence: on('absence'),
  onOpenHours: on('hours'),
  onOpenReport: on('report'),
  onOpenProject: on('project'),
  onOpenProjects: on('projects'),
  onOpenExpenses: on('expenses'),
  onOpenMileage: on('mileage'),
  onOpenSettings: on('settings'),
};

for (const width of [1400, 900, 390]) {
  layoutWidth = width;
  hits.length = 0;
  const view = render(React.createElement(EmployeeHome, props));
  const label = `bredde ${width}`;
  // Flisene øverst: ett område per flis, alle med handling.
  for (const id of ['todo', 'hours', 'absence', 'expenses', 'mileage', 'settings']) {
    assert.ok(view.ids.has(`ansatt-tile-${id}`), `${label}: flis ${id}`);
  }
  // Kortene.
  for (const id of ['employee-home-profile', 'employee-home-productivity', 'employee-home-projects', 'employee-home-absence', 'employee-home-week', 'employee-home-shortcuts', 'employee-home-todo']) {
    assert.ok(view.ids.has(id), `${label}: ${id}`);
  }
  // Hver knapp som ikke er slått av, gjør noe.
  for (const b of view.buttons) {
    if (b.disabled) continue;
    assert.equal(typeof b.onPress, 'function', `${label}: ${b.id || b.label || 'knapp'} gjør ingenting`);
  }
  // Ukestolpene: sju dager, hver åpner timelisten.
  const days = view.buttons.filter((b) => b.id.startsWith('employee-home-week-day-'));
  assert.equal(days.length, 7, `${label}: sju dager`);
  // Trykk på alt og se at alle veiene er brukt.
  for (const b of view.buttons) if (!b.disabled) b.onPress();
  for (const expected of ['todo', 'hours', 'absence', 'expenses', 'mileage', 'settings', 'report', 'edit', 'shortcut-hours']) {
    assert.ok(hits.includes(expected), `${label}: ingen knapp førte til ${expected}`);
  }
  assert.match(view.text, /Timer denne uken/);
  assert.match(view.text, /75 % utfylt/);
  // Gjøremål-kortet får tellingen tilbake til flisen.
  assert.equal(typeof view.todos[0]?.onCount, 'function', `${label}: Gjøremål-kortet melder antall`);
}

// Telefon og e-post åpner ring og e-post.
layoutWidth = 1400;
opened.length = 0;
const view = render(React.createElement(EmployeeHome, props));
view.buttons.find((b) => b.id === 'employee-home-phone').onPress();
view.buttons.find((b) => b.id === 'employee-home-email').onPress();
assert.deepEqual(opened, ['tel:90000000', 'mailto:ada@example.com']);

// Uten tilgang til timer: ingen timeflis og ingen arbeidskort, men resten virker.
hits.length = 0;
const limited = render(React.createElement(EmployeeHome, {
  ...props, showWork: false, onOpenHours: undefined, onOpenReport: undefined, onOpenAbsence: undefined,
}));
assert.equal(limited.ids.has('ansatt-tile-hours'), false);
assert.equal(limited.ids.has('employee-home-week'), false);
assert.ok(limited.ids.has('ansatt-tile-todo'));
for (const b of limited.buttons) if (!b.disabled) assert.equal(typeof b.onPress, 'function', b.id);

console.log('employeeHomeRender.test.cjs: ok');
