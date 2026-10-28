/**
 * Avvik og forbedring: listen med nøkkeltall, grafer og faner, «Meld avvik» med typekort og vedlegg,
 * og saksvisningen med neste steg øverst, «Behandling» og dialogene for hvert steg.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', brandSoft: '#e6f3fe', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', bg: '#F4F7FB',
  sunken: '#f8fafc', danger: '#dc2626', warn: '#d97706', success: '#16a34a', successSoft: '#e4f5ea', placeholder: '#94a3b8',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  TextInput: host('TextInput'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  ScrollView: host('ScrollView'),
  // Modal rendrer innholdet uansett, så dialogene blir også sjekket.
  Modal: host('Modal'),
  Image: host('Image'),
  ActivityIndicator: host('ActivityIndicator'),
  Linking: { openURL: async () => {} },
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1, absoluteFill: {}, flatten: (s) => s },
  Platform: { OS: 'web' },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
};

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
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (id === 'react-native-svg') return { __esModule: true, default: host('Svg'), Circle: host('Circle'), G: host('G') };
    if (id.includes('components/OptionPicker')) return { __esModule: true, default: host('OptionPicker') };
    if (id.includes('components/DateField')) return { __esModule: true, default: host('DateField') };
    if (id.includes('components/TimeField')) return { __esModule: true, default: host('TimeField') };
    if (id.includes('context/ThemeContext')) return { useColors: () => colors };
    if (id.includes('utils/media')) return { pickDocument: async () => [], pickImage: async () => null, uploadFile: async () => 'https://x/fil' };
    if (id.includes('iso/storage')) return { loadAuditFor: async () => [] };
    if (id === './IsoDiagram') return { __esModule: true, default: host('IsoDiagram'), fitView: () => ({ scale: 1, offset: { x: 0, y: 0 } }) };
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

// Bredden på listen måles med onLayout. Testen kan late som den er målt, så tabellen vises.
let measuredWidth = 0;

const dispatcher = {
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value === 0 && measuredWidth ? measuredWidth : value, () => {}];
  },
  useMemo(fn) { return fn(); },
  useEffect() {},
  useLayoutEffect() {},
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useContext(context) { return context ? context._currentValue : undefined; },
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internals.H;
  internals.H = dispatcher;
  try { return fn(); } finally { internals.H = previous; }
}

// Lukkede dialoger (Modal med visible=false) tas bare med når testen ber om det.
let showHidden = false;

function walk(node, visit, depth = 0) {
  if (depth > 60 || node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit, depth));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') return;
  if (!React.isValidElement(node)) return;
  if (node.type === 'Modal' && !node.props.visible && !showHidden) return;
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
    if (typeof element.type !== 'string') return;
    const props = element.props || {};
    const text = flat(props.children);
    if (text) out.push(text);
    if (props.testID) out.push(`#${props.testID}`);
    if (props.accessibilityLabel) out.push(`@${props.accessibilityLabel}`);
    if (props.placeholder) out.push(`(${props.placeholder})`);
  });
  return out.join('\n');
}

const IsoFindings = loadLocal(path.join(ROOT, 'screens/iso/IsoFindings.jsx')).default;
const F = loadLocal(path.join(ROOT, 'src/iso/findings.js'));
const { emptyIsoState } = loadLocal(path.join(ROOT, 'src/iso/state.js'));
const { isoCapabilities } = loadLocal(path.join(ROOT, 'src/iso/access.js'));

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const PER = { uid: 'u2', name: 'Per Tiltak' };
const BOSS = { uid: 'u3', name: 'Siri Leder' };
const ADMIN = isoCapabilities({ bypass: true, uid: 'u3', restricted: { uids: ['u3'] } });
const READER = isoCapabilities({ grants: { iso: 'see' }, uid: 'u1' });
const now = new Date();
const day = (offset) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);

const photo = { label: 'stillas.jpg', url: 'https://x/stillas.jpg', path: 'families/c1/iso/findings/k/1-stillas.jpg', contentType: 'image/jpeg', size: 4096, kind: 'fil' };
const fresh = F.createFinding({ type: 'nestenulykke', title: 'Løs planke i stillas', description: 'Planke lå løst på plan 3.', occurredTime: '07:40', location: 'Plan 3, stillas nord', attachments: [photo] }, { actor: ANNE, now }).finding;
let handled = F.createFinding({ type: 'prosess', title: 'Feil revisjon sendt kunde', description: 'Tegning rev B sendt i stedet for C.' }, { actor: ANNE, now, existing: [fresh] }).finding;
handled = F.triageFinding(handled, { severity: 'middels', assigneeName: PER.name, assigneeUid: PER.uid, dueAt: day(-2) }, { actor: BOSS, now }).finding;
let ready = F.createFinding({ type: 'forbedring', title: 'Felles mal for SJA', description: 'Bruk samme mal på alle prosjekter.' }, { actor: ANNE, now, existing: [fresh, handled] }).finding;
ready = F.triageFinding(ready, { severity: 'lav', assigneeName: BOSS.name, assigneeUid: BOSS.uid }, { actor: BOSS, now }).finding;
ready = F.assessFinding(ready, { correctiveRequired: false, rationale: 'Forslaget tas inn i neste revisjon av rutinen.' }, { actor: BOSS, now }).finding;

const state = { ...emptyIsoState(), findings: [fresh, handled, ready] };
state.system = { ...state.system, setupAt: '2026-01-01', roleMap: { quality_manager: { uid: 'u3', name: BOSS.name } } };

function render({ caps = ADMIN, params = {}, width = 0, hidden = false } = {}) {
  measuredWidth = width;
  showHidden = hidden;
  const ctx = {
    state,
    caps,
    params,
    go() {},
    wide: true,
    store: { current: () => state, commit: async () => ({ ok: true }), commitLists: async () => ({ ok: true }), tasks: {} },
    actor: caps === ADMIN ? BOSS : ANNE,
    people: [ANNE, PER, BOSS].map((p) => ({ ...p, id: p.uid })),
    projects: [],
    sources: {},
    companyId: 'c1',
    prefill: null,
  };
  try {
    return texts(withHooks(() => React.createElement(IsoFindings, { ctx })));
  } finally {
    measuredWidth = 0;
    showHidden = false;
  }
}

// Listen: nøkkeltall, grafer, faner med antall og rader.
const list = render();
for (const label of ['Nye', 'Under behandling', 'Lukket siste 12 mnd', 'Åpne tiltak', 'Saker per måned', 'Etter type', 'Avsluttet']) {
  assert.ok(list.includes(label), `mangler ${label}`);
}
assert.match(list, /1 med passert frist/, 'saken med passert frist telles');
assert.match(list, /#iso-row/, 'hjelperundturen finner første rad');
assert.match(list, /Løs planke i stillas/);
assert.match(list, /\(Alle saksbehandlere\)/);

// Bred nok liste: tabell med kolonner som i eksempelet.
const table = render({ width: 1100 });
for (const head of ['NR', 'TITTEL', 'TYPE', 'SKJEDDE', 'SAKSBEHANDLER', 'FRIST', 'TILTAK', 'STATUS']) {
  assert.ok(table.split('\n').includes(head), `mangler kolonnen ${head}`);
}
assert.match(table, /Per Tiltak/);

// «Meld avvik»: typekort med forklaring, når/hvor, vedlegg og dra-og-slipp. Uten type er «Send inn» av.
assert.equal(list.includes('Hva slags sak'), false, 'dialogen er lukket');
const report = render({ params: { create: true } });
assert.match(report, /Hva slags sak/);
assert.match(report, /Kunne ført til skade, men gjorde det ikke/);
assert.match(report, /\(Andre typer …\)/);
assert.match(report, /Når skjedde det/);
assert.match(report, /\(Klokkeslett\)|TimeField/);
assert.match(report, /\(F\.eks\. plan 2, trappeløp B\)/);
assert.match(report, /Bilder og vedlegg/);
assert.match(report, /Dra og slipp filer her/);
assert.match(report, /@Last opp/);
assert.match(report, /Flere detaljer \(konsekvens\)/);
assert.match(report, /@Send inn/);

// Ny sak: «Start behandling» er neste steg, bildet vises, og «Behandling» viser frist for vurdering.
const newCase = render({ params: { open: fresh.id } });
assert.match(newCase, /@Start behandling/);
assert.match(newCase, /@Åpne bildet stillas\.jpg/);
assert.match(newCase, /Frist for vurdering/);
assert.match(newCase, /Skjedde/);
assert.match(newCase, /kl\. 07:40/);
assert.match(newCase, /Ikke vurdert ennå/);
assert.match(newCase, /Kvalitetsleder: Siri Leder/, 'hvem som kan lukke');
assert.equal(newCase.includes('Bakenforliggende årsaker'), false, 'dialogene er lukket');
const dialogs = render({ params: { open: fresh.id }, hidden: true });
for (const label of ['Bakenforliggende årsaker', 'Hvorfor skjedde det', 'Alvorlighet', 'Saksbehandler', '@Legg til og lag oppgave', '@Godkjenn lukking', '@Kanseller saken', 'Effektkontroll']) {
  assert.ok(dialogs.includes(label), `dialog mangler ${label}`);
}

// Under behandling: «Vurder» er neste steg, og passert frist vises.
const triaged = render({ params: { open: handled.id } });
assert.match(triaged, /@Vurder/);
assert.match(triaged, /Frist passert/);
assert.equal(triaged.includes('@Start behandling'), false);

// Klar til lukking: «Lukk saken» er hovedknappen.
const closing = render({ params: { open: ready.id } });
assert.match(closing, /@Lukk saken/);
assert.match(closing, /Alle krav for lukking er oppfylt\./);
assert.match(closing, /Nei – Forslaget tas inn i neste revisjon av rutinen\./);

// Melder uten behandlingstilgang: ser saken, men ingen behandlingsknapper eller opplasting.
const reader = render({ caps: READER, params: { open: fresh.id } });
assert.match(reader, /Løs planke i stillas/);
assert.equal(reader.includes('@Start behandling'), false);
assert.equal(reader.includes('@Vurder'), false);
assert.equal(reader.includes('Dra og slipp filer her'), false);

console.log('findingsRender ok');
