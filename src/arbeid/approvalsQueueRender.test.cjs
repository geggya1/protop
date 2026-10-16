/**
 * Godkjenninger: lås uten førte timer skal ikke stå under «Låst til kontroll».
 * På smal skjerm bytter en bryter mellom «Låst til kontroll» og «Ikke låst».
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

let viewport = { width: 1200, height: 800 };

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  useWindowDimensions: () => viewport,
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
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const hookState = [];
let hookCursor = 0;

const dispatcher = {
  useState(initial) {
    const index = hookCursor++;
    if (hookState[index] === undefined) {
      hookState[index] = typeof initial === 'function' ? initial() : initial;
    }
    return [hookState[index], (next) => {
      hookState[index] = typeof next === 'function' ? next(hookState[index]) : next;
    }];
  },
  useMemo(fn) { return fn(); },
  useEffect() {},
  useLayoutEffect() {},
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useContext() { return undefined; },
};

function resetHooks() {
  hookState.length = 0;
  hookCursor = 0;
}

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

function collectText(node, depth = 0, out = []) {
  if (depth === 0) hookCursor = 0;
  if (depth > 30 || node == null || typeof node === 'boolean') return out;
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

const { ApprovalsBody } = loadJsx('screens/arbeid/ApprovalsView.jsx');

function aina(hours) {
  return {
    employees: [{
      id: 'aina',
      person: { firstName: 'Aina Helen', lastName: 'Jespersen' },
      company: { status: 'active' },
    }],
    manager: true,
    state: {
      timesheetLocks: [{ employeeId: 'aina', throughDate: '2026-10-05', approvedAt: '' }],
      timesheetLockArchive: [],
      timeEntries: hours
        ? [{ id: 't1', employeeId: 'aina', date: '2026-10-03', hours, description: 'Befaring' }]
        : [],
      absences: [],
    },
    setError() {},
    setState() {},
    uid: 'u1',
    linked: null,
    error: '',
  };
}

function collectHosts(node, depth = 0, out = []) {
  if (depth === 0) hookCursor = 0;
  if (depth > 30 || node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectHosts(child, depth, out));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  if (typeof node.type === 'function') {
    collectHosts(withHooks(() => node.type(node.props || {})), depth + 1, out);
    return out;
  }
  out.push(node);
  collectHosts(node.props && node.props.children, depth + 1, out);
  return out;
}

function renderText(props) {
  return collectText(React.createElement(ApprovalsBody, props)).join('\n');
}

function press(props, nativeID) {
  const node = collectHosts(React.createElement(ApprovalsBody, props))
    .find((el) => el.props && el.props.nativeID === nativeID);
  assert.ok(node, nativeID);
  node.props.onPress();
}

{
  viewport = { width: 1200, height: 800 };
  resetHooks();
  const empty = renderText({ workspace: aina(0), colors });
  assert.match(empty, /Ingen timer å kontrollere/);
  assert.match(empty, /Hvor lenge siden listen ble låst sist/);
  assert.match(empty, /Låst til kontroll/);
  assert.match(empty, /Ikke låst/);
  assert.equal(collectHosts(React.createElement(ApprovalsBody, { workspace: aina(0), colors }))
    .some((el) => el.props && el.props.nativeID === 'godkjenning-visning'), false);
  assert.doesNotMatch(empty, /Aina Helen Jespersen/);
  assert.equal(empty.split('\n').includes('Kontroller'), false);
}

{
  viewport = { width: 1200, height: 800 };
  resetHooks();
  const filled = renderText({ workspace: aina(6), colors });
  assert.match(filled, /Aina Helen Jespersen/);
  assert.equal(filled.split('\n').includes('Kontroller'), true);
  assert.match(filled, /\n6\n|6/);
}

{
  viewport = { width: 390, height: 844 };
  resetHooks();
  const props = { workspace: aina(6), colors };
  const locked = renderText(props);
  const lockedHosts = collectHosts(React.createElement(ApprovalsBody, props));
  assert.equal(lockedHosts.some((el) => el.props && el.props.nativeID === 'godkjenning-visning'), true);
  assert.equal(lockedHosts.some((el) => el.props && el.props.nativeID === 'godkjenning-laste'), true);
  assert.equal(lockedHosts.some((el) => el.props && el.props.nativeID === 'godkjenning-ulaste'), false);
  assert.match(locked, /Låste timer\. Kontroller før du godkjenner til fakturering/);
  assert.match(locked, /Aina Helen Jespersen/);
  assert.doesNotMatch(locked, /Hvor lenge siden listen ble låst sist/);

  press(props, 'godkjenning-vis-ulast');
  const unlocked = renderText(props);
  const unlockedHosts = collectHosts(React.createElement(ApprovalsBody, props));
  assert.match(unlocked, /Hvor lenge siden listen ble låst sist/);
  assert.doesNotMatch(unlocked, /Låste timer\. Kontroller før du godkjenner til fakturering/);
  assert.equal(unlockedHosts.some((el) => el.props && el.props.nativeID === 'godkjenning-ulaste'), true);
  assert.equal(unlockedHosts.some((el) => el.props && el.props.nativeID === 'godkjenning-laste'), false);

  press(props, 'godkjenning-vis-last');
  const back = renderText(props);
  assert.match(back, /Låste timer\. Kontroller før du godkjenner til fakturering/);
  assert.doesNotMatch(back, /Hvor lenge siden listen ble låst sist/);
}

console.log('approvalsQueueRender.test.cjs: ok');
