import assert from 'node:assert/strict';
import {
  BIRTHDAY_PREP_DAYS,
  BIRTHDAY_PREP_EVENT,
  adultUidsFromMembers,
  birthdayPrepDismissKey,
  birthdayPrepNotificationId,
  birthdayPrepYear,
  buildBirthdayPrepNotificationPayload,
  buildBirthdayPrepSuggestions,
  findDueBirthdayPrep,
  firstNameFrom,
  prepTaskTitlesForMember,
} from './birthdayPrepReminder.js';

const now = new Date(2026, 8, 16); // 16. sep 2026

assert.equal(firstNameFrom('Celine Hansen'), 'Celine');
assert.equal(BIRTHDAY_PREP_DAYS, 20);

const members = [
  { id: 'c1', name: 'Celine Hansen', birthday: '2018-10-06', role: 'child', uid: 'cu1' },
  { id: 'c2', name: 'Ada', birthday: '2016-12-01', role: 'child' },
  { id: 'p1', name: 'Geir', birthday: '1985-01-01', role: 'parent', uid: 'pu1' },
  { id: 'p2', name: 'Vanessa', birthday: null, role: 'parent', uid: 'pu2' },
];

// 16. sep → 6. okt = 20 dager
const due = findDueBirthdayPrep({ members, now });
assert.equal(due.length, 1);
assert.equal(due[0].memberId, 'c1');
assert.equal(due[0].daysUntil, 20);
assert.equal(due[0].role, 'child');

const suggestions = buildBirthdayPrepSuggestions(due[0]);
assert.ok(suggestions.some((s) => /gave til Celine/i.test(s.title)));
assert.ok(suggestions.some((s) => s.action === 'openWishlist'));
assert.ok(suggestions.some((s) => s.action === 'createPartyEvent'));
assert.ok(suggestions.some((s) => s.action === 'createPrepTasks'));
assert.ok(suggestions.some((s) => s.action === 'createCakeTask'));

const payload = buildBirthdayPrepNotificationPayload({
  familyId: 'fam1',
  item: due[0],
  now,
});
assert.equal(payload.eventType, BIRTHDAY_PREP_EVENT);
assert.match(payload.title, /Celine/);
assert.equal(payload.childId, 'c1');
assert.equal(payload.memberId, 'c1');
assert.equal(
  payload.notificationId,
  birthdayPrepNotificationId('fam1', 'c1', birthdayPrepYear(due[0].nextDate, now)),
);

assert.deepEqual(adultUidsFromMembers(members).sort(), ['pu1', 'pu2']);
assert.equal(birthdayPrepDismissKey('u1', 'c1', 2026), 'weekplan.birthdayPrep.v1.u1.c1.2026');

const titles = prepTaskTitlesForMember(due[0]);
assert.ok(titles.some((t) => /gave til Celine/.test(t)));
assert.ok(titles.some((t) => /kake til Celine/.test(t)));

// Utenfor vinduet
const none = findDueBirthdayPrep({
  members: [{ id: 'x', name: 'Bo', birthday: '2019-03-01', role: 'child' }],
  now,
});
assert.equal(none.length, 0);

console.log('birthdayPrepReminder.test.mjs: ok');
