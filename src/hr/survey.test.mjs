/**
 * Anonym medarbeiderundersøkelse: svar uten bruker-id, resultater først når den er avsluttet
 * og minst fem har svart, og ingen gjenåpning.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_SURVEY_QUESTIONS, SURVEY_MIN_ANSWERS, newSurvey, participation, receiptId,
  surveyAnswerDoc, surveyEditable, surveyResults, surveyTransition,
} from './survey.js';

const now = new Date(2026, 8, 1);
let s = newSurvey({ year: 2026, uid: 'hr', now });
assert.equal(s.status, 'draft');
assert.equal(s.title, 'Medarbeiderundersøkelse 2026');
assert.equal(s.questions.length, DEFAULT_SURVEY_QUESTIONS.length);
assert.ok(surveyEditable(s));

// Utkast tar ikke imot svar.
assert.equal(surveyAnswerDoc(s, { trivsel: 4 }), null);

s = surveyTransition(s, 'open', { now });
assert.equal(s.status, 'open');
assert.equal(surveyEditable(s), false);

// Svaret har bare verdier og kommentar: ingen bruker-id eller tid.
const answer = surveyAnswerDoc(s, { trivsel: 4, arbeidsmengde: 9, ukjent: 3, leder: '2' }, '  Bra sted  ');
assert.deepEqual(Object.keys(answer).sort(), ['answers', 'comment', 'surveyId']);
assert.deepEqual(answer.answers, { trivsel: 4, leder: 2 });
assert.equal(answer.comment, 'Bra sted');
assert.equal(surveyAnswerDoc(s, {}), null, 'minst ett svar');
assert.equal(receiptId(s.id, 'u1'), `${s.id}_u1`);

// Mens den er åpen: bare antall.
const answers = [5, 4, 4, 3, 5].map((v, i) => ({ surveyId: s.id, answers: { trivsel: v, trakassering: i === 0 ? 4 : 1 }, comment: i ? '' : 'Mer opplæring' }));
let r = surveyResults(s, answers);
assert.equal(r.ready, false);
assert.equal(r.count, 5);
assert.deepEqual(r.questions, []);

// Avsluttet med fem svar: tall. Trakassering er snudd (høyt er dårlig).
s = surveyTransition(s, 'closed', { now });
r = surveyResults(s, answers);
assert.equal(r.ready, true);
const trivsel = r.questions.find((q) => q.id === 'trivsel');
assert.equal(trivsel.avg, 4.2);
assert.equal(trivsel.score, 80);
assert.deepEqual(trivsel.dist, [0, 0, 1, 2, 2]);
const trak = r.questions.find((q) => q.id === 'trakassering');
assert.equal(trak.avg, 1.6);
assert.equal(trak.score, 85);
// Spørsmål ingen har svart på: ingen tall.
assert.equal(r.questions.find((q) => q.id === 'leder').avg, null);
assert.deepEqual(r.comments, ['Mer opplæring']);
assert.ok(r.areas.length >= 2);

// Færre enn fem: ingen tall, heller ikke etter avslutning.
assert.equal(surveyResults(s, answers.slice(0, SURVEY_MIN_ANSWERS - 1)).ready, false);

// Avsluttet er endelig.
assert.equal(surveyTransition(s, 'open').status, 'closed');
assert.equal(surveyAnswerDoc(s, { trivsel: 4 }), null);

assert.deepEqual(participation(5, 10), { count: 5, invited: 10, pct: 50 });
assert.deepEqual(participation(3, 0), { count: 3, invited: 0, pct: null });

console.log('survey ok');

// Analyse: fordeling i god retning, indeks, styrker/forbedringsområder, trakassering og utvikling.
{
  const { likertShares, surveyAnalysis, previousSurvey, surveyActionDraft } = await import('./survey.js');
  assert.deepEqual(likertShares([1, 1, 2, 3, 3]), { shares: [10, 10, 20, 30, 30], negative: 20, neutral: 20, positive: 60 });
  // Snudd: «helt enig» i at en har opplevd trakassering er svært negativt.
  assert.equal(likertShares([8, 1, 1, 0, 0], true).positive, 90);

  const make = (id, closedAt, vals) => {
    const sv = { ...surveyTransition(surveyTransition(newSurvey({ year: 2026, now }), 'open', { now }), 'closed', { now }), id, closedAt };
    const ans = vals.map((v, i) => ({ surveyId: id, answers: { trivsel: v, arbeidsmengde: 6 - v, trakassering: i === 0 ? 4 : 1 }, comment: '' }));
    return { sv, res: surveyResults(sv, ans) };
  };
  const before = make('a', '2025-09-30', [3, 3, 4, 3, 3]);
  const nowR = make('b', '2026-09-30', [5, 4, 4, 5, 4]);
  assert.equal(previousSurvey([before.sv, nowR.sv], nowR.sv).id, 'a');
  assert.equal(previousSurvey([nowR.sv], nowR.sv), null);
  const an = surveyAnalysis(nowR.res, before.res);
  assert.equal(an.hasPrevious, true);
  assert.ok(an.index > 0 && an.index <= 100);
  const trivsel = an.areas.find((a) => a.area === 'Trivsel');
  assert.equal(trivsel.delta, trivsel.score - before.res.areas.find((a) => a.area === 'Trivsel').score);
  assert.equal(an.strengths[0].id, 'trivsel');
  assert.equal(an.improvements[0].id, 'arbeidsmengde');
  assert.deepEqual(an.harassment, { count: 1, of: 5 });
  const weak = an.areas.find((a) => a.area === 'Arbeidsmengde');
  assert.equal(weak.level, 'weak');
  assert.ok(weak.advice);
  const draft = surveyActionDraft(nowR.sv, weak, { today: new Date(2026, 9, 1) });
  assert.match(draft.title, /^Tiltak etter medarbeiderundersøkelse 2026: arbeidsmengde/);
  assert.equal(draft.deadline, '2026-11-01');
  assert.equal(draft.source, 'hr-survey');
  // Ikke klar: ingen analyse.
  assert.equal(surveyAnalysis({ ready: false }), null);
  console.log('survey analysis ok');
}

// Snudde spørsmål står ikke blant styrker eller forbedringsområder, og området forklares.
{
  const { surveyAnalysis } = await import('./survey.js');
  const sv = surveyTransition(surveyTransition(newSurvey({ year: 2026, now }), 'open', { now }), 'closed', { now });
  const ans = [5, 4, 4, 5, 4].map((v) => ({ surveyId: sv.id, answers: { trivsel: v, trakassering: 1 }, comment: '' }));
  const an = surveyAnalysis(surveyResults(sv, ans));
  assert.equal(an.strengths.some((q) => q.reverse), false);
  assert.equal(an.areas.find((a) => a.area === 'Trakassering').note, '100 = ingen har opplevd det');
  assert.equal(an.areas.find((a) => a.area === 'Trivsel').note, '');
  console.log('survey reverse ok');
}
