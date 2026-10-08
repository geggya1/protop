import assert from 'node:assert/strict';
import { emptyProjectState } from '../project/engine.js';
import { projectFromAward } from './handoff.js';
import {
  addContractDocuments,
  attachContractDocumentFile,
  awardContract,
  closeContract,
  contractAlerts,
  deleteContract,
  executionBlockers,
  markOutcome,
  markSubmitted,
  normalizeBidRecord,
  openExecution,
  registerDirectContract,
  regulatoryChecks,
  updateContractDetails,
  setMilestoneStatus,
  toggleStrategy,
  STRATEGY_ITEMS,
} from './lifecycle.js';
import { createBidWork, emptyAnbudState, normalizeAnbudState } from './model.js';

function readyBid() {
  const state = {
    ...emptyAnbudState(),
    bids: [{
      id: 'bid_1',
      noticeId: '2026-1',
      title: 'Skolebygg',
      buyer: 'Eidsvoll kommune',
      phase: 'trinn2',
      stage: 'planlegging',
      strategy: Object.fromEntries(STRATEGY_ITEMS.map((item) => [item.id, true])),
      dossier: {
        submissionDeadline: '2026-12-01',
        questionDeadline: '2026-11-15',
        procedure: 'Åpen anbudskonkurranse',
        espd: true,
        documentsUrl: 'https://example.test/docs',
        electronicSubmission: 'Ja',
      },
    }],
  };
  return state;
}

const now = new Date(2026, 8, 26);

const blocked = openExecution(readyBid(), 'bid_1', now);
assert.equal(blocked.ok, true, blocked.error);

const bare = readyBid();
bare.bids[0].strategy = {};
const stopped = openExecution(bare, 'bid_1', now);
assert.equal(stopped.ok, false);
assert.match(stopped.error, /Fag og geografi/);

const late = readyBid();
late.bids[0].dossier.submissionDeadline = '2026-09-01';
assert.equal(openExecution(late, 'bid_1', now).ok, false);
assert.match(regulatoryChecks(late.bids[0], now).find((row) => row.id === 'frist').detail, /passert/);

const noDocs = readyBid();
noDocs.bids[0].dossier = { submissionDeadline: '2026-12-01' };
assert.ok(executionBlockers(noDocs.bids[0], now).some((row) => /Konkurransedokumenter/.test(row)));

let state = openExecution(readyBid(), 'bid_1', now).state;
assert.equal(awardContract(state, 'bid_1', { value: '0' }).ok, false);
assert.equal(awardContract(readyBid(), 'bid_1', { value: '1500000' }).ok, false);

state = awardContract(state, 'bid_1', { value: '1 500 000', start: '2026-10-01', end: '2027-04-01' }).state;
assert.equal(state.bids[0].stage, 'kontrakt');
assert.equal(state.contracts[0].value, 1500000);
assert.equal(state.contracts[0].systemId, '1');
assert.equal(state.contracts[0].oppdragId, '1');
assert.equal(state.contracts[0].milestones.length, 5);
assert.equal(state.contracts[0].milestones[0].due, '2026-10-01');
assert.equal(state.contracts[0].milestones.find((row) => row.key === 'overlevering').due, '2027-04-01');
assert.equal(state.contracts[0].milestones.find((row) => row.key === 'delfaktura').due, '2026-12-31');
assert.equal(awardContract(state, 'bid_1', { value: '10' }).ok, false);
assert.match(state.audit[0].action, /kontrakt-registrert/);

const alertsSoon = contractAlerts(state.contracts, new Date(2026, 11, 20));
assert.ok(alertsSoon.some((row) => row.level === 'snart' && /Delfaktura/.test(row.title)));
const overdue = contractAlerts(state.contracts, new Date(2027, 0, 15));
assert.equal(overdue[0].level, 'forfalt');
assert.match(overdue[0].title, /Delfaktura/);

