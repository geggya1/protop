import assert from 'node:assert/strict';
import {
  GRID_COLS,
  GRID_SPANS,
  MAX_CONTENT_WIDGET_GH,
  MAX_DENSE_WIDGET_GH,
  canPlace,
  clampContentWidgetHeight,
  compactGrid,
  displayHomeWidgets,
  firstFit,
  fitHomeWidgets,
  fitTimelineWidgets,
  intendedPlacement,
  layoutWidgets,
  moveWidgetOnGrid,
  nearestFit,
  nextSpan,
  nextSpanForType,
  pointerToCell,
  preferredListGh,
  preferredProgressGh,
  preferredSchoolGh,
  preferredShoppingGh,
  preferredTasksGh,
  preferredTimelineGh,
  resizeWidgetOnGrid,
  timelineDisplayGh,
  usedRows,
  widgetBox,
  widgetIsCompact,
  widgetIsNarrow,
  widgetIsWide,
} from './homeGrid.js';

assert.equal(GRID_COLS, 5);
assert.equal(MAX_CONTENT_WIDGET_GH, 2);
assert.equal(MAX_DENSE_WIDGET_GH, 3);
assert.deepEqual(nextSpan(2, 2), GRID_SPANS.rect);
assert.deepEqual(nextSpan(3, 2), GRID_SPANS.columnTall);
assert.deepEqual(nextSpan(2, 3), GRID_SPANS.rectTall);
assert.deepEqual(nextSpan(3, 3), GRID_SPANS.slim);
assert.deepEqual(nextSpan(5, 1), GRID_SPANS.wide);
assert.deepEqual(nextSpan(5, 2), GRID_SPANS.tall);
assert.deepEqual(nextSpan(5, 3), GRID_SPANS.square);

assert.equal(preferredTimelineGh(0), 1);
assert.equal(preferredTimelineGh(2), 2);
assert.equal(preferredTimelineGh(3), 2);
assert.equal(preferredTimelineGh(5), 2);
assert.equal(timelineDisplayGh(3, 2), 2);
assert.equal(timelineDisplayGh(1, 5), 1);
assert.equal(preferredTasksGh(0), 2);
assert.equal(preferredTasksGh(1), 2);
assert.equal(preferredTasksGh(2), 2);
assert.equal(preferredTasksGh(3), 2);
assert.equal(preferredTasksGh(5), 2);
assert.equal(preferredListGh(0), 2);
assert.equal(preferredListGh(2), 2);
assert.equal(preferredListGh(3), 2);
assert.equal(preferredSchoolGh(0), 2);
assert.equal(preferredSchoolGh(2), 2);
assert.equal(preferredSchoolGh(3), 2);
assert.equal(preferredProgressGh(3), 3);
assert.equal(preferredShoppingGh(5), 3);
assert.deepEqual(nextSpanForType('timeline', 5, 2), GRID_SPANS.slim);
assert.deepEqual(nextSpanForType('timeline', 5, 1), GRID_SPANS.wide);
assert.deepEqual(nextSpanForType('tasks', 5, 2), GRID_SPANS.square);
assert.deepEqual(nextSpanForType('progress', 3, 2), GRID_SPANS.columnTall);
assert.deepEqual(nextSpanForType('shopping', 2, 2), GRID_SPANS.rect);
assert.deepEqual(nextSpanForType('family', 2, 2), GRID_SPANS.rect);
assert.deepEqual(nextSpanForType('weather', 2, 2), GRID_SPANS.rect);

const a = { id: 'a', type: 'weather', gw: 2, gh: 2 };
const placedA = firstFit([], a);
assert.deepEqual(placedA, { col: 0, row: 0, gw: 2, gh: 2 });

const b = { id: 'b', type: 'nextEvent', gw: 3, gh: 2 };
const placedB = firstFit([{ ...a, ...placedA }], b);
assert.deepEqual(placedB, { col: 2, row: 0, gw: 3, gh: 2 });

const laid = layoutWidgets([
  { id: 'w', type: 'weather', gw: 2, gh: 2 },
  { id: 'n', type: 'nextEvent', gw: 3, gh: 2 },
  { id: 'k', type: 'kids', gw: 5, gh: 2 },
]);
assert.equal(laid[0].col, 0);
assert.equal(laid[0].gw, 2);
assert.equal(laid[1].col, 2);
assert.equal(laid[1].gw, 3);
assert.equal(laid[2].row, 2);
assert.equal(laid[2].gw, 5);

