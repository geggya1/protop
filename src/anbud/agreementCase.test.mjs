import assert from 'node:assert/strict';
import {
  acceptProposals,
  acceptRemarks,
  addAgreementNote,
  agreementNoticeText,
  applyAgreementOp,
  bidsAwaitingAgreement,
  composeCounterpartyCase,
  createAgreementCase,
  deleteAgreementNote,
  editAgreementNote,
  fillAgreementFields,
  mergeAgreementCases,
  publicAgreementView,
  publishAgreementVersion,
  returnAgreement,
  sendAgreement,
  setAgreementField,
  signAgreement,
  splitCounterpartyPrivacy,
  visibleNotes,
} from './agreementCase.js';
import { agreementToPdf, agreementToWordHtml } from './agreementExport.js';
import { buildAgreementNotice } from './agreementNotice.js';
import { normalizeAnbudState } from './model.js';

let n = 0;
const ctx = {
  now: '2026-10-12T10:00:00.000Z',
  nextId: (prefix) => `${prefix}_${++n}`,
};

const template = {
  id: 'mal_1',
  title: 'Oppdragsavtale',
  category: 'avtale',
  fields: [
    { id: 'f_type', label: 'Avtaletype', kind: 'text', editor: 'fast' },
    { id: 'f_oppdrag', label: 'Oppdrag', kind: 'text', editor: 'avsender' },
    { id: 'f_kunde', label: 'Oppdragsgiver', kind: 'text', editor: 'fast' },
    { id: 'f_org', label: 'Organisasjonsnummer', kind: 'text', editor: 'fast' },
    { id: 'f_mail', label: 'E-post', kind: 'text', editor: 'motpart' },
    { id: 'f_kontakt', label: 'Kontaktperson', kind: 'text', editor: 'motpart' },
    { id: 'f_leverandor', label: 'Oppdragstaker', kind: 'text', editor: 'fast' },
    { id: 'f_levorg', label: 'Oppdragstakers organisasjonsnummer', kind: 'text', editor: 'fast' },
    { id: 'f_ansvarlig', label: 'Ansvarlig', kind: 'text', editor: 'fast' },
    { id: 'f_honorar', label: 'Avtalt honorar eks. mva', kind: 'number', editor: 'avsender' },
    { id: 'f_note', label: 'Fast tekst', kind: 'note', editor: 'fast' },
  ],
};

const base = {
  agreementCases: [],
  contracts: [],
  bids: [{ id: 'bud_1', stage: 'kontrakt', title: 'Bro' }],
  customers: [],
};

const created = createAgreementCase(base, {
  template,
  kind: 'oppdrag',
  title: 'Broen',
  bidId: 'bud_1',
  customer: {
    id: 'kun_1',
    name: 'Byggherre AS',
    orgnr: '999999999',
    email: 'kunde@byggherre.no',
    contactName: 'Kari',
    phone: '22000000',
    address: 'Kai 1',
    place: 'Bergen',
  },
  company: { name: 'Consult1 AS', orgnr: '111111111', email: 'post@consult1.no' },
  ownerName: 'Ola',
  ownerUid: 'ola',
  actorName: 'Ola',
  actorUid: 'ola',
  notifyUids: ['ola'],
}, ctx);

assert.equal(created.ok, true, created.error);
assert.equal(created.row.status, 'utkast');
assert.equal(created.row.version, 1);
assert.equal(created.row.versions[0].fields.find((field) => field.id === 'f_kunde').value, 'Byggherre AS');
assert.equal(created.row.versions[0].fields.find((field) => field.id === 'f_org').value, '999999999');
assert.equal(created.row.versions[0].fields.find((field) => field.id === 'f_levorg').value, '111111111');
assert.equal(created.row.versions[0].fields.find((field) => field.id === 'f_ansvarlig').value, 'Ola');
assert.equal(created.row.versions[0].fields.find((field) => field.id === 'f_mail').value, 'kunde@byggherre.no');
assert.ok(created.row.versions[0].digest);
assert.equal(bidsAwaitingAgreement(created.state).length, 0);
assert.equal(createAgreementCase(base, { template: { ...template, category: 'skjema' }, customer: { name: 'A' } }, ctx).ok, false);
assert.equal(createAgreementCase(base, { template, kind: 'avrop', customer: { name: 'A' } }, ctx).ok, false);

