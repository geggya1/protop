import assert from 'node:assert/strict';
import {
  deadlineInfo,
  deadlinePassedAt,
  formatNoticeText,
  isCompetitorPortal,
  nextRowAfterRemoval,
  noticeListFilter,
  noticeMatchesListFilter,
  officialNoticeUrl,
  parseDeadline,
  sourceLabel,
} from './noticeText.js';

const formatted = formatNoticeText(
  'Dette er første setning.Dette er andre setning som er lang nok til å bli eget avsnitt når den fortsetter med mer tekst her. Beskrivelse: Oppdraget gjelder rehabilitering.',
);
assert.match(formatted, /første setning\./);
assert.match(formatted, /\n\nBeskrivelse:/);
assert.match(formatted, /Dette er andre/);

assert.equal(isCompetitorPortal('https://my.mercell.com/tender'), true);
assert.equal(isCompetitorPortal('https://hyyr.no/tender/1'), true);
assert.equal(isCompetitorPortal('https://www.doffin.no/notices/2026-1'), false);

assert.equal(
  officialNoticeUrl({ id: '2026-1', source: 'doffin', url: 'https://permalink.mercell.com/1.aspx' }),
  'https://www.doffin.no/notices/2026-1',
);
assert.equal(
  officialNoticeUrl({ id: '123-2026', source: 'ted', url: 'https://ted.europa.eu/no/notice/-/detail/123-2026' }),
  'https://ted.europa.eu/no/notice/-/detail/123-2026',
);
assert.equal(sourceLabel({ source: 'ted' }), 'TED');
assert.equal(sourceLabel({ source: 'doffin' }), 'Doffin');

const soon = deadlineInfo('2099-01-15', new Date('2099-01-10T12:00:00'));
assert.equal(soon.daysLeft, 5);
assert.equal(soon.tone, 'warn');
assert.match(soon.headline, /5 dager/);

const today = deadlineInfo('2099-01-10', new Date('2099-01-10T08:00:00'));
assert.equal(today.daysLeft, 0);
assert.equal(today.tone, 'danger');

const gone = deadlineInfo('2099-01-01', new Date('2099-01-10T08:00:00'));
assert.ok(gone.daysLeft < 0);
assert.equal(gone.tone, 'danger');

const timed = parseDeadline('26.10.2026 08:00');
assert.equal(timed.getFullYear(), 2026);
assert.equal(timed.getMonth(), 9);
assert.equal(timed.getDate(), 26);
assert.equal(timed.getHours(), 8);
assert.equal(deadlinePassedAt('26.10.2026 08:00', new Date('2026-10-26T07:59:00')), false);
assert.equal(deadlinePassedAt('26.10.2026 08:00', new Date('2026-10-26T08:01:00')), true);

const fresh = { decision: 'ubestemt', deadline: '2099-12-01' };
const current = { decision: 'aktuell', deadline: '2020-01-01' };
const rejected = { decision: 'forkastet', deadline: '2099-12-01' };
const expired = { decision: 'ubestemt', deadline: '2020-01-01' };
assert.equal(noticeListFilter(fresh), 'nye');
assert.equal(noticeListFilter(current), 'aktuelle');
assert.equal(noticeListFilter(rejected), 'uaktuelle');
assert.equal(noticeListFilter(expired), 'utlopt');
assert.equal(noticeMatchesListFilter(fresh, 'uaktuelle'), false);
assert.equal(noticeMatchesListFilter(fresh, 'nye'), true);
assert.equal(noticeMatchesListFilter(fresh, 'alle'), true);
assert.equal(noticeMatchesListFilter(rejected, 'alle'), false);
assert.equal(noticeMatchesListFilter({ ...fresh, decision: 'aktuell' }, 'nye'), false);
assert.equal(noticeMatchesListFilter({ ...fresh, decision: 'forkastet' }, 'nye'), false);
assert.equal(nextRowAfterRemoval([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a'), 'b');
assert.equal(nextRowAfterRemoval([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b'), 'c');
assert.equal(nextRowAfterRemoval([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c'), 'b');
assert.equal(nextRowAfterRemoval([{ id: 'a' }], 'a'), '');
assert.equal(nextRowAfterRemoval([{ id: 'a' }], 'mangler'), '');

console.log('noticeText.test.mjs ok');
