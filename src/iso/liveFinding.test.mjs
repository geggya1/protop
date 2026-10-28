/**
 * Åpen sak følges i sanntid (DRIFT-23): en nyere revisjon fra skyen erstatter den lokale,
 * men en eldre eller lik revisjon (egen lagring på vei) overskriver aldri det lokale.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyIsoState, mergeRemoteFinding } from './state.js';

function withFinding(f) {
  return { ...emptyIsoState(), findings: [f] };
}

test('DRIFT-23: nyere revisjon fra skyen tas inn', () => {
  const s = withFinding({ id: 'f1', rev: 2, state: 'triage', title: 'Løs planke' });
  const next = mergeRemoteFinding(s, { id: 'f1', rev: 3, state: 'vurdert', title: 'Løs planke', updatedBy: 'Kari' });
  assert.notEqual(next, s);
  assert.equal(next.findings[0].state, 'vurdert');
  assert.equal(next.findings[0].restricted, false);
});

test('DRIFT-23: lik eller eldre revisjon endrer ingenting', () => {
  const s = withFinding({ id: 'f1', rev: 4, state: 'tiltak' });
  assert.equal(mergeRemoteFinding(s, { id: 'f1', rev: 4, state: 'triage' }), s);
  assert.equal(mergeRemoteFinding(s, { id: 'f1', rev: 3, state: 'triage' }), s);
  assert.equal(mergeRemoteFinding(s, null), s);
});

test('DRIFT-23: krav-id-er med utgave gjøres om som ved lasting, og skjermet sak beholder flagget', () => {
  const s = withFinding({ id: 'f1', rev: 1, restricted: true });
  const next = mergeRemoteFinding(s, { id: 'f1', rev: 2, restricted: true, links: { requirementIds: ['req_45001_2018_hazard'] } });
  assert.equal(next.findings[0].restricted, true);
  assert.ok(!next.findings[0].links.requirementIds[0].includes('2018'));
});
