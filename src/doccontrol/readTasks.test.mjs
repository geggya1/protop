/**
 * Oppgaver om å lese og bekrefte eller fylle ut og signere styrte dokumenter.
 * Nyansatte og nye versjoner gir oppgave. Gamle mangler gir ikke en bølge av oppgaver.
 */
import assert from 'node:assert/strict';
import { ackFor, approveRevision, contentHash, newControl, normalizeSettings, submitRevision } from './model.js';
import { templateSnapshot } from './content.js';
import { libraryForm } from '../forms/ksLibrary.js';
import { defaultReadRule } from './templates.js';
import { DOC_TASK_SOURCE, docReadTask, docTaskId, docTaskPlan, requiredControls } from './readTasks.js';
import { privacyDocState } from '../hr/privacyDoc.js';

const kari = { uid: 'kari', name: 'Kari Leder' };
const settings = normalizeSettings({ approvers: [kari], fourEyes: false });

function published(key, readRule, approvedAt) {
  let control = newControl({ kind: 'template', refId: `ks_${key}`, title: libraryForm(key).title, code: 'X', readRule }, { actor: kari, now: new Date(approvedAt) });
  const snap = templateSnapshot(libraryForm(key));
  control = submitRevision(control, snap, { actor: kari, now: new Date(approvedAt) }).control;
  return approveRevision(control, { actor: kari, settings, isAdmin: true, currentHash: contentHash(snap), now: new Date(approvedAt) }).control;
}

// Malen for personverninformasjon finnes og krever les og bekreft.
const form = libraryForm('personvern-ansatte');
assert.equal(form.title, 'Personverninformasjon til ansatte');
assert.equal(form.doc.docId, 'C1-C-01-005');
assert.equal(defaultReadRule('personvern-ansatte'), 'pakrevd');
assert.ok(form.fields.some((f) => /Datatilsynet/.test(f.label || '')), 'klageretten står i malen');
assert.ok(form.fields.some((f) => f.editor === 'fast' && f.label === 'Kontakt for personvern'), 'bedriften fyller inn kontakt');

const today = '2026-10-30';
const oldDoc = published('personvern-ansatte', 'pakrevd', '2026-01-15T09:00:00Z');
const newDoc = published('taushetserklaering', 'signeres', '2026-10-20T09:00:00Z');
const infoDoc = published('avfallsinstruks', 'info', '2026-10-20T09:00:00Z');
assert.deepEqual(requiredControls([oldDoc, newDoc, infoDoc]).map((c) => c.id), [oldDoc.id, newDoc.id], 'bare påkrevde');

const veteran = { id: 'e1', personUid: 'u1', person: { firstName: 'Ola' }, company: { periodFrom: '2015-01-01' } };
const newbie = { id: 'e2', personUid: 'u2', person: { firstName: 'Nina' }, company: { periodFrom: '2026-10-01' } };
const noAccount = { id: 'e3', person: { firstName: 'Per' }, company: { periodFrom: '2026-10-01' } };

{
  const plan = docTaskPlan([veteran, newbie, noAccount], [oldDoc, newDoc], [], { today });
  const got = plan.create.map(({ control, employee }) => `${control.id}:${employee.id}`).sort();
  // Nyansatt: begge. Veteran: bare den nye versjonen. Uten brukerkonto: ingen.
  assert.deepEqual(got, [`${newDoc.id}:e1`, `${newDoc.id}:e2`, `${oldDoc.id}:e2`].sort());
}

{
  // Bekreftet eller signert: ingen oppgave, og en åpen oppgave lukkes.
  const acks = [ackFor(oldDoc.id, 1, { uid: 'u2', employeeId: 'e2' })];
  const filled = [{ status: 'ferdig', templateId: 'ks_taushetserklaering', subject: { kind: 'employee', id: 'e2' } }];
  const openTasks = [
    { ...docReadTask(oldDoc, newbie, { today }), id: docTaskId(oldDoc.id, 'e2') },
    { ...docReadTask(newDoc, newbie, { today }), id: docTaskId(newDoc.id, 'e2') },
  ];
  const plan = docTaskPlan([newbie], [oldDoc, newDoc], openTasks, { acks, filled, today });
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.close.map((t) => t.id).sort(), openTasks.map((t) => t.id).sort());
}

{
  // Samme versjon: ikke ny oppgave, heller ikke når den er lukket uten bekreftelse.
  const task = { ...docReadTask(newDoc, veteran, { today }), id: docTaskId(newDoc.id, 'e1'), done: true, completedDates: [today] };
  assert.equal(docTaskPlan([veteran], [newDoc], [task], { today }).create.length, 0);
  // Arkivert dokument: åpen oppgave lukkes.
  const openTask = { ...task, done: false, completedDates: [] };
  assert.equal(docTaskPlan([veteran], [{ ...newDoc, archived: true }], [openTask], { today }).close.length, 1);
  // Personen er ikke i listen (ikke ferdig lastet): oppgaven står.
  assert.equal(docTaskPlan([], [{ ...newDoc, archived: true }], [openTask], { today }).close.length, 0);
}

{
  const task = docReadTask(oldDoc, newbie, { uid: 'kari', today });
  assert.equal(task.title, 'Les og bekreft: Personverninformasjon til ansatte');
  assert.match(task.description, /Min side › Dokumenter å lese/);
  assert.match(task.description, /Jeg har lest og forstått/);
  assert.equal(task.assignedTo, 'u2');
  assert.equal(task.deadline, '2026-11-13');
  assert.equal(task.source, DOC_TASK_SOURCE);
  assert.equal(task.revision, 1);
  assert.match(docReadTask(newDoc, newbie, { today }).title, /^Fyll ut og signer: Taushetserklæring/);
}

{
  // Personverninformasjonen i Lovpålagt følger bekreftelsen når dokumentet er godkjent.
  const people = [veteran, newbie, noAccount];
  assert.equal(privacyDocState([], [], people).state, 'none');
  const draft = newControl({ kind: 'template', refId: 'ks_personvern-ansatte', title: 'P', readRule: 'pakrevd' }, { actor: kari });
  assert.equal(privacyDocState([draft], [], people).state, 'draft');
  assert.equal(privacyDocState([draft], [], people).published, false);
  const state = privacyDocState([oldDoc], [ackFor(oldDoc.id, 1, { uid: 'u1', employeeId: 'e1' })], people);
  assert.equal(state.state, 'published');
  assert.deepEqual(state.acked, ['e1']);
  assert.deepEqual(state.manual, ['e3'], 'uten brukerkonto krysses av for hånd');
  assert.equal(state.revision, 1);
}

console.log('readTasks.test.mjs: ok');
