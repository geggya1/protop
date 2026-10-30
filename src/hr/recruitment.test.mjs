import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeApplication, normalizeHrState } from './model.js';
import {
  PIPELINE_COLUMNS,
  addApplicationComment,
  applicationFromRead,
  applicationsByColumn,
  applyReadToApplication,
  assignApplication,
  criteriaAverages,
  filterApplications,
  historyLine,
  markResponseSent,
  moveApplicationStage,
  myScorecard,
  recruitmentOverview,
  responseTemplate,
  saveScorecard,
  sortApplications,
} from './recruitment.js';
import {
  applicationPrompt, cleanPhone, contactFromText, nameFromFilename, sanitizeApplicationRead,
} from './applicationRead.js';
import { storageSafeName } from './applicationImport.js';
import { applicationClosed } from './retention.js';

const now = new Date('2026-10-30T10:00:00Z');
const ola = { uid: 'u1', name: 'Ola HR' };
const kari = { uid: 'u2', name: 'Kari Leder' };

// Stegene: fem aktive kolonner og én for avsluttede.
assert.deepEqual(PIPELINE_COLUMNS.map((col) => col.id), ['new', 'screening', 'interview', 'references', 'offer', 'closed']);

// Ny søknad fra AI-lesingen: kontaktinfo, profil, vurdering, ansvarlig og historikk.
const read = {
  candidate: { name: 'Ada Nordmann', email: 'Ada@Example.no', phone: '912 34 567', location: 'Bergen' },
  profile: { headline: 'Byggingeniør', skills: ['BIM', 'Revit'], yearsExperience: 6 },
  assessment: { match: 7.5, strengths: ['6 års erfaring'], gaps: ['Mangler sertifikat'], summary: 'God match.' },
};
const app = applicationFromRead(read, {
  jobId: 'job1', actor: ola, engine: 'ocr+gemini', now,
  attachment: { name: 'cv.pdf', url: 'https://x/cv.pdf' },
});
assert.equal(app.stage, 'new');
assert.equal(app.board, 'received');
assert.equal(app.email, 'ada@example.no');
assert.equal(app.ownerUid, 'u1');
assert.equal(app.ownerName, 'Ola HR');
assert.equal(app.profile.headline, 'Byggingeniør');
assert.equal(app.ai.match, 7.5);
assert.equal(app.attachments.length, 1);
assert.equal(app.history[0].action, 'created');
assert.match(historyLine(app.history[0]), /OCR\/AI/);

// Flytt gjennom stegene. Avslag krever begrunnelse.
const screening = moveApplicationStage(app, 'screening', { actor: kari, now });
assert.equal(screening.ok, true);
assert.equal(screening.app.board, 'processing');
assert.equal(screening.app.history.at(-1).from, 'new');
assert.equal(screening.app.history.at(-1).byName, 'Kari Leder');
const noReason = moveApplicationStage(screening.app, 'rejected', { actor: kari, now });
assert.equal(noReason.ok, false);
assert.equal(noReason.needsReason, true);
const rejected = moveApplicationStage(screening.app, 'rejected', { actor: kari, reason: 'Annen kandidat', now });
assert.equal(rejected.ok, true);
assert.equal(rejected.app.board, 'completed');
assert.equal(rejected.app.outcome, 'rejected');
assert.equal(rejected.app.closedAt, '2026-10-30');
assert.equal(rejected.app.rejectReason, 'Annen kandidat');
assert.equal(applicationClosed(rejected.app), true, 'avslag slettes etter lagringstiden');
const withdrawn = moveApplicationStage(screening.app, 'withdrawn', { reason: 'Fikk annen jobb', now }).app;
assert.equal(applicationClosed(withdrawn), true, 'trukket følger samme lagringstid');
// Gjenåpne nullstiller avgjørelsesdatoen.
const reopened = moveApplicationStage(rejected.app, 'screening', { now }).app;
assert.equal(reopened.closedAt, '');
assert.equal(applicationClosed(reopened), false);

// Tilbud setter sendt-dato.
const offer = moveApplicationStage(screening.app, 'offer', { now }).app;
assert.equal(offer.offerSentAt, '2026-10-30');
assert.equal(offer.board, 'processing');

