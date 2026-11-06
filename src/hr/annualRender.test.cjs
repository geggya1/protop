/**
 * Rendertest for HR → Årshjul (HrAnnual med frister ved sykefravær og medarbeiderundersøkelse)
 * og kortet for undersøkelsen på Min side. React Native og Firestore er byttet ut med enkle
 * stand-ins, så JSX-feil og manglende symboler kaster her.
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
  deleteDraftSurvey: async () => {},
  setSurveyDeadline: async () => {},
  notifySurveyEmployees: async () => ({ ok: true, notified: 0 }),
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
    if (id.includes('ui/lazyScreen')) return syncLazyScreen(m.require);
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('surveyStore')) return surveyStoreMock;
    if (id === 'react-native-svg') {
      return { __esModule: true, default: host('Svg'), G: host('G'), Path: host('Path'), Line: host('Line'), Circle: host('Circle'), Text: host('SvgText') };
    }
    if (/src\/theme$/.test(id)) return ((m) => ({ ...m, useBreakpoints: m.useLayout }))({ useLayout: () => ({ isPhone: false, isWide: true, width: 1280 }) });
    if (id.includes('filledStore')) return { peekFilledDocs: () => [], loadFilledDocs: async () => [] };
    if (id.includes('saveToast')) return { showSaveToast() {} };
    if (id.includes('ShellTitles')) return { useRepeatsShellTitle: () => false };
    if (id.includes('components/DateInput')) return { __esModule: true, default: host('DateInput') };
    // Komponentene ved siden av (./HrShared, ./HrSickLeave …) kompileres på samme måte.
    if (id.includes('ui/useConfirm')) return { useConfirm: () => async () => true };
    if (id.startsWith('.')) {
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
  // Tidslinjen viser hele månedsnavn på web, ikke bare forbokstaver.
  const timeline = annual.slice(annual.indexOf('id="hr-annual-timeline"'));
  for (const name of ['Januar', 'September', 'Desember']) assert.ok(timeline.includes(`>${name}<`), `${name} i tidslinjen`);
  // Valgt måned (inneværende) viser aktivitetene sine; hjulet har tolv måneder og én bue per aktivitet.
  assert.equal((annual.match(/<path/g) || []).length >= 12 + 10, true, 'måneder og aktiviteter i hjulet');
  assert.equal(annual.includes('id="hr-sick-followup"'), false, 'sykefravær er egen side');
  assert.equal(annual.includes('id="hr-survey"'), false, 'undersøkelsen er egen side');
  assert.equal(annual.includes('Ada Nordmann'), false, 'ingen navn i årshjulet');
  assert.match(annual, /Åpne Sykefravær|Oppfølging ved sykefravær/);
  assert.match(annual, /Hele året/);
  assert.match(annual, /Lager oppgave når måneden starter/);

  // Samlet visning: ISO-årshjulet i samme hjul, tidslinje og månedspanel.
  const month = new Date().getMonth();
  const MONTHS = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
  const isoState = { records: { aarshjul: [{ id: 'ahj1', title: 'Ledelsens gjennomgang', months: [MONTHS[month]], page: 'ledelse', state: 'aktiv' }] }, documents: [] };
  const combined = renderToStaticMarkup(React.createElement(HrAnnual, {
    colors,
    hr: { annual: { tasks: false, done: {}, off: [] }, reviews: [], sickFollowUps: [] },
    canWrite: true,
    onPatch() {},
    familyId: 'c1',
    actorName: 'HR',
    staff: employees,
    onOpen() {},
    onOpenIso() {},
    onRefreshTasks() {},
    iso: { available: true, show: true, onToggle() {}, status: 'ready', state: isoState },
  }));
  has(combined, 'hr-annual-iso');
  has(combined, 'hr-annual-iso-month');
  assert.match(combined, /Viser også ISO-årshjulet/);
  assert.match(combined, /ISO · Ledelsens gjennomgang/);
  assert.match(combined, /Åpne i ISO/);
  assert.match(combined, /ISO-årshjulet/);

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

  // Redigering av utkast: spørsmål, spørsmålsbank, svarfrist og varsel om spørsmål som ikke kan sammenlignes.
  const HrSurveyEditor = load('screens/hr/HrSurveyEditor.jsx').default;
  const draft = sv.newSurvey({ year: 2027, template: done });
  const changed = sv.updateSurveyQuestion(draft, 'trivsel', { text: 'Ny tekst.' });
  const editor = renderToStaticMarkup(React.createElement(HrSurveyEditor, {
    colors, survey: changed, previous: done, onSave: async () => true, onDelete() {}, busy: false,
  }));
  for (const id of ['hr-survey-editor', 'hr-survey-q-trivsel', 'hr-survey-bank-toggle', 'hr-survey-save', 'hr-survey-delete', 'hr-survey-add-own']) has(editor, id);
  assert.match(editor, /1 spørsmål er nye eller endret/);
  assert.match(editor, /Spørsmålsbank \(\d+\)/);
  assert.match(editor, /Svarfrist/);

  // Utvikling over tid: diagram, områdetabell og «Hva må bedres».
  const SurveyTrend = load('components/surveys/SurveyTrend.jsx').default;
  const { surveyTrend } = await import('../surveys/trend.js');
  const trend = surveyTrend([
    { id: 'a', label: '2025', date: '2025-11-01', index: 61, count: 8, pct: 80, areas: [{ area: 'Ledelse', score: 72 }, { area: 'HMS', score: 66 }] },
    { id: 'b', label: '2026', date: '2026-11-01', index: 58, count: 9, pct: 90, areas: [{ area: 'Ledelse', score: 74 }, { area: 'HMS', score: 52 }] },
  ]);
  const trendHtml = renderToStaticMarkup(React.createElement(SurveyTrend, { colors, trend, target: 70, nativeID: 'hr-survey-trend', onExport() {} }));
  for (const id of ['hr-survey-trend', 'hr-survey-trend-areas', 'hr-survey-trend-improve', 'hr-survey-trend-table-toggle', 'hr-survey-trend-export']) has(trendHtml, id);
  assert.match(trendHtml, /Hva må bedres/);
  assert.match(trendHtml, /HMS/);
  assert.match(trendHtml, /under målet og ned fra forrige/);

  // Tiltaksplan: fem trinn, tiltak med ansvar og frist, forslag fra resultatet, og «Virket tiltakene?».
  const planMod = load('screens/hr/HrSurveyPlan.jsx');
  const sp = await import('./surveyPlan.js');
  let plan = sp.toggleStep(sp.emptyPlan(done.id), 'ledelse');
  plan = sp.addAction(plan, { area: 'Arbeidsmengde', text: 'Gå gjennom bemanningen', owner: 'Kari', due: '2020-01-01' });
  const planHtml = renderToStaticMarkup(React.createElement(planMod.default, {
    colors, survey: done, plan, analysis, canWrite: true, onUpdate() {}, onCreateTask: async () => 'id',
  }));
  for (const id of [`hr-survey-plan-${done.id}`, 'hr-survey-plan-steps', 'hr-survey-plan-step-ledelse', 'hr-survey-plan-step-evaluert', 'hr-survey-plan-add', `hr-survey-plan-action-${plan.actions[0].id}`]) has(planHtml, id);
  assert.match(planHtml, /3 av 5 trinn/);
  assert.match(planHtml, /Fristen er passert/);
  assert.match(planHtml, /Gjort ut fra tiltakene/);
  const eff = renderToStaticMarkup(React.createElement(planMod.ActionEffects, {
    colors, previousTitle: 'Medarbeiderundersøkelse 2025',
    effects: sp.actionEffects(plan, [{ area: 'Arbeidsmengde', score: 40 }], [{ area: 'Arbeidsmengde', score: 52 }]),
  }));
  has(eff, 'hr-survey-effects');
  assert.match(eff, /40 → 52/);
  assert.match(eff, /Bedre/);

  // Svarprosent med mål.
  const Meter = load('components/surveys/ResponseMeter.jsx');
  assert.equal(Meter.responseLevel(72).level, 'good');
  assert.equal(Meter.responseLevel(55).level, 'ok');
  assert.equal(Meter.responseLevel(30, { open: false }).level, 'low');
  const meterHtml = renderToStaticMarkup(React.createElement(Meter.default, { colors, pct: 45, count: 9, of: 20, nativeID: 'm' }));
  assert.match(meterHtml, /9 av 20 har svart/);
  assert.match(meterHtml, /Lav svarprosent/);

  // Min side viser svarfristen.
  // Uten åpen undersøkelse vises ingenting på Min side (første rendering, før lasting).
  assert.equal(renderToStaticMarkup(React.createElement(EmployeeSurveyCard, { colors, companyId: 'c1', uid: 'u1' })), '');
  console.log('hr annual render ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