const filled = fillAgreementFields([
  { id: 'a', label: 'Oppdragsgiver', kind: 'text', value: '' },
  { id: 'b', label: 'Oppdragsgiver', kind: 'text', value: 'Allerede' },
], { customer: { name: 'Ny AS' } });
assert.equal(filled.fields[0].value, 'Ny AS');
assert.equal(filled.fields[1].value, 'Allerede');

let state = created.state;
const caseId = created.row.id;
const lockedFast = setAgreementField(state, caseId, {
  party: 'avsender', fieldId: 'f_kunde', value: 'Annen', actorName: 'Ola',
}, ctx);
assert.equal(lockedFast.ok, false);

const honorar = setAgreementField(state, caseId, {
  party: 'avsender', fieldId: 'f_honorar', value: '150000', actorName: 'Ola', actorUid: 'ola',
}, ctx);
assert.equal(honorar.ok, true);
assert.equal(honorar.row.versions[0].fields.find((field) => field.id === 'f_honorar').value, '150000');
assert.equal(publicAgreementView(honorar.row, 'motpart').events.some((event) => event.action === 'felt-endret'), false);
state = honorar.state;

const missingMail = sendAgreement({
  ...state,
  agreementCases: state.agreementCases.map((row) => ({ ...row, counterparty: { ...row.counterparty, email: '' } })),
}, caseId, { party: 'avsender', actorName: 'Ola' }, ctx);
assert.equal(missingMail.ok, false);

const sent = sendAgreement(state, caseId, { party: 'avsender', actorName: 'Ola', actorUid: 'ola' }, ctx);
assert.equal(sent.ok, true);
assert.equal(sent.row.status, 'hos-motpart');
assert.ok(sent.row.versions[0].sentAt);
assert.equal(publicAgreementView(sent.row, 'motpart').events.some((event) => event.action === 'felt-endret'), true);
state = sent.state;

const frozen = setAgreementField(state, caseId, {
  party: 'avsender', fieldId: 'f_honorar', value: '1', actorName: 'Ola',
}, ctx);
assert.equal(frozen.ok, false);

const motpartFast = setAgreementField(state, caseId, {
  party: 'motpart', fieldId: 'f_honorar', value: '9', actorName: 'Kari',
}, ctx);
assert.equal(motpartFast.ok, false);

const motpartFelt = setAgreementField(state, caseId, {
  party: 'motpart', fieldId: 'f_kontakt', value: 'Per', actorName: 'Kari', actorUid: 'kari',
}, ctx);
assert.equal(motpartFelt.ok, true);
assert.equal(publicAgreementView(motpartFelt.row, 'avsender').proposals.length, 0);
assert.equal(publicAgreementView(motpartFelt.row, 'motpart').fields.find((field) => field.id === 'f_kontakt').value, 'Per');
state = motpartFelt.state;

const hidden = addAgreementNote(state, caseId, {
  party: 'motpart', kind: 'merknad', fieldId: 'f_kontakt', body: 'Bytt kontakt', actorName: 'Kari',
}, ctx);
assert.equal(hidden.ok, true);
assert.equal(visibleNotes(hidden.row, 'avsender').some((note) => note.body === 'Bytt kontakt'), false);
assert.equal(visibleNotes(hidden.row, 'motpart').some((note) => note.body === 'Bytt kontakt'), true);
state = hidden.state;

const edited = editAgreementNote(state, caseId, {
  party: 'motpart', noteId: hidden.row.notes.at(-1).id, body: 'Bytt til Per', actorName: 'Kari',
}, ctx);
assert.equal(edited.ok, true);
const removed = deleteAgreementNote(edited.state, caseId, {
  party: 'motpart', noteId: hidden.row.notes.at(-1).id, actorName: 'Kari',
}, ctx);
assert.equal(removed.ok, true);
const again = addAgreementNote(removed.state, caseId, {
  party: 'motpart', kind: 'melding', body: 'Vi vil justere kontakten', actorName: 'Kari',
}, ctx);
assert.equal(again.ok, true);
state = again.state;

