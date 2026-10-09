import assert from 'node:assert/strict';
import { weekAround } from './calendar.js';

{
  // 1. oktober 2026 er en torsdag. Uken skal være hel, mandag–søndag.
  const week = weekAround(new Date(2026, 9, 1));
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((day) => day.weekday), ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø']);
  assert.deepEqual(week.map((day) => day.key), [
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
  ]);
  assert.equal(new Set(week.map((day) => day.week)).size, 1);
}

console.log('calendar.test.mjs: ok');
