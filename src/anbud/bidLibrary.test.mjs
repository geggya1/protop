import assert from 'node:assert/strict';
import {
  addBidFile,
  addBidQuestion,
  answerBidQuestion,
  bidDeskBucket,
  bidOverview,
  bidStatusCounts,
  bidWorkspacePath,
  competitionDocuments,
  createBidFolder,
  deleteBidFile,
  deleteBidFolder,
  deleteFormTemplate,
  normalizeBidWork,
  pullFormTemplate,
  saveFormTemplate,
  setFormStatus,
  setFormValue,
  sortBidsByDeadline,
  updateBidAssignment,
} from './bidLibrary.js';
import {
  createBidWork,
  emptyAnbudState,
  normalizeAnbudState,
  setNoticeDecision,
  toggleConsideration,
} from './model.js';

const dossier = {
  title: 'Skole',
  buyer: 'Kommune',
  description: 'Ny skole',
  procedure: 'Åpen',
  submissionDeadline: '29.10.2026 09:00',
  documentsUrl: 'https://permalink.mercell.com/1.aspx',
  portalFiles: [{ name: 'Krav.pdf', size: '12 KB', status: 'portal' }],
  documents: [{ title: 'Anskaffelsesdokumenter', url: 'https://permalink.mercell.com/1.aspx' }],
  qa: [{ question: 'Kan vi dele opp?', answer: 'Nei.' }],
};

const docs = competitionDocuments(dossier);
assert.equal(docs[0].name, 'Kunngjøring.txt');
assert.equal(docs[0].status, 'lastet');
assert.match(docs[0].text, /Ny skole/);
assert.equal(docs.some((row) => row.name === 'Krav.pdf' && row.status === 'portal'), true);
assert.equal(docs.some((row) => row.name === 'Spørsmål og svar.txt'), true);

const seeded = {
  ...emptyAnbudState(),
  notices: [{ id: '2026-1', title: 'Skole', buyer: 'Kommune', decision: 'aktuell', dossier }],
};
const weighed = toggleConsideration(seeded, '2026-1', 'fag');
assert.equal(weighed.ok, true);
assert.equal(weighed.state.notices[0].consideration.strategy.fag, true);
assert.equal(toggleConsideration(seeded, '2026-1', 'ukjent').ok, false);
assert.equal(toggleConsideration(setNoticeDecision(seeded, '2026-1', 'ubestemt').state, '2026-1', 'fag').ok, false);

const madeRaw = createBidWork(weighed.state, '2026-1');
assert.equal(madeRaw.ok, true);
const made = { ...madeRaw, state: normalizeAnbudState(madeRaw.state) };
assert.equal(made.state.notices[0].decision, 'tilbud');
assert.equal(made.state.bids[0].strategy.fag, true);
assert.equal(made.state.bids[0].files.some((row) => row.name === 'Kunngjøring.txt'), true);
assert.equal(made.state.bids[0].files.some((row) => row.name === 'Krav.pdf'), true);
assert.equal(made.state.formTemplates.some((row) => row.id === 'tilbudsbrev'), true);

const declined = setNoticeDecision(seeded, '2026-1', 'ikke');
assert.equal(declined.ok, true);
assert.equal(declined.state.notices[0].decision, 'ikke');

let state = made.state;
const bidId = state.bids[0].id;
state = createBidFolder(state, bidId, { name: 'Pris', parentId: 'grunnlag' });
assert.equal(state.ok, false);
state = createBidFolder(made.state, bidId, { name: 'Pris' }).state;
const folderId = state.bids[0].folders.find((row) => row.name === 'Pris').id;
state = createBidFolder(state, bidId, { name: 'Underlag', parentId: folderId }).state;
state = addBidFile(state, bidId, folderId, { name: 'Kalkyle.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,QQ==', size: 2 }).state;
assert.equal(state.bids[0].files.some((row) => row.name === 'Kalkyle.pdf' && row.kind === 'egen'), true);
assert.equal(addBidFile(state, bidId, 'grunnlag', { name: 'Ekstra.pdf' }).ok, false);
assert.equal(deleteBidFile(state, bidId, state.bids[0].files.find((row) => row.name === 'Kunngjøring.txt').id).ok, false);
const ownId = state.bids[0].files.find((row) => row.name === 'Kalkyle.pdf').id;
const removed = deleteBidFolder(state, bidId, folderId).state;
assert.equal(removed.bids[0].folders.some((row) => row.name === 'Underlag'), false);
assert.equal(removed.bids[0].files.some((row) => row.id === ownId), false);

