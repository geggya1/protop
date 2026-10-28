import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  companyOrgnr, orgnrIndexDecision, orgnrIndexRecord, pickOrgnrOwner, timeMillis,
} from './orgnrIndex.js';

const ORG = '999888777';
const company = (id, extra = {}, createTime = null) => ({
  id, createTime, data: { name: id, orgnr: ORG, ...extra },
});

test('orgnummeret leses fra toppfeltet eller selskapsprofilen', () => {
  assert.equal(companyOrgnr({ orgnr: '999 888 777' }), ORG);
  assert.equal(companyOrgnr({ company: { organisasjonsnummer: '999888777' } }), ORG);
  assert.equal(companyOrgnr({ orgnr: '123' }), '');
  assert.equal(companyOrgnr(null), '');
});

test('tid fra Timestamp, Date, tall og tekst; ukjent kommer sist', () => {
  assert.equal(timeMillis({ toMillis: () => 5 }), 5);
  assert.equal(timeMillis(new Date(7)), 7);
  assert.equal(timeMillis(9), 9);
  assert.equal(timeMillis({ _seconds: 2, _nanoseconds: 5e6 }), 2005);
  assert.equal(timeMillis('1970-01-01T00:00:00.010Z'), 10);
  assert.equal(timeMillis(null), Infinity);
  assert.equal(timeMillis('tull'), Infinity);
});

test('den eldste levende bedriften vinner, uavhengig av rekkefølgen i svaret', () => {
  const old = company('zz-eldst', {}, 100);
  const young = company('aa-ny', {}, 200);
  assert.equal(pickOrgnrOwner([young, old], ORG).id, 'zz-eldst');
  assert.equal(pickOrgnrOwner([old, young], ORG).id, 'zz-eldst');
  // Slettet, skjult eller annet orgnr teller ikke.
  const deleted = company('slettet', { deleted: true }, 1);
  const hidden = company('skjult', { hiddenFromApp: true }, 1);
  const other = company('annen', { orgnr: '111222333' }, 1);
  assert.equal(pickOrgnrOwner([deleted, hidden, other, young], ORG).id, 'aa-ny');
  assert.equal(pickOrgnrOwner([deleted], ORG), null);
  assert.equal(pickOrgnrOwner([old], '123'), null);
});

test('createTime fra Firestore vinner over createdAt klienten har skrevet', () => {
  // Angriperen setter createdAt langt tilbake, men dokumentet er nytt.
  const legit = company('ekte', { createdAt: '2026-01-01T00:00:00Z' }, Date.parse('2026-01-01T00:00:00Z'));
  const forged = company('falsk', { createdAt: '2001-01-01T00:00:00Z' }, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(pickOrgnrOwner([forged, legit], ORG).id, 'ekte');
  // Uten createTime brukes createdAt, og lik tid avgjøres av id.
  assert.equal(pickOrgnrOwner([company('b', { createdAt: 5 }), company('a', { createdAt: 5 })], ORG).id, 'a');
});

test('indeksen beholdes så lenge bedriften lever og har orgnummeret', () => {
  const pinned = company('fast', {}, 500);
  const older = company('eldre', {}, 100);
  const index = { familyId: 'fast', orgnr: ORG };
  // En eldre bedrift som senere har fått samme orgnr, tar ikke over oppslaget.
  assert.deepEqual(
    orgnrIndexDecision({ orgnr: ORG, index, indexed: pinned, candidates: [older, pinned] }),
    { owner: pinned, write: null },
  );
  // Bedriften er slettet eller har byttet orgnr: den eldste levende tar over.
  const gone = company('fast', { deleted: true }, 500);
  assert.deepEqual(
    orgnrIndexDecision({ orgnr: ORG, index, indexed: gone, candidates: [older, gone] }),
    { owner: older, write: 'set' },
  );
  const moved = company('fast', { orgnr: '111222333', company: {} }, 500);
  assert.equal(orgnrIndexDecision({ orgnr: ORG, index, indexed: moved, candidates: [older] }).owner.id, 'eldre');
  // Ingen igjen: indeksen fjernes.
  assert.deepEqual(orgnrIndexDecision({ orgnr: ORG, index, indexed: gone, candidates: [gone] }), { owner: null, write: 'delete' });
  // Ingen indeks og ingen bedrift: ingenting skrives.
  assert.deepEqual(orgnrIndexDecision({ orgnr: ORG, candidates: [] }), { owner: null, write: null });
  assert.deepEqual(orgnrIndexDecision({ orgnr: '12', candidates: [older] }), { owner: null, write: null });
});

test('indeksdokumentet har bare orgnr, bedrift, kilde og hvem', () => {
  assert.deepEqual(orgnrIndexRecord({ orgnr: '999 888 777', familyId: 'A', source: 'create', claimedBy: 'u1' }), {
    orgnr: ORG, familyId: 'A', source: 'create', claimedBy: 'u1',
  });
});
