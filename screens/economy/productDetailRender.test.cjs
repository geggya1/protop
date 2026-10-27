/**
 * Rendrer produktsiden: info, statistikk og knapper for salg, redigering,
 * arkivering og sletting. Brukte produkter kan bare arkiveres.
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
  card: '#fff', bg: '#F4F7FB', danger: '#b42318', placeholder: '#8B95A6', warn: '#d97706', sunken: '#f8fafc',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const cache = new Map();

function loadLocal(full) {
  if (cache.has(full)) return cache.get(full).exports;
  const out = babel.transformSync(fs.readFileSync(full, 'utf8'), {
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
  cache.set(full, m);
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') {
      return {
        View: host('View'),
        Text: host('Text'),
        TextInput: host('TextInput'),
        TouchableOpacity: host('TouchableOpacity'),
        Pressable: host('Pressable'),
        StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
        Platform: { OS: 'web' },
      };
    }
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (id.includes('components/OptionPicker')) return { __esModule: true, default: host('OptionPicker'), CHIP_LIMIT: 4 };
    if (id.includes('components/DateField')) return { __esModule: true, default: host('DateField') };
    if (id.startsWith('.')) {
      const fromDir = path.dirname(full);
      let resolved;
      try {
        resolved = require.resolve(id, { paths: [fromDir] });
      } catch (error) {
        const candidate = path.resolve(fromDir, id);
        const hit = ['.jsx', '.js'].map((ext) => candidate + ext).find((file) => fs.existsSync(file));
        if (!hit) throw error;
        resolved = hit;
      }
      if (resolved.includes(`${path.sep}src${path.sep}`) || resolved.includes(`${path.sep}screens${path.sep}`)) {
        return loadLocal(resolved);
      }
    }
    return m.constructor._load(id, m, false);
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
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = dispatcher;
  try { return fn(); } finally { internals.H = previous; }
}

function walk(node, visit, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return;
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

function flat(children) {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flat).join('');
  return '';
}

function texts(node) {
  const out = [];
  walk(node, (element) => {
    // Host-komponentene rendrer seg selv på nytt. Tell bare selve vertselementet.
    if (typeof element.type !== 'string') return;
    const children = element.props && element.props.children;
    const text = flat(children);
    if (text) out.push(text);
    if (element.props && element.props.nativeID) out.push(`#${element.props.nativeID}`);
    if (element.props && element.props.accessibilityLabel) out.push(`@${element.props.accessibilityLabel}`);
  });
  return out.join('\n');
}

const ProductDetail = loadLocal(path.join(ROOT, 'screens/economy/ProductDetail.jsx')).default;
const { productFromDraft } = loadLocal(path.join(ROOT, 'screens/economy/ProductForms.jsx'));
const { emptyProduct, normalizeSale } = loadLocal(path.join(ROOT, 'src/economy/products.js'));

const product = emptyProduct({
  id: 'p104',
  sku: '104',
  name: 'Fremleie',
  kind: 'service',
  unit: 'mnd',
  priceExVat: 8500,
  costExVat: 6200,
  description: 'Fremleie av kontorplass.',
});
const today = new Date();
const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-02`;
const rows = [
  normalizeSale({ id: 's1', date: thisMonth, productId: 'p104', name: 'Fremleie', quantity: 2, unit: 'mnd', unitPrice: 8500, customerName: 'Frøya Vind AS', projectNumber: '2401', projectName: 'Frøya Vindmøllepark', status: 'draft' }),
  normalizeSale({ id: 's2', date: '2025-01-05', productId: 'p104', name: 'Fremleie', quantity: 1, unit: 'mnd', unitPrice: 8500, customerName: 'Statkraft AS', status: 'invoiced' }),
  normalizeSale({ id: 's3', date: '2025-01-04', productId: 'p104', name: 'Fremleie', quantity: 1, unit: 'mnd', unitPrice: 8500, customerName: 'Statkraft AS', status: 'draft', externalStore: true }),
];

function render(props) {
  return texts(withHooks(() => React.createElement(ProductDetail, {
    product,
    rows,
    colors,
    wide: true,
    narrow: false,
    canEdit: true,
    canAdmin: true,
    salesReady: true,
    salesComplete: true,
    busy: false,
    error: '',
    customers: [],
    projects: [],
    onBack() {},
    onSave() {},
    onSell() {},
    onArchive() {},
    onRestore() {},
    onDelete() {},
    onApproveSale() {},
    onOpenSales() {},
    onOpenBilling() {},
    onClearError() {},
    ...props,
  })));
}

// Brukt produkt: info, statistikk, og «Slett / arkiver» i stedet for vanlig sletting.
const used = render();
assert.match(used, /#produkt-detalj/);
assert.match(used, /104/);
assert.match(used, /Fremleie av kontorplass\./);
assert.match(used, /Brukt i 3 salg/);
assert.match(used, /#produkt-registrer-salg/);
assert.match(used, /#produkt-rediger/);
assert.match(used, /Slett \/ arkiver/);
assert.match(used, /Dekningsbidrag/);
assert.match(used, /2\s300,00\skr \(27,1 %\)/);
assert.match(used, /#produkt-statistikk/);
assert.match(used, /Salg totalt/);
assert.match(used, /#produkt-maaneder/);
assert.match(used, /#produkt-kunder/);
assert.match(used, /Statkraft AS/);
assert.match(used, /#produkt-prosjekter/);
assert.match(used, /2401 · Frøya Vindmøllepark/);
assert.match(used, /#produkt-siste-salg/);
// Bare salg lagret i ProTop kan merkes klare herfra. Importerte salg står som de er.
assert.equal((used.match(/@Merk klar for faktura/g) || []).length, 1);

// Arkivert og brukt: kan hentes tilbake, men ikke slettes.
const archived = render({ product: { ...product, archived: true, archivedAt: '2026-02-01T10:00:00Z' } });
assert.match(archived, /#produkt-hent-tilbake/);
assert.match(archived, /#produkt-arkivert-info/);
assert.equal(archived.includes('#produkt-slett'), false);
assert.equal(archived.includes('#produkt-registrer-salg'), false);

// Ubrukt produkt med Admin og alle salg hentet: vanlig sletting.
const unused = render({ rows: [] });
assert.match(unused, /Ikke brukt i salg/);
assert.match(unused, /#produkt-ingen-salg/);
assert.match(unused, /#produkt-slett/);
assert.equal(unused.includes('Slett / arkiver'), false);

// Uten redigeringsrett: ingen knapper.
const readOnly = render({ canEdit: false, canAdmin: false });
assert.equal(readOnly.includes('#produkt-registrer-salg'), false);
assert.equal(readOnly.includes('#produkt-rediger'), false);
assert.equal(readOnly.includes('#produkt-slett'), false);
assert.equal(readOnly.includes('@Merk klar for faktura'), false);

// Skjemaet leser norske tall og stopper tekst i tallfelt.
const draft = {
  name: 'Befaring', sku: '108', kind: 'service', unit: 'time', price: '1 250,50', cost: '', vatCode: 'HIGH',
  account: '', trackStock: false, stock: '', description: 'Linje 1\nLinje 2', notes: '',
};
const built = productFromDraft(draft, { id: 'p1', archived: false });
assert.equal(built.ok, true);
assert.equal(built.product.priceExVat, 1250.5);
assert.equal(built.product.stock, null);
assert.equal(built.product.id, 'p1');
assert.equal(productFromDraft({ ...draft, price: 'abc' }).ok, false);
assert.equal(productFromDraft({ ...draft, trackStock: true, stock: '12' }).product.stock, 12);

console.log('productDetailRender ok');
