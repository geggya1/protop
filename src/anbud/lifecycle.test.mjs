import assert from 'node:assert/strict';
import { emptyProjectState } from '../project/engine.js';
import { projectFromAward } from './handoff.js';
import {
  awardContract,
  closeContract,
  contractAlerts,
  executionBlockers,
  markOutcome,
  normalizeBidRecord,
  openExecution,
  regulatoryChecks,
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
assert.equal(state.contracts[0].milestones.length, 5);
assert.equal(state.contracts[0].milestones[0].due, '2026-10-01');
assert.equal(state.contracts[0].milestones.find((row) => row.key === 'overlevering').due, '2027-04-01');
assert.equal(state.contracts[0].milestones.find((row) => row.key === 'delfaktura').due, '2026-12-31');
assert.equal(awardContract(state, 'bid_1', { value: '10' }).ok, false);
assert.match(state.audit[0].action, /kontrakt-registrert/);

const alerts = contractAlerts(state.contracts, new Date(2026, 9, 1));
assert.equal(alerts[0].level, 'snart');
assert.equal(alerts[0].title, 'Kontrakt signert');
const overdue = contractAlerts(state.contracts, new Date(2026, 10, 1));
assert.equal(overdue[0].level, 'forfalt');

const toggled = toggleStrategy(readyBid(), 'bid_1', 'fag');
assert.equal(toggled.state.bids[0].strategy.fag, false);
assert.equal(toggleStrategy(state, 'bid_1', 'fag').ok, false);

assert.equal(markOutcome(state, 'bid_1', 'tapt').ok, false);
const lost = markOutcome(readyBid(), 'bid_1', 'tapt');
assert.equal(lost.ok, true);
assert.equal(lost.state.bids[0].stage, 'tapt');
assert.equal(awardContract(lost.state, 'bid_1', { value: '10' }).ok, false);

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

const seeded = {
  ...emptyAnbudState(),
  notices: [{ id: '2026-9', title: 'Kai', buyer: 'Havn', decision: 'aktuell' }],
};
const made = createBidWork(seeded, '2026-9');
assert.equal(made.ok, true);
assert.equal(made.state.bids[0].phase, 'trinn2');
assert.equal(made.state.bids[0].stage, 'planlegging');
assert.equal(made.state.bids[0].strategy.fag, false);

console.log('lifecycle ok');