// Ansvarlig logges.
const assigned = assignApplication(app, kari, { actor: ola, now });
assert.equal(assigned.ownerName, 'Kari Leder');
assert.equal(assigned.history.at(-1).action, 'owner');
assert.equal(assignApplication(assigned, null, { now }).ownerUid, '');

// Scorekort per vurderer. Scoren er snittet (1–5) ganget med to.
let scored = saveScorecard(app, { ratings: { competence: 4, experience: 5 }, recommendation: 'yes' }, { actor: ola, now });
scored = saveScorecard(scored, { ratings: { competence: 2, fit: 3 }, comment: 'Usikker' }, { actor: kari, now });
assert.equal(scored.scorecards.length, 2);
assert.equal(scored.score, 7);
scored = saveScorecard(scored, { ratings: { competence: 5, experience: 5 } }, { actor: ola, now });
assert.equal(scored.scorecards.length, 2, 'samme vurderer erstatter sitt kort');
assert.deepEqual(myScorecard(scored, ola).ratings, { competence: 5, experience: 5 });
assert.equal(criteriaAverages(scored.scorecards).find((row) => row.id === 'competence').avg, 3.5);
assert.equal(scored.history.filter((row) => row.action === 'score').length, 2);

// Interne notater.
const noted = addApplicationComment(app, '  Ring referanse  ', { actor: kari, now });
assert.equal(noted.comments.length, 1);
assert.equal(noted.comments[0].text, 'Ring referanse');
assert.equal(addApplicationComment(noted, '   ', { actor: kari, now }).comments.length, 1);

// Svar til søker.
const tpl = responseTemplate('interview', {
  app: { ...app, interviewDate: '2026-11-03', interviewTime: '10:00', interviewPlace: 'Kontoret' },
  job: { title: 'Prosjektleder' },
  company: 'Consult1 AS',
  sender: 'Ola HR',
});
assert.match(tpl.subject, /Prosjektleder/);
assert.match(tpl.body, /^Hei Ada,/);
assert.match(tpl.body, /03\.11\.2026 kl\. 10:00, Kontoret/);
const sent = markResponseSent(rejected.app, 'reject', { actor: ola, now });
assert.equal(sent.respondedAt, '2026-10-30');
assert.equal(markResponseSent(app, 'ack', { now }).acknowledgedAt, '2026-10-30');

// AI-lesing på eksisterende søknad beholder utfylte felt.
const manual = normalizeApplication({ name: 'Søker', email: 'fast@x.no' });
const merged = applyReadToApplication(manual, read, { engine: 'gemini', now });
assert.equal(merged.name, 'Ada Nordmann');
assert.equal(merged.email, 'fast@x.no');
assert.equal(merged.ai.engine, 'gemini');

// Filter, sortering, kolonner og nøkkeltall.
const list = [
  normalizeApplication({ ...app, id: 'a', appliedAt: '2026-10-01', ownerUid: '', history: [] }),
  normalizeApplication({ ...scored, id: 'b', appliedAt: '2026-10-20' }),
  normalizeApplication({ ...rejected.app, id: 'c' }),
];
assert.deepEqual(filterApplications(list, { owner: 'none' }).map((row) => row.id), ['a']);
assert.deepEqual(filterApplications(list, { owner: 'mine', uid: 'u1' }).map((row) => row.id), ['b', 'c']);
assert.deepEqual(filterApplications(list, { showClosed: false }).map((row) => row.id), ['a', 'b']);
assert.deepEqual(filterApplications(list, { query: 'revit' }).map((row) => row.id), ['a', 'b', 'c']);
assert.equal(sortApplications(list, 'score')[0].id, 'b');
const cols = applicationsByColumn(list);
assert.equal(cols.new.length, 2);
assert.equal(cols.closed.length, 1);
const kpi = recruitmentOverview(list, now);
assert.equal(kpi.active, 2);
assert.equal(kpi.closedNo, 1);
assert.equal(kpi.unassigned, 1);
assert.equal(kpi.unanswered, 1);
assert.equal(kpi.idle, 1, 'a har stått i Mottatt siden 1. oktober');

// Lagring: nye felt overlever normaliseringen av hele HR-tilstanden.
const state = normalizeHrState({ applications: [scored, noted, offer] });
assert.equal(state.applications[0].scorecards.length, 2);
assert.equal(state.applications[1].comments.length, 1);
assert.equal(state.applications[2].stage, 'offer');

