/**
 * Timerapport: raden er en knapp som åpner timeføringsdialogen.
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
  card: '#fff', bg: '#F4F7FB', sunken: '#F3F6FA', danger: '#b42318', placeholder: '#9aa',
};

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

const today = localDateKey(new Date());
const fixture = {
  projects: [{
    id: 'p1',
    number: '10640',
    name: 'Myklebust barnehage',
    client: 'Sola Kommune',
    status: 'aktiv',
    workSettings: {},
  }],
  activities: [{ id: 'a1', projectId: 'p1', name: 'Hovedaktivitet' }],
  timeEntries: [{
    id: 't1',
    projectId: 'p1',
    projectNumber: '10640',
    projectName: 'Myklebust barnehage',
    employeeId: 'e1',
    employeeName: 'Geir Ove Andersen',
    customerName: 'Sola Kommune',
    date: today,
    hours: 1,
    billableHours: 1,
    description: '20',
    activityId: 'a1',
    activityName: 'Hovedaktivitet',
    status: 'registrert',
  }],
  timesheetLocks: [],
  absences: [],
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
  TextInput: host('TextInput'),
  Modal: function Modal(props) {
    return props && props.visible === false ? null : React.createElement('Modal', props, props.children);
  },
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: {},
  },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

let activeRequire = Module.prototype.require;

function compile(filename, code) {
  const current = Module.prototype.require;
  Module.prototype.require = activeRequire;
  try {
  return babel.transformSync(code, {
    filename,
    presets: [['babel-preset-expo', { jsxRuntime: 'classic' }]],
    plugins: [['@babel/plugin-transform-modules-commonjs', { lazy: false }]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
  }).code;
  } finally {
    Module.prototype.require = current;
  }
}

function hookedRequire(orig, id) {
  if (id === 'react') return React;
  if (id === 'react-native') return rnMock;
  if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
  if (id.includes('AppContext')) return { useApp: () => ({ familyId: 'co' }) };
  if (id.includes('useCompanyAi')) return { useCompanyAiGuard: () => (call) => call, useCompanyAiAllowed: () => true };
  if (id.includes('useCompanyAccess')) {
    return { useCompanyAccess: () => ({ ready: true, previewing: false, employee: null, canView: () => true, canEdit: () => true, canAdmin: () => true }) };
  }
  if (id.includes('ThemeContext')) return { useColors: () => colors };
  if (id.includes('/theme')) {
    return { useLayout: () => ({ width: 1400, height: 900, isPhone: false, hasRail: false, railWidth: 0 }) };
  }
  if (id.includes('saveToast')) return { showSaveToast() {} };
  if (id.includes('BrandBusyOverlay')) return { __esModule: true, default() { return null; } };
  if (id.includes('ModulePageBg')) return { useModuleHeroHosted: () => false };
  if (id.includes('ImportReview')) return { ImportResult() { return null; } };
  if (id.includes('HoursOrganizePanel') || id.includes('HoursImportReview') || id.includes('TimesheetDayView')) {
    return { __esModule: true, default() { return null; } };
  }
  if (id.includes('project/storage')) {
    return {
      loadProjectState: async () => fixture,
      ensureProjectHours: async () => fixture,
      peekProjectState: () => null,
      hoursRangeCovered: () => false,
      adoptLoadedHours: (current, loaded) => ({
        ...(current || {}),
        ...(loaded || {}),
        timeEntries: loaded?.timeEntries?.length ? loaded.timeEntries : (current?.timeEntries || []),
      }),
      persistProjectState: async (state) => state,
      putProjectState() {},
    };
  }
  if (id.includes('employees/storage')) {
    return { watchEmployees(_id, onData) { onData([]); return () => {}; } };
  }
  if (id.includes('anbud/storage')) return { loadAnbudState: async () => ({ customers: [] }) };
  if (id.includes('usageClient')) return { recordUsage: async () => {} };
  if (id.includes('utils/media')) return { pickDocument: async () => null };
  if (id.includes('imports/assist')) return { readHourImport: async () => ({ rows: [] }) };
  if (id.includes('imports/interpretClient')) return { askImportInterpret: async () => ({}) };
  if (id.includes('react-native')) return rnMock;
  return orig(id);
}

const originalRequire = activeRequire;
Module.prototype.require = function patched(id) {
  if (id === 'react-native') return rnMock;
  try {
    return originalRequire.apply(this, arguments);
  } catch (error) {
    console.error('FAIL_REQUIRE', id, error.message);
    throw error;
  }
};

require.extensions['.jsx'] = function loadJsx(module, filename) {
  const code = compile(filename, fs.readFileSync(filename, 'utf8'));
  const orig = module.require.bind(module);
  module.require = (id) => hookedRequire(orig, id);
  module._compile(code, filename);
};

const screenPath = path.join(ROOT, 'screens/economy/EconomyHours.jsx');
const EconomyHours = require(screenPath).default;

const buckets = new Map();
let active = null;

function bucketFor(type) {
  const name = type.displayName || type.name || 'anon';
  if (!buckets.has(name)) buckets.set(name, { slots: [], effects: [], cursor: 0 });
  return buckets.get(name);
}

const dispatcher = {
  useState(initial) {
    const bag = active;
    const index = bag.cursor++;
    if (bag.slots[index] === undefined) {
      bag.slots[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
    }
    const slot = bag.slots[index];
    return [slot.value, (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (Object.is(slot.value, value)) return;
      slot.value = value;
      bag.dirty = true;
    }];
  },
  useRef(initial) {
    const bag = active;
    const index = bag.cursor++;
    if (bag.slots[index] === undefined) bag.slots[index] = { current: initial };
    return bag.slots[index];
  },
  useEffect(fn, deps) {
    const bag = active;
    const index = bag.cursor++;
    bag.planned[index] = { fn, deps };
  },
  useLayoutEffect(fn, deps) { this.useEffect(fn, deps); },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useContext() { return undefined; },
};

function depsChanged(prev, next) {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  return prev.some((item, index) => !Object.is(item, next[index]));
}

function callWithHooks(type, props) {
  const bag = bucketFor(type);
  bag.cursor = 0;
  bag.planned = [];
  bag.dirty = false;
  active = bag;
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return type(props || {});
  } finally {
    internals.H = previous;
    active = null;
    bag.planned.forEach((plan, index) => {
      const prior = bag.effects[index];
      if (!prior || depsChanged(prior.deps, plan.deps)) {
        if (prior && prior.cleanup) prior.cleanup();
        const cleanup = plan.fn();
        bag.effects[index] = { deps: plan.deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
      }
    });
  }
}

function findPress(node, id, depth = 0) {
  if (depth > 25 || node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPress(child, id, depth);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  if (node.props && node.props.nativeID === id && node.props.onPress) return node.props.onPress;
  if (typeof node.type === 'function') {
    return findPress(callWithHooks(node.type, node.props), id, depth + 1);
  }
  return findPress(node.props && node.props.children, id, depth + 1);
}

function collectText(node, depth = 0, out = []) {
  if (depth > 25 || node == null || typeof node === 'boolean') return out;
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
    collectText(callWithHooks(node.type, node.props), depth + 1, out);
    return out;
  }
  collectText(node.props && node.props.children, depth + 1, out);
  return out;
}

async function settle() {
  let tree = null;
  for (let pass = 0; pass < 6; pass += 1) {
    tree = callWithHooks(EconomyHours, { familyId: 'co' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return tree;
}

(async () => {
  const tree = await settle();
  const open = findPress(tree, 'hour-row-t1');
  assert.equal(typeof open, 'function');
  open();
  const opened = callWithHooks(EconomyHours, { familyId: 'co' });
  collectText(opened);
  const text = collectText(opened).join('\n');
  assert.match(text, /Beskrivelse av utført arbeid/);
  assert.match(text, /Myklebust barnehage/);
  assert.ok(text.includes('20'), text);
  console.log('hourReportUi.test.cjs: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
