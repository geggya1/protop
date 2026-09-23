import assert from 'node:assert/strict';
import {
  emptyBoard,
  boardToFlat,
  boardFromStored,
  dropRow,
  hasConnect4Win,
  isBoardFull,
  myConnect4Mark,
} from './connect4Logic.js';

function place(grid, col, player) {
  const row = dropRow(grid, col);
  assert.ok(row >= 0, `column ${col} full`);
  grid[row][col] = player;
  return row;
}

{
  const g = emptyBoard();
  assert.equal(g.length, 6);
  assert.equal(g[0].length, 7);
  assert.equal(dropRow(g, 0), 5);
  assert.equal(isBoardFull(g), false);
}

{
  const flat = boardToFlat(emptyBoard());
  assert.equal(flat.length, 42);
  assert.ok(flat.every((c) => c === 0));
  assert.equal(Array.isArray(flat[0]), false);

  const g = emptyBoard();
  place(g, 0, 1);
  place(g, 3, 2);
  const stored = boardToFlat(g);
  const roundTrip = boardFromStored(stored);
  assert.equal(roundTrip[5][0], 1);
  assert.equal(roundTrip[5][3], 2);

  // Legacy nested boards still load
  const legacy = boardFromStored(g);
  assert.equal(legacy[5][0], 1);
  assert.equal(legacy[5][3], 2);
}

{
  const g = emptyBoard();
  place(g, 0, 1);
  place(g, 1, 1);
  place(g, 2, 1);
  const r = place(g, 3, 1);
  assert.equal(hasConnect4Win(g, r, 3, 1), true);
}

{
  const g = emptyBoard();
  let r;
  for (let i = 0; i < 4; i += 1) r = place(g, 2, 2);
  assert.equal(hasConnect4Win(g, r, 2, 2), true);
}

{
  const g = emptyBoard();
  // diagonal /
  place(g, 0, 1);
  place(g, 1, 2); place(g, 1, 1);
  place(g, 2, 2); place(g, 2, 2); place(g, 2, 1);
  place(g, 3, 2); place(g, 3, 2); place(g, 3, 2);
  const r = place(g, 3, 1);
  assert.equal(hasConnect4Win(g, r, 3, 1), true);
}

{
  const g = emptyBoard();
  place(g, 0, 1);
  place(g, 1, 1);
  place(g, 2, 1);
  assert.equal(hasConnect4Win(g, 5, 2, 1), false);
}

{
  assert.equal(myConnect4Mark({ player1: { uid: 'a' }, player2: { uid: 'b' } }, 'a'), 1);
  assert.equal(myConnect4Mark({ player1: { uid: 'a' }, player2: { uid: 'b' } }, 'b'), 2);
  assert.equal(myConnect4Mark({ player1: { uid: 'a' }, player2: { uid: 'b' } }, 'c'), null);
}

console.log('connect4Logic.test.mjs: ok');