const pulled = pullFormTemplate(made.state, bidId, 'egenerklaering');
assert.equal(pulled.ok, true);
const form = pulled.state.bids[0].forms[0];
assert.equal(form.title, 'Egenerklæring');
let worked = setFormValue(pulled.state, bidId, form.id, form.fields[0].id, true).state;
worked = setFormStatus(worked, bidId, form.id, 'ferdig').state;
assert.equal(worked.bids[0].forms[0].status, 'ferdig');
assert.equal(worked.bids[0].forms[0].fields[0].value, true);
assert.equal(setFormValue(worked, bidId, form.id, form.fields[0].id, false).ok, false);

const custom = saveFormTemplate(made.state, {
  title: 'Riggliste',
  intro: 'Egen mal',
  fields: [{ label: 'Rigg', kind: 'long' }],
});
assert.equal(custom.ok, true);
assert.equal(custom.state.formTemplates.some((row) => row.title === 'Riggliste'), true);
const customId = custom.state.formTemplates.find((row) => row.title === 'Riggliste').id;
assert.equal(deleteFormTemplate(custom.state, customId).state.formTemplates.some((row) => row.id === customId), false);
assert.equal(saveFormTemplate(made.state, { title: 'Tom' }).ok, false);

const asked = addBidQuestion(made.state, bidId, 'Er tegning A3 gjeldende?');
assert.equal(asked.ok, true);
const questionId = asked.state.bids[0].questions[0].id;
const answered = answerBidQuestion(asked.state, bidId, questionId, 'Ja, revisjon B.');
assert.equal(answered.state.bids[0].questions[0].status, 'besvart');

const overview = bidOverview(worked.bids[0]);
assert.equal(overview.doneForms, 1);
assert.ok(overview.documents >= 1);
assert.equal(bidStatusCounts(worked.bids).planlegging, 1);
assert.equal(bidStatusCounts(worked.bids, new Date('2026-10-01T12:00:00')).aktive, 1);
assert.equal(bidDeskBucket(worked.bids[0], new Date('2026-10-01T12:00:00')), 'aktive');
assert.equal(bidDeskBucket(worked.bids[0], new Date('2026-10-30T12:00:00')), 'utgatt');
assert.equal(bidWorkspacePath(bidId), `/anbud/tilbud/${encodeURIComponent(bidId)}`);

const ranked = sortBidsByDeadline([
  { id: 'a', dossier: { submissionDeadline: '29.10.2026 09:00' } },
  { id: 'b', dossier: { submissionDeadline: '26.10.2026 08:00' } },
  { id: 'c', dossier: { submissionDeadline: '02.11.2026 12:00' } },
  { id: 'd', dossier: {} },
]);
assert.deepEqual(ranked.map((row) => row.id), ['b', 'a', 'c', 'd']);

const won = { ...worked.bids[0], stage: 'kontrakt' };
const delivered = { ...worked.bids[0], stage: 'levert' };
assert.equal(bidDeskBucket(won), 'vunnet');
assert.equal(bidDeskBucket(delivered), 'levert');
assert.equal(bidStatusCounts([won, delivered, worked.bids[0]], new Date('2026-10-01T12:00:00')).vunnet, 1);
assert.equal(bidStatusCounts([won, delivered, worked.bids[0]], new Date('2026-10-01T12:00:00')).levert, 1);

const assigned = updateBidAssignment(worked, bidId, {
  personId: 'u1',
  personName: 'Kari Nord',
  unitId: 'd1',
  unitName: 'Anbud',
  unitKind: 'avdeling',
});
assert.equal(assigned.ok, true);
assert.equal(assigned.state.bids[0].assignment.personName, 'Kari Nord');
assert.equal(bidOverview(assigned.state.bids[0]).assignee, 'Kari Nord');
assert.equal(normalizeBidWork(assigned.state.bids[0]).assignment.unitName, 'Anbud');

const restored = normalizeAnbudState({
  notices: [{ id: '2026-1', decision: 'aktuell', consideration: { strategy: { fag: true } } }],
  bids: [{ id: 'bid_2026-1', noticeId: '2026-1', title: 'Skole', dossier }],
});
assert.equal(restored.notices[0].consideration.strategy.fag, true);
assert.equal(normalizeBidWork(restored.bids[0]).files.some((row) => row.name === 'Kunngjøring.txt'), true);
assert.equal(restored.formTemplates.length >= 5, true);

console.log('bid library ok');
