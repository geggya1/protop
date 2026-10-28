/**
 * Rendrer utfylling av en KS-mal, tabellredigering i byggeren, personalhåndboken
 * i HR og dokumentstyringen, og sjekker at gule felt, tabeller, signatur, godkjenning,
 * merknader og lesebekreftelse vises.
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

// Dokumentstyringen som useDocControl finner i minnet (peekDocControl). Settes per test.
const DC = { controls: [], settings: null, acks: [] };

const MOCKS = {
  'src/utils/media': { pickImage: async () => null, pickDocument: async () => null },
  'src/anbud/intakeClient': { fileToDataUrl: async () => '' },
  'src/doccontrol/store': {
    peekDocControl: () => DC,
    loadControls: async () => DC.controls,
    loadSettings: async () => DC.settings,
    loadAcks: async () => DC.acks,
    loadComments: async () => [],
    saveControl: async (id, control) => ({ ok: true, control }),
    saveSettings: async (id, settings) => ({ ok: true, settings }),
    saveComment: async (id, comment) => ({ ok: true, comment }),
    saveAck: async (id, ack) => ({ ok: true, ack }),
  },
  'src/employees/storage': { watchEmployees: () => () => {} },
  'src/context/CompanyDataContext': require('../../src/company/companyDataTesting.js').companyDataHooks(),
  'src/utils/notifications': { notifyUsers: async () => ({ notified: 0 }) },
  'src/access/useCompanyAccess': { useCompanyAccess: () => ({ levelId: 'leder', bypass: false, canView: () => true, canEdit: () => true }) },
  'src/employees/cvImport': { textFromDocx: async () => '' },
  'src/ui/saveToast': { showSaveToast: () => {} },
  'src/context/AppContext': {
    useApp: () => ({
      family: { company: { navn: 'Eksempel AS', organisasjonsnummer: '123456789' }, ownerUid: 'u1' },
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
        Modal: host('Modal'),
        useWindowDimensions: () => ({ width: 1200, height: 900 }),
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

/* Dokumentstyring: utkast, innsending, godkjenning. */
const dcModel = loadLocal(path.join(ROOT, 'src/doccontrol/model.js'));
const dcContent = loadLocal(path.join(ROOT, 'src/doccontrol/content.js'));
const kari = { uid: 'u1', name: 'Kari' };
const per = { uid: 'u2', name: 'Per Godkjenner' };
DC.settings = dcModel.normalizeSettings({ approvers: [per] });

/* Personalhåndbok i HR: redigering med godkjenning og lesing. */
const { standardHandbookChapters, normalizeHandbook } = loadLocal(path.join(ROOT, 'src/hr/handbook.js'));
const HrHandbook = loadLocal(path.join(ROOT, 'screens/hr/HrHandbook.jsx'));
const chapters = standardHandbookChapters();
const hr = { handbook: normalizeHandbook({ chapters }) };
DC.controls = [dcModel.newControl({ kind: 'handbook', title: 'Personalhåndbok', code: 'C1-C-01-001', readRule: 'pakrevd' }, { actor: kari })];
const edit = collect(withHooks(() => React.createElement(HrHandbook.default, {
  colors, hr, canWrite: true, onPatch() {}, employees: [], actor: kari, company, logo: '',
})));
assert.match(edit.text, /Personalhåndbok/);
assert.match(edit.text, /gule felt å bekrefte/);
assert.match(edit.text, /Versjon og godkjenning/);
assert.match(edit.text, /Send rev\. 1 til godkjenning/);
assert.match(edit.text, /gule felt er ikke bekreftet/, 'innsending stoppes til de gule feltene er bekreftet');
assert.match(edit.text, /Utkast 1/, 'dokumenthodet viser utkast til godkjenning er gitt');
assert.match(edit.text, /Godkjennes av .*Per Godkjenner/);
assert.match(edit.text, /Om personalhåndboken/);
assert.doesNotMatch(edit.text, /Lovsjekk/, 'standardhåndboken består lovsjekken');

/* Lovsjekk av en eldre håndbok: overtid knyttet til kundens betaling, og kapitler som mangler. */
const olderBook = normalizeHandbook({ chapters: [{ id: 'a', title: 'Arbeidstid', body: 'Overtid kompenseres når den er pålagt av leder, normalt når oppdragsgiver betaler for det.' }] });
const older = collect(withHooks(() => React.createElement(HrHandbook.default, {
  colors, hr: { handbook: olderBook }, canWrite: true, onPatch() {}, employees: [], actor: kari, company, logo: '',
})));
assert.match(older.text, /Lovsjekk/);
assert.match(older.text, /knytter overtidstillegget til at oppdragsgiveren betaler/);
assert.match(older.text, /Rett teksten/);
assert.match(older.text, /mangler varslingsrutine/);
assert.match(older.text, /Legg til kapitlet/);

const clean = chapters.map((row) => ({ ...row, body: row.body.replace(/\[\[([^\]]+)\]\]/g, '$1') }));
const snapshot = dcContent.handbookSnapshot({ chapters: clean });
let handbookControl = dcModel.submitRevision(DC.controls[0], snapshot, { actor: kari }).control;

