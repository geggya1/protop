/**
 * Gjøremål (EmployeeTodo): hver rad, hvert nøkkeltall og hver linje i «Mine gjøremål» er en knapp
 * som fører dit punktet gjøres. Kortet på Min side sender målet videre. Uten nettleser:
 * lagring og dokumentkontroll er byttet ut med stubber, gjøremålene regnes av den ekte todo.js.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const cache = new Map();

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
};

const DOCS = [
  { control: { id: 'ks-1', title: 'Personalhåndbok', readRule: 'lesBekreft' }, required: true, done: false, revision: 2 },
  { control: { id: 'ks-2', title: 'Taushetserklæring', readRule: 'signeres' }, required: true, done: true, revision: 1 },
];
const SLICE = {
  tasks: [{ id: 't1', title: 'Last opp kursbevis', status: 'open', dueDate: '2020-01-01', description: 'Fra HR' }],
  hmsCards: [],
  compliance: [],
  settings: { hmsCard: 'required' },
};
const scrolled = [];

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
    if (id.endsWith('ui/lazyScreen')) return { lazyScreen: () => host('Lazy') };
    if (id.endsWith('doccontrol/model')) return { documentsForEmployee: () => DOCS };
    if (id.endsWith('forms/filledStore')) return { loadFilledDocs: async () => [] };
    if (id.endsWith('hr/hmsSelf')) return { loadOwnHmsCard: async () => null, saveOwnHmsCard: async (_c, _e, card) => card };
    if (id.endsWith('hr/storage')) return { loadEmployeeHrSlice: async () => SLICE };
    if (id.endsWith('hr/model')) return { employeeVisibleSlice: () => ({}) };
    if (id.endsWith('hr/hmsCard')) {
      return {
        hmsCardRequirement: () => ({ required: true }),
        mergeHmsCards: (a, b) => [...(a || []), ...(b || [])],
        hmsCardStatus: () => ({ id: 'missing', label: 'Mangler' }),
      };
    }
    if (id.endsWith('ui/saveToast')) return { showSaveToast: () => {} };
    if (id.endsWith('ui/scrollToAnchor')) return { scrollToAnchorSoon: (anchor) => { scrolled.push(anchor); return () => {}; } };
    if (id === '../doccontrol/MyDocuments') return { __esModule: true, default: host('MyDocuments') };
    if (id === '../doccontrol/useDocControl') return { useDocControl: () => ({ controls: [], acks: [] }) };
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

// useState: bredden (0) er 1400, gjøremålene fra HR (første null) er hentet, eget HMS-kort finnes ikke.
let nulls = [];
const setters = [];
const dispatcher = {
  useState(initial) {
    let value = typeof initial === 'function' ? initial() : initial;
    if (value === 0) value = 1400;
    else if (value === null && nulls.length) value = nulls.shift();
    const set = (next) => setters.push(next);
    return [value, set];
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
  nulls = [SLICE, null];
  const texts = [];
  const ids = new Set();
  const buttons = [];
  walk(withHooks(() => element), (node, str) => {
    if (str != null) { texts.push(str); return; }
    if (node.props?.nativeID) ids.add(node.props.nativeID);
    if (node.type?.name === 'Host' && node.props && 'onPress' in node.props) {
      buttons.push({ id: node.props.nativeID || '', onPress: node.props.onPress, disabled: !!node.props.disabled });
    }
  });
  return { text: texts.join('\n'), ids, buttons };
}

const colors = {
  brand: '#0284c7', brandSoft: '#e0f2fe', ink: '#111', muted: '#667', line: '#ddd', card: '#fff', sunken: '#f4f4f5',
  bg: '#fafafa', success: '#16a34a', successSoft: '#dcfce7', successInk: '#166534', warn: '#d97706', warnInk: '#92400e',
  starSoft: '#fef3c7', danger: '#dc2626', dangerSoft: '#fee2e2', dangerInk: '#991b1b', accent: '#db2777', onBrand: '#fff',
};

const { default: EmployeeTodo } = load(path.join(ROOT, 'screens/employees/EmployeeTodo.jsx'));
const employee = { id: 'e1', kind: 'employee', person: { firstName: 'Ada' }, company: {} };

// Hele siden.
let kin = 0;
let view = render(React.createElement(EmployeeTodo, {
  colors, companyId: 'c1', employee, onOpenKin: () => { kin += 1; },
}));
for (const id of ['employee-todo-kpis', 'employee-todo-attention', 'employee-todo-docs', 'employee-todo-hms', 'employee-todo-progress', 'employee-todo-done']) {
  assert.ok(view.ids.has(id), id);
}
assert.match(view.text, /Les og bekreft: Personalhåndbok/);
assert.match(view.text, /Last opp kursbevis/);
assert.match(view.text, /Frist passert/);
for (const b of view.buttons) {
  if (b.disabled) continue;
  assert.equal(typeof b.onPress, 'function', `${b.id || 'knapp'} gjør ingenting`);
}
const press = (id) => {
  const b = view.buttons.find((row) => row.id === id);
  assert.ok(b, `fant ikke ${id}`);
  scrolled.length = 0;
  setters.length = 0;
  b.onPress();
};
// Dokumentet: siden ruller til dokumentet og åpner det.
press('employee-todo-doc-ks-1');
assert.deepEqual(scrolled, ['my-doc-ks-1']);
assert.ok(setters.some((v) => v && v.id === 'ks-1'), 'dokumentet åpnes');
// HMS-kortet.
press('employee-todo-hms');
assert.deepEqual(scrolled, ['employee-todo-hms']);
// Pårørende åpner familievinduet.
press('employee-todo-kin');
assert.equal(kin, 1);
// Oppgaven fra HR foldes ut.
press('employee-todo-hr-t1');
assert.deepEqual(scrolled, ['employee-todo-hr-t1']);
assert.ok(setters.some((v) => typeof v === 'function'), 'oppgaven foldes ut');
// Nøkkeltallene.
press('employee-todo-kpi-open');
assert.deepEqual(scrolled, ['employee-todo-attention']);
press('employee-todo-kpi-done');
assert.deepEqual(scrolled, ['employee-todo-done']);
press('employee-todo-kpi-hms');
assert.deepEqual(scrolled, ['employee-todo-hms']);
// «Mine gjøremål»: hver type fører til sitt.
press('employee-todo-progress-document');
assert.deepEqual(scrolled, ['my-doc-ks-1']);
press('employee-todo-progress-hrTask');
assert.deepEqual(scrolled, ['employee-todo-hr-t1']);
// Fullført: det signerte dokumentet kan åpnes igjen.
press('employee-todo-done-doc-ks-2');
assert.deepEqual(scrolled, ['my-doc-ks-2']);

// Kortet på Min side: hver rad sender målet sitt videre.
const targets = [];
view = render(React.createElement(EmployeeTodo, {
  colors, companyId: 'c1', employee, variant: 'card', onOpenTodo: (target) => targets.push(target ?? ''),
}));
for (const b of view.buttons) if (!b.disabled) b.onPress();
assert.ok(targets.includes('documents:ks-1'), 'dokumentet');
assert.ok(targets.includes('hr:t1'), 'oppgaven');
assert.ok(targets.includes('kin'), 'pårørende');
assert.ok(targets.includes('hms'), 'HMS-kortet');
assert.ok(targets.includes(''), '«Se alle»');

console.log('employeeTodoRender.test.cjs: ok');
