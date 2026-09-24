import assert from 'node:assert/strict';
import {
  nextOccurrence,
  daysUntil,
  formatCountdown,
  memberBirthdayItems,
  buildUpcomingList,
  availableHolidayPresets,
  assertRememberInput,
  enrichRememberItem,
  formatRememberSubtitle,
} from './rememberDatesLogic.js';

const now = new Date(2026, 8, 2); // 2. sep 2026

const christmas = nextOccurrence({ yearly: true, month: 12, day: 24 }, now);
assert.equal(christmas.getFullYear(), 2026);
assert.equal(christmas.getMonth(), 11);
assert.equal(christmas.getDate(), 24);
assert.equal(daysUntil(christmas, now), 113);
assert.equal(formatCountdown(0), 'I dag!');
assert.equal(formatCountdown(1), 'I morgen');
assert.equal(formatCountdown(5), '5 dager');

const pastOnce = enrichRememberItem({
  id: 'x',
  title: 'Ferdig',
  yearly: false,
  dateKey: '2026-01-01',
}, now);
assert.ok(pastOnce.daysUntil < 0);

const members = [
  { id: 'c1', name: 'Ada Lovecraft', birthday: '2018-09-02', role: 'child' },
  { id: 'c2', name: 'Bo', birthday: null },
];
const bdays = memberBirthdayItems(members, now);
assert.equal(bdays.length, 1);
assert.equal(bdays[0].daysUntil, 0);
assert.match(bdays[0].title, /Ada/);
assert.match(bdays[0].subtitle, /gjentas hvert år/);
assert.equal(bdays[0].role, 'child');
assert.equal(/fyller/i.test(bdays[0].subtitle), false);

const bdaySub = formatRememberSubtitle({ nextDate: christmas, yearly: true });
assert.match(bdaySub, /gjentas hvert år/);
assert.equal(/fyller/i.test(bdaySub), false);

const onceSub = formatRememberSubtitle({ nextDate: christmas, yearly: false });
assert.equal(/gjentas/i.test(onceSub), false);

const events = [
  {
    id: 'e1', title: 'Julaften', yearly: true, month: 12, day: 24,
    kind: 'holiday', presetKey: 'jul', emoji: '🎄',
  },
];
const list = buildUpcomingList({ members, events, now });
assert.ok(list[0].daysUntil === 0); // bursdag i dag først
assert.equal(availableHolidayPresets(events).some((p) => p.key === 'jul'), false);
assert.equal(availableHolidayPresets(events).some((p) => p.key === 'nyttar'), true);
assert.equal(availableHolidayPresets([]).some((p) => p.key === 'lucia'), true);
assert.equal(availableHolidayPresets([]).some((p) => p.key === 'skolestart'), true);

const ok = assertRememberInput({ title: 'Tur', dateKey: '2026-10-01', yearly: false, emoji: '✈️' });
assert.equal(ok.month, 10);
assert.equal(ok.day, 1);
assert.equal(ok.yearly, false);

let threw = false;
try {
  assertRememberInput({ title: '', dateKey: '2026-10-01' });
} catch {
  threw = true;
}
assert.equal(threw, true);

console.log('rememberDatesLogic.test.mjs: ok');
