/**
 * Inntjeningssiden viser lønn fra HR og 0 i standardsatser.
 * Eksempeltall fra et ark skal ikke dukke opp av seg selv.
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
  placeholder: '#9aa', brandSoft: '#E5F6FE',
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
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

const employee = {
  id: 'e1',
  person: { firstName: 'Kari', lastName: 'Nordmann' },
  company: { status: 'active', workPercent: '100', title: 'Rådgiver', employmentType: 'Fast', personnelKind: 'staff' },
};
const people = [
  employee,
  {
    id: 'e2',
    person: { firstName: 'Per', lastName: 'Innleid' },
    company: { status: 'active', personnelKind: 'innleid', workPercent: '100', title: 'Konsulent' },
  },
  {
    id: 'e3',
    person: { firstName: 'Sluttet', lastName: 'Person' },
    company: { status: 'inactive', personnelKind: 'staff', title: 'Tidligere' },
  },
];
global.fetch = async () => { throw new Error('offline'); };
const salaries = [{ employeeId: 'e1', kind: 'actual', annualAmount: 950000, effectiveDate: '2026-01-01', currency: 'NOK' }];
let settings;
let updates = 0;

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
  if (id.includes('@expo/vector-icons')) return { Ionicons() { return null; } };
  if (id.includes('AppContext')) return { useApp: () => ({ familyId: 'co' }) };
  if (id.includes('ThemeContext')) return { useColors: () => colors };
  if (id.includes('src/theme')) return { useLayout: () => ({ width: 1400, isPhone: false, hasRail: false, railWidth: 0 }) };
  if (id.includes('useCompanyAccess')) {
    return {
      useCompanyAccess: () => ({
        can: () => true,
        canView: () => true,
        canEdit: () => true,
        canAdmin: () => true,
      }),
    };
  }
  if (id.includes('async-storage')) {
    return { default: { getItem: async () => null, setItem: async () => {} } };
  }
  if (id === 'firebase/firestore') {
    return {
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false, data: () => ({}) }),
      setDoc: async () => {},
    };
  }
  if (id.endsWith('/firebase') || id.endsWith('/firebase.js')) return { db: {} };
  if (id.includes('employees/storage')) {
    return { watchEmployees(_id, onData) { onData(people); return () => {}; } };
  }
  if (id.includes('vacationPlanStorage')) {
    return { loadVacationPlan: async () => null };
  }
  if (id.includes('hr/storage')) return { loadHrState: async () => ({ salaries }) };
  if (id.includes('useEarningsSettings')) {
    return {
      useEarningsSettings: () => ({
        settings,
        ready: true,
        update(next) {
          settings = typeof next === 'function' ? next(settings) : next;
          updates += 1;
        },
      }),
    };
  }
  return orig(id);
}

const originalRequire = activeRequire;
Module.prototype.require = function patched(id) {
  if (id === 'react-native') return rnMock;
  return originalRequire.apply(this, arguments);
};
activeRequire = Module.prototype.require;

require.extensions['.jsx'] = function loadJsx(module, filename) {
  const code = compile(filename, fs.readFileSync(filename, 'utf8'));
  const orig = module.require.bind(module);
  module.require = (id) => hookedRequire(orig, id);
  module._compile(code, filename);
};

const earnings = originalRequire(path.join(__dirname, 'earnings.js'));
settings = earnings.defaultEarningsSettings();

const buckets = new Map();
let active = null;

function bucketFor(type) {
  const name = type.displayName || type.name || 'anon';
  if (!buckets.has(name)) buckets.set(name, { slots: [], effects: [] });
  return buckets.get(name);
}

const dispatcher = {
  useState(initial) {
    const bag = active;
    const index = bag.cursor++;
    if (bag.slots[index] === undefined) {
      bag.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    }
    const slot = bag.slots[index];
    return [slot.value, (next) => {
      slot.value = typeof next === 'function' ? next(slot.value) : next;
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
  let tree;
  try {
    tree = type(props || {});
  } finally {
    internals.H = previous;
    active = null;
  }
  bag.planned.forEach((plan, index) => {
    const prior = bag.effects[index];
    if (!prior || depsChanged(prior.deps, plan.deps)) {
      if (prior && prior.cleanup) prior.cleanup();
      const cleanup = plan.fn();
      bag.effects[index] = { deps: plan.deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
    }
  });
  return tree;
}

function collectText(node, depth = 0, out = []) {
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
    collectText(callWithHooks(node.type, node.props), depth + 1, out);
    return out;
  }
  collectText(node.props && node.props.children, depth + 1, out);
  return out;
}

function findPress(node, id, depth = 0) {
  if (depth > 30 || node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPress(child, id, depth);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  if (node.props && node.props.nativeID === id && node.props.onPress) return node.props.onPress;
  if (typeof node.type === 'function') return findPress(callWithHooks(node.type, node.props), id, depth + 1);
  return findPress(node.props && node.props.children, id, depth + 1);
}

function findProp(node, id, depth = 0) {
  if (depth > 30 || node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProp(child, id, depth);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  if (node.props && node.props.nativeID === id) return node.props;
  if (typeof node.type === 'function') return findProp(callWithHooks(node.type, node.props), id, depth + 1);
  return findProp(node.props && node.props.children, id, depth + 1);
}

const EconomyEarnings = require(path.join(ROOT, 'screens/economy/EconomyEarnings.jsx')).default;

async function renderScreen() {
  let tree = null;
  for (let pass = 0; pass < 4; pass += 1) {
    tree = callWithHooks(EconomyEarnings, {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return tree;
}

(async () => {
  const tree = await renderScreen();
  const text = collectText(tree).join('\n');
  assert.match(text, /Kari Nordmann/);
  assert.doesNotMatch(text, /Per Innleid/);
  assert.doesNotMatch(text, /Sluttet/);
  assert.match(text, /950\s?000/);
  assert.match(text, /lønn/i);
  assert.match(text, /Ansatte/);
  assert.match(text, /Innleide/);
  assert.match(text, /Kunder/);
  assert.match(text, /Prosjekt/);
  assert.match(text, /Avtaler/);
  assert.match(text, /Faktureringsgrad/);
  assert.doesNotMatch(text, /85\s?666/);
  assert.doesNotMatch(text, /37\s?970/);
  assert.doesNotMatch(text, /1\s?150/);
  assert.match(text, /Variabler/);

  const open = findPress(tree, 'earnings-open-e1');
  assert.equal(typeof open, 'function');
  open();
  let person = await renderScreen();
  assert.match(collectText(person).join('\n'), /Rådgiver/);
  assert.match(collectText(person).join('\n'), /Faktureringsgrad/);
  findPress(person, 'earnings-group-direct')();
  person = await renderScreen();
  assert.match(collectText(person).join('\n'), /Fastlønn/);
  assert.match(collectText(person).join('\n'), /Fra lønn/);
  const car = findProp(person, 'earnings-amount-bil');
  assert.equal(car.value, 0);
  assert.equal(car.editable, true);
  findPress(person, 'earnings-group-indirect')();
  person = await renderScreen();
  const personText = collectText(person).join('\n');
  assert.match(personText, /Feriepenger/);
  assert.match(personText, /Beregnet/);
  assert.match(personText, /104\s?500/);
  const holiday = findProp(person, 'earnings-amount-feriepenger');
  assert.equal(holiday.value, 104500);
  assert.equal(holiday.editable, false);

  const variables = findPress(person, 'earnings-open-variables');
  variables();
  const vars = await renderScreen();
  const varText = collectText(vars).join('\n');
  assert.match(varText, /Grunnbeløp/);
  assert.match(varText, /136\s?549/);
  assert.match(varText, /Gjeldende/);
  assert.equal(findProp(vars, 'earnings-var-grunnbelop'), null);
  assert.equal(findProp(vars, 'earnings-var-normHours'), null);
  assert.equal(findProp(vars, 'earnings-var-defaultBillablePercent'), null);
  const bil = findProp(vars, 'earnings-standard-amount-bil');
  assert.equal(bil.value, 0);
  assert.equal(updates, 0);

  findPress(vars, 'earnings-tab-innleide')();
  const hired = await renderScreen();
  const hiredText = collectText(hired).join('\n');
  assert.match(hiredText, /Per Innleid/);
  assert.doesNotMatch(hiredText, /Kari Nordmann/);
  assert.doesNotMatch(hiredText, /Feriepenger/);
  findPress(hired, 'earnings-open-variables')();
  const hiredVars = await renderScreen();
  const hiredVarText = collectText(hiredVars).join('\n');
  assert.match(hiredVarText, /innkj/i);
  assert.doesNotMatch(hiredVarText, /Grunnbeløp/);
  assert.doesNotMatch(hiredVarText, /Feriepengesats/);

  const ProjectEarningsTab = require(path.join(ROOT, 'components/project/ProjectEarningsTab.jsx')).default;
  const projectTree = callWithHooks(ProjectEarningsTab, {
    project: { id: 'p1', name: 'Bryggen', pricingSettings: { hourlyRate: 1800 } },
    entries: [{ projectId: 'p1', employeeId: 'e1', hours: 8, billableHours: 8, date: '2026-04-01', timeType: 'ordinary' }],
    employees: [employee],
    contracts: [],
    familyId: 'co',
    colors,
    hoursLoading: false,
  });
  const projectText = collectText(projectTree).join('\n');
  assert.match(projectText, /Kari Nordmann/);
  assert.match(projectText, /14\s?400/);
  assert.match(projectText, /Kostnad/);
  assert.doesNotMatch(projectText, /Sett normtimer/);

  console.log('earningsUi.test.cjs: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
