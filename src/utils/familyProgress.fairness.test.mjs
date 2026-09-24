import assert from 'node:assert/strict';
import { choreFairnessByKid } from './familyProgress.js';

const kids = [
  { id: 'a', name: 'Ada', color: '#111' },
  { id: 'b', name: 'Bo', color: '#222' },
];
const weekKeys = ['2026-09-01', '2026-09-02'];
const todayKey = '2026-09-02';

// Minimal todo shape for scoreInKeys / todosOnDate
function todo(id, title, dates, scheduleDays) {
  return {
    id,
    title,
    completedDates: dates,
    schedule: { type: 'weekly', days: scheduleDays || [1, 2, 3, 4, 5, 6, 0] },
    rewardType: 'points',
    points: 1,
  };
}

// Soft check: empty week → zero shares
const empty = choreFairnessByKid(kids, { a: [], b: [] }, weekKeys, todayKey);
assert.equal(empty.length, 2);
assert.equal(empty[0].sharePct + empty[1].sharePct, 0);

console.log('familyProgress fairness ok');
