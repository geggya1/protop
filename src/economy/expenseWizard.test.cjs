/**
 * Nytt utlegg (ExpenseWizard): fire trinn som kjøreturen, med fakturering Ja / Usikker / Nei,
 * prosjekt, kvittering (kamera, bilder, fil) og felt som tolkes fra kvitteringen.
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
  Image: host('Image'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  Modal: host('Modal'),
  KeyboardAvoidingView: host('KeyboardAvoidingView'),
  ActivityIndicator: host('ActivityIndicator'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {} },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
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
    if (id.endsWith('/DateInput')) return { __esModule: true, default: host('DateInput') };
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (id.endsWith('/OptionPicker')) return { __esModule: true, default: host('OptionPicker') };
    if (id.includes('utils/media')) return { pickDocument: async () => null, pickImage: async () => null, pickImages: async () => [], uploadFile: async () => '' };
    if (id.includes('utils/receiptPrepare')) return { prepareReceipt: async () => ({}), RECEIPT_ACCEPT: 'image/*', receiptStoragePath: () => '' };
    if (id.includes('utils/receiptOcr')) return { ocrExpenseReceipt: async () => ({}) };
    if (id.includes('mileage/modalFrame')) return { mileageModalFrame: () => ({ width: 370, maxHeight: 800 }) };
    if (/src\/economy\/(expenses|expenseReceipt|invoices|hoursList|vatTreatment)\.js$/.test(id)) {
      return require(path.join(path.dirname(full), id));
    }
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


async function main() {
  // ESM-modulene (src/economy) lastes med import() og legges i require-cachen for wizarden.
  const load = async (rel) => {
    const full = path.join(ROOT, rel);
    require.cache[full] = { id: full, filename: full, loaded: true, exports: await import(full) };
  };
  for (const rel of ['src/economy/expenses.js', 'src/economy/expenseReceipt.js', 'src/economy/invoices.js', 'src/economy/hoursList.js', 'src/economy/vatTreatment.js']) {
    await load(rel);
  }
  const Wizard = loadJsx('components/economy/ExpenseWizard.jsx').default;
  const render = (props) => {
    const tree = withHooks(() => React.createElement(Wizard, {
      colors,
      companyId: 'co',
      onSave: async () => ({ ok: true }),
      onClose: () => {},
      projectOptions: [{ id: 'p1', label: '#12 Hillevågsveien 59' }],
      people: [{ id: 'a', label: 'Aina' }],
      existing: [{ employeeId: 'a', category: 'parking', date: '2026-10-01' }],
      myEmployeeId: 'a',
      canInternal: true,
      ...props,
    }));
    return texts(tree);
  };

  const type = render({ initialStep: 'type' });
  assert.match(type, /Nytt utlegg/);
  assert.match(type, /Skal utlegget faktureres videre til kunde\?/);
  for (const label of ['Ja', 'Usikker', 'Nei', 'Betalt privat', 'Firmakort', 'Type', 'Prosjekt', 'Kvittering', 'Se over', 'Avbryt', 'Neste']) {
    assert.match(type, new RegExp(`^${label}$`, 'm'), label);
  }

  const project = render({ initialStep: 'prosjekt' });
  assert.match(project, /Søk prosjekt, nummer eller kunde/);
  assert.match(project, /Uten prosjekt \(internt\)/);
  assert.match(project, /#12 Hillevågsveien 59/);
  assert.match(project, /^Tilbake$/m);

  const receipt = render({ initialStep: 'kvittering' });
  for (const label of ['Ta bilde', 'Legg til fra bildene', 'Legg til fil', 'Fortsett uten']) {
    assert.match(receipt, new RegExp(`^${label}$`, 'm'), label);
  }

  const review = render({ initialStep: 'seover' });
  for (const label of ['Dato \\*', 'Valuta', 'Utgiftstype \\*', 'Beløp inkl\\. mva \\*', 'Butikk / leverandør', 'Betalt med', 'Kort', 'Vipps', 'Beskrivelse \\*', '^Lagre$']) {
    assert.match(review, new RegExp(label, 'm'), label);
  }
  // Tolkes og lagres, men vises ikke: mva-sats, avgiftskode, org.nr., kvitteringsnr. og formål.
  for (const label of ['Mva-sats', 'Avgiftskode', 'Org\\.nr\\.', 'Kvitteringsnr\\.', '^Formål$']) {
    assert.doesNotMatch(review, new RegExp(label, 'm'), label);
  }
  assert.match(review, /Ingenting lagres før du trykker Lagre/);
  console.log('expenseWizard ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
