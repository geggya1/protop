/**
 * Prosjektutlegg: filter og import ligger bak knapper, uten åpen medarbeider-rekke.
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
  TextInput: host('TextInput'),
  Pressable: host('Pressable'),
  Modal: function Modal(props) {
    return props && props.visible ? React.createElement('Modal', props, props.children) : null;
  },
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
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
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.includes('ModulePageBg')) return { useModuleHeroHosted: () => false };
    if (id.includes('useTimesheetWorkspace')) {
      return {
        useTimesheetWorkspace: () => ({
          workspaceId: 'co',
          lockedId: '',
          employees: [
            { id: 'a', person: { firstName: 'Aina', lastName: 'Jespersen' } },
            { id: 'b', person: { firstName: 'Anas', lastName: 'Elbakri' } },
          ],
          state: { expenses: [], projects: [] },
        }),
      };
    }
    if (id.includes('anbud/storage')) return { loadAnbudState: async () => ({ customers: [] }) };
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
assert.match(body, /Filtrer/);
assert.equal(body.includes('Importer fra fil'), false);
assert.equal(body.includes('Filtrer medarbeider'), false);
assert.equal(body.includes('Nyeste dato'), false);
assert.equal(body.includes('Aina'), false);
assert.equal(body.includes('Anas'), false);
const ids = [];
walk(tree, (element) => {
  if (element.props && element.props.nativeID) ids.push(element.props.nativeID);
});
assert.ok(ids.includes('prosjektutlegg'));
assert.ok(ids.includes('expense-filter-toggle'));
assert.ok(ids.includes('expense-settings'));
assert.equal(ids.includes('expense-import-open'), false);
assert.equal(ids.includes('expense-filters'), false);

const source = fs.readFileSync(path.join(ROOT, 'screens/economy/ProjectExpensesScreen.jsx'), 'utf8');
assert.match(source, /expense-import-open/);
assert.match(source, /expense-filters/);
assert.match(source, /Filtrer medarbeider/);
assert.match(source, /Filtrer kunde/);
assert.match(source, /Filtrer prosjekt/);
assert.match(source, /Importer fra fil/);

function expandTree(node, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map((child) => expandTree(child, depth));
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (!React.isValidElement(node)) return node;
  if (typeof node.type === 'function') return expandTree(node.type(node.props || {}), depth + 1);
  const children = node.props && node.props.children;
  if (children == null) return node;
  return React.cloneElement(node, node.props, expandTree(children, depth));
}

function findByNativeId(node, nativeID, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByNativeId(child, nativeID, depth);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  if (node.props && node.props.nativeID === nativeID) return node;
  return findByNativeId(node.props && node.props.children, nativeID, depth + 1);
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
    text() { return texts(tree); },
    press(nativeID) {
      const node = findByNativeId(tree, nativeID);
      assert.ok(node, `fant ikke ${nativeID}`);
      node.props.onPress();
    },
  };
}

{
  const ui = interactiveRender(React.createElement(screen.ProjectExpensesScreen, {}));
  assert.equal(ui.text().includes('Filtrer og sorter'), false);
  assert.equal(ui.text().includes('Importer fra fil'), false);
  ui.press('expense-filter-toggle');
  assert.match(ui.text(), /Filtrer og sorter/);
  assert.match(ui.text(), /Nyeste dato/);
  assert.match(ui.text(), /Filtrer medarbeider/);
  ui.press('expense-filter-close');
  assert.equal(ui.text().includes('Nyeste dato'), false);
  ui.press('expense-settings');
  assert.match(ui.text(), /Importer fra fil/);
  assert.equal(ui.text().includes('Filtrer og sorter'), false);
  ui.press('expense-settings-dismiss');
  assert.equal(ui.text().includes('Importer fra fil'), false);
}

console.log('projectExpensesScreen.test.cjs ok');
