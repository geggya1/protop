/**
 * Innstillinger på personen: menyen til venstre med alle seksjonene, oversikten med kort,
 * mobil med oversikt og vei tilbake, og familiekortet på Gjøremål.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const cache = new Map();
let phone = false;

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  Pressable: host('Pressable'),
  TouchableOpacity: host('TouchableOpacity'),
  TextInput: host('TextInput'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
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
    if (id.endsWith('src/theme')) return { useBreakpoints: () => ({ isPhone: phone, isDesktop: !phone }) };
    if (id.includes('childCareStorage')) return { loadChildCare: async () => ({ kids: [] }) };
    if (id.includes('employees/model')) {
      return {
        newId: (prefix) => `${prefix}_test`,
        displayName: () => 'Ada',
        personnelKind: () => 'staff',
        setEmployeePath(employee, key, value) {
          const next = JSON.parse(JSON.stringify(employee));
          const parts = key.split('.');
          let cursor = next;
          for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]] = cursor[parts[i]] || {};
          cursor[parts[parts.length - 1]] = value;
          return next;
        },
      };
    }
    if (id.includes('sendPasswordReset')) return { sendPasswordResetV2: async () => {} };
    if (id.endsWith('components/DateInput')) return { __esModule: true, default: host('DateInput') };
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

function walk(node, visit, depth = 0) {
  if (depth > 60 || node == null || typeof node === 'boolean') return;
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
  const next = typeof node.type === 'function'
    ? withHooks(() => node.type(node.props || {}))
    : node.props && node.props.children;
  walk(next, visit, depth + 1);
}

function render(element) {
  const texts = [];
  const ids = new Set();
  walk(withHooks(() => element), (node, str) => {
    if (str != null) texts.push(str);
    else if (node.props?.nativeID) ids.add(node.props.nativeID);
  });
  return { text: texts.join('\n'), ids };
}

const colors = {
  brand: '#6d28d9', brandSoft: '#ede9fe', ink: '#111', muted: '#667', line: '#ddd', card: '#fff', sunken: '#f4f4f5',
  bg: '#fafafa', danger: '#dc2626', dangerSoft: '#fee2e2', dangerInk: '#991b1b', placeholder: '#999',
};

const { EMPLOYEE_SUB_TABS } = load(path.join(ROOT, 'src/employees/personTabs.js'));
const { default: Layout } = load(path.join(ROOT, 'components/employees/PersonSettingsLayout.jsx'));
const sections = EMPLOYEE_SUB_TABS.settings;
const summary = {
  settingsProfile: [{ label: 'Stilling', value: 'Prosjektleder', missing: false }],
  settingsWork: [{ label: 'Tidsplan', value: '37,5 t per uke', missing: false }],
};

// PC: meny til venstre med alle seksjonene. Oversikten viser et kort per seksjon med linjene.
let view = render(React.createElement(Layout, { sections, active: 'settingsOverview', colors, summary }));
for (const section of sections) assert.ok(view.ids.has(`employee-settings-nav-${section.id}`), section.id);
for (const section of sections.filter((row) => row.id !== 'settingsOverview')) {
  assert.ok(view.ids.has(`employee-settings-card-${section.id}`), section.id);
}
assert.match(view.text, /Innstillinger/);
assert.match(view.text, /Prosjektleder/);
assert.match(view.text, /37,5 t per uke/);
assert.match(view.text, /Tilgang og rettigheter/);

// En seksjon: overskrift og forklaring, innholdet under, ingen kort-oversikt.
view = render(React.createElement(Layout, { sections, active: 'settingsWork', colors, summary }, React.createElement('Text', null, 'UKEPLAN-INNHOLD')));
assert.match(view.text, /Arbeidstid/);
assert.match(view.text, /Ukeplan og perioder/);
assert.match(view.text, /UKEPLAN-INNHOLD/);
assert.equal(view.ids.has('employee-settings-overview'), false);
assert.ok(view.ids.has('employee-settings-nav'));

// Mobil: oversikten er menyen. En seksjon har «Alle innstillinger» tilbake, ingen meny ved siden av.
phone = true;
view = render(React.createElement(Layout, { sections, active: 'settingsOverview', colors, summary }));
assert.ok(view.ids.has('employee-settings-overview'));
assert.equal(view.ids.has('employee-settings-nav'), false);
view = render(React.createElement(Layout, { sections, active: 'settingsKin', colors, summary }, React.createElement('Text', null, 'BARN')));
assert.ok(view.ids.has('employee-settings-back'));
assert.match(view.text, /Alle innstillinger/);
assert.match(view.text, /Pårørende/);
assert.match(view.text, /BARN/);
phone = false;

// Familiekortet: skjermet for den som ikke har innsyn, navn og telefon for den som har det.
const { default: FamilyCard } = load(path.join(ROOT, 'components/employees/FamilyCard.jsx'));
const person = {
  id: 'e1',
  person: { kinName: 'Kari Nordmann', kinPhone: '900 00 000', kinNote: 'Ektefelle' },
  extras: { childCare: { birthYears: [2016, 2019] } },
};
view = render(React.createElement(FamilyCard, { colors, companyId: 'c1', employee: person, reveal: false, canEdit: false }));
assert.doesNotMatch(view.text, /Kari Nordmann/);
assert.match(view.text, /Registrert \(skjermet\)/);
assert.match(view.text, /Barn \(2\)/);
assert.equal(view.ids.has('employee-family-edit'), false);
view = render(React.createElement(FamilyCard, { colors, companyId: 'c1', employee: person, reveal: true, canEdit: true, onEdit() {} }));
assert.match(view.text, /Kari Nordmann/);
assert.match(view.text, /900 00 000 · Ektefelle/);
assert.ok(view.ids.has('employee-family-edit'));
assert.match(view.text, /Bare du, administrator og HR med tilgang/);

// Timeføring: regler, mål og timepris i samme seksjon. Avslutt kontoen står under Administrasjon.
const { default: WorkViews } = load(path.join(ROOT, 'screens/employees/EmployeeWorkViews.jsx'));
const staff = { id: 's1', person: { email: 'a@b.no' }, company: { status: 'active' }, extras: { timeSettings: { hourlyRate: '1200' } } };
view = render(React.createElement(WorkViews, { mode: 'settings', sub: 'general', employee: staff, colors, canEdit: true, onSave() {} }));
assert.ok(view.ids.has('employee-settings-rate'));
assert.ok(view.ids.has('employee-settings-save'));
assert.match(view.text, /Mål og timepris/);
assert.equal(view.ids.has('employee-settings-close'), false);
view = render(React.createElement(WorkViews, { mode: 'settings', sub: 'close', employee: staff, colors, canEdit: true, onSave() {} }));
assert.ok(view.ids.has('employee-settings-close'));
view = render(React.createElement(WorkViews, { mode: 'settings', sub: 'close', employee: staff, colors, canEdit: false, onSave() {} }));
assert.equal(view.ids.has('employee-settings-close'), false);

console.log('personSettingsRender.test.cjs: ok');
