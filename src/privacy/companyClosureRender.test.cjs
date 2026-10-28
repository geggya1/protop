/**
 * Kjører CompanyClosure (Selskapsinnstillinger → Avslutt bedriften, GRUNN-03) med RN-verter og
 * src/ui som enkle elementer, så manglende symboler og feil i JSX slår ut her.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', danger: '#b42318', dangerInk: '#b42318',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

const uiMock = {
  Banner: (props) => React.createElement('Banner', props, props.text),
  Button: (props) => React.createElement('Button', props, props.label),
  Check: (props) => React.createElement('Check', props, props.label),
  Field: (props) => React.createElement('Field', props, props.label, props.children),
  Row: host('Row'),
  Sheet: (props) => (props.visible ? React.createElement('Sheet', props, props.children, props.footer) : null),
  TextIn: host('TextIn'),
  space: { xs: 8 },
  type: { body: {}, bodyStrong: {} },
};

const cache = new Map();
function load(full) {
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
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id.endsWith('/src/ui')) return uiMock;
    if (id.includes('companyExportClient')) {
      return {
        COMPANY_EXPORT_WEB_ONLY: 'web',
        closeCompanyAccount: async () => ({}),
        downloadCompanyExport: async () => ({}),
        reopenCompanyAccount: async () => ({}),
      };
    }
    if (id.startsWith('.')) {
      const base = path.resolve(path.dirname(full), id);
      const file = [base, `${base}.js`, `${base}.jsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (file) return load(file);
    }
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const dispatcher = {
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useMemo(fn) { return fn(); },
  useEffect() {},
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useContext() { return undefined; },
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'React 19 client internals missing');
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

/** Alle elementer og all tekst i treet, med funksjonskomponentene kjørt. */
function flatten(node, out = { ids: [], text: [] }, depth = 0) {
  if (depth > 40 || node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => flatten(child, out, depth));
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.text.push(String(node));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  if (node.props?.nativeID) out.ids.push(node.props.nativeID);
  if (typeof node.type === 'function') {
    return flatten(withHooks(() => node.type(node.props || {})), out, depth + 1);
  }
  return flatten(node.props?.children, out, depth + 1);
}

const { default: CompanyClosure } = load(path.join(ROOT, 'components/company/CompanyClosure.jsx'));
const company = {
  type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], company: { navn: 'Bygg AS' },
};

function render(family, uid) {
  return flatten(React.createElement(CompanyClosure, {
    family, familyId: 'A', uid, colors,
  }));
}

// Eier: eksport og avslutning.
{
  const { ids, text } = render(company, 'own');
  assert.ok(ids.includes('company-closure'));
  assert.ok(ids.includes('company-export'));
  assert.ok(ids.includes('company-close'));
  assert.match(text.join(' '), /slettes etter 90 dager/);
  assert.match(text.join(' '), /Avslutt bedriftens abonnement og slett data/);
}

// Vanlig medlem: ingen knapper.
{
  const { ids, text } = render(company, 'bob');
  assert.equal(ids.includes('company-close'), false);
  assert.equal(ids.includes('company-export'), false);
  assert.match(text.join(' '), /Bare eier eller administrator kan avslutte bedriften/);
}

// Avsluttet: fristen vises for alle, og eier kan angre.
{
  const closed = {
    ...company,
    closure: {
      status: 'closed', closedAt: '2026-10-28T10:00:00.000Z', deleteAfter: '2027-01-26T10:00:00.000Z', closedByName: 'Ola Eier',
    },
  };
  const owner = render(closed, 'own').text.join(' ');
  assert.match(owner, /slettes etter 26\. januar 2027/);
  assert.match(owner, /Angre avslutningen/);
  const member = render(closed, 'bob').text.join(' ');
  assert.match(member, /slettes etter 26\. januar 2027/);
  assert.doesNotMatch(member, /Angre avslutningen/);
}

console.log('companyClosureRender.test.cjs: ok');
