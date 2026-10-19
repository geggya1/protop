/**
 * Kjørebok: knappen åpner en popup, og popupen har samme mål på hvert trinn.
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
  card: '#fff', bg: '#F4F7FB', danger: '#b42318',
};

function host(name) {
  function Host(props) {
    return React.createElement(name, props, props && props.children);
  }
  Host.displayName = name;
  return Host;
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  ActivityIndicator: host('ActivityIndicator'),
  KeyboardAvoidingView: host('KeyboardAvoidingView'),
  Modal(props) {
    if (!props || !props.visible) return null;
    return React.createElement('Modal', props, props.children);
  },
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 2 }),
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
    if (id === '@expo/vector-icons') {
      return { Ionicons: function Ionicons() { return null; } };
    }
    if (id === 'react-native-safe-area-context') {
      return { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) };
    }
    if (id.includes('useCompanyAccess')) {
      return {
        useCompanyAccess: () => ({
          bypass: false,
          previewing: false,
          levelId: 'ansatt',
          employee: null,
          viewingAs: null,
        }),
      };
    }
    if (id.includes('AppContext')) {
      return {
        useApp: () => ({
          familyId: 'F',
          user: { email: 'ada@protop.no', displayName: 'Ada' },
          uid: 'ada',
          activeProfile: { name: 'Ada' },
        }),
      };
    }
    if (id.includes('employees/storage')) return { watchEmployees: () => () => {} };
    if (id.includes('employees/model')) {
      return { displayName: () => 'Ada', ownEmployee: () => ({ id: 'e1' }) };
    }
    if (id.includes('economy/invoices')) return { formatMoney: (n) => `${n} kr` };
    if (id.includes('economy/opsState')) return { recordDutyTrip: () => ({ ok: true, trip: {}, expense: {} }) };
    if (id.includes('equipment/state')) return { upsertPersonalVehicle: () => ({ ok: true }) };
    if (id.includes('equipment/model')) {
      return {
        companyVehicles: () => [{ id: 'pool', plate: 'EL1', nickname: 'Pool' }],
        employeeVehicles: () => [],
        vehicleTitle: (car) => car.nickname || car.plate || 'Bil',
        canAddCompanyVehicle: (levelIds, options = {}) => {
          if (options.bypass) return true;
          const ids = Array.isArray(levelIds) ? levelIds : [levelIds];
          return ids.includes('leder') || ids.includes('administrator');
        },
      };
    }
    if (id.includes('mileage/drivingRoute')) return { planDrivingRoute: async () => null };
    if (id.includes('mileage/suggestRoute')) return { suggestDriving: async () => null };
    if (id.includes('mileage/routePlan')) return { chargesForRoute: () => [] };
    if (id.endsWith('/firebase') || id.endsWith('/firebase.js') || id === '../../firebase') {
      return { firebaseConfig: { apiKey: '' } };
    }
    if (id.includes('utils/location')) {
      return {
        searchPlaces: async () => [],
        getDeviceLocation: async () => ({ lat: 0, lng: 0 }),
        reverseGeocode: async () => ({ label: '', lat: 0, lng: 0 }),
      };
    }
    if (id.includes('project/engine')) return { updateProject: (state) => ({ ok: true, state }) };
    if (id.includes('vegvesenLookupClient')) return { lookupVehicleByReg: async () => ({}) };
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const { default: MileageWizard } = loadJsx('screens/economy/MileageWizard.jsx');
const { mileageModalFrame } = require('../../src/mileage/modalFrame.js');

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
assert.ok(internals, 'React 19 client internals missing');

function mount(Component, props) {
  const states = [];
  const refs = [];
  let tree = null;
  function render() {
    let cursor = 0;
    let refCursor = 0;
    const dispatcher = {
      useState(initial) {
        const i = cursor;
        cursor += 1;
        if (states.length <= i) states[i] = typeof initial === 'function' ? initial() : initial;
        return [states[i], (next) => {
          states[i] = typeof next === 'function' ? next(states[i]) : next;
          render();
        }];
      },
      useEffect() {},
      useLayoutEffect() {},
      useMemo(fn) { return fn(); },
      useCallback(fn) { return fn; },
      useRef(value) {
        const i = refCursor;
        refCursor += 1;
        if (refs.length <= i) refs[i] = { current: value };
        return refs[i];
      },
      useContext() { return undefined; },
    };
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      tree = Component(props);
    } finally {
      internals.H = previous;
    }
    return tree;
  }
  render();
  return () => tree;
}

const stub = {
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value, () => {}];
  },
  useEffect() {},
  useLayoutEffect() {},
  useMemo(fn) { return fn(); },
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useContext() { return undefined; },
};

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
    const previous = internals.H;
    internals.H = stub;
    let child;
    try {
      child = node.type(node.props || {});
    } finally {
      internals.H = previous;
    }
    walk(child, visit, depth + 1);
    return;
  }
  walk(node.props && node.props.children, visit, depth + 1);
}

function press(node, nativeID) {
  let handler = null;
  walk(node, (element) => {
    if (element.props && element.props.nativeID === nativeID) handler = element.props.onPress;
  });
  assert.equal(typeof handler, 'function', nativeID);
  handler();
}

function pressLabel(node, label) {
  let handler = null;
  walk(node, (element) => {
    if (element.props && element.props.accessibilityLabel === label && element.props.onPress) {
      handler = element.props.onPress;
    }
  });
  assert.equal(typeof handler, 'function', label);
  handler();
}

function sheetStyle(node) {
  let style = null;
  walk(node, (element) => {
    if (element.props && element.props.nativeID === 'mileage-wizard-modal') style = element.props.style;
  });
  assert.ok(style, 'popupen er åpen');
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
  return { width: flat.width, maxHeight: flat.maxHeight };
}

function texts(node) {
  const out = [];
  walk(node, (element) => {
    const kids = element.props && element.props.children;
    if (typeof kids === 'string' || typeof kids === 'number') out.push(String(kids));
  });
  return out;
}

const today = new Date();
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const state = {
  projects: [
    { id: 'p1', number: '10563', name: 'Kvitsøy skole', client: 'Kvitsøy Kommune', status: 'aktiv' },
    { id: 'p2', number: '10001', name: 'Myklebust', client: 'Sola Kommune', status: 'aktiv' },
  ],
  timeEntries: [{ employeeId: 'e1', hours: 2, date, projectId: 'p1' }],
  members: [],
  equipment: [],
  personalVehicles: [],
  mileagePolicies: [],
};
const getTree = mount(MileageWizard, {
  colors,
  state,
  company: { adresse: 'Storgata 1', postnummer: '4000', poststed: 'Stavanger' },
  onApply: (result) => result,
  onOpenBilling() {},
});

assert.ok(texts(getTree()).includes('Registrer kjøretur'));
let opened = false;
walk(getTree(), (element) => {
  if (element.props && element.props.nativeID === 'mileage-wizard-modal') opened = true;
});
assert.equal(opened, false);

press(getTree(), 'mileage-register');
const expected = mileageModalFrame(390, 844, { top: 47, bottom: 34 });
assert.deepEqual(sheetStyle(getTree()), expected);
assert.ok(texts(getTree()).includes('Neste'));
assert.ok(texts(getTree()).includes('Prosjekt'));
assert.ok(texts(getTree()).includes('#10563 Kvitsøy skole'), 'prosjektlisten er åpen med en gang');
assert.equal(texts(getTree()).includes('Myklebust'), false, 'prosjekt uten timer siste to måneder vises ikke');

press(getTree(), 'mileage-wizard-next');
assert.ok(texts(getTree()).includes('Velg prosjekt før du går videre.'));
assert.deepEqual(sheetStyle(getTree()), expected);

pressLabel(getTree(), '#10563 Kvitsøy skole');
assert.ok(texts(getTree()).includes('Valgt prosjekt'));
assert.ok(texts(getTree()).includes('#10563 Kvitsøy skole'));
assert.equal(texts(getTree()).includes('Myklebust'), false, 'andre prosjekt skjules når ett er valgt');
let search = null;
walk(getTree(), (element) => {
  if (element.props && element.props.placeholder === 'Nummer, navn eller kunde') search = element.props.onChangeText;
});
assert.equal(typeof search, 'function', 'søkefeltet blir stående');
search('Mykle');
assert.ok(texts(getTree()).some((row) => row.includes('Myklebust')), 'søk finner andre prosjekt');
search('');
press(getTree(), 'mileage-wizard-next');
assert.equal(texts(getTree()).includes('Hent fra Vegvesenet'), false);
assert.equal(texts(getTree()).includes('Legg til ny'), false);
assert.deepEqual(sheetStyle(getTree()), expected, 'kjøretøy-trinnet har samme popup');

pressLabel(getTree(), 'Velg kjøretøy');
assert.ok(texts(getTree()).includes('Legg til ny'));
assert.ok(texts(getTree()).includes('Pool'));
assert.deepEqual(sheetStyle(getTree()), expected, 'kjøretøylisten endrer ikke popupen');

pressLabel(getTree(), 'Pool');
press(getTree(), 'mileage-wizard-next');
assert.ok(texts(getTree()).includes('Én vei, km'));
assert.deepEqual(sheetStyle(getTree()), expected, 'rute-trinnet har samme popup');

const fieldValues = [];
walk(getTree(), (element) => {
  const placeholder = element.props && element.props.placeholder;
  if (placeholder === 'Søk adresse') fieldValues.push(element.props.value);
});
assert.ok(fieldValues.includes('Storgata 1, 4000 Stavanger'), 'fra er selskapets adresse');
assert.ok(fieldValues.includes('Kvitsøy skole'), 'til foreslår prosjektet når gateadresse mangler');
assert.ok(texts(getTree()).includes('Til er foreslått fra prosjektnavnet. Rett adressen om stedet er et annet.'));

let focused = 0;
walk(getTree(), (element) => {
  if (element.props && element.props.placeholder === 'Søk adresse' && element.props.onFocus && focused === 0) {
    focused += 1;
    element.props.onFocus();
  }
});
assert.ok(texts(getTree()).includes('Bruk firmaadressen'));
assert.ok(texts(getTree()).includes('Bruk hvor jeg er nå'));

const kmInputs = [];
walk(getTree(), (element) => {
  if (element.props && element.props.keyboardType === 'decimal-pad' && element.props.onChangeText) {
    kmInputs.push(element.props.onChangeText);
  }
});
assert.ok(kmInputs.length >= 2, 'kilometerfelt');
kmInputs[1]('10');
press(getTree(), 'mileage-wizard-next');
setImmediate(() => {
  try {
    assert.ok(texts(getTree()).includes('Storgata 1, 4000 Stavanger'));
    assert.ok(texts(getTree()).includes('Kvitsøy skole'));
    assert.ok(texts(getTree()).includes('Tur/retur'));
    assert.ok(texts(getTree()).includes('10 km'));
    assert.ok(texts(getTree()).includes('Til sammen'));
    assert.ok(texts(getTree()).includes('Vil du registrere dette som fast prosjektadresse på prosjektet?'));
    assert.equal(texts(getTree()).includes('Lagret i kjøreboken'), false);
    pressLabel(getTree(), 'Nei, ikke lagre prosjektadresse');
    assert.equal(texts(getTree()).includes('Vil du registrere dette som fast prosjektadresse på prosjektet?'), false);
    press(getTree(), 'mileage-wizard-next');
    let stillOpen = false;
    walk(getTree(), (element) => {
      if (element.props && element.props.nativeID === 'mileage-wizard-modal') stillOpen = true;
    });
    assert.equal(stillOpen, false, 'Lagre lukker registreringen');
    console.log('mileageWizardModal.test.cjs: ok');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});