const { stored, pending } = splitCounterpartyPrivacy(state.agreementCases[0]);
assert.equal(stored.notes.some((note) => note.body === 'Vi vil justere kontakten'), false);
assert.equal(pending.notes.length, 1);
assert.equal(composeCounterpartyCase(stored, pending).notes.length >= 1, true);
assert.equal(publicAgreementView(stored, 'avsender').notes.some((note) => /justere/.test(note.body)), false);

const earlySign = signAgreement(state, caseId, { party: 'motpart', actorName: 'Kari', method: 'forpliktende' }, ctx);
assert.equal(earlySign.ok, false);

const returned = returnAgreement(state, caseId, { party: 'motpart', actorName: 'Kari', actorUid: 'kari' }, ctx);
assert.equal(returned.ok, true);
assert.equal(returned.row.status, 'merknader');
assert.equal(visibleNotes(returned.row, 'avsender').some((note) => /justere/.test(note.body)), true);
assert.equal(publicAgreementView(returned.row, 'avsender').proposals.length, 1);
state = returned.state;

const taken = acceptProposals(state, caseId, { party: 'avsender', actorName: 'Ola', actorUid: 'ola' }, ctx);
assert.equal(taken.ok, true);
assert.equal(taken.row.fields.find((field) => field.id === 'f_kontakt').value, 'Per');
state = taken.state;

const blockedSign = signAgreement(state, caseId, { party: 'avsender', actorName: 'Ola', method: 'forpliktende' }, ctx);
assert.equal(blockedSign.ok, false);
const accepted = acceptRemarks(state, caseId, { party: 'avsender', actorName: 'Ola', actorUid: 'ola' }, ctx);
assert.equal(accepted.ok, true);
state = accepted.state;

const senderSign = signAgreement(state, caseId, {
  party: 'avsender', actorName: 'Ola', actorUid: 'ola', method: 'bankid',
}, ctx);
assert.equal(senderSign.ok, true);
assert.equal(senderSign.row.status, 'merknader');
assert.equal(senderSign.row.signatures[0].provider, 'protop-seal');
assert.match(senderSign.row.signatures[0].statement, /BankID-leverandør er ikke tilkoblet/);
state = senderSign.state;

const both = signAgreement(state, caseId, {
  party: 'motpart', actorName: 'Kari', actorUid: 'kari', method: 'forpliktende',
}, ctx);
assert.equal(both.ok, true);
assert.equal(both.row.status, 'signert');
assert.equal(both.row.events.at(-1).action, 'forseglet');
assert.equal(setAgreementField(both.state, caseId, {
  party: 'avsender', fieldId: 'f_honorar', value: '2', actorName: 'Ola',
}, ctx).ok, false);

const quiet = createAgreementCase(base, {
  template,
  customer: { id: 'kun_2', name: 'Stille AS', email: 'stille@example.com' },
  company: { name: 'Consult1 AS', orgnr: '111111111' },
  actorName: 'Ola',
  actorUid: 'ola',
}, ctx);
const quietSent = sendAgreement(quiet.state, quiet.row.id, { party: 'avsender', actorName: 'Ola' }, ctx);
const quietSign = signAgreement(quietSent.state, quiet.row.id, {
  party: 'motpart', method: 'forpliktende', actorName: 'Kari',
}, ctx);
assert.equal(quietSign.ok, true, quietSign.error);
const quietBoth = signAgreement(quietSign.state, quiet.row.id, {
  party: 'avsender', method: 'forpliktende', actorName: 'Ola',
}, ctx);
assert.equal(quietBoth.row.status, 'signert');

