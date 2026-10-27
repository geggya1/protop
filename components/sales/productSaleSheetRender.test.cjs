/**
 * Rendrer panelet for ett produktsalg: all info, prosjektlenke, lås på
 * fakturert salg, og skjemaet for et nytt salg.
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
        ScrollView: host('ScrollView'),
        Modal: host('Modal'),
        StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
        Platform: { OS: 'web' },
        useWindowDimensions: () => ({ width: 1280, height: 800 }),
      };
    }
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (/(^|\/)OptionPicker$/.test(id)) return { __esModule: true, default: host('OptionPicker'), CHIP_LIMIT: 4 };
    if (/(^|\/)DateField$/.test(id)) return { __esModule: true, default: host('DateField') };
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
      if (['src', 'screens', 'components'].some((dir) => resolved.includes(`${path.sep}${dir}${path.sep}`))) {
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

const ProductSaleSheet = loadLocal(path.join(ROOT, 'components/sales/ProductSaleSheet.jsx')).default;
const { emptySale, normalizeSale } = loadLocal(path.join(ROOT, 'src/economy/products.js'));

const open = normalizeSale({
  id: 'sal-1',
  date: '2026-08-31',
  sku: '103',
  name: 'Dronefotografering',
  title: 'Dronetjenester iht. avtale august 2026',
  quantity: 1,
  unitPrice: 2000,
  customerName: 'Sandnes Kommune',
  projectId: 'prj-10427',
  projectNumber: '10427',
  projectName: 'SHA-koordinator',
  status: 'approved',
  externalStore: true,
  comment: 'Avtalt med prosjektleder',
  source: { filename: 'moment.xlsx', importedAt: '2026-09-01T08:00:00.000Z', values: { Prosjekt: '10427', Beløp: '2 500,00' } },
});
const invoiced = normalizeSale({ ...open, id: 'sal-2', status: 'invoiced', invoiceId: 'inv-9' });

function render(props) {
  return texts(withHooks(() => React.createElement(ProductSaleSheet, {
    sale: open,
    colors,
    projects: [{ id: 'prj-10427', number: '10427', name: 'SHA-koordinator' }],
    customers: [],
    employees: [],
    canEdit: true,
    canDelete: true,
    onSave() {},
    onDelete() {},
    onOpenProject() {},
    onOpenInvoice() {},
    onClose() {},
    ...props,
  })));
}

// Åpent salg: all info, prosjektlenke, kilde og knapper for redigering og sletting.
const view = render();
assert.match(view, /#produktsalg-detalj/);
assert.match(view, /Dronefotografering/);
assert.match(view, /Varenr 103/);
assert.match(view, /Dronetjenester iht\. avtale august 2026/);
assert.match(view, /Sandnes Kommune/);
assert.match(view, /#produktsalg-detalj-prosjekt/);
assert.match(view, /#10427 SHA-koordinator/);
assert.match(view, /Avtalt med prosjektleder/);
assert.match(view, /Import fra moment\.xlsx/);
assert.match(view, /Vis verdiene fra filen \(2\)/);
assert.match(view, /#produktsalg-detalj-rediger/);
assert.match(view, /#produktsalg-detalj-slett/);
assert.doesNotMatch(view, /#produktsalg-detalj-laast/);
assert.doesNotMatch(view, /#produktsalg-rediger-lagre/, 'skjemaet åpnes først ved Rediger');

// Uten rettigheter: bare visning.
const readOnly = render({ canEdit: false, canDelete: false });
assert.doesNotMatch(readOnly, /#produktsalg-detalj-rediger/);
assert.doesNotMatch(readOnly, /#produktsalg-detalj-slett/);

// Fakturert: låst, ingen redigering eller sletting, lenke til fakturaen.
const locked = render({ sale: invoiced });
assert.match(locked, /#produktsalg-detalj-laast/);
assert.match(locked, /fakturert og låst/);
assert.match(locked, /Fakturert/);
assert.doesNotMatch(locked, /#produktsalg-detalj-rediger/);
assert.doesNotMatch(locked, /#produktsalg-detalj-slett/);
assert.match(locked, /#produktsalg-detalj-faktura/);

// Nytt salg: skjemaet med en gang.
const fresh = render({ sale: emptySale({ projectId: 'prj-10427', status: 'approved' }), isNew: true });
assert.match(fresh, /Nytt produktsalg/);
assert.match(fresh, /#produktsalg-rediger/);
assert.match(fresh, /Registrer salg/);
assert.doesNotMatch(fresh, /#produktsalg-detalj-rediger/);

// Uten salg: ingenting.
assert.equal(render({ sale: null }), '');

console.log('productSaleSheetRender ok');
