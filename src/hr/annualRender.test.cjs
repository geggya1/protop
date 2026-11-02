/**
 * Rendertest for HR → Årshjul (HrAnnual med frister ved sykefravær og medarbeiderundersøkelse)
 * og kortet for undersøkelsen på Min side. React Native og Firestore er byttet ut med enkle
 * stand-ins, så JSX-feil og manglende symboler kaster her.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4', ink: '#152033', muted: '#8B95A6', line: '#E6EBF2', card: '#fff', bg: '#F4F7FB', danger: '#b42318',
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
  StyleSheet: { create: (s) => s },
  Platform: { OS: 'web', select: (o) => o && (o.web || o.default) },
};

const surveyStoreMock = {
  loadSurveys: async () => [],
  saveSurvey: async (id, s) => s,
  openSurvey: async () => {},
  closeSurvey: async () => ({ ok: true, count: 0, ready: false }),
  loadSurveyResult: async () => null,
  countSurveyAnswers: async () => 0,
  loadOpenSurveys: async () => [],
  hasAnswered: async () => false,
  submitSurveyAnswer: async () => true,
};

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
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('surveyStore')) return surveyStoreMock;
    if (id === 'react-native-svg') {
      return { __esModule: true, default: host('Svg'), G: host('G'), Path: host('Path'), Line: host('Line'), Circle: host('Circle'), Text: host('SvgText') };
    }
    if (/src\/theme$/.test(id)) return { useLayout: () => ({ isPhone: false, width: 1280 }) };
    if (id.includes('filledStore')) return { peekFilledDocs: () => [], loadFilledDocs: async () => [] };
    if (id.includes('saveToast')) return { showSaveToast() {} };
    if (id.includes('ShellTitles')) return { useRepeatsShellTitle: () => false };
    if (id.includes('components/DateInput')) return { __esModule: true, default: host('DateInput') };
    // Komponentene ved siden av (./HrShared, ./HrSickLeave …) kompileres på samme måte.
    if (id.startsWith('./')) {
      const jsx = path.join(path.dirname(full), `${id}.jsx`);
      if (fs.existsSync(jsx)) return load(path.relative(ROOT, jsx));
    }
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const HrAnnual = load('screens/hr/HrAnnual.jsx').default;
const HrSickLeave = load('screens/hr/HrSickLeave.jsx').default;
const HrSurvey = load('screens/hr/HrSurvey.jsx').default;
const EmployeeSurveyCard = load('screens/hr/EmployeeSurveyCard.jsx').default;
const has = (html, id) => assert.ok(html.includes(`id="${id}"`), `mangler ${id}`);

(async () => {
  const { sickFollowUpRows, addDays } = await import('./sickLeave.js');
  const today = new Date().toISOString().slice(0, 10);
  const start = addDays(today, -20);
  const absences = [];
  for (let d = start; d <= today; d = addDays(d, 1)) absences.push({ employeeId: 'e1', date: d, type: 'syk_melding' });
  const employees = [{ id: 'e1', personUid: 'u1', person: { firstName: 'Ada', lastName: 'Nordmann' } }];
  const sickRows = sickFollowUpRows(absences, [], { today, employees });
  assert.equal(sickRows.length, 1);

  // Årshjul: bare årshjulet. Sykefravær og undersøkelsen er egne sider, og aktivitetene lenker dit.
  const annual = renderToStaticMarkup(React.createElement(HrAnnual, {
    colors,
    hr: { annual: { tasks: true, done: {}, off: [] }, reviews: [], sickFollowUps: [] },
    canWrite: true,
    onPatch() {},
    familyId: 'c1',
    actorName: 'HR',
    staff: employees,
    onOpen() {},
    onOpenIso() {},
    onRefreshTasks() {},
  }));
  for (const id of ['hr-annual-wheel', 'hr-annual-wheel-graphic', 'hr-annual-timeline', 'hr-annual-kpi-done', 'hr-annual-tasks', 'hr-annual-month-0', 'hr-annual-ongoing-sykefravaer']) has(annual, id);
  // Valgt måned (inneværende) viser aktivitetene sine; hjulet har tolv måneder og én bue per aktivitet.
  assert.equal((annual.match(/<path/g) || []).length >= 12 + 10, true, 'måneder og aktiviteter i hjulet');
  assert.equal(annual.includes('id="hr-sick-followup"'), false, 'sykefravær er egen side');
  assert.equal(annual.includes('id="hr-survey"'), false, 'undersøkelsen er egen side');
  assert.equal(annual.includes('Ada Nordmann'), false, 'ingen navn i årshjulet');
  assert.match(annual, /Åpne Sykefravær|Oppfølging ved sykefravær/);
  assert.match(annual, /Hele året/);
  assert.match(annual, /Lager oppgave når måneden starter/);

  const sick = renderToStaticMarkup(React.createElement(HrSickLeave, {
    colors, rows: sickRows, loading: false, canWrite: true, onPatch() {}, actorName: 'HR',
  }));
  has(sick, 'hr-sick-followup');
  assert.match(sick, /Ada Nordmann/);
  assert.match(sick, /Oppfølgingsplan · frist/);

  const survey = renderToStaticMarkup(React.createElement(HrSurvey, { colors, familyId: 'c1', canWrite: true, invited: 1, uid: 'u1' }));
  has(survey, 'hr-survey');

  // Resultat og analyse: indeks, styrker, forbedringsområder, områder, svarfordeling og trakassering.
  const HrSurveyResults = load('screens/hr/HrSurveyResults.jsx').default;
  const sv = await import('./survey.js');
  const done = sv.surveyTransition(sv.surveyTransition(sv.newSurvey({ year: 2026 }), 'open'), 'closed');
  const answers = [5, 4, 4, 2, 5, 3].map((v, i) => ({ surveyId: done.id, answers: { trivsel: v, arbeidsmengde: 6 - v, trakassering: i === 0 ? 4 : 1 }, comment: i ? '' : 'Bra' }));
  const results = sv.surveyResults(done, answers);
  const analysis = sv.surveyAnalysis(results);
  const resHtml = renderToStaticMarkup(React.createElement(HrSurveyResults, {
    colors, survey: done, results, analysis, participation: sv.participation(6, 10), canWrite: true, onCreateTask: async () => 'id', onOpenHandbook() {},
  }));
  for (const id of ['hr-survey-index', 'hr-survey-harassment', 'hr-survey-strengths', 'hr-survey-improvements', 'hr-survey-areas', 'hr-survey-likert', 'hr-survey-actions']) has(resHtml, id);
  assert.match(resHtml, /1 av 6 oppgir/);
  assert.match(resHtml, /Lag oppgave for tiltak/);
  assert.match(resHtml, /Svært positivt/);

  // Uten åpen undersøkelse vises ingenting på Min side (første rendering, før lasting).
  assert.equal(renderToStaticMarkup(React.createElement(EmployeeSurveyCard, { colors, companyId: 'c1', uid: 'u1' })), '');
  console.log('hr annual render ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