// Eldre søknader: kolonne uten steg, og «ferdig, venter på utfall».
assert.equal(normalizeApplication({ board: 'processing' }).stage, 'screening');
assert.equal(normalizeApplication({ board: 'completed', outcome: 'pending' }).stage, 'offer');
assert.equal(normalizeApplication({ board: 'completed', outcome: 'rejected' }).stage, 'rejected');

// OCR/AI-svaret renses. E-post og telefon hentes fra teksten når modellen ikke fant dem.
const clean = sanitizeApplicationRead({
  name: '  Per  Hansen ', match: '8,5', skills: ['Excel', 'excel', 'SAP'], yearsExperience: '12 år',
  strengths: 'God erfaring\nLedererfaring',
}, 'Per Hansen\nE-post: per@firma.no\nTelefon: +47 412 34 567\nFødselsnummer: 01019012345');
assert.equal(clean.candidate.name, 'Per Hansen');
assert.equal(clean.candidate.email, 'per@firma.no');
assert.equal(clean.candidate.phone, '+47 412 34 567');
assert.equal(clean.assessment.match, 8.5);
assert.deepEqual(clean.profile.skills, ['Excel', 'SAP']);
assert.equal(clean.profile.yearsExperience, 12);
assert.deepEqual(clean.assessment.strengths, ['God erfaring', 'Ledererfaring']);
assert.equal(sanitizeApplicationRead({ match: null }).assessment.match, null);
assert.equal(cleanPhone('01019012345'), '', 'fødselsnummer er ikke telefon');
assert.equal(contactFromText('Navn: Kari Nordmann\nkari@x.no').name, 'Kari Nordmann');
assert.equal(nameFromFilename('CV_-_Kari_Nordmann.pdf'), 'Kari Nordmann');
assert.match(applicationPrompt({ title: 'Elektriker', requirements: 'Fagbrev' }), /Stilling: Elektriker[\s\S]*Fagbrev/);
assert.match(applicationPrompt({}), /match er null/);
assert.match(applicationPrompt({}), /Ikke ta med fødselsnummer/);
assert.equal(storageSafeName('Søknad Åse Ødegård (1).pdf'), 'Soknad_Ase_odegard_1_.pdf');

