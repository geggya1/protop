/**
 * Rendrer rapporttabellen som faktura- og kundelisten bruker: overskrift med
 * sortering og filter, rader, sumlinje, «Vis flere», slett-kolonne og mobilkort.
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


const ReportTable = loadLocal(path.join(ROOT, 'components/table/ReportTable.jsx')).default;
const { INVOICE_REPORT_COLUMNS } = loadLocal(path.join(ROOT, 'src/economy/invoiceReport.js'));
const { visibleColumns } = loadLocal(path.join(ROOT, 'src/ui/reportTable.js'));

const columns = visibleColumns(INVOICE_REPORT_COLUMNS, ['invoiceNumber', 'invoiceDate', 'customerName', 'amountInclVat', 'outstanding']);
const rows = [
  { id: 'i1', invoiceNumber: '10001', invoiceDate: '2026-10-06', customerName: 'Ryfylke Eiendom AS', amountInclVat: 1250, outstandingAmount: 1250 },
  { id: 'i2', invoiceNumber: '10002', invoiceDate: '2026-09-01', customerName: 'Sandnes Kommune', amountInclVat: 5000 },
  { id: 'i3', invoiceNumber: '10003', invoiceDate: '', customerName: '', amountInclVat: 100 },
];

function render(props) {
  return texts(withHooks(() => React.createElement(ReportTable, {
    nativeID: 'invoice-table',
    colors,
    columns,
    rows,
    sort: { key: 'invoiceDate', dir: 'desc' },
    onSort() {},
    filters: { customerName: 'sand' },
    onFilter() {},
    onOpen() {},
    rowNativeID: (row) => `invoice-row-${row.id}`,
    rowLabel: (row) => `Faktura ${row.invoiceNumber}`,
    totals: { amountInclVat: 'kr 6 350,00', outstanding: 'kr 1 250,00' },
    ...props,
  })));
}

// Bred skjerm: én scroller, overskrift med sortering og «Filtrer» per kolonne, rader og sumlinje.
const view = render();
assert.match(view, /#invoice-table-viewport/);
assert.match(view, /#invoice-table-head/);
for (const col of columns) {
  assert.match(view, new RegExp(`#invoice-table-sort-${col.key}`));
  assert.match(view, new RegExp(`#invoice-table-filter-${col.key}`));
  assert.match(view, new RegExp(`@Filtrer ${col.label}`));
}
assert.match(view, /@Sorter på Fakturadato/);
assert.match(view, /#invoice-row-i1/);
assert.match(view, /@Faktura 10001/);
assert.match(view, /06\.10\.2026/);
assert.match(view, /Ryfylke Eiendom AS/);
assert.match(view, /#invoice-table-sum/);
assert.match(view, /Sum \(3\)/);
assert.match(view, /kr 6 350,00/);
assert.doesNotMatch(view, /#invoice-table-mer/, 'alle radene vises');
assert.match(view, /—/, 'tomme celler får strek');

// Mange rader: viser en side og «Vis flere».
const paged = render({ limit: 2, onMore() {}, onShowAll() {} });
assert.match(paged, /#invoice-table-mer/);
assert.match(paged, /Viser 2 av 3/);
assert.match(paged, /Vis flere/);
assert.match(paged, /Vis alle/);
assert.doesNotMatch(paged, /#invoice-row-i3/);

// Slett-kolonne ved siden av raden, ikke inni den.
const withAction = render({ actionWidth: 44, renderAction: (row) => React.createElement('Delete', { accessibilityLabel: `Slett ${row.id}` }) });
assert.match(withAction, /@Slett i1/);

// Ingen treff: overskriften med filtrene står, så filteret kan tømmes.
const none = render({ rows: [], empty: 'Ingen fakturaer treffer søket eller filteret.' });
assert.match(none, /#invoice-table-filter-customerName/);
assert.match(none, /#invoice-table-no-hits/);
assert.doesNotMatch(none, /#invoice-table-sum/);

// Egen celle: merke eller lenke i stedet for tekst.
const custom = render({ renderCell: (row, col) => (col.key === 'customerName' ? React.createElement('Link', { accessibilityLabel: `Kunde ${row.id}` }) : undefined) });
assert.match(custom, /@Kunde i2/);

// Mobil: kort i stedet for tabell.
const phone = render({ phone: true, renderCard: (row) => React.createElement('Card', { nativeID: `card-${row.id}` }) });
assert.match(phone, /#card-i1/);
assert.doesNotMatch(phone, /#invoice-table-head/);

console.log('reportTableRender ok');
