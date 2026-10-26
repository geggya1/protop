/**
 * Rendrer utfylling av en KS-mal, tabellredigering i byggeren og personalhåndboken
 * i HR, og sjekker at gule felt, tabeller, signatur og lesebekreftelse vises.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', sunken: '#EEF2F7',
  card: '#fff', bg: '#F4F7FB', danger: '#b42318', placeholder: '#8B95A6', brandSoft: '#E8F6FE',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const MOCKS = {
  'src/utils/media': { pickImage: async () => null, pickDocument: async () => null },
  'src/anbud/intakeClient': { fileToDataUrl: async () => '' },
  'src/hr/handbookAcks': { loadHandbookAcks: async () => [], saveHandbookAck: async () => ({ ok: true }) },
  'src/employees/cvImport': { textFromDocx: async () => '' },
  'src/ui/saveToast': { showSaveToast: () => {} },
  'src/context/AppContext': {
    useApp: () => ({
      family: { company: { navn: 'Eksempel AS', organisasjonsnummer: '123456789' } },
      familyId: 'f1',
      uid: 'u1',
      activeProfile: { name: 'Kari' },
      shellIntent: null,
      clearShellIntent() {},
      requestShellTab() {},
    }),
  },
  'src/context/ThemeContext': { useColors: () => colors },
  'src/anbud/storage': { loadAnbudState: async () => ({ formTemplates: [] }), saveAnbudState: async () => {}, peekAnbudState: () => null },
  'src/forms/filledStore': {
    loadFilledDocs: async () => [],
    peekFilledDocs: () => [],
    saveFilledDoc: async () => ({ ok: true }),
    deleteFilledDoc: async () => ({ ok: true }),
  },
  'src/anbud/formImport': { askCompanyForm: async () => null, FORM_IMPORT_ACCEPT: '', readFormImport: async () => null },
  'src/anbud/agreementCase': { agreementStarterTemplate: () => ({ fields: [] }) },
  'components/CreateMenu': { __esModule: true, default: host('CreateMenu') },
  'components/BrandBusyOverlay': { __esModule: true, default: host('BrandBusyOverlay') },
};

const cache = new Map();

function mockFor(resolved) {
  const rel = path.relative(ROOT, resolved).replace(/\\/g, '/').replace(/\.(jsx?|mjs)$/, '');
  return MOCKS[rel] || null;
}

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
        Switch: host('Switch'),
        Image: host('Image'),
        ScrollView: host('ScrollView'),
        Platform: { OS: 'ios', select: (row) => row.ios ?? row.default },
        StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
      };
    }
    if (id === '@expo/vector-icons') return { Ionicons: host('Ionicons') };
    if (id === 'react-native-svg') return { __esModule: true, default: host('Svg'), Circle: host('Circle'), Path: host('Path') };
    if (id.startsWith('.')) {
      const fromDir = path.dirname(full);
      const candidate = path.resolve(fromDir, id);
      const hit = [candidate, ...['.jsx', '.js'].map((ext) => candidate + ext)].find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
      if (!hit) throw new Error(`cannot resolve ${id} from ${full}`);
      const mocked = mockFor(hit);
      if (mocked) return mocked;
      if (hit.includes(`${path.sep}src${path.sep}`) || hit.includes(`${path.sep}screens${path.sep}`) || hit.includes(`${path.sep}components${path.sep}`)) {
        return loadLocal(hit);
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

function collect(node) {
  const texts = [];
  const styles = [];
  walk(node, (element) => {
    // Bare vertselementer, ellers telles hver tekst to ganger (Host-komponenten og elementet den lager).
    if (typeof element.type !== 'string') return;
    const children = element.props && element.props.children;
    if (typeof children === 'string') texts.push(children);
    if (Array.isArray(children)) children.filter((c) => typeof c === 'string').forEach((c) => texts.push(c));
    if (element.props?.accessibilityLabel) texts.push(`@${element.props.accessibilityLabel}`);
    if (element.props?.placeholder) texts.push(`[${element.props.placeholder}]`);
    if (typeof element.props?.value === 'string' && element.props.value) texts.push(`=${element.props.value}`);
    if (element.props?.style) styles.push(JSON.stringify(element.props.style));
  });
  return { texts, text: texts.join(' | '), styles: styles.join('\n') };
}

const { libraryForm, libraryTemplateId } = loadLocal(path.join(ROOT, 'src/forms/ksLibrary.js'));
const { newFilledDoc } = loadLocal(path.join(ROOT, 'src/forms/filledDocs.js'));
const { tokenContext } = loadLocal(path.join(ROOT, 'src/forms/tokens.js'));
const company = tokenContext({ navn: 'Eksempel AS', organisasjonsnummer: '123456789' }, { userName: 'Kari' });

/* Utfylling av vernerunde: gule felt, tabell og signatur. */
const FormFill = loadLocal(path.join(ROOT, 'screens/anbud/FormFill.jsx')).default;
const doc = newFilledDoc({ ...libraryForm('vernerunde'), id: libraryTemplateId('vernerunde') }, { actor: { uid: 'u1', name: 'Kari' } });
const fill = collect(withHooks(() => React.createElement(FormFill, {
  doc, colors, company, actor: { uid: 'u1', name: 'Kari' }, onChange() {}, onSave() {}, onComplete() {}, onReopen() {}, onBack() {},
})));
assert.match(fill.text, /Sjekkliste vernerunde/);
assert.match(fill.text, /Lyse gule felt skal fylles ut/);
assert.match(fill.text, /Kartleggingssted/);
assert.match(fill.text, /Ergonomi og arbeidsstillinger/, 'faste sjekkpunkter vises');
assert.match(fill.text, /1\. Trivsel og organisatorisk arbeidsmiljø/, 'mellomoverskrifter vises');
assert.match(fill.text, /Signer som Kari/);
assert.match(fill.text, /Ferdig/);
assert.ok(fill.styles.includes('#fff4cc'), 'tomme felt er gule');
assert.equal(fill.texts.filter((t) => t === 'Sjekkpunkter').length, 1, 'tabellen gjentar ikke seksjonsoverskriften');
assert.equal(fill.texts.filter((t) => t === 'Deltakere').length, 1, 'tabell uten egen seksjon har overskrift');

