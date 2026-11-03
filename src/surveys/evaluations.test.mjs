/**
 * Evalueringer (prosjekt og tilbud) og maler: modell, kopi av svaret på e-post, at evalueringen
 * avsluttes når alle har svart, og at Prosjekt-tilgang bare gir evalueringene.
 */
import assert from 'node:assert/strict';
import { createMemoryDb } from '../helpdesk/memoryDb.js';
import {
  BUILTIN_TEMPLATES, answerCopyRows, customerTrendPoints, evaluationAverage, evaluationReferenceText, evaluationsFor, linkLabel, maskEmail,
  newCustomerSurvey, newEvaluation, normalizeCustomerSurvey, normalizeSurveyTemplate, templateList,
} from './customerSurvey.js';
import { answerCopyMail, customerSurveyMail } from './customerMail.js';
import { handleCustomerSurvey } from './customerService.js';

// ------------------------------------------------------------ modell
{
  const project = BUILTIN_TEMPLATES.find((t) => t.id === 'std_prosjekt');
  const e = newEvaluation({
    template: project,
    link: { type: 'project', id: 'p1', name: 'Skole Sola', number: '1042' },
    unit: { id: 'avd_bygg', name: 'Bygg' },
    uid: 'u1',
    now: new Date('2026-11-03T10:00:00Z'),
  });
  assert.equal(e.kind, 'project');
  assert.equal(e.title, 'Prosjektevaluering: 1042 Skole Sola');
  assert.equal(e.templateId, 'std_prosjekt');
  assert.equal(e.questions.length, project.questions.length);
  assert.equal(linkLabel(e), 'Prosjekt 1042 Skole Sola · Bygg');

  const bid = newEvaluation({ template: project, link: { type: 'bid', id: 'b1', name: 'Rammeavtale vei' } });
  assert.equal(bid.kind, 'bid', 'koblingen til tilbud bestemmer typen');
  const company = newEvaluation({ template: BUILTIN_TEMPLATES[0], link: { type: 'company', id: 'skal-bort', name: 'x' } });
  assert.equal(company.kind, 'project', 'kundeundersøkelsesmal brukt som evaluering blir prosjektevaluering');
  assert.equal(company.link.id, '');
  assert.equal(company.title, 'Prosjektevaluering');
  assert.equal(linkLabel(company), 'Selskapet');

  // Eldre undersøkelser uten kind er kundeundersøkelser.
  assert.equal(normalizeCustomerSurvey({ title: 'Gammel' }).kind, 'customer');
  assert.equal(normalizeCustomerSurvey({ kind: 'tull' }).kind, 'customer');

  const list = templateList([{ id: 'mal_1', name: 'Ettårsbefaring', kind: 'project', questions: [{ id: 'a', type: 'scale', text: 'Hvordan?' }] }, { id: 'std_kunde', builtin: true }]);
  assert.deepEqual(list.map((t) => t.id), ['std_kunde', 'std_prosjekt', 'std_tilbud', 'mal_1']);
  assert.equal(normalizeSurveyTemplate({ kind: 'bid' }).name, 'Tilbudsevaluering');

  // Utviklingen over tid gjelder bare kundeundersøkelsen.
  const closed = (kind, index) => ({ ...newCustomerSurvey(), kind, status: 'closed', closedAt: '2026-01-01', summary: { ready: true, count: 2, index, nps: 10, areas: [] } });
  assert.equal(customerTrendPoints([closed('customer', 70), closed('project', 40)]).length, 1);
  const evals = [closed('project', 80), closed('bid', 60), closed('customer', 10), { ...closed('project', 50), link: { type: 'project', id: 'p2' } }];
  assert.equal(evaluationsFor(evals).length, 3);
  assert.equal(evaluationsFor(evals, { kind: 'bid' }).length, 1);
  assert.equal(evaluationsFor(evals, { linkId: 'p2' }).length, 1);
  assert.deepEqual(evaluationAverage(evaluationsFor(evals)), { count: 3, index: 63, nps: 10 });
  assert.equal(
    evaluationReferenceText(evaluationsFor(evals), 'Bygg AS'),
    'Bygg AS evaluerer prosjektene sammen med kunden etter overlevering. 3 evalueringer i 2026 med 6 svar gir en tilfredshet på 63 av 100 og NPS 10.',
  );
  assert.equal(evaluationReferenceText([]), '');

  const rows = answerCopyRows(
    { ...e, companyName: 'Bygg AS' },
    { answers: { nps: 9, resultat: 4 }, texts: { bra: 'Ryddig byggeplass' } },
  );
  assert.equal(rows[0].question, 'Hvor sannsynlig er det at du vil anbefale Bygg AS til andre?');
  assert.equal(rows[0].answer, '9 av 10');
  assert.equal(rows[1].answer, '4 av 5 (fornøyd)');
  assert.equal(rows[2].answer, 'Ikke besvart');
  assert.equal(rows.find((r) => r.question === 'Hva fungerte best i prosjektet?').answer, 'Ryddig byggeplass');

  assert.equal(maskEmail('Per@Novaform.no'), 'p***@novaform.no');
  assert.equal(maskEmail('ugyldig'), '');

  const copy = answerCopyMail({ survey: { ...e, companyName: 'Bygg AS' }, recipient: { name: 'Per Hansen' }, rows, submittedAt: new Date('2026-11-03T10:00:00Z') });
  assert.match(copy.subject, /^Kopi av svaret ditt: Prosjektevaluering/);
  assert.match(copy.text, /^Hei Per,/);
  assert.match(copy.text, /1\. Hvor sannsynlig.*\n {3}9 av 10/);
  assert.match(copy.html, /Ryddig byggeplass/);
  assert.doesNotMatch(copy.html, /<script/);

  const invite = customerSurveyMail({ survey: { ...e, companyName: 'Bygg AS' }, recipient: { name: 'Per' }, url: 'https://protop.no/svar/x' });
  assert.match(invite.text, /Takk for samarbeidet om Skole Sola/);
}

