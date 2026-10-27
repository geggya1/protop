/**
 * Arbeidsforhold skal vise alle tidsplaner, ikke bare den siste.
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
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  TextInput: host('TextInput'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

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
    if (id.includes('employees/model')) {
      return {
        newId: (prefix) => `${prefix}_test`,
        personnelKind(employee) {
          const kind = employee?.company?.personnelKind;
          if (kind === 'external' || kind === 'innleid' || kind === 'staff') return kind;
          return 'staff';
        },
        setEmployeePath(employee, key, value) {
          const next = JSON.parse(JSON.stringify(employee));
          const parts = key.split('.');
          let cursor = next;
          for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
          cursor[parts[parts.length - 1]] = value;
          return next;
        },
      };
    }
    if (id.includes('sendPasswordReset')) return { sendPasswordResetV2: async () => {} };
    if (id.startsWith('.')) {
      const resolved = path.resolve(path.dirname(full), id);
      const file = fs.existsSync(resolved) ? resolved : `${resolved}.js`;
      return load(file);
    }
    return orig(id);
  };
  m._compile(out.code, full);
  cache.set(full, m.exports);
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
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

function walk(node, depth, visit) {
  if (depth > 50 || node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, depth, visit));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') return;
  if (!React.isValidElement(node)) return;
  visit(node);
  const next = typeof node.type === 'function'
    ? withHooks(() => node.type(node.props || {}))
    : node.props && node.props.children;
  walk(next, depth + 1, visit);
}

function checkRows(tree) {
  const rows = [];
  walk(tree, 0, (node) => {
    if (node.props?.accessibilityRole !== 'checkbox') return;
    const label = collectText(node.props.children).join(' ').replace(/✓/g, '').replace(/\s+/g, ' ').trim();
    rows.push({
      label,
      disabled: node.props.accessibilityState?.disabled === true,
      checked: node.props.accessibilityState?.checked === true,
      pressable: typeof node.props.onPress === 'function',
    });
  });
  return rows;
}

function collectText(node, depth = 0, out = []) {
  if (depth > 50 || node == null || typeof node === 'boolean') return out;
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

const { default: EmployeeWorkViews } = load(path.join(ROOT, 'screens/employees/EmployeeWorkViews.jsx'));
const { scheduleFromPercent } = load(path.join(ROOT, 'src/arbeid/schedule.js'));

const days = scheduleFromPercent(100, 8);
days.mon = { hours: 8, arrival: '7:00', adjustment: '0:00' };
days.fri = { hours: 0, arrival: '0:00', adjustment: '0:00' };

const employee = {
  id: 'e1',
  person: { email: 'ada@example.com' },
  company: { workPercent: 100, canLogin: true, status: 'active' },
  extras: {
    schedules: [
      { id: 'spring', from: '2026-04-01', days },
      { id: 'autumn', from: '2026-09-01', days: { ...days, fri: { hours: 4, arrival: '8:00', adjustment: '0:00' } } },
    ],
  },
};

const colors = {
  brand: '#6d28d9', ink: '#111', muted: '#667', line: '#ddd', card: '#fff', sunken: '#f4f4f5', placeholder: '#999',
};

const tree = withHooks(() => React.createElement(EmployeeWorkViews, {
  mode: 'settings',
  employee,
  colors,
  canEdit: true,
  sub: 'work',
  onSave() {},
}));
const text = collectText(tree).join('\n');
assert.match(text, /Ny periode/);
assert.match(text, /Gjelder fra/);
assert.match(text, /Gjelder til/);
assert.match(text, /8 timer mandag til fredag/);
assert.match(text, /01\.09\.2026/);
assert.match(text, /nåværende/);
assert.match(text, /01\.04\.2026/);
assert.match(text, /31\.08\.2026/);
assert.match(text, /Går:/);
assert.match(text, /15:00/);
assert.match(text, /Kommer:/);
assert.match(text, /7:00/);
assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'screens/employees/EmployeeWorkViews.jsx'), 'utf8'), /list\[list\.length - 1\]/);

function settingsRows(person) {
  const view = withHooks(() => React.createElement(EmployeeWorkViews, {
    mode: 'settings',
    employee: person,
    colors,
    canEdit: true,
    sub: 'general',
    onSave() {},
  }));
  return checkRows(view);
}

const externalRows = settingsRows({
  id: 'ext',
  person: { email: 'ext@example.com' },
  company: { personnelKind: 'external', status: 'active', canLogin: true },
  extras: { timeSettings: { externalConsultant: false, includeInCapacity: true, mustLockTimesheet: false, requireClockTimes: false } },
});
const externalByLabel = Object.fromEntries(externalRows.map((row) => [row.label, row]));
assert.equal(externalByLabel['Er ekstern konsulent'].checked, true);
assert.equal(externalByLabel['Er ekstern konsulent'].disabled, true);
assert.equal(externalByLabel['Er ekstern konsulent'].pressable, false);
assert.equal(externalByLabel['Inkluder i selskapets kapasitetsoversikt'].checked, false);
assert.equal(externalByLabel['Inkluder i selskapets kapasitetsoversikt'].pressable, false);
assert.equal(externalByLabel['Skal låse timelisten'].pressable, false);
assert.equal(externalByLabel['Skal spesifisere kom- og gå-tid'].pressable, false);
assert.equal(externalByLabel['Kan logge inn'].pressable, true);
assert.equal(externalByLabel['Mertid teller i lønn'].pressable, true);

const staffRows = settingsRows({
  id: 'staff',
  company: { personnelKind: 'staff', status: 'active', canLogin: true },
  extras: { timeSettings: { externalConsultant: true, mustLockTimesheet: false } },
});
const staffByLabel = Object.fromEntries(staffRows.map((row) => [row.label, row]));
assert.equal(staffByLabel['Er ekstern konsulent'].checked, false);
assert.equal(staffByLabel['Er ekstern konsulent'].pressable, false);
assert.equal(staffByLabel['Inkluder i selskapets kapasitetsoversikt'].checked, true);
assert.equal(staffByLabel['Inkluder i selskapets kapasitetsoversikt'].pressable, false);
assert.equal(staffByLabel['Skal låse timelisten'].pressable, true);
assert.equal(staffByLabel['Skal spesifisere kom- og gå-tid'].pressable, true);

const rightsRows = settingsRows({
  id: 'rights',
  company: { personnelKind: 'staff', accessLevel: 'regnskap_ekstern', status: 'active', canLogin: true },
});
const rightsByLabel = Object.fromEntries(rightsRows.map((row) => [row.label, row]));
assert.equal(rightsByLabel['Er ekstern konsulent'].checked, true);
assert.equal(rightsByLabel['Inkluder i selskapets kapasitetsoversikt'].checked, false);
assert.equal(rightsByLabel['Skal låse timelisten'].pressable, false);

const promotedRows = settingsRows({
  id: 'promoted',
  company: { personnelKind: 'external', accessLevel: 'ansatt', status: 'active', canLogin: true },
});
const promotedByLabel = Object.fromEntries(promotedRows.map((row) => [row.label, row]));
assert.equal(promotedByLabel['Er ekstern konsulent'].checked, false);
assert.equal(promotedByLabel['Inkluder i selskapets kapasitetsoversikt'].checked, true);
assert.equal(promotedByLabel['Skal låse timelisten'].pressable, true);

// Menyen for brukerinnstillingene ligger øverst på personen, ikke som egen tittel og faner her.
assert.doesNotMatch(text, /Brukerinnstillinger/);

// Uten rett til å endre: ingen passordlenke, og varslene kan ikke slås av eller på.
function settingsView(sub, canEdit) {
  return withHooks(() => React.createElement(EmployeeWorkViews, {
    mode: 'settings', employee, colors, canEdit, sub, onSave() {},
  }));
}
assert.match(collectText(settingsView('password', true)).join('\n'), /Send passordlenke/);
assert.doesNotMatch(collectText(settingsView('password', false)).join('\n'), /Send passordlenke/);
for (const row of checkRows(settingsView('notify', false))) assert.equal(row.disabled, true, row.label);

console.log('employeeScheduleRender.test.cjs: ok');