/* Godkjenner ser knappen. Den som sendte inn, gjør ikke det (fire øyne). */
const DocControlPanel = loadLocal(path.join(ROOT, 'screens/doccontrol/DocControlPanel.jsx')).default;
const dcFor = (actor, extra = {}) => ({
  actor, settings: DC.settings, isAdmin: false, employees: [], acks: [], people: [kari, per], comments: [], canComment: true, allComments: false,
  storeControl: async (control) => ({ ok: true, control }), notifySubmitted() {}, notifyPublished() {}, addComment: async () => ({ ok: true }), updateComment: async () => ({ ok: true }),
  ...extra,
});
const asPer = collect(withHooks(() => React.createElement(DocControlPanel, { colors, dc: dcFor(per), control: handbookControl, snapshot })));
assert.match(asPer.text, /Rev\. 1 venter på godkjenning hos Per Godkjenner/);
assert.match(asPer.text, /Godkjenn og publiser versjon 1/);
const asKari = collect(withHooks(() => React.createElement(DocControlPanel, { colors, dc: dcFor(kari), control: handbookControl, snapshot })));
assert.doesNotMatch(asKari.text, /Godkjenn og publiser/);
assert.match(asKari.text, /Bare Per Godkjenner kan|Du sendte inn revisjonen selv|Du er ikke godkjenner/);
assert.match(asKari.text, /Trekk tilbake/);

handbookControl = dcModel.approveRevision(handbookControl, { actor: per, settings: DC.settings }).control;
const published = collect(withHooks(() => React.createElement(DocControlPanel, { colors, dc: dcFor(kari), control: handbookControl, snapshot })));
assert.match(published.text, /Gjeldende versjon 1, godkjent/);
assert.match(published.text, /Per Godkjenner/, 'godkjent av står i hodet');
assert.match(published.text, /Ingen endringer siden versjon 1/);

const book = dcContent.handbookFromControl(handbookControl);
const reader = collect(withHooks(() => React.createElement(HrHandbook.HandbookReader, {
  colors, book, company, ack: null, onAck() {}, onComment() {},
})));
assert.match(reader.text, /Likestilling, mangfold og inkludering/);
assert.match(reader.text, /Jeg har lest og forstått versjon 1/);
assert.match(reader.text, /@Merknad til Arbeidstid|@Merknad til /, 'kapitlene kan få merknad');

/* Merknader: bare de som har lov ser dem. Eier og godkjenner kan behandle dem. */
const DocComments = loadLocal(path.join(ROOT, 'screens/doccontrol/DocComments.jsx')).default;
const comment = dcModel.newComment({ control: handbookControl, anchorId: chapters[0].id, anchorLabel: chapters[0].title, quote: 'fem uker', note: 'Gjelder dette også deltid?' }, { actor: { uid: 'u3', name: 'Ola' } });
const comments = collect(withHooks(() => React.createElement(DocComments, { colors, dc: dcFor(per, { comments: [comment], allComments: true }), control: handbookControl })));
assert.match(comments.text, /Gjelder dette også deltid\?/);
assert.match(comments.text, /«fem uker»/);
assert.match(comments.text, /Behandle/, 'godkjenner kan behandle merknaden');
const noResolve = collect(withHooks(() => React.createElement(DocComments, { colors, dc: dcFor({ uid: 'u3', name: 'Ola' }, { comments: [comment] }), control: handbookControl })));
assert.doesNotMatch(noResolve.text, /Behandle/, 'forfatteren kan ikke behandle sin egen merknad');

/* Min side: påkrevde dokumenter står øverst og må bekreftes. */
const { newTemplateControl } = loadLocal(path.join(ROOT, 'src/doccontrol/templates.js'));
let brann = newTemplateControl({ ...libraryForm('branninstruks'), id: libraryTemplateId('branninstruks') }, { actor: kari });
assert.equal(brann.readRule, 'pakrevd', 'branninstruks er påkrevd lesing');
brann = dcModel.submitRevision(brann, dcContent.templateSnapshot(libraryForm('branninstruks')), { actor: kari }).control;
brann = dcModel.approveRevision(brann, { actor: per, settings: DC.settings }).control;
DC.controls = [handbookControl, brann];
const MyDocuments = loadLocal(path.join(ROOT, 'screens/doccontrol/MyDocuments.jsx')).default;
const mine = collect(withHooks(() => React.createElement(MyDocuments, { colors, employeeId: 'e1' })));
assert.match(mine.text, /Dokumenter å lese/);
assert.match(mine.text, /2 påkrevde gjenstår/);
assert.match(mine.text, /Branninstruks/);
assert.match(mine.text, /Påkrevd: les og bekreft/);