// ------------------------------------------------------------ serveren
function setup({ failCopy = { on: false } } = {}) {
  const db = createMemoryDb();
  const outbox = [];
  let n = 0;
  const deps = {
    db,
    now: () => new Date('2026-11-03T10:00:00Z'),
    sendMail: async (m) => {
      if (failCopy.on && /^Kopi/.test(m.subject)) throw new Error('E-post er nede.');
      outbox.push(m);
    },
    // Full tilgang til Kunder.
    assertAccess: async () => {},
    companyName: async () => 'Bygg AS',
    newToken: () => `tok_${String(n += 1).padStart(24, '0')}`,
    hashToken: async (t) => `h_${t}`,
  };
  const auth = { uid: 'leder', token: { name: 'Kari Leder' } };
  const call = (action, data = {}, who = auth) => handleCustomerSurvey({ familyId: 'fam_1', ...data, action }, who, deps);
  const tokenOf = (m) => (m.text.match(/svar\/([A-Za-z0-9_-]+)/) || [])[1];
  return { db, outbox, call, tokenOf };
}

const code = (p) => p.then(() => 'ok', (e) => e.code);

// Maler: lage, liste, endre, slette. Innebygde kan ikke overskrives.
{
  const { call } = setup();
  const { template } = await call('saveTemplate', {
    template: { name: 'Ettårsbefaring', kind: 'project', intro: 'Ett år etter overlevering.', questions: [{ id: 'feil', type: 'scale', area: 'Kvalitet', text: 'Har bygget fungert som det skal?' }] },
  });
  assert.match(template.id, /^mal_2026_/);
  let { templates } = await call('templates');
  assert.deepEqual(templates.map((t) => t.name).slice(-1), ['Ettårsbefaring']);
  assert.equal(templates.filter((t) => t.builtin).length, 3);
  await call('saveTemplate', { template: { ...template, name: 'Ettårsbefaring (bolig)' } });
  ({ templates } = await call('templates'));
  assert.equal(templates.filter((t) => !t.builtin).length, 1);
  assert.equal(templates.at(-1).name, 'Ettårsbefaring (bolig)');
  // En innebygd mal som sendes inn, lagres som en ny egen mal.
  const copy = await call('saveTemplate', { template: { ...BUILTIN_TEMPLATES[1], name: 'Vår prosjektmal' } });
  assert.notEqual(copy.template.id, 'std_prosjekt');
  assert.equal(await code(call('saveTemplate', { template: { name: 'Tom', questions: [] } })), 'invalid-argument');
  await call('deleteTemplate', { templateId: template.id });
  ({ templates } = await call('templates'));
  assert.equal(templates.filter((t) => !t.builtin).length, 1);
  assert.equal(await code(call('deleteTemplate', { templateId: 'std_prosjekt' })), 'not-found');
}

