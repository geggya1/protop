/**
 * Rendertest for kundeundersøkelsen: resultat, mottakere, svarskjema, svarsiden og hovedsiden.
 * React Native, tema og serverkall er byttet ut med enkle stand-ins, så JSX-feil og manglende
 * symboler kaster her (samme oppsett som src/hr/annualRender.test.cjs).
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const syncLazyScreen = require('../../tests/helpers/syncLazyScreen.cjs');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', brandInk: '#0A70B5', onBrand: '#fff', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', bg: '#F4F7FB',
  danger: '#b42318', success: '#16a34a', warn: '#d97706', sunken: '#f8fafc',
};

function host(name) {
  return function Host(props) {
    const { children, nativeID } = props || {};
    return React.createElement(name.toLowerCase(), nativeID ? { id: nativeID } : null, children);
  };
}

const rnMock = {
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  View: host('View'),
  Text: host('Text'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  ScrollView: host('ScrollView'),
  ActivityIndicator: host('ActivityIndicator'),
  StyleSheet: { create: (s) => s },
  Platform: { OS: 'web', select: (o) => o && (o.web || o.default) },
};

const calls = [];
const cache = new Map();
function load(rel) {
  const full = path.join(ROOT, rel);
  if (cache.has(full)) return cache.get(full).exports;
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
  cache.set(full, m);
  m.filename = full;
  m.paths = Module._nodeModulePaths(path.dirname(full));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id.includes('ui/lazyScreen')) return syncLazyScreen(m.require);
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id === 'react-native-svg') {
      return { __esModule: true, default: host('Svg'), G: host('G'), Path: host('Path'), Line: host('Line'), Circle: host('Circle'), Text: host('SvgText') };
    }
    if (/src\/theme$/.test(id)) return ((m) => ({ ...m, useBreakpoints: m.useLayout }))({ useLayout: () => ({ isPhone: false, isWide: true, width: 1280 }) });
    if (id.includes('context/ThemeContext')) return { useColors: () => colors };
    if (id.includes('context/AppContext')) return ((m) => ({ ...m, useShellNav: () => { const a = (m.useApp && m.useApp()) || {}; return { shellIntent: a.shellIntent ?? null, shellNav: a.shellNav ?? null }; } }))({ useApp: () => ({ familyId: 'c1', family: { name: 'Bygg AS' }, uid: 'u1' }) });
    if (id.includes('access/useCompanyAccess')) return { useCompanyAccess: () => ({ ready: true, canEdit: () => true, canView: () => true }) };
    if (id.includes('anbud/storage')) return { loadCustomerList: async () => ({ customers: [] }) };
    if (id.includes('surveys/customerClient')) return { customerSurveyCall: async (action, data) => { calls.push([action, data]); return {}; } };
    if (id.includes('saveToast')) return { showSaveToast() {} };
    if (id.includes('ShellTitles')) return { useRepeatsShellTitle: () => false };
    if (id.includes('ui/useConfirm')) return { useConfirm: () => async () => true };
    if (id.includes('components/DateInput')) return { __esModule: true, default: host('DateInput') };
    if (id.startsWith('.')) {
      const jsx = path.join(path.dirname(full), `${id}.jsx`);
      if (fs.existsSync(jsx)) return load(path.relative(ROOT, jsx));
    }
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const has = (html, id) => assert.ok(html.includes(`id="${id}"`), `mangler ${id}`);

(async () => {
  const cs = await import('./customerSurvey.js');
  const base = cs.newCustomerSurvey({ year: 2026 });
  const named = { ...base, id: 'k1', status: 'open', companyName: 'Bygg AS', stats: { recipients: 4, sent: 4, answered: 3 } };
  const answers = [
    { id: 'a1', customerName: 'Sola kommune', answers: { nps: 10, kvalitet: 5, fremdrift: 4 }, texts: { bedre: 'Ingenting' } },
    { id: 'a2', customerName: 'Novaform AS', recipientName: 'Per', answers: { nps: 3, kvalitet: 2, fremdrift: 1 }, texts: { bedre: 'Holde frister' } },
    { id: 'a3', customerName: 'Ola', answers: { nps: 8, kvalitet: 4, pris: 2 }, texts: {} },
  ];
  const results = cs.customerResults(named, answers);
  const analysis = cs.customerAnalysis(results, { nps: 10, index: 50, areas: [{ area: 'Kvalitet', score: 60 }] });

  const Results = load('screens/customers/CustomerSurveyResults.jsx').default;
  const html = renderToStaticMarkup(React.createElement(Results, { colors, survey: named, results, analysis, canWrite: true, onFollowUp: async () => {} }));
  for (const id of ['customer-survey-results-k1', 'customer-survey-nps', 'customer-survey-index', 'customer-survey-nps-bar', 'customer-survey-unhappy', 'customer-survey-followup-a2', 'customer-survey-areas', 'customer-survey-improve', 'customer-survey-export']) has(html, id);
  assert.match(html, /Kritikere \(0–6\): 1/);
  assert.match(html, /Anbefalere \(9–10\): 1/);
  assert.match(html, /Novaform AS/);
  assert.match(html, /Merk som fulgt opp/);
  assert.match(html, /Holde frister/);
  assert.match(html, /anbefale Bygg AS/, '{firma} byttes med navnet');

  // Anonym: ingen kundeliste og ingen kundenavn ved fritekst.
  const anon = { ...named, anonymous: true, status: 'closed' };
  const ar = cs.customerResults(anon, answers);
  const anonHtml = renderToStaticMarkup(React.createElement(Results, { colors, survey: anon, results: ar, analysis: cs.customerAnalysis(ar), canWrite: true }));
  assert.equal(anonHtml.includes('customer-survey-unhappy'), false);
  assert.equal(anonHtml.includes('Novaform'), false, 'anonym: ingen kundenavn');
  assert.match(anonHtml, /Undersøkelsen er anonym/);

  // Mottakere: navngitt viser hvem som har svart, anonym gjør det ikke.
  const Recipients = load('screens/customers/CustomerSurveyRecipients.jsx').default;
  const recipients = [
    { id: 'r1', name: 'Per', email: 'per@x.no', customerName: 'Novaform AS', status: 'sent', sentAt: '2026-10-01', answered: true, answeredAt: '2026-10-02', reminders: 0 },
    { id: 'r2', name: '', email: 'feil@x.no', customerName: '', status: 'failed', error: 'Postkassen finnes ikke', reminders: 0 },
  ];
  const recHtml = renderToStaticMarkup(React.createElement(Recipients, { colors, survey: named, recipients, customers: [], canWrite: true, busy: false, onAdd: async () => true, onRemove() {} }));
  has(recHtml, 'customer-survey-recipients');
  assert.match(recHtml, /Svarte 02\.10\.2026/);
  assert.match(recHtml, /Ikke sendt: Postkassen finnes ikke/);
  assert.match(recHtml, /1 av 2 har svart/);
  const anonRec = renderToStaticMarkup(React.createElement(Recipients, { colors, survey: { ...named, anonymous: true }, recipients: recipients.map((r) => ({ ...r, answered: null, answeredAt: '' })), customers: [], canWrite: true, busy: false, onAdd: async () => true, onRemove() {} }));
  assert.equal(anonRec.includes('Svarte'), false);
  assert.match(anonRec, /ikke hvem som har svart/);
  const { recipientFromCustomer } = load('screens/customers/CustomerSurveyRecipients.jsx');
  assert.deepEqual(recipientFromCustomer({ id: 'c1', name: 'Bygg AS', contactName: 'Kari', email: 'kari@bygg.no' }), { customerId: 'c1', customerName: 'Bygg AS', name: 'Kari', email: 'kari@bygg.no' });

  // Svarskjemaet: NPS 0–10, skala 1–5 og fritekst.
  const Form = load('components/surveys/SurveyAnswerForm.jsx');
  const formHtml = renderToStaticMarkup(React.createElement(Form.default, { colors, survey: { questions: named.questions }, values: { nps: 9 }, texts: {} }));
  for (const id of ['survey-q-nps', 'survey-nps-0', 'survey-nps-10', 'survey-kvalitet-1', 'survey-kvalitet-5', 'survey-text-bedre']) has(formHtml, id);
  assert.equal(formHtml.includes('survey-kvalitet-0'), false);
  assert.equal(Form.answeredCount({ questions: named.questions }, { nps: 9, kvalitet: 3 }, { bedre: ' ' }), 2);

  // Svarsiden: lenken fra adressen, og første tegning mens den henter.
  const Answer = load('screens/surveys/SurveyAnswerScreen.jsx');
  assert.equal(Answer.tokenFromPath('/svar/abcdefghijklmnopqrstuvwxyz012345'), 'abcdefghijklmnopqrstuvwxyz012345');
  assert.equal(Answer.tokenFromPath('/svar/kort'), '');
  const loading = renderToStaticMarkup(React.createElement(Answer.default, { route: { params: { token: 'x'.repeat(32) } } }));
  has(loading, 'survey-answer');
  assert.match(loading, /Henter undersøkelsen/);

  // Hovedsiden (første tegning): beskrivelse og knapp for ny undersøkelse.
  const Screen = load('screens/customers/CustomerSurveyScreen.jsx').default;
  const screenHtml = renderToStaticMarkup(React.createElement(Screen));
  has(screenHtml, 'customer-survey');
  assert.match(screenHtml, /Henter kundeundersøkelser/);
  assert.match(screenHtml, /ISO 9001 punkt 9\.1\.2/);

  console.log('surveys render ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
