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

console.log('hr/recruitment.test.mjs ok');