// Skjermen: ekte dra-og-slipp på DOM-noden, filer inn i kolonner og OCR/AI-lesing.
const board = readFileSync(new URL('../../screens/hr/RecruitmentBoard.jsx', import.meta.url), 'utf8');
assert.match(board, /addEventListener\('dragstart'/);
assert.match(board, /addEventListener\('drop'/);
assert.match(board, /dataTransfer\?\.files/);
const screen = readFileSync(new URL('../../screens/hr/HrRecruitment.jsx', import.meta.url), 'utf8');
assert.match(screen, /readApplicationFile\(/);
assert.match(screen, /FileDropZone/);
assert.doesNotMatch(screen, /title="Rekruttering"/, 'skallet viser sidetittelen');


// ---- Runde 2: analyse, referanser, intervjusett, AI-kontroll, avslutning, kalender, CSV, talentbank.
{
  const {
    addReference, applicantsCsv, bccMailtoHref, closeRecruitment, copyApplicationToJob, deadlineDays,
    interviewIcs, markAiReviewed, otherApplications, recruitmentAnalytics, removeReference, updateReference,
  } = await import('./recruitment.js');
  const { jobCriteria, normalizeJob, RECRUITMENT_CRITERIA } = await import('./model.js');
  const t = new Date('2026-10-30T10:00:00Z');

  // Egne kriterier og spørsmål på stillingen. Id-ene er stabile og trygge som nøkler.
  const job = normalizeJob({
    id: 'j1', title: 'PL', publishedAt: '2026-09-01', closesAt: '2026-11-02',
    criteria: 'Prosjektledelse\nHMS-forståelse\nprosjektledelse', questions: [{ id: 'spm-a', label: 'Fortell om et prosjekt' }],
  });
  assert.deepEqual(job.criteria.map((c) => c.id), ['krit-prosjektledelse', 'krit-hms-forstaelse'], 'duplikat fjernet, æøå i id');
  assert.equal(job.questions[0].id, 'spm-a');
  assert.equal(jobCriteria(job), job.criteria);
  assert.equal(jobCriteria({}), RECRUITMENT_CRITERIA);
  assert.equal(deadlineDays(job, t), 3);
  const scoredCustom = saveScorecard(app, { ratings: { 'krit-prosjektledelse': 5, 'bad key!': 4 } }, { actor: ola, now: t });
  assert.deepEqual(scoredCustom.scorecards[0].ratings, { 'krit-prosjektledelse': 5 }, 'ugyldige nøkler fjernes');
  assert.equal(criteriaAverages(scoredCustom.scorecards, job.criteria)[0].avg, 5);
  assert.equal(normalizeApplication({ interviewNotes: { 'spm-a': ' Godt svar ', '<x>': 'nei' } }).interviewNotes['spm-a'], 'Godt svar');

  // Referanser: oppgitt av søkeren som standard, logges i historikken.
  let withRef = addReference(app, { name: ' Per Leder ', relation: 'Leder', phone: '99887766' }, { actor: kari, now: t });
  assert.equal(withRef.references[0].name, 'Per Leder');
  assert.equal(withRef.references[0].givenByApplicant, true);
  assert.equal(withRef.references[0].byName, 'Kari Leder');
  assert.equal(withRef.history.at(-1).action, 'reference');
  assert.equal(addReference(app, { name: '  ' }).references.length, 0);
  withRef = updateReference(withRef, withRef.references[0].id, { contactedAt: '2026-10-30' });
  assert.equal(withRef.references[0].contactedAt, '2026-10-30');
  assert.equal(removeReference(withRef, withRef.references[0].id).references.length, 0);

  // Et menneske kontrollerer AI-lesingen.
  const reviewed = markAiReviewed(app, { actor: kari, now: t });
  assert.equal(reviewed.aiReviewedBy, 'Kari Leder');
  assert.equal(reviewed.aiReviewedAt, t.toISOString());
  assert.match(historyLine(reviewed.history.at(-1)), /AI-lesingen kontrollert/);

  // Talentbank: kopi til annen stilling uten vurderinger og notater.
  const copy = copyApplicationToJob(scored, 'j2', { actor: kari, fromJobTitle: 'PL', now: t });
  assert.equal(copy.jobId, 'j2');
  assert.equal(copy.stage, 'new');
  assert.equal(copy.copiedFrom, scored.id);
  assert.equal(copy.scorecards.length, 0);
  assert.equal(copy.comments.length, 0);
  assert.equal(copy.profile.headline, 'Byggingeniør');
  assert.deepEqual(otherApplications(copy, [scored, copy]).map((row) => row.id), [scored.id]);
  assert.deepEqual(otherApplications({ id: 'z', email: '' }, [scored]), []);

  // Avslutt rekrutteringen: aktive avslås, ansatte og andre stillinger berøres ikke.
  const hiredApp = moveApplicationStage({ ...app, id: 'h', jobId: 'j1' }, 'hired', { now: t }).app;
  const state = {
    jobs: [job, { id: 'j2', title: 'Annen', status: 'open' }],
    applications: [
      normalizeApplication({ ...app, id: 'x1', jobId: 'j1', stage: 'interview' }),
      normalizeApplication({ ...app, id: 'x2', jobId: 'j1', stage: 'new', email: 'b@x.no' }),
      hiredApp,
      normalizeApplication({ ...app, id: 'x3', jobId: 'j2' }),
    ],
  };
  const closedState = closeRecruitment(state, 'j1', { reason: 'Besatt', actor: ola, now: t });
  assert.deepEqual(closedState.rejected.map((row) => row.id), ['x1', 'x2']);
  assert.equal(closedState.applications.find((row) => row.id === 'h').stage, 'hired');
  assert.equal(closedState.applications.find((row) => row.id === 'x3').stage, 'new');
  assert.equal(closedState.applications.find((row) => row.id === 'x1').rejectReason, 'Besatt');
  assert.equal(closedState.applications.find((row) => row.id === 'x1').history.at(-1).action, 'bulk-close');
  assert.equal(closedState.jobs.find((row) => row.id === 'j1').status, 'closed');
  assert.equal(closedState.jobs.find((row) => row.id === 'j2').status, 'open');
  const bcc = bccMailtoHref(['A@x.no', 'a@x.no', '', 'b@x.no'], 'Svar', 'Hei');
  assert.match(bcc, /^mailto:\?bcc=a@x\.no,b@x\.no&subject=Svar&body=Hei$/);

  // Kalender: lokal tid, escaping av komma og semikolon.
  const ics = interviewIcs({ id: 'i1', name: 'Ada, N', interviewDate: '2026-11-03', interviewTime: '9:05', interviewPlace: 'Rom 1; 3. etg' }, { job, now: t });
  assert.match(ics, /DTSTART:20261103T090500/);
  assert.match(ics, /DTEND:20261103T100500/);
  assert.match(ics, /SUMMARY:Intervju: Ada\\, N – PL/);
  assert.match(ics, /LOCATION:Rom 1\\; 3\. etg/);
  assert.equal(interviewIcs({ id: 'i2', name: 'Uten dato' }), '');

  // CSV: semikolon, BOM for Excel, formler nøytralisert.
  const csv = applicantsCsv([normalizeApplication({ name: '=HYPERLINK("x")', email: 'a@x.no', jobId: 'j1', source: 'NAV; Oslo' })], [job]);
  assert.ok(csv.startsWith('﻿Navn;E-post'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /;PL;Mottatt;/);
  assert.match(csv, /"NAV; Oslo"/);

  // Analyse: median tid til ansettelse/besatt, tilbudsaksept, konvertering og kilder.
  const hiredA = normalizeApplication({ ...moveApplicationStage({ ...app, id: 'ha', jobId: 'j1', appliedAt: '2026-09-10', source: 'Finn.no' }, 'hired', { now: new Date('2026-09-30T10:00:00Z') }).app });
  const declined = normalizeApplication({ id: 'd1', jobId: 'j1', stage: 'declined', appliedAt: '2026-09-12', source: 'NAV', rejectReason: 'Annen jobb', closedAt: '2026-10-01' });
  const early = normalizeApplication({ id: 'e1', jobId: 'j1', stage: 'screening', appliedAt: '2026-10-01', source: 'Finn.no' });
  const stats = recruitmentAnalytics([hiredA, declined, early], [job]);
  assert.equal(stats.timeToHire, 20);
  assert.equal(stats.timeToFill, 29);
  assert.equal(stats.offerAcceptance, 50);
  assert.equal(stats.funnel.find((row) => row.id === 'new').count, 3);
  assert.equal(stats.funnel.find((row) => row.id === 'offer').count, 2, 'takket nei og ansatt har begge nådd tilbud');
  assert.equal(stats.funnel.find((row) => row.id === 'hired').pct, 33);
  assert.deepEqual(stats.sources[0], { source: 'Finn.no', applicants: 2, hired: 1, interviewed: 1 });
  assert.equal(recruitmentAnalytics([]).offerAcceptance, null);

  // Ny nøkkeltall: ikke bekreftet mottatt etter tre dager.
  const unack = recruitmentOverview([normalizeApplication({ appliedAt: '2026-10-20' }), normalizeApplication({ appliedAt: '2026-10-29' })], t);
  assert.equal(unack.unacknowledged, 1);
}

{
  const { interviewIcs } = await import('./recruitment.js');
  // Klokkeslett skrevet på norsk vis normaliseres; ugyldig tid lagres ikke.
  assert.equal(normalizeApplication({ interviewTime: '9.30' }).interviewTime, '09:30');
  assert.equal(normalizeApplication({ interviewTime: '1430' }).interviewTime, '14:30');
  assert.equal(normalizeApplication({ interviewTime: '25:00' }).interviewTime, '');
  assert.match(interviewIcs({ id: 'n', name: 'Natt', interviewDate: '2026-11-03', interviewTime: '23:30' }), /DTEND:20261104T003000/);
  assert.equal(interviewIcs({ id: 'n', name: 'Feil', interviewDate: '03.11.2026' }), '');
}

// Bekreftelsen forteller søkeren om AI-støtten og at mennesker avgjør (åpenhet, GDPR art. 13 / AI-forordningen).
assert.match(responseTemplate('ack', { app, job: { title: 'PL' } }).body, /AI-støtte[\s\S]*avgjørelser tas av mennesker/);

console.log('hr/recruitment.test.mjs ok');
