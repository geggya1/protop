import assert from 'node:assert/strict';
import {
  assignmentGap,
  assignmentHint,
  directQueueItems,
  noticesAwaitingBid,
  processStepsForBid,
  processStepsForInquiry,
  processStepsForNotice,
} from './processTrail.js';

const steps = processStepsForNotice({
  source: 'doffin',
  publishedAt: '2026-10-08',
  interestAt: '2026-10-12T09:00:00.000Z',
  decision: 'aktuell',
});
assert.equal(steps[0].label, 'Anbudsvarsling');
assert.equal(steps[0].detail, 'Doffin');
assert.equal(steps[0].done, true);
assert.equal(steps[1].label, 'Aktuell');
assert.equal(steps[1].done, true);
assert.equal(steps[2].label, 'Tilbudsarbeid');
assert.equal(steps[2].done, false);
assert.equal(steps[2].detail, 'Ikke startet');

const bidSteps = processStepsForBid({
  source: 'varsling',
  noticeId: '2026-1',
  createdAt: '2026-10-12T10:00:00.000Z',
  assignment: { unitName: 'Rådgivning', personName: 'Ada' },
}, {
  source: 'ted',
  publishedAt: '2026-10-08',
  interestAt: '2026-10-12T09:00:00.000Z',
  decision: 'tilbud',
});
assert.equal(bidSteps[0].detail, 'TED');
assert.equal(bidSteps[1].done, true);
assert.equal(bidSteps[2].done, true);
assert.equal(bidSteps[2].detail, 'Rådgivning · Ada');
assert.equal(bidSteps[2].at, '2026-10-12T10:00:00.000Z');

const manual = processStepsForInquiry({
  source: 'manuell',
  channel: 'epost',
  createdAt: '2026-10-01T08:00:00.000Z',
  status: 'mottatt',
});
assert.equal(manual[0].label, 'Manuelt registrert');
assert.equal(manual[0].detail, 'E-post');
assert.equal(manual[1].done, true);
assert.equal(manual[2].done, false);

const received = processStepsForInquiry({
  source: 'protop',
  queueKind: 'protop',
  fromName: 'Veidekke',
  createdAt: '2026-10-02T08:00:00.000Z',
  status: 'mottatt',
});
assert.equal(received[0].label, 'Mottatt i ProTop');

const queue = directQueueItems({
  inquiries: [
    { id: 'a', status: 'mottatt', createdAt: '2026-10-01' },
    { id: 'b', status: 'tilbud', bidId: 'bid_b', createdAt: '2026-10-02' },
  ],
  inbox: [{ id: 'c', status: 'mottatt', createdAt: '2026-10-03' }],
});
assert.deepEqual(queue.map((row) => row.id), ['c', 'a']);
assert.equal(queue[0].queueKind, 'protop');
assert.equal(queue[1].queueKind, 'manuell');

assert.deepEqual(
  assignmentGap({ departments: [{ id: '1' }], people: [{ id: 'p' }], unitId: '', personId: '' }),
  ['avdeling', 'person'],
);
assert.equal(assignmentGap({ departments: [], people: [], unitId: '', personId: '' }).length, 0);
assert.match(assignmentHint(['avdeling', 'person']), /avdeling og person/);
assert.match(assignmentHint([]), /3\. Tilbud/);

const waiting = noticesAwaitingBid([
  { id: '1', decision: 'aktuell', interestAt: '2026-10-01' },
  { id: '2', decision: 'forkastet' },
  { id: '3', decision: 'tilbud', interestAt: '2026-10-04' },
  { id: '4', decision: 'aktuell', interestAt: '2026-10-09' },
]);
assert.deepEqual(waiting.map((row) => row.id), ['4', '1']);

console.log('processTrail.test.mjs ok');
