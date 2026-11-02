/**
 * Tiltaksplan etter medarbeiderundersøkelsen (fem trinn) og maler (arbeidsmiljø, motivasjon, puls).
 */
import assert from 'node:assert/strict';
import {
  PLAN_STEPS, actionEffects, addAction, emptyPlan, normalizeSurveyPlan, planFor, planProgress, removeAction,
  suggestedActions, toggleStep, updateAction, upsertPlan,
} from './surveyPlan.js';
import {
  MOTIVATION_QUESTIONS, SURVEY_TEMPLATES, hrTrendPoints, newSurvey, previousSurvey, surveyKind, surveyResults,
} from './survey.js';
import { emptyHrState, normalizeHrState, patchHrState } from './model.js';

const now = new Date(2026, 10, 2);
let p = emptyPlan('mu1');
assert.equal(planProgress(p, now).done, 0);
assert.equal(planProgress(p, now).current, 'ledelse');

p = toggleStep(p, 'ledelse', now);
assert.equal(p.steps.ledelse, '2026-11-02');
assert.equal(planProgress(p, now).current, 'ansatte');
assert.equal(toggleStep(p, 'ledelse', now).steps.ledelse, undefined, 'av igjen');

// Tiltak: trinn 3 (valgt) og 4 (plan) regnes ut fra tiltakene.
p = addAction(p, { area: 'Arbeidsmengde', text: 'Gå gjennom bemanning før høsten' });
let pr = planProgress(p, now);
assert.equal(pr.steps.find((s) => s.id === 'tiltak').done, true);
assert.equal(pr.steps.find((s) => s.id === 'tiltak').auto, true);
assert.equal(pr.steps.find((s) => s.id === 'plan').done, false);
const id = p.actions[0].id;
p = updateAction(p, id, { owner: 'Kari', due: '2026-10-01', id: 'hack' });
assert.equal(p.actions[0].id, id, 'id endres ikke');
pr = planProgress(p, now);
assert.equal(pr.steps.find((s) => s.id === 'plan').done, true);
assert.equal(pr.overdue, 1, 'fristen er passert');
p = updateAction(p, id, { status: 'done', result: 'Bedre fordeling' });
pr = planProgress(p, now);
assert.equal(pr.overdue, 0);
assert.equal(pr.steps.find((s) => s.id === 'evaluert').done, true);
assert.equal(pr.finished, 1);
assert.equal(removeAction(p, id).actions.length, 0);
assert.equal(updateAction(p, id, { status: 'tull' }).actions[0].status, 'planned');
assert.equal(normalizeSurveyPlan({ steps: {} }), null, 'krever undersøkelse');
assert.deepEqual(Object.keys(normalizeSurveyPlan({ surveyId: 'x', steps: { ledelse: 'i går', ansatte: '2026-01-02', hack: '2026-01-01' } }).steps), ['ansatte']);
assert.equal(PLAN_STEPS.length, 5);

// Lagres i HR-tilstanden.
let hr = patchHrState(emptyHrState(), { surveyPlans: upsertPlan([], p, now) });
assert.equal(normalizeHrState(hr).surveyPlans.length, 1);
assert.equal(planFor(hr.surveyPlans, 'mu1').actions[0].text, 'Gå gjennom bemanning før høsten');
assert.equal(planFor(hr.surveyPlans, 'annen').actions.length, 0);
hr = patchHrState(hr, { surveyPlans: upsertPlan(hr.surveyPlans, { ...p, note: 'x' }, now) });
assert.equal(hr.surveyPlans.length, 1, 'erstattes, ikke dupliseres');

// Forslag fra analysen: svake og middels områder uten tiltak.
const analysis = { areas: [{ area: 'Ledelse', score: 80, level: 'good' }, { area: 'HMS', score: 45, level: 'weak', advice: 'Gå vernerunde.' }, { area: 'Samarbeid', score: 60, level: 'ok', advice: 'Ta det opp.' }] };
assert.deepEqual(suggestedActions(analysis, emptyPlan('x')).map((s) => s.area), ['HMS', 'Samarbeid']);
assert.deepEqual(suggestedActions(analysis, addAction(emptyPlan('x'), { area: 'HMS', text: 't' })).map((s) => s.area), ['Samarbeid']);

// Virket tiltakene?
const eff = actionEffects(addAction(addAction(emptyPlan('a'), { area: 'HMS', text: 'Vernerunde' }), { area: 'Ny', text: 'Noe' }),
  [{ area: 'HMS', score: 45 }], [{ area: 'HMS', score: 58 }]);
assert.deepEqual(eff.map((e) => [e.area, e.before, e.after, e.verdict]), [['HMS', 45, 58, 'bedre'], ['Ny', null, null, 'ukjent']]);
assert.deepEqual(actionEffects(null, [], []), []);

// Maler: motivasjon og mestring har ti faktorer med to utsagn hver, unike id-er.
assert.equal(new Set(MOTIVATION_QUESTIONS.map((q) => q.area)).size, 10);
assert.equal(new Set(MOTIVATION_QUESTIONS.map((q) => q.id)).size, 20);
assert.deepEqual(SURVEY_TEMPLATES.map((t) => t.id), ['arbeidsmiljo', 'motivasjon', 'puls']);
const mot = newSurvey({ templateId: 'motivasjon', year: 2027 });
assert.equal(mot.title, 'Motivasjon og mestring 2027');
assert.equal(surveyKind(mot), 'motivasjon');
assert.equal(surveyKind({ title: 'gammel' }), 'arbeidsmiljo', 'eldre uten mal');
assert.equal(newSurvey({ template: mot }).questions.length, 20, 'som sist beholder malen');
assert.equal(newSurvey({ template: mot }).templateId, 'motivasjon');

// Utvikling og sammenligning bare innen samme slag.
const close = (s, id, at) => ({ ...s, id, status: 'closed', closedAt: at });
const a1 = close(newSurvey({ templateId: 'arbeidsmiljo', year: 2025 }), 'a1', '2025-11-01');
const m1 = close(mot, 'm1', '2026-03-01');
const a2 = close(newSurvey({ templateId: 'arbeidsmiljo', year: 2026 }), 'a2', '2026-11-01');
assert.equal(previousSurvey([a1, m1, a2], a2).id, 'a1', 'hopper over motivasjon');
const five = (s, v) => Array.from({ length: 5 }, () => ({ surveyId: s.id, answers: Object.fromEntries(s.questions.map((q) => [q.id, v])) }));
const byId = { a1: surveyResults(a1, five(a1, 3)), m1: surveyResults(m1, five(m1, 4)), a2: surveyResults(a2, five(a2, 4)) };
assert.deepEqual(hrTrendPoints([a1, m1, a2], byId, 0, 'arbeidsmiljo').map((x) => x.id), ['a1', 'a2']);
assert.deepEqual(hrTrendPoints([a1, m1, a2], byId, 0, 'motivasjon').map((x) => [x.id, x.label]), [['m1', '2027']]);

console.log('surveyPlan.test.mjs OK');
