import assert from 'node:assert/strict';
import {
  courseKey,
  insertBullet,
  moveItem,
  plainFormatted,
  sortByStartDesc,
  sortCoursesDesc,
  wrapSelection,
  yearKey,
} from './cvFormat.js';

assert.equal(yearKey('2022 - 2025'), 2022);
assert.equal(yearKey(''), 0);
assert.equal(courseKey('06. 2026'), 202606);
assert.equal(courseKey('2020'), 202000);

const sorted = sortByStartDesc([
  { id: 'a', from: '2008', school: 'BTF' },
  { id: 'b', from: '2022', school: 'UiS' },
  { id: 'c', from: '2020', school: 'HFY' },
  { id: 'd', from: '', school: 'Tom' },
]);
assert.deepEqual(sorted.map((row) => row.id), ['b', 'c', 'a', 'd']);

const courses = sortCoursesDesc([
  { id: '1', date: '02. 2019', title: 'A' },
  { id: '2', date: '06. 2026', title: 'B' },
  { id: '3', date: '11. 2025', title: 'C' },
]);
assert.deepEqual(courses.map((row) => row.id), ['2', '3', '1']);

assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b']);

const bold = wrapSelection('hei verden', 0, 3, '**');
assert.equal(bold.text, '**hei** verden');
assert.equal(bold.start, 2);
assert.equal(bold.end, 5);

const italic = wrapSelection('tekst', 0, 5, '_');
assert.equal(italic.text, '_tekst_');

const under = wrapSelection('tekst', 0, 5, '__');
assert.equal(under.text, '__tekst__');

const bullet = insertBullet('Linje en\nLinje to', 0);
assert.equal(bullet.text, '• Linje en\nLinje to');

assert.equal(plainFormatted('**fet** og _kursiv_ og __under__'), 'fet og kursiv og under');
assert.equal(plainFormatted('• punkt'), '• punkt');

console.log('cvFormat.test.mjs: ok');