const frame = createAgreementCase(base, {
  template,
  kind: 'rammeavtale',
  title: 'Ramme',
  customer: { id: 'kun_3', name: 'Ramme AS', email: 'ramme@example.com' },
  company: { name: 'Consult1 AS' },
  actorName: 'Ola',
}, ctx);
const calloff = createAgreementCase(frame.state, {
  template,
  kind: 'avrop',
  parentId: frame.row.id,
  title: 'Avrop 1',
  customer: { id: 'kun_3', name: 'Ramme AS', email: 'ramme@example.com' },
  company: { name: 'Consult1 AS' },
  actorName: 'Ola',
}, ctx);
assert.equal(calloff.ok, true, calloff.error);
assert.equal(calloff.row.kind, 'avrop');

const remarked = createAgreementCase(base, {
  template,
  customer: { name: 'Merknad AS', email: 'm@example.com' },
  company: { name: 'Consult1 AS' },
  actorName: 'Ola',
}, ctx);
let flow = sendAgreement(remarked.state, remarked.row.id, { party: 'avsender', actorName: 'Ola' }, ctx).state;
flow = addAgreementNote(flow, remarked.row.id, { party: 'motpart', body: 'Endre frist', actorName: 'Kari' }, ctx).state;
flow = returnAgreement(flow, remarked.row.id, { party: 'motpart', actorName: 'Kari' }, ctx).state;
const published = publishAgreementVersion(flow, remarked.row.id, { party: 'avsender', actorName: 'Ola', actorUid: 'ola' }, ctx);
assert.equal(published.ok, true, published.error);
assert.equal(published.row.version, 2);
assert.equal(published.row.status, 'utkast');
assert.equal(published.row.signatures.length, 0);

const stale = published.row;
const remote = returned.row;
const merged = mergeAgreementCases([stale], [{ ...remote, id: stale.id, updatedAt: '2026-10-12T09:00:00.000Z' }]);
assert.equal(merged[0].version, 2);
const lostRisk = mergeAgreementCases(
  [{ ...remote, updatedAt: '2026-10-12T11:00:00.000Z', notes: remote.notes.filter((note) => note.sentAt) }],
  [{ ...remote, updatedAt: '2026-10-12T12:00:00.000Z', notes: [], status: 'hos-motpart' }],
);
assert.equal(lostRisk[0].status, 'merknader');
assert.equal(lostRisk[0].notes.some((note) => /justere/.test(note.body)), true);

const pdf = agreementToPdf(sent.row);
assert.match(pdf, /^%PDF-1\.4/);
assert.match(pdf, /Broen/);
const word = agreementToWordHtml(sent.row);
assert.match(word, /Broen/);
assert.match(word, /Byggherre AS/);
const mail = buildAgreementNotice({
  title: 'Broen',
  detail: agreementNoticeText(sent.row, 'sendt'),
  actorName: 'Ola',
  link: 'https://protop.no/?avtale=tok',
});
assert.match(mail.subject, /Broen/);
assert.match(mail.text, /protop\.no/);

const normalized = normalizeAnbudState({ agreementCases: [created.row] });
assert.equal(normalized.agreementCases[0].title, 'Broen');
assert.equal(normalizeAnbudState({}).agreementCases.length, 0);

const op = applyAgreementOp(base, { op: 'ukjent' }, ctx);
assert.equal(op.ok, false);

const badMail = createAgreementCase(base, {
  template,
  customer: { name: 'Feil AS', email: 'ikke-en-epost' },
  company: { name: 'Consult1 AS' },
  actorName: 'Ola',
}, ctx);
assert.equal(badMail.ok, false);

const emptyNote = addAgreementNote(sent.state, caseId, { party: 'motpart', body: '   ', actorName: 'Kari' }, ctx);
assert.equal(emptyNote.ok, false);

const senderWhileAway = addAgreementNote(sent.state, caseId, { party: 'avsender', body: 'Hei', actorName: 'Ola' }, ctx);
assert.equal(senderWhileAway.ok, false);

const onlyField = setAgreementField(sent.state, caseId, {
  party: 'motpart', fieldId: 'f_mail', value: 'ny@byggherre.no', actorName: 'Kari',
}, ctx);
assert.equal(onlyField.ok, true);
const returnedField = returnAgreement(onlyField.state, caseId, { party: 'motpart', actorName: 'Kari' }, ctx);
assert.equal(returnedField.ok, true, returnedField.error);
assert.equal(returnedField.row.proposals.some((item) => item.after === 'ny@byggherre.no' && item.sentAt), true);