const toggled = toggleStrategy(readyBid(), 'bid_1', 'fag');
assert.equal(toggled.state.bids[0].strategy.fag, false);
assert.equal(toggleStrategy(state, 'bid_1', 'fag').ok, false);

assert.equal(markOutcome(state, 'bid_1', 'tapt').ok, false);
const lost = markOutcome(readyBid(), 'bid_1', 'tapt');
assert.equal(lost.ok, true);
assert.equal(lost.state.bids[0].stage, 'tapt');
assert.equal(awardContract(lost.state, 'bid_1', { value: '10' }).ok, false);

const submitted = markSubmitted(openExecution(readyBid(), 'bid_1', now).state, 'bid_1');
assert.equal(submitted.ok, true, submitted.error);
assert.equal(submitted.state.bids[0].stage, 'levert');
assert.equal(toggleStrategy(submitted.state, 'bid_1', 'fag').ok, false);
const wonFromDelivered = awardContract(submitted.state, 'bid_1', {
  value: '900000', start: '2026-10-01', end: '2027-01-01',
});
assert.equal(wonFromDelivered.ok, true, wonFromDelivered.error);
assert.equal(wonFromDelivered.state.bids[0].stage, 'kontrakt');
assert.equal(markSubmitted(readyBid(), 'bid_1').ok, true);

let contractId = state.contracts[0].id;
for (const milestone of state.contracts[0].milestones) {
  state = setMilestoneStatus(state, contractId, milestone.id, 'utfort').state;
}
assert.equal(closeContract(state, contractId).ok, true);
assert.equal(closeContract(state, contractId).state.contracts[0].status, 'avsluttet');
assert.equal(contractAlerts(closeContract(state, contractId).state.contracts, new Date(2027, 5, 1)).length, 0);

const restored = normalizeAnbudState({
  bids: [{ id: 'bid_old', title: 'Gammel', phase: 'trinn2' }],
  contracts: [{ id: 'kon_1', bidId: 'bid_old', title: 'Gammel', value: '2500', milestones: [{ key: 'oppstart', due: '2026-13-01', status: 'utfort' }] }],
  audit: [{ at: '2026-09-01T00:00:00.000Z', action: 'notat', detail: 'beholdt' }, { action: '' }],
});
assert.equal(restored.bids[0].stage, 'planlegging');
assert.equal(restored.bids[0].strategy.grunnlag, false);
assert.equal(restored.contracts[0].value, 2500);
assert.equal(restored.contracts[0].milestones.find((row) => row.key === 'oppstart').due, '');
assert.equal(restored.contracts[0].milestones.find((row) => row.key === 'oppstart').status, 'utfort');
assert.equal(restored.audit.length, 1);
assert.equal(normalizeBidRecord(null).stage, 'planlegging');

const handed = projectFromAward(emptyProjectState(), state.contracts[0]);
assert.equal(handed.ok, true);
assert.equal(handed.created, true);
assert.equal(handed.state.projects[0].name, 'Skolebygg');
assert.equal(handed.state.projects[0].client, 'Eidsvoll kommune');
assert.equal(handed.state.contracts[0].value, 1500000);
const again = projectFromAward(handed.state, { ...state.contracts[0], projectId: handed.projectId });
assert.equal(again.created, false);
assert.equal(again.state.projects.length, 1);

const direct = registerDirectContract(emptyAnbudState(), {
  title: 'Madlalia · Anleggsleder',
  buyer: 'Igang Totalentreprenør As',
  projectName: 'Madlalia',
  value: '1080',
  start: '2025-11-17',
  end: '2028-12-31',
  fields: { standard: 'NS 8403', indexId: 'ppi-byggeteknisk', contactName: 'Øyvind Lerbrekk' },
  indexDraft: { title: 'Madlalia · Anleggsleder', standard: 'NS 8403' },
  documents: [{ id: 'dok-1', name: 'C1-H-03-001.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,Zg==', text: 'NS 8403' }],
});
assert.equal(direct.ok, true, direct.error);
assert.equal(direct.state.contracts[0].source, 'direkte');
assert.equal(direct.state.contracts[0].bidId, '');
assert.equal(direct.state.contracts[0].fields.standard, 'NS 8403');
assert.equal(direct.state.contracts[0].systemId, '1');
assert.equal(direct.state.contracts[0].oppdragId, '1');
assert.equal(direct.state.contracts[0].documents[0].name, 'C1-H-03-001.pdf');
assert.match(direct.state.contracts[0].documents[0].dataUrl, /^data:application\/pdf/);
assert.equal(direct.state.contracts[0].milestones.find((row) => row.key === 'signert').status, 'utfort');
assert.equal(contractAlerts(direct.state.contracts, new Date(2026, 9, 5)).filter((row) => /signert|Oppstart/.test(row.title)).length, 0);

