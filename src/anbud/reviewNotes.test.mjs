import assert from 'node:assert/strict';
import {
  createBidWork,
  createManualBidWork,
  emptyAnbudState,
  normalizeAnbudState,
  saveNoticeReviewNotes,
  setNoticeDecision,
} from './model.js';
import { saveBidReviewNotes } from './bidLibrary.js';
import { deleteReviewNote, notesWithDraft, upsertReviewNote } from './reviewNotes.js';

const first = upsertReviewNote([], { text: 'For langt unna.' });
assert.equal(first.ok, true);
assert.equal(first.notes.length, 1);
const edited = upsertReviewNote(first.notes, { id: first.notes[0].id, text: 'Kapasitet mangler i perioden.' });
assert.equal(edited.notes[0].text, 'Kapasitet mangler i perioden.');
assert.equal(edited.notes[0].id, first.notes[0].id);
const removed = deleteReviewNote(edited.notes, edited.notes[0].id);
assert.equal(removed.notes.length, 0);
assert.equal(upsertReviewNote([], { text: '   ' }).ok, false);

const base = {
  ...emptyAnbudState(),
  notices: [{
    id: '2026-1',
    title: 'Skole',
    buyer: 'Kommune',
    decision: 'aktuell',
    publishedAt: '2026-10-01',
    interestAt: '2026-10-02T08:00:00.000Z',
    reviewNotes: first.notes,
  }],
  bids: [],
};
const kept = normalizeAnbudState(base);
assert.equal(kept.notices[0].reviewNotes[0].text, 'For langt unna.');
const declined = setNoticeDecision(kept, '2026-1', 'ikke');
assert.equal(declined.state.notices[0].decision, 'ikke');
assert.equal(declined.state.notices[0].reviewNotes[0].text, 'For langt unna.');

const noted = saveNoticeReviewNotes(base, '2026-1', notesWithDraft(first.notes, 'Se også reisetid', ''));
assert.equal(noted.ok, true);
assert.equal(noted.state.notices[0].reviewNotes.length, 2);
const bid = createBidWork(noted.state, '2026-1', {
  personId: 'ada',
  personName: 'Ada Nord',
  unitId: 'avd',
  unitName: 'Rådgivning',
});
assert.equal(bid.ok, true);
assert.equal(bid.state.bids[0].reviewNotes.length, 2);
assert.match(bid.state.bids[0].reviewNotes.map((row) => row.text).join(' '), /reisetid/);
const changed = saveBidReviewNotes(bid.state, bid.state.bids[0].id, [bid.state.bids[0].reviewNotes[0]]);
assert.equal(changed.state.bids[0].reviewNotes.length, 1);

const manual = createManualBidWork(emptyAnbudState(), {
  title: 'Brøyting',
  buyer: 'Sortland',
  inquiryId: 'in_1',
  reviewNotes: [{ id: 'rn_1', text: 'For lite volum.', createdAt: '2026-10-12T10:00:00.000Z' }],
});
assert.equal(manual.state.bids[0].reviewNotes[0].text, 'For lite volum.');

console.log('reviewNotes.test.mjs ok');