assert.equal(canPlace(laid, laid[0], 0, 0, 'w'), true);
assert.equal(canPlace(laid, { ...laid[0], gw: 2, gh: 2 }, 2, 0, 'w'), false);

const moved = moveWidgetOnGrid(laid, 'w', 0, 4);
assert.equal(moved.find((x) => x.id === 'w').row, 4);
assert.equal(moved.find((x) => x.id === 'w').col, 0);

const swapped = moveWidgetOnGrid(laid, 'w', 2, 0);
const weatherAfter = swapped.find((x) => x.id === 'w');
const nextAfter = swapped.find((x) => x.id === 'n');
assert.equal(weatherAfter.col, 2);
assert.equal(weatherAfter.row, 0);
assert.ok(nextAfter.col !== 2 || nextAfter.row !== 0);

const near = nearestFit(laid, laid[0], 2, 0, 'w');
assert.ok(near.col === 0 || near.row >= 2);

const resized = resizeWidgetOnGrid(laid, 'n', 'wide');
const wide = resized.find((x) => x.id === 'n');
assert.equal(wide.gw, 5);
assert.equal(wide.gh, 2);
assert.ok(wide.row <= 4);

const box = widgetBox({ col: 2, row: 0, gw: 3, gh: 2 }, 330);
assert.ok(box.left > 0);
assert.ok(box.width > box.left);
assert.equal(usedRows(laid), 4);

const cell = pointerToCell(0, 0, 330);
assert.deepEqual(cell, { col: 0, row: 0 });

assert.equal(widgetIsNarrow({ gw: 2, gh: 2 }), true);
assert.equal(widgetIsCompact({ gw: 3, gh: 2 }), true);
assert.equal(widgetIsWide({ gw: 5, gh: 2 }), true);
assert.deepEqual(intendedPlacement({ gw: 3, gh: 2 }, 4, 1), { col: 2, row: 1, gw: 3, gh: 2 });

// Tall timeline widgets clamp to max 2 rows; dense progress may stay at 3
const tallTimeline = clampContentWidgetHeight({
  id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 3,
});
assert.equal(tallTimeline.gh, 2);
const tallProgress = clampContentWidgetHeight({
  id: 'pg', type: 'progress', col: 0, row: 0, gw: 3, gh: 4,
});
assert.equal(tallProgress.gh, 3);
const laidTall = layoutWidgets([
  { id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 3 },
  { id: 'sq', type: 'shortcuts', col: 0, row: 3, gw: 2, gh: 2 },
]);
assert.equal(laidTall.find((w) => w.id === 'tl').gh, 2);

const board = [
  { id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'sq', type: 'shortcuts', col: 0, row: 2, gw: 2, gh: 2 },
];
const fitted = fitTimelineWidgets(board, 2);
assert.equal(fitted.find((w) => w.id === 'tl').gh, 2);
assert.equal(fitted.find((w) => w.id === 'sq').row, 2);
const fittedEmpty = fitTimelineWidgets(board, 0);
assert.equal(fittedEmpty.find((w) => w.id === 'tl').gh, 1);
assert.equal(fittedEmpty.find((w) => w.id === 'sq').row, 2);
const fittedPacked = fitTimelineWidgets([
  { id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'sq', type: 'shortcuts', col: 0, row: 3, gw: 2, gh: 2 },
], 0, { compact: true });
assert.equal(fittedPacked.find((w) => w.id === 'tl').gh, 1);
assert.equal(fittedPacked.find((w) => w.id === 'sq').row, 1);

const shot = [
  { id: 'kids', type: 'kids', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'tl', type: 'timeline', col: 0, row: 2, gw: 5, gh: 2 },
  { id: 'a', type: 'shortcuts', col: 0, row: 5, gw: 1, gh: 1 },
  { id: 'b', type: 'shortcuts', col: 1, row: 5, gw: 1, gh: 1 },
];
const shotKeep = fitTimelineWidgets(shot, 0);
assert.equal(shotKeep.find((w) => w.id === 'tl').gh, 1);
assert.equal(shotKeep.find((w) => w.id === 'a').row, 5);