const textOnly = registerDirectContract(emptyAnbudState(), {
  title: 'Madlalia uten fil',
  buyer: 'Igang Totalentreprenør As',
  documents: [{
    id: 'dok-text',
    name: 'C1-H-03-001 Oppdragsavtale NS8403.pdf',
    mimeType: 'application/pdf',
    text: 'Oppdragsbekreftelse',
  }],
});
assert.equal(textOnly.ok, true, textOnly.error);
const attached = attachContractDocumentFile(
  textOnly.state,
  textOnly.state.contracts[0].id,
  'dok-text',
  {
    url: 'https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/families%2Fx%2Fanbud%2Fcontracts%2Favtale.pdf?alt=media&token=abc',
    storagePath: 'families/x/anbud/contracts/avtale.pdf',
    name: 'C1-H-03-001 Oppdragsavtale NS8403.pdf',
    mimeType: 'application/pdf',
    size: 120000,
  },
);
assert.equal(attached.ok, true, attached.error);
assert.match(attached.state.contracts[0].documents[0].url, /^https:\/\/firebasestorage/);
assert.equal(attached.state.contracts[0].documents[0].text, 'Oppdragsbekreftelse');
assert.equal(attached.state.contracts[0].documents[0].dataUrl, '');

const many = addContractDocuments(attached.state, attached.state.contracts[0].id, [
  { name: 'Tillegg 1.pdf', url: 'https://example.com/1.pdf', mimeType: 'application/pdf', size: 10 },
  { name: 'Tillegg 2.pdf', url: 'https://example.com/2.pdf', mimeType: 'application/pdf', size: 11 },
  { name: 'Endring.docx', url: 'https://example.com/3.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 12 },
]);
assert.equal(many.ok, true, many.error);
assert.equal(many.state.contracts[0].documents.length, 4);
assert.equal(many.state.contracts[0].documents.filter((row) => /Tillegg|Endring/.test(row.name)).length, 3);
assert.equal(many.state.contracts[0].documents.some((row) => row.name === 'Tillegg 2.pdf' && row.url.includes('2.pdf')), true);

const frame = registerDirectContract(emptyAnbudState(), {
  title: 'Rammeavtale byggherre',
  buyer: 'Sola kommune',
  kind: 'rammeavtale',
  start: '2024-01-01',
  end: '2027-12-31',
  renewal: { type: 'automatisk', until: '2030-12-31', noticeDays: 90 },
  options: [{ title: 'Forlengelse 1 år', start: '2028-01-01', end: '2028-12-31' }],
});
assert.equal(frame.ok, true, frame.error);
assert.equal(frame.state.contracts[0].kind, 'rammeavtale');
assert.equal(frame.state.contracts[0].renewal.type, 'automatisk');
assert.equal(frame.state.contracts[0].options[0].title, 'Forlengelse 1 år');
const callOff = registerDirectContract(frame.state, {
  title: 'Avrop 1',
  kind: 'avrop',
  parentId: frame.state.contracts[0].id,
  value: '25000',
});
assert.equal(callOff.ok, true, callOff.error);
assert.equal(callOff.state.contracts[0].parentId, frame.state.contracts[0].id);
assert.equal(callOff.state.contracts[0].buyer, 'Sola kommune');
assert.equal(registerDirectContract(emptyAnbudState(), { title: 'Avrop uten ramme', kind: 'avrop' }).ok, false);
assert.equal(registerDirectContract(emptyAnbudState(), { title: '' }).ok, false);

const logged = updateContractDetails(callOff.state, callOff.state.contracts[0].id, {
  regulations: [{
    id: '2025K4-2026K2-1080',
    savedAt: '2026-10-05',
    before: 1080,
    after: 1110.73,
    increase: 30.73,
    fromPeriod: '2025K4',
    fromIndex: 119.5,
    toPeriod: '2026K2',
    toIndex: 122.9,
    changePercent: 2.85,
    formula: 'ny verdi = opprinnelig × (1 − s + s × t / t0)',
    query: 't0 4. kvartal 2025 = 119,5 · t 2. kvartal 2026 = 122,9',
    letterTitle: 'Varsel om indeksregulering',
    letterPlain: 'Brevtekst om indeksregulering',
    ignored: 'skal ikke bli med',
  }],
});
assert.equal(logged.ok, true, logged.error);
const storedRow = logged.state.contracts.find((item) => item.id === callOff.state.contracts[0].id);
assert.equal(storedRow.regulations.length, 1);
assert.equal(storedRow.regulations[0].before, 1080);
assert.equal(storedRow.regulations[0].after, 1110.73);
assert.equal(storedRow.regulations[0].increase, 30.73);
assert.equal(storedRow.regulations[0].fromPeriod, '2025K4');
assert.equal(storedRow.regulations[0].toPeriod, '2026K2');
assert.equal(storedRow.regulations[0].letterPlain, 'Brevtekst om indeksregulering');
assert.equal(storedRow.regulations[0].ignored, undefined);
const reloaded = normalizeAnbudState(logged.state);
const kept = reloaded.contracts.find((item) => item.id === storedRow.id);
assert.equal(kept.regulations[0].fromIndex, 119.5);
assert.equal(kept.regulations[0].toIndex, 122.9);
assert.match(kept.regulations[0].query, /119,5/);

const seeded = {
  ...emptyAnbudState(),
  notices: [{ id: '2026-9', title: 'Kai', buyer: 'Havn', decision: 'aktuell' }],
};
const made = createBidWork(seeded, '2026-9');
assert.equal(made.ok, true);
assert.equal(made.state.bids[0].phase, 'trinn2');
assert.equal(made.state.bids[0].stage, 'planlegging');
assert.equal(made.state.bids[0].strategy.fag, false);

const coverEdit = updateContractDetails(direct.state, direct.state.contracts[0].id, {
  title: 'Madlalia · Oppdatert',
  value: '2500',
  start: '2025-12-01',
  end: '2029-01-01',
  buyer: 'Igang Totalentreprenør As',
  fields: {
    ...direct.state.contracts[0].fields,
    place: 'Sandnes',
    orgnr: '922987106',
    contractDate: '2025-10-09',
  },
});
assert.equal(coverEdit.ok, true, coverEdit.error);
assert.equal(coverEdit.state.contracts[0].title, 'Madlalia · Oppdatert');
assert.equal(coverEdit.state.contracts[0].value, 2500);
assert.equal(coverEdit.state.contracts[0].fields.place, 'Sandnes');

const withChild = registerDirectContract(frame.state, {
  title: 'Avrop som skal slettes',
  kind: 'avrop',
  parentId: frame.state.contracts[0].id,
  value: '100',
});
assert.equal(withChild.ok, true, withChild.error);
const deleted = deleteContract(withChild.state, frame.state.contracts[0].id);
assert.equal(deleted.ok, true, deleted.error);
assert.equal(deleted.state.contracts.some((row) => row.id === frame.state.contracts[0].id), false);
assert.equal(deleted.state.contracts.some((row) => row.parentId === frame.state.contracts[0].id), false);
assert.equal(deleteContract(deleted.state, 'mangler').ok, false);

console.log('lifecycle ok');
