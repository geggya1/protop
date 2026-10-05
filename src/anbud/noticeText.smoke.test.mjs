import assert from 'node:assert/strict';
import {
  deadlineInfo,
  formatNoticeText,
  officialNoticeUrl,
  sourceLabel,
  noticeIsRejected,
  noticeNeedsReview,
  noticeIsCurrent,
} from './noticeText.js';

// Sammenhengende tekst uten mellomrom etter punktum
const messy = 'Oppdraget gjelder rehabilitering.Arbeidet omfatter fasade og tak med tilhørende arbeider. Beskrivelse: Bygg i tre etasjer. Tilleggsinformasjon: Adkomst via port A.';
const clean = formatNoticeText(messy);
assert.match(clean, /rehabilitering\./);
assert.match(clean, /Arbeidet omfatter/);
assert.match(clean, /\n\nBeskrivelse:/);
assert.match(clean, /\n\nTilleggsinformasjon:/);

// Hyyr/Mercell skal aldri bli offisiell lenke når Doffin-id finnes
assert.equal(
  officialNoticeUrl({
    id: '2026-123',
    source: 'doffin',
    url: 'https://hyyr.no/tender/abc',
  }),
  'https://www.doffin.no/notices/2026-123',
);
assert.equal(
  officialNoticeUrl({
    id: '2026-123',
    source: 'doffin',
    url: 'https://my.mercell.com/nb-no/m/Tender.aspx?id=1',
  }),
  'https://www.doffin.no/notices/2026-123',
);
assert.equal(sourceLabel({ source: 'doffin' }), 'Doffin');

// Pedagogisk frist
const inThree = deadlineInfo('2099-03-13', new Date('2099-03-10T09:00:00'));
assert.equal(inThree.daysLeft, 3);
assert.equal(inThree.tone, 'warn');
assert.match(inThree.detail, /nærmer seg/);

// Filterklassifisering
assert.equal(noticeNeedsReview({ decision: 'ubestemt' }), true);
assert.equal(noticeIsCurrent({ decision: 'aktuell' }), true);
assert.equal(noticeIsRejected({ decision: 'forkastet' }), true);
assert.equal(noticeIsRejected({ decision: 'ikke' }), true);

console.log('noticeText.smoke.test.mjs ok');
