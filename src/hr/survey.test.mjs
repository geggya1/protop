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