/* Ferdig dokument er låst og uten gul markering. */
const done = { ...doc, status: 'ferdig', completedAt: '2026-10-26T10:00:00Z', completedBy: { uid: 'u1', name: 'Kari' } };
const locked = collect(withHooks(() => React.createElement(FormFill, {
  doc: done, colors, company, actor: { uid: 'u1', name: 'Kari' }, onChange() {}, onSave() {}, onComplete() {}, onReopen() {}, onBack() {},
})));
assert.match(locked.text, /Gjenåpne/);
assert.doesNotMatch(locked.text, /Signer som/);
assert.ok(!locked.styles.includes('"backgroundColor":"#fff4cc"'), 'ferdig dokument har ikke gule felt');

/* Tabellredigering i byggeren. */
const FormEditor = loadLocal(path.join(ROOT, 'screens/anbud/FormEditor.jsx')).default;
const draft = { ...libraryForm('el-kontroll'), id: libraryTemplateId('el-kontroll') };
const tableIndex = draft.fields.findIndex((field) => field.kind === 'table');
const editor = collect(withHooks(() => React.createElement(FormEditor, {
  draft, colors, selected: tableIndex, onSelect() {}, onPatch() {}, onType() {}, onDuplicate() {}, onMove() {}, onDelete() {}, onDeleteIds() {}, onAdd() {}, onOptionImage() {},
})));
assert.match(editor.text, /Dokumenthode \(KS\)/);
assert.match(editor.text, /Kolonner/);
assert.match(editor.text, /Ett av valgene/);
assert.match(editor.text, /Lim inn mange rader/);
assert.match(editor.text, /Er sikringene godt tilskrudd\?/);

/* Personalhåndbok i HR: redigering og lesing. */
const { standardHandbookChapters, publishHandbook, normalizeHandbook } = loadLocal(path.join(ROOT, 'src/hr/handbook.js'));
const HrHandbook = loadLocal(path.join(ROOT, 'screens/hr/HrHandbook.jsx'));
const chapters = standardHandbookChapters();
const hr = { handbook: normalizeHandbook({ chapters }) };
const edit = collect(withHooks(() => React.createElement(HrHandbook.default, {
  colors, hr, canWrite: true, onPatch() {}, employees: [], familyId: 'f1', actor: { uid: 'u1', name: 'Kari' }, company, logo: '',
})));
assert.match(edit.text, /Personalhåndbok/);
assert.match(edit.text, /gule felt å bekrefte/);
assert.match(edit.text, /Publiser versjon 1/);
assert.match(edit.text, /Om personalhåndboken/);

const clean = chapters.map((row) => ({ ...row, body: row.body.replace(/\[\[([^\]]+)\]\]/g, '$1') }));
const published = publishHandbook(normalizeHandbook({ chapters: clean }), { by: 'Kari' }).handbook.published;
const reader = collect(withHooks(() => React.createElement(HrHandbook.HandbookReader, {
  colors, handbook: published, company, ack: null, onAck() {},
})));
assert.match(reader.text, /Likestilling, mangfold og inkludering/);
assert.match(reader.text, /Jeg har lest og forstått versjon 1/);

/* Skjemabygger: KS-malene er standardfanen. */
const FormBuilderScreen = loadLocal(path.join(ROOT, 'screens/anbud/FormBuilderScreen.jsx')).default;
const list = collect(withHooks(() => React.createElement(FormBuilderScreen, { state: { formTemplates: [] }, colors })));
assert.match(list.text, /KS-maler/);
assert.match(list.text, /Bedriftens maler/);
assert.match(list.text, /Utfylte dokumenter/);
assert.match(list.text, /Sjekkliste for gjennomføring av SJA/);
assert.match(list.text, /ISO \/ K-HMS › Avvik og forbedring/, 'avviksrapport peker til avviksregisteret');
assert.match(list.text, /HR › Personalhåndbok/);
assert.match(list.text, /@Fyll ut Møtereferat/);

/* HR › Skjemaer viser personalskjemaene. */
const HrForms = loadLocal(path.join(ROOT, 'screens/hr/HrForms.jsx')).default;
const hrForms = collect(withHooks(() => React.createElement(HrForms, {
  colors, employees: [], canWrite: true, familyId: 'f1', actor: { uid: 'u1', name: 'Kari' }, company, logo: null,
})));
assert.match(hrForms.text, /Pårørendeskjema/);
assert.match(hrForms.text, /Taushetserklæring/);
assert.match(hrForms.text, /Utfylte personalskjema/);

console.log('formFillRender.test.cjs: ok');