// Prosjektevaluering: send, svar med kopi på e-post, avsluttes når alle har svart.
{
  const { db, outbox, call, tokenOf } = setup();
  const draft = newEvaluation({
    template: BUILTIN_TEMPLATES[1],
    link: { type: 'project', id: 'p1', name: 'Skole Sola', number: '1042' },
    unit: { id: 'avd_bygg', name: 'Bygg' },
  });
  const { survey } = await call('save', { survey: draft });
  assert.equal(survey.kind, 'project');
  assert.equal(survey.link.id, 'p1');
  // Typen kan ikke endres etterpå.
  const again = await call('save', { survey: { ...survey, kind: 'customer' } });
  assert.equal(again.survey.kind, 'project');

  await call('addRecipients', { surveyId: survey.id, recipients: [{ name: 'Per Hansen', email: 'per@novaform.no' }, { name: 'Lise Berg', email: 'lise@sola.no' }] });
  await call('send', { surveyId: survey.id });
  assert.equal(outbox.length, 2);
  assert.match(outbox[0].text, /Takk for samarbeidet om Skole Sola/);

  const per = tokenOf(outbox.find((m) => m.to === 'per@novaform.no'));
  const opened = await call('open', { token: per }, null);
  assert.equal(opened.copyTo, 'p***@novaform.no');
  assert.equal(opened.survey.kind, 'project');
  assert.deepEqual(opened.survey.link, { type: 'project', name: 'Skole Sola', number: '1042' }, 'ingen id-er til kunden');

  const r1 = await call('submit', { token: per, values: { nps: 9, resultat: 5 }, texts: { bra: 'God dialog' } }, null);
  assert.equal(r1.copySent, true);
  const copyMail = outbox.at(-1);
  assert.equal(copyMail.to, 'per@novaform.no');
  assert.match(copyMail.subject, /^Kopi av svaret ditt/);
  assert.match(copyMail.text, /God dialog/);
  assert.equal(copyMail.replyTo, undefined);
  let list = (await call('list')).surveys;
  assert.equal(list[0].status, 'open', 'åpen til alle har svart');

  // Uten kopi: ingen e-post. Siste svar avslutter evalueringen med sammendrag.
  const before = outbox.length;
  const lise = tokenOf(outbox.find((m) => m.to === 'lise@sola.no'));
  const r2 = await call('submit', { token: lise, values: { nps: 7, resultat: 3 }, copy: false }, null);
  assert.equal(r2.copySent, false);
  assert.equal(outbox.length, before);
  list = (await call('list')).surveys;
  assert.equal(list[0].status, 'closed');
  assert.equal(list[0].summary.ready, true);
  assert.equal(list[0].summary.count, 2);
  assert.ok(Object.keys(db.dump()).length);
}

// Kundeundersøkelsen avsluttes ikke av seg selv, og kopi som ikke kan sendes, stopper ikke svaret.
{
  const { outbox, call, tokenOf } = setup();
  const { survey } = await call('save', { survey: newCustomerSurvey() });
  await call('addRecipients', { surveyId: survey.id, recipients: [{ email: 'a@kunde.no' }] });
  await call('send', { surveyId: survey.id });
  const t = tokenOf(outbox[0]);
  const res = await call('submit', { token: t, values: { nps: 10 } }, null);
  assert.equal(res.copySent, true);
  const list = (await call('list')).surveys;
  assert.equal(list[0].status, 'open');
}
{
  const failCopy = { on: false };
  const { outbox, call, tokenOf } = setup({ failCopy });
  const { survey } = await call('save', { survey: newEvaluation({ link: { type: 'company' } }) });
  await call('addRecipients', { surveyId: survey.id, recipients: [{ email: 'a@kunde.no' }] });
  await call('send', { surveyId: survey.id });
  const t = tokenOf(outbox[0]);
  failCopy.on = true;
  const res = await call('submit', { token: t, values: { nps: 10 } }, null);
  assert.equal(res.copySent, false, 'kopien feilet');
  const [done] = (await call('list')).surveys;
  assert.equal(done.summary.count, 1, 'svaret er lagret');
  assert.equal(done.status, 'closed');
}

// Prosjekt-tilgang uten Kunder: bare evalueringene, ingen maler å endre.
{
  const full = setup();
  // Samme database, men brukeren har bare Prosjekt.
  const db = full.db;
  const asProject = (action, data = {}) => handleCustomerSurvey({ familyId: 'fam_1', ...data, action }, { uid: 'ansatt' }, {
    db,
    assertAccess: async (f, u, m, resource = 'customers') => {
      if (resource !== 'projects') { const e = new Error('nei'); e.code = 'permission-denied'; throw e; }
    },
  });
  const { survey: kunde } = await full.call('save', { survey: newCustomerSurvey() });
  const { survey: evalu } = await asProject('save', { survey: newEvaluation({ link: { type: 'project', id: 'p1', name: 'Skole' } }) });
  assert.equal(evalu.kind, 'project');
  const seen = (await asProject('list')).surveys.map((s) => s.id);
  assert.deepEqual(seen, [evalu.id]);
  assert.equal(await code(asProject('results', { surveyId: kunde.id })), 'not-found');
  assert.equal(await code(asProject('save', { survey: newCustomerSurvey() })), 'permission-denied');
  assert.equal(await code(asProject('save', { survey: { ...kunde, title: 'Kapret' } })), 'not-found');
  assert.equal((await asProject('templates')).templates.length, 3);
  assert.equal(await code(asProject('saveTemplate', { template: BUILTIN_TEMPLATES[1] })), 'permission-denied');
  // Uten noen av delene: ingen tilgang.
  const none = (action) => handleCustomerSurvey({ familyId: 'fam_1', action }, { uid: 'x' }, { db });
  assert.equal(await code(none('list')), 'permission-denied');
}

console.log('evaluations.test.mjs OK');