/* Oversikten: venter på godkjenning, dokumentliste og innstillinger. */
const DocOverview = loadLocal(path.join(ROOT, 'screens/doccontrol/DocOverview.jsx')).default;
const waiting = dcModel.submitRevision(dcModel.ensureWorkingRevision(brann, 'ny', { actor: kari }), { title: 'Branninstruks 2' }, { actor: kari, changeReason: 'Ny møteplass' }).control;
const overview = collect(withHooks(() => React.createElement(DocOverview, {
  colors, dc: dcFor(per, { controls: [handbookControl, waiting], company, logo: null }), onOpen() {}, onPreview() {}, libraryMissing: 3, onAddLibrary() {},
})));
assert.match(overview.text, /Venter på din godkjenning/);
assert.match(overview.text, /Ny møteplass/);
assert.match(overview.text, /Dokumentliste/);
assert.match(overview.text, /3 KS-maler er ikke tatt inn/);
assert.match(overview.text, /Lesere av merknader/);
assert.match(overview.text, /Varsle ansatte om ny versjon/);
assert.match(overview.text, /C1-B-02-004/, 'KS-referansen er dokument-ID');

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
assert.match(list.text, /Dokumentstyring/);
assert.match(list.text, /Versjon 1 gjeldende/, 'godkjent KS-mal viser versjonen');
assert.match(list.text, /Ikke godkjent/, 'KS-maler som ikke er godkjent er merket');

/* HR › Skjemaer viser personalskjemaene. */
const HrForms = loadLocal(path.join(ROOT, 'screens/hr/HrForms.jsx')).default;
const hrForms = collect(withHooks(() => React.createElement(HrForms, {
  colors, employees: [], canWrite: true, familyId: 'f1', actor: { uid: 'u1', name: 'Kari' }, company, logo: null,
})));
assert.doesNotMatch(hrForms.text, /Pårørendeskjema/, 'pårørende fylles inn på profilen, ikke som skjema');
assert.match(hrForms.text, /Taushetserklæring/);
assert.match(hrForms.text, /Utfylte personalskjema/);

/* HR › Oversikt: hvem som mangler pårørende, og oppgaven de har fått. */
const HrDashboard = loadLocal(path.join(ROOT, 'screens/hr/HrDashboard.jsx')).default;
const olaEmp = { id: 'e1', personUid: 'ola', person: { firstName: 'Ola', lastName: 'Nordmann' }, company: { status: 'active' } };
const liseEmp = { id: 'e3', person: { firstName: 'Lise', lastName: 'Ny' }, company: { status: 'active' } };
const kinTaskRow = { id: 'kin_e1', deadline: '2026-11-09', reminders: 1 };
const dash = collect(withHooks(() => React.createElement(HrDashboard, {
  colors, employees: [olaEmp, liseEmp], hr: {}, canWrite: true, onPatch() {}, familyId: 'f1',
  kin: { missing: [{ employee: olaEmp, task: kinTaskRow }, { employee: liseEmp, task: null }], busy: false, remindNow: async () => 1 },
})));
assert.match(dash.text, /2 ansatte mangler pårørende/);
assert.match(dash.text, /Oppgave sendt til 1, første frist 09\.11\.2026 · 1 påminnet/);
assert.match(dash.text, /1 uten brukerkonto: inviter personen/);
assert.match(dash.text, /Send påminnelse nå \(1\)/);
assert.doesNotMatch(dash.text, /Lise Ny/, 'navnene ligger bak varselet, ikke som lang liste');

/* Felles velger: 1–4 valg som knapper, 5 eller flere som nedtrekk. */
const parts = loadLocal(path.join(ROOT, 'screens/doccontrol/parts.jsx'));
const few = collect(withHooks(() => React.createElement(parts.PersonChips, { colors, people: [kari, per], value: kari, onChange() {} })));
assert.ok(few.texts.includes('Kari') && few.texts.includes('Per Godkjenner'), 'to personer vises som knapper');
const crowd = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ uid: n, name: `Person ${n}` }));
const many = collect(withHooks(() => React.createElement(parts.PersonChips, { colors, people: crowd, value: crowd[1], onChange() {}, emptyLabel: 'Administrator', title: 'Godkjenner' })));
assert.ok(many.texts.includes('Person B'), 'valgt person står i feltet');
assert.ok(!many.texts.includes('Person E'), 'seks personer vises ikke som knapper, men som nedtrekk');
const FormAnswer = loadLocal(path.join(ROOT, 'screens/anbud/FormAnswer.jsx')).default;
const sixChoices = { id: 'f1', kind: 'choice', label: 'Fag', options: ['Elektro', 'Rør', 'Tømrer', 'Maler', 'Murer', 'Ventilasjon'].map((label, i) => ({ id: `o${i}`, label })), value: 'o2' };
const choice = collect(withHooks(() => React.createElement(FormAnswer, { field: sixChoices, colors, onChange() {} })));
assert.ok(choice.texts.includes('Tømrer'), 'valgt alternativ står i feltet');
assert.ok(!choice.texts.includes('Ventilasjon') && !choice.text.includes('○'), 'seks valg er ikke en radioliste');
const threeChoices = { ...sixChoices, options: sixChoices.options.slice(0, 3), value: '' };
const three = collect(withHooks(() => React.createElement(FormAnswer, { field: threeChoices, colors, onChange() {} })));
assert.ok(three.texts.includes('Rør') && three.text.includes('○'), 'tre valg vises fortsatt som liste');

console.log('formFillRender.test.cjs: ok');
