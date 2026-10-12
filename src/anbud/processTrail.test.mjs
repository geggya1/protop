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
assert.equal(steps[1].label, 'Vurdering');
assert.equal(steps[1].detail, 'Under vurdering');
assert.equal(steps[1].done, true);
assert.equal(steps[1].at, '2026-10-12T09:00:00.000Z');
assert.equal(steps[2].label, 'Tilbudsarbeid');
assert.equal(steps[2].done, false);
assert.equal(steps[2].detail, 'Ikke startet');
assert.equal(steps[3].label, 'Tilbud levert');
assert.equal(steps[3].done, false);
assert.equal(steps[4].label, 'Status konkurranse');
assert.equal(steps[4].done, false);

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
assert.equal(bidSteps[1].label, 'Vurdering');
assert.equal(bidSteps[1].detail, 'Gi tilbud');
assert.equal(bidSteps[1].done, true);
assert.equal(bidSteps[2].done, true);
assert.equal(bidSteps[2].detail, 'Pågår · Rådgivning · Ada');
assert.equal(bidSteps[2].at, '2026-10-12T10:00:00.000Z');
assert.equal(bidSteps[3].done, false);
assert.equal(bidSteps[4].done, false);

const manual = processStepsForInquiry({
  source: 'manuell',
  channel: 'epost',
  createdAt: '2026-10-01T08:00:00.000Z',
  status: 'mottatt',
});
assert.equal(manual[0].label, 'Anbudsforespørsel');
assert.equal(manual[0].detail, 'E-post');
assert.equal(manual[1].label, 'Vurdering');
assert.equal(manual[1].detail, 'Under vurdering');
assert.equal(manual[1].done, true);
assert.equal(manual[2].done, false);
assert.equal(manual[3].label, 'Tilbud levert');
assert.equal(manual[4].label, 'Status konkurranse');

const received = processStepsForInquiry({
  source: 'protop',
  queueKind: 'protop',
  fromName: 'Veidekke',
  createdAt: '2026-10-02T08:00:00.000Z',
  status: 'mottatt',
});
assert.equal(received[0].label, 'Anbudsforespørsel');
assert.equal(received[0].detail, 'Veidekke');

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

const submitted = processStepsForBid({
  source: 'varsling',
  noticeId: '2026-2',
  stage: 'levert',
  createdAt: '2026-10-12T10:00:00.000Z',
  submittedAt: '2026-10-20T15:00:00.000Z',
  assignment: { personName: 'Ada' },
});
assert.equal(submitted[2].detail, 'Avsluttet · Ada');
assert.equal(submitted[3].done, true);
assert.equal(submitted[3].detail, 'Levert');
assert.equal(submitted[3].at, '2026-10-20T15:00:00.000Z');
assert.equal(submitted[4].done, false);
assert.equal(submitted[4].detail, 'Venter på avgjørelse');

const won = processStepsForBid({
  source: 'varsling',
  noticeId: '2026-3',
  stage: 'kontrakt',
  createdAt: '2026-10-12T10:00:00.000Z',
  closedAt: '2026-11-02T08:00:00.000Z',
});
assert.equal(won[2].detail, 'Avsluttet');
assert.equal(won[3].done, true);
assert.equal(won[4].done, true);
assert.equal(won[4].detail, 'Vunnet');
assert.equal(won[4].at, '2026-11-02T08:00:00.000Z');

const lost = processStepsForBid({
  source: 'varsling',
  noticeId: '2026-4',
  stage: 'tapt',
  createdAt: '2026-10-12T10:00:00.000Z',
  closedAt: '2026-11-03T08:00:00.000Z',
});
assert.equal(lost[3].done, false);
assert.equal(lost[4].detail, 'Tapt');
assert.equal(lost[4].done, true);

const withdrawn = processStepsForInquiry({
  source: 'manuell',
  channel: 'telefon',
  status: 'tilbud',
  createdAt: '2026-10-01T08:00:00.000Z',
}, {
  stage: 'trukket',
  submittedAt: '2026-10-18T12:00:00.000Z',
  closedAt: '2026-10-19T12:00:00.000Z',
  createdAt: '2026-10-04T08:00:00.000Z',
});
assert.equal(withdrawn[0].detail, 'Telefon');
assert.equal(withdrawn[2].detail, 'Avsluttet');
assert.equal(withdrawn[3].done, true);
assert.equal(withdrawn[4].detail, 'Trukket');

const declined = processStepsForNotice({
  source: 'doffin',
  decision: 'forkastet',
  reviewedAt: '2026-10-11T08:00:00.000Z',
});
assert.equal(declined[1].detail, 'Ikke gi tilbud');
assert.equal(declined[1].done, true);
assert.equal(declined[2].done, false);

console.log('processTrail.test.mjs ok');
