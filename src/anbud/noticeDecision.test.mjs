import assert from 'node:assert/strict';
import {
  emptyAnbudState,
  nextNoticeDecision,
  sameMarkGesture,
  setNoticeDecision,
} from './model.js';
import { noticeDeadlineExpired } from './model.js';
import { noticeIsCurrent, noticeIsRejected, noticeNeedsReview } from './noticeText.js';

assert.equal(nextNoticeDecision('ubestemt', 'aktuell', { toggle: false }), 'aktuell');
assert.equal(nextNoticeDecision('aktuell', 'aktuell', { toggle: false }), 'aktuell');
assert.equal(nextNoticeDecision('aktuell', 'aktuell', { toggle: true }), 'ubestemt');
assert.equal(nextNoticeDecision('ubestemt', 'forkastet', { toggle: false }), 'forkastet');
assert.equal(nextNoticeDecision('forkastet', 'aktuell', { toggle: false }), 'aktuell');
assert.equal(nextNoticeDecision('ubestemt', 'tilbud', { toggle: false }), 'ubestemt');

assert.equal(sameMarkGesture({ key: 'a', at: 1000 }, 'a', 1000), true);
assert.equal(sameMarkGesture({ key: 'a', at: 1000 }, 'a', 1799), true);
assert.equal(sameMarkGesture({ key: 'a', at: 1000 }, 'a', 1800), false);
assert.equal(sameMarkGesture({ key: 'a', at: 1000 }, 'b', 1000), false);

function inNye(row) {
  const expired = noticeDeadlineExpired(row);
  const rejected = noticeIsRejected(row);
  return !rejected && !expired && noticeNeedsReview(row);
}

function inAktuelle(row) {
  if (row.decision === 'tilbud') return false;
  return noticeIsCurrent(row) && !noticeIsRejected(row);
}

const start = {
  ...emptyAnbudState(),
  notices: [{ id: 'ted-1882', title: 'Norway – Architectural', decision: 'ubestemt', deadline: '2026-12-01' }],
};

function file(state, id, decision, toggle) {
  const current = state.notices.find((row) => row.id === id);
  const next = nextNoticeDecision(current?.decision, decision, { toggle });
  if (current?.decision === next) return state;
  return setNoticeDecision(state, id, next).state;
}

const marked = file(start, 'ted-1882', 'aktuell', false);
assert.equal(marked.notices[0].decision, 'aktuell');
assert.equal(inNye(marked.notices[0]), false);
assert.equal(inAktuelle(marked.notices[0]), true);

const again = file(marked, 'ted-1882', 'aktuell', false);
assert.equal(again.notices[0].decision, 'aktuell');
assert.equal(inAktuelle(again.notices[0]), true);

const ghost = file(file(start, 'ted-1882', 'aktuell', true), 'ted-1882', 'aktuell', true);
assert.equal(ghost.notices[0].decision, 'ubestemt');
assert.equal(inNye(ghost.notices[0]), true);
assert.equal(inAktuelle(ghost.notices[0]), false);

let stayed = start;
const stamp = { key: '', at: 0 };
for (const at of [5000, 5000, 5200]) {
  const key = 'ted-1882\0aktuell\0s';
  if (sameMarkGesture(stamp, key, at)) continue;
  stamp.key = key;
  stamp.at = at;
  stayed = file(stayed, 'ted-1882', 'aktuell', false);
}
assert.equal(stayed.notices[0].decision, 'aktuell');
assert.equal(inNye(stayed.notices[0]), false);
assert.equal(inAktuelle(stayed.notices[0]), true);

console.log('noticeDecision.test.mjs ok');