const nothingBack = returnAgreement(sent.state, caseId, { party: 'motpart', actorName: 'Kari' }, ctx);
assert.equal(nothingBack.ok, false);

const motpartSend = sendAgreement(sent.state, caseId, { party: 'motpart', actorName: 'Kari' }, ctx);
assert.equal(motpartSend.ok, false);

const afterReturn = returnedField.state;
const fieldAfterReturn = setAgreementField(afterReturn, caseId, {
  party: 'motpart', fieldId: 'f_mail', value: 'enda@byggherre.no', actorName: 'Kari',
}, ctx);
assert.equal(fieldAfterReturn.ok, false);

const earlyVersion = publishAgreementVersion(created.state, caseId, { party: 'avsender', actorName: 'Ola' }, ctx);
assert.equal(earlyVersion.ok, false);

const named = signAgreement(quietSent.state, quiet.row.id, { party: 'motpart', method: 'forpliktende', actorName: '' }, ctx);
assert.equal(named.ok, false);
const once = signAgreement(quietSent.state, quiet.row.id, { party: 'motpart', method: 'forpliktende', actorName: 'Kari' }, ctx);
const twice = signAgreement(once.state, quiet.row.id, { party: 'motpart', method: 'forpliktende', actorName: 'Kari' }, ctx);
assert.equal(twice.ok, false);

const signedThenRemark = signAgreement(sent.state, caseId, { party: 'avsender', method: 'forpliktende', actorName: 'Ola' }, ctx);
assert.equal(signedThenRemark.ok, true, signedThenRemark.error);
const changedAfterSign = setAgreementField(signedThenRemark.state, caseId, {
  party: 'motpart', fieldId: 'f_mail', value: 'etter@byggherre.no', actorName: 'Kari',
}, ctx);
const wiped = returnAgreement(changedAfterSign.state, caseId, { party: 'motpart', actorName: 'Kari' }, ctx);
assert.equal(wiped.ok, true, wiped.error);
assert.equal(wiped.row.signatures.length, 0);

const otherEdit = editAgreementNote(again.state, caseId, {
  party: 'avsender', noteId: again.row.notes.at(-1).id, body: 'Overtatt', actorName: 'Ola',
}, ctx);
assert.equal(otherEdit.ok, false);
const sentNote = again.row.notes.at(-1);
const lockedEdit = editAgreementNote(
  { ...again.state, agreementCases: again.state.agreementCases.map((row) => ({ ...row, notes: row.notes.map((note) => ({ ...note, sentAt: note.sentAt || ctx.now })) })) },
  caseId,
  { party: 'motpart', noteId: sentNote.id, body: 'For sent', actorName: 'Kari' },
  ctx,
);
assert.equal(lockedEdit.ok, false);

const dropped = deleteAgreementNote(again.state, caseId, { party: 'motpart', noteId: again.row.notes.at(-1).id, actorName: 'Kari' }, ctx);
const privacy = splitCounterpartyPrivacy(dropped.row);
assert.equal(privacy.pending.notes.some((note) => note.deletedAt), false);
assert.equal(privacy.pending.notes.some((note) => note.body === 'Vi vil justere kontakten'), false);

const bothField = setAgreementField(
  { ...created.state, agreementCases: created.state.agreementCases.map((row) => ({ ...row, fields: row.fields.map((field) => (field.id === 'f_honorar' ? { ...field, editor: 'begge' } : field)) })) },
  caseId,
  { party: 'avsender', fieldId: 'f_honorar', value: '10', actorName: 'Ola' },
  ctx,
);
assert.equal(bothField.ok, true, bothField.error);

const pdfLetters = agreementToPdf({ ...sent.row, title: 'Bræøå' });
assert.match(pdfLetters, /\\346\\370\\345/);
assert.equal(pdfLetters.includes('Bræ'), false);

console.log('agreementCase.test.mjs ok');
