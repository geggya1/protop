import assert from 'node:assert/strict';
import {
  createInitialState,
  toFen,
  fromFen,
  makeMove,
  findMove,
  getGameResult,
  isGameOver,
} from './chessEngine.js';

// Round-trip FEN for online chess storage
{
  const start = createInitialState();
  const fen = toFen(start);
  const again = fromFen(fen);
  assert.equal(toFen(again), fen);
  assert.equal(again.turn, 'w');
}

// Simulate an online move payload
{
  let state = createInitialState();
  const move = findMove(state, 6, 4, 4, 4); // e2e4
  assert.ok(move);
  state = makeMove(state, move);
  const fen = toFen(state);
  const remote = fromFen(fen);
  remote.keys = state.keys.slice();
  assert.equal(remote.turn, 'b');
  assert.equal(isGameOver(getGameResult(remote)), false);
}

console.log('chessOnline.serialize.test.mjs ok');
