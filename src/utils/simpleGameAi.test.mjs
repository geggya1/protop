import assert from 'node:assert/strict';
import {
  chooseTttAiMove,
  chooseConnect4AiMove,
  applyConnect4Drop,
  emptyConnect4Board,
} from './simpleGameAi.js';

// TTT: AI takes winning move
{
  const board = ['O', 'O', null, 'X', 'X', null, null, null, null];
  assert.equal(chooseTttAiMove(board, 'O', 'hard', () => 0), 2);
}

// TTT: AI blocks
{
  const board = ['X', 'X', null, 'O', null, null, null, null, null];
  assert.equal(chooseTttAiMove(board, 'O', 'hard', () => 0), 2);
}

// Connect4: AI wins when possible
{
  const g = emptyConnect4Board();
  // Fill column 0 with three AI pieces (player 2)
  for (let r = 5; r >= 3; r -= 1) g[r][0] = 2;
  g[5][1] = 1;
  g[4][1] = 1;
  assert.equal(chooseConnect4AiMove(g, 2, 'hard', () => 0), 0);
}

// Connect4 drop helper
{
  const g = emptyConnect4Board();
  const a = applyConnect4Drop(g, 3, 1);
  assert.equal(a.row, 5);
  assert.equal(a.grid[5][3], 1);
  assert.equal(a.won, false);
}

console.log('simpleGameAi.test.mjs ok');
