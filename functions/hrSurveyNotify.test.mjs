/**
 * Varsel og purring for medarbeiderundersøkelsen (notifySurvey i hrSurvey.js):
 * bare ansatte som ikke har svart, åpningsvarsel én gang, purring høyst én gang i døgnet.
 */
import assert from 'node:assert/strict';
import { createMemoryDb } from '../src/helpdesk/memoryDb.js';
import { notifySurvey } from './hrSurvey.js';

const db = createMemoryDb({
  'families/fam1': { type: 'company', name: 'Bygg AS', ownerUid: 'boss', memberIds: ['boss', 'u1', 'u2', 'u3'] },
  'families/fam1/employees/e1': { personUid: 'u1' },
  'families/fam1/employees/e2': { personUid: 'u2' },
  'families/fam1/employees/e3': { personUid: 'u3' },
  'families/fam1/hrSurveys/mu1': { status: 'open', title: 'Medarbeiderundersøkelse 2026', closesOn: '2026-11-20' },
  'families/fam1/hrSurveys/mu0': { status: 'draft', title: 'Utkast' },
  'families/fam1/hrSurveyAnswers/mu1_u2': { surveyId: 'mu1', answers: { trivsel: 4 } },
});
const notes = (uid) => Object.entries(db.dump()).filter(([k]) => k.startsWith(`users/${uid}/notifications/`)).map(([, v]) => v);

const now = new Date('2026-11-02T08:00:00Z');
const first = await notifySurvey(db, { familyId: 'fam1', surveyId: 'mu1', kind: 'open', now });
assert.equal(first.ok, true);
const got = ['boss', 'u1', 'u2', 'u3'].filter((u) => notes(u).length);
assert.ok(got.includes('u1') && got.includes('u3'));
assert.ok(!got.includes('u2'), 'den som har svart, får ikke varsel');
assert.equal(first.notified, got.length);
const n = notes('u1')[0];
assert.equal(n.eventType, 'hrSurvey');
assert.equal(n.familyId, 'fam1');
assert.match(n.body, /Svarfrist 20\.11\.2026/);
assert.match(n.body, /anonymt/);

// Åpningsvarselet sendes bare én gang.
const again = await notifySurvey(db, { familyId: 'fam1', surveyId: 'mu1', kind: 'open', now });
assert.deepEqual(again, { ok: true, notified: 0, already: true });
assert.equal(notes('u1').length, 1);

// Purring: én gang i døgnet.
const r1 = await notifySurvey(db, { familyId: 'fam1', surveyId: 'mu1', kind: 'remind', now: new Date('2026-11-03T08:00:00Z') });
assert.equal(r1.notified, first.notified);
assert.match(notes('u1')[1].title, /^Påminnelse:/);
await assert.rejects(notifySurvey(db, { familyId: 'fam1', surveyId: 'mu1', kind: 'remind', now: new Date('2026-11-03T12:00:00Z') }), /allerede purret/);
assert.equal(db.dump()['families/fam1/hrSurveys/mu1'].reminders, 1);

// Bare åpne undersøkelser.
await assert.rejects(notifySurvey(db, { familyId: 'fam1', surveyId: 'mu0', kind: 'open', now }), /ikke åpen/);
await assert.rejects(notifySurvey(db, { familyId: 'fam1', surveyId: 'nope', kind: 'open', now }), /Fant ikke/);

console.log('hrSurveyNotify.test.mjs OK');
