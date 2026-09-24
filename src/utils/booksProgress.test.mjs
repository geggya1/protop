import assert from 'node:assert/strict';
import {
  BOOK_STATUS,
  progressPatchForPages,
  finishedPatchForBook,
  reopenReadingPatch,
  effectiveBookStatus,
  isBookUnread,
  progressPct,
  normalizeBookPages,
  bookNavPayload,
} from './booksProgress.js';

const zero = progressPatchForPages(
  { status: BOOK_STATUS.finished, totalPages: 200, pagesRead: 200 },
  0,
);
assert.equal(zero.pagesRead, 0);
assert.equal(zero.status, BOOK_STATUS.reading);
assert.equal(zero.finishedAt, null);

const mid = progressPatchForPages(
  { status: BOOK_STATUS.finished, totalPages: 100, pagesRead: 100 },
  40,
);
assert.equal(mid.pagesRead, 40);
assert.equal(mid.status, BOOK_STATUS.reading);

const reading = progressPatchForPages(
  { status: BOOK_STATUS.reading, totalPages: 100, pagesRead: 10 },
  25,
);
assert.equal(reading.pagesRead, 25);
assert.equal(reading.status, undefined);

const fin = finishedPatchForBook({ totalPages: 120, pagesRead: 30 }, 30);
assert.equal(fin.pagesRead, 120);
assert.equal(fin.status, BOOK_STATUS.finished);

const finNoTotal = finishedPatchForBook({ pagesRead: 0 }, 0);
assert.equal(finNoTotal.pagesRead, 1);
assert.equal(finNoTotal.status, BOOK_STATUS.finished);

const reopen = reopenReadingPatch({ totalPages: 80, pagesRead: 80 }, 80);
assert.equal(reopen.status, BOOK_STATUS.reading);
assert.ok(reopen.pagesRead < 80);

assert.equal(isBookUnread({ pagesRead: 0, status: BOOK_STATUS.finished }), true);
assert.equal(effectiveBookStatus({ pagesRead: 0, status: BOOK_STATUS.finished }), BOOK_STATUS.reading);
assert.equal(effectiveBookStatus({ pagesRead: 50, status: BOOK_STATUS.finished }), BOOK_STATUS.finished);

assert.equal(progressPct({ totalPages: 200, pagesRead: 50 }), 25);
assert.equal(progressPct({ totalPages: 200, pagesRead: 0 }), 0);
assert.equal(progressPct({ totalPages: 200 }), 0);
assert.equal(progressPct({ totalPages: 200, pagesRead: null }), 0);
assert.equal(progressPct({ totalPages: 200, pagesRead: Number.NaN }), 0);
assert.equal(progressPct({ totalPages: 0, pagesRead: 10 }), null);
assert.equal(progressPct({ pagesRead: 10 }), null);
assert.ok(Number.isFinite(progressPct({ totalPages: 100, pagesRead: undefined })));

const pages = normalizeBookPages({ totalPages: '320', pagesRead: undefined });
assert.equal(pages.totalPages, 320);
assert.equal(pages.pagesRead, 0);

const payload = bookNavPayload({
  id: 'b1',
  title: 'Test',
  totalPages: 100,
  pagesRead: 40,
  status: BOOK_STATUS.reading,
  createdAt: { seconds: 1, nanoseconds: 0, toDate() { return new Date(); } },
});
assert.equal(payload.pagesRead, 40);
assert.equal(payload.totalPages, 100);
assert.equal(payload.createdAt, undefined);

console.log('booksProgress.test.mjs: ok');
