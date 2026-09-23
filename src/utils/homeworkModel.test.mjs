import assert from 'node:assert/strict';
import {
  canAdultEditHomework,
  canCreateHomework,
  formatHomeworkDue,
  groupHomeworkBySubject,
  homeworkFromLegacyTodo,
  homeworkHelpPrompt,
  homeworkInWeek,
  inferSubjectId,
  isHomeworkDone,
  mapHomework,
  mergeLekserForWeek,
  resolveHomeworkSubjectId,
  subjectLabel,
} from './homeworkModel.js';

assert.equal(canAdultEditHomework({ isParent: true, isChild: false, isActingAsChild: false }), true);
assert.equal(canAdultEditHomework({ isParent: true, isChild: false, isActingAsChild: true }), true);
assert.equal(canAdultEditHomework({ isParent: false, isChild: true }), false);
assert.equal(canAdultEditHomework({ isAdmin: true, isChild: false }), true);
assert.equal(canAdultEditHomework({ isAdmin: true, isChild: true }), false);

assert.equal(canCreateHomework({ isParent: true, isChild: false, isActingAsChild: false }), true);
assert.equal(canCreateHomework({ isChild: true, lekserAllowed: true }), true);
assert.equal(canCreateHomework({ isChild: true, lekserAllowed: true, homeworkSelfEdit: false }), false);
assert.equal(canCreateHomework({ isChild: true, lekserAllowed: false }), false);
assert.equal(canCreateHomework({ isActingAsChild: true, lekserAllowed: true, homeworkSelfEdit: true }), true);
assert.equal(canCreateHomework({ isParent: true, isActingAsChild: true, homeworkSelfEdit: false, lekserAllowed: true }), true);

assert.equal(inferSubjectId('Norsk: les kapittel 4'), 'norsk');
assert.equal(inferSubjectId('Matte oppgave 3–7'), 'matematikk');
assert.equal(inferSubjectId('10 gloser'), 'annet');
assert.equal(subjectLabel('norsk'), 'Norsk');
assert.equal(resolveHomeworkSubjectId('engelsk', 'Norsk: les kapittel 4'), 'engelsk');
assert.equal(resolveHomeworkSubjectId('Norsk', 'les kapittel 4'), 'norsk');

const item = mapHomework('h1', {
  title: 'Norsk: les kapittel 4',
  description: 'Spørsmål 1–3',
  subject: 'norsk',
  dueDate: '2026-09-04',
  assignedTo: 'child-1',
});
assert.equal(item.title, 'Norsk: les kapittel 4');
assert.equal(item.subject, 'norsk');
assert.equal(isHomeworkDone(item, '2026-09-02'), false);
assert.equal(isHomeworkDone({ ...item, done: true }, '2026-09-02'), true);
assert.equal(isHomeworkDone({ ...item, completedDates: ['2026-09-02'] }, '2026-09-02'), true);

const friday = new Date(2026, 8, 4); // 4. sep 2026 is Friday
const inWeek = homeworkInWeek([item], friday);
assert.equal(inWeek.length, 1);
const nextWeek = homeworkInWeek([item], new Date(2026, 8, 14));
assert.equal(nextWeek.length, 0);

const undated = mapHomework('h2', { title: 'Øve gloser', subject: 'engelsk' });
assert.equal(homeworkInWeek([undated], new Date()).length, 1);

const legacy = homeworkFromLegacyTodo({
  id: 't1',
  title: 'Engelsk: 10 gloser',
  category: 'lekser',
  startKey: '2026-08-31',
  endKey: '2026-09-04',
  completedDates: [],
}, { childId: 'c1' });
assert.equal(legacy.source, 'legacy-todo');
assert.equal(legacy.subject, 'engelsk');
assert.equal(legacy.sourceTodoId, 't1');

const merged = mergeLekserForWeek({
  homework: [item],
  legacyTodos: [{
    id: 't1',
    title: 'Engelsk: 10 gloser',
    category: 'lekser',
    startKey: '2026-08-31',
    endKey: '2026-09-04',
  }],
  refDate: friday,
  childId: 'c1',
});
assert.equal(merged.length, 2);

const prompt = homeworkHelpPrompt(item);
assert.match(prompt, /Norsk: les kapittel 4/);
assert.match(prompt, /Fag: Norsk/);
assert.match(formatHomeworkDue('2026-09-04'), /sep/i);

const grouped = groupHomeworkBySubject([
  item,
  mapHomework('h3', { title: 'Engelsk: 10 gloser', subject: 'engelsk' }),
  mapHomework('h4', { title: 'Mer lesing', subject: 'norsk' }),
]);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].id, 'norsk');
assert.equal(grouped[0].items.length, 2);
assert.equal(grouped[1].id, 'engelsk');
assert.equal(grouped[1].items.length, 1);

console.log('homeworkModel.test.mjs ok');