const childSparse = [
  { id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'tasks', type: 'tasks', col: 0, row: 2, gw: 5, gh: 2 },
  { id: 'hw', type: 'homework', col: 0, row: 4, gw: 2, gh: 2 },
  { id: 'school', type: 'school', col: 2, row: 4, gw: 3, gh: 2 },
  { id: 'sc', type: 'shortcuts', col: 0, row: 6, gw: 5, gh: 2 },
];
const childFit = fitHomeWidgets(childSparse, {
  timeline: 2,
  tasks: 1,
  homework: 1,
  school: 0,
  shopping: 0,
  weekPlan: 0,
});
assert.equal(childFit.find((w) => w.id === 'tl').gh, 2);
assert.equal(childFit.find((w) => w.id === 'tasks').gh, 2);
assert.equal(childFit.find((w) => w.id === 'hw').gh, 2);
assert.equal(childFit.find((w) => w.id === 'sc').row, 6);

const childFull = fitHomeWidgets(childSparse, {
  timeline: 5,
  tasks: 6,
  homework: 4,
  school: 4,
});
assert.equal(childFull.find((w) => w.id === 'tasks').gh, 2);
assert.equal(childFull.find((w) => w.id === 'hw').gh, 2);
assert.equal(childFull.find((w) => w.id === 'school').gh, 2);

const parentSparse = [
  { id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'prog', type: 'progress', col: 0, row: 2, gw: 3, gh: 3 },
  { id: 'shop', type: 'shopping', col: 3, row: 2, gw: 2, gh: 3 },
  { id: 'kids', type: 'kids', col: 0, row: 5, gw: 5, gh: 2 },
];
const parentFit = fitHomeWidgets(parentSparse, {
  timeline: 1,
  shopping: 1,
  progress: 3,
  tasks: 0,
  homework: 0,
  school: 0,
  weekPlan: 0,
});
assert.equal(parentFit.find((w) => w.id === 'tl').gh, 2);
assert.equal(parentFit.find((w) => w.id === 'shop').gh, 3);
assert.equal(parentFit.find((w) => w.id === 'prog').gh, 3);
assert.equal(parentFit.find((w) => w.id === 'kids').row, 5);

const kidsTall = [
  { id: 'tl', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'kids', type: 'kids', col: 0, row: 2, gw: 5, gh: 4 },
];
const kidsFit = fitHomeWidgets(kidsTall, { timeline: 6, kids: 3 });
assert.equal(kidsFit.find((w) => w.id === 'kids').gh, 2);
assert.equal(kidsFit.find((w) => w.id === 'kids').row, 2);

const stack = [
  { id: 'top', type: 'weekPlan', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'bot', type: 'shortcuts', col: 0, row: 6, gw: 2, gh: 2 },
];
const snug = moveWidgetOnGrid(stack, 'bot', 0, 2);
assert.equal(snug.find((w) => w.id === 'top').row, 0);
assert.equal(snug.find((w) => w.id === 'bot').row, 2);

const ghost = intendedPlacement(stack[1], 0, 2);
assert.deepEqual(ghost, { col: 0, row: 2, gw: 2, gh: 2 });
assert.equal(canPlace(stack, stack[1], ghost.col, ghost.row, 'bot'), true);

const tallSaved = [
  { id: 'top', type: 'weekPlan', col: 0, row: 0, gw: 5, gh: 3 },
  { id: 'bot', type: 'shortcuts', col: 0, row: 5, gw: 2, gh: 2 },
];
const editView = displayHomeWidgets(tallSaved, { weekPlan: 0 }, { editing: true });
assert.equal(editView.find((w) => w.id === 'top').gh, 2);
assert.equal(editView.find((w) => w.id === 'bot').row, 5);
const homeView = displayHomeWidgets(tallSaved, { weekPlan: 0 }, { editing: false });
assert.equal(homeView.find((w) => w.id === 'top').gh, 2);
assert.equal(homeView.find((w) => w.id === 'bot').row, 5);

const packed = compactGrid([
  { id: 'a', type: 'weather', col: 0, row: 2, gw: 2, gh: 2 },
  { id: 'b', type: 'weather', col: 2, row: 4, gw: 2, gh: 2 },
]);
assert.equal(packed.find((w) => w.id === 'a').row, 0);
assert.equal(packed.find((w) => w.id === 'b').row, 0);

console.log('homeGrid.test.mjs: ok');
