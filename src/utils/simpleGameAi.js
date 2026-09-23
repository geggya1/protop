/**
 * Enkel AI for tre på rad og fire på rad.
 */

import { checkWinner } from './ticTacToeLogic.js';
import {
  C4_COLS,
  emptyBoard,
  hasConnect4Win,
  isBoardFull,
  dropRow,
} from './connect4Logic.js';

function pickRandom(list, rng = Math.random) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

/** @returns {number|null} cell index 0–8 */
export function chooseTttAiMove(board, aiMark = 'O', difficulty = 'medium', rng = Math.random) {
  const empty = [];
  for (let i = 0; i < 9; i += 1) if (!board[i]) empty.push(i);
  if (!empty.length) return null;

  const human = aiMark === 'X' ? 'O' : 'X';
  const tryWin = (mark) => {
    for (const i of empty) {
      const next = board.slice();
      next[i] = mark;
      if (checkWinner(next) === mark) return i;
    }
    return null;
  };

  if (difficulty !== 'easy') {
    const win = tryWin(aiMark);
    if (win != null) return win;
    const block = tryWin(human);
    if (block != null) return block;
  }

  if (difficulty === 'hard') {
    if (!board[4] && empty.includes(4)) return 4;
    const corners = [0, 2, 6, 8].filter((i) => empty.includes(i));
    if (corners.length) return pickRandom(corners, rng);
  }

  if (difficulty === 'medium' && rng() < 0.55) {
    const win = tryWin(aiMark);
    if (win != null) return win;
    const block = tryWin(human);
    if (block != null) return block;
  }

  return pickRandom(empty, rng);
}

/** @returns {number|null} column 0–6 */
export function chooseConnect4AiMove(grid, aiPlayer = 2, difficulty = 'medium', rng = Math.random) {
  const human = aiPlayer === 1 ? 2 : 1;
  const legal = [];
  for (let c = 0; c < C4_COLS; c += 1) {
    if (dropRow(grid, c) >= 0) legal.push(c);
  }
  if (!legal.length) return null;

  const simulate = (col, player) => {
    const row = dropRow(grid, col);
    if (row < 0) return null;
    const next = grid.map((r) => r.slice());
    next[row][col] = player;
    return { next, row };
  };

  const winningCols = (player) => legal.filter((c) => {
    const sim = simulate(c, player);
    return sim && hasConnect4Win(sim.next, sim.row, c, player);
  });

  if (difficulty !== 'easy') {
    const wins = winningCols(aiPlayer);
    if (wins.length) return pickRandom(wins, rng);
    const blocks = winningCols(human);
    if (blocks.length) return pickRandom(blocks, rng);
  }

  if (difficulty === 'hard') {
    // Prefer center columns
    const ranked = [...legal].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
    for (const c of ranked) {
      const sim = simulate(c, aiPlayer);
      if (!sim) continue;
      // Avoid giving opponent an immediate win
      let givesWin = false;
      for (let oc = 0; oc < C4_COLS; oc += 1) {
        const orow = dropRow(sim.next, oc);
        if (orow < 0) continue;
        const og = sim.next.map((r) => r.slice());
        og[orow][oc] = human;
        if (hasConnect4Win(og, orow, oc, human)) {
          givesWin = true;
          break;
        }
      }
      if (!givesWin) return c;
    }
  }

  if (difficulty === 'medium' && rng() < 0.5) {
    const mid = legal.filter((c) => c >= 2 && c <= 4);
    if (mid.length) return pickRandom(mid, rng);
  }

  return pickRandom(legal, rng);
}

export function applyConnect4Drop(grid, col, player) {
  const row = dropRow(grid, col);
  if (row < 0) return null;
  const next = grid.map((r) => r.slice());
  next[row][col] = player;
  const won = hasConnect4Win(next, row, col, player);
  const draw = !won && isBoardFull(next);
  return { grid: next, row, won, draw };
}

export { emptyBoard as emptyConnect4Board };
