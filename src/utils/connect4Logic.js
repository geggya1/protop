/** Pure Fire på rad helpers (no Firestore). */

export const C4_ROWS = 6;
export const C4_COLS = 7;

export function emptyBoard() {
  return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(0));
}

/** Flat 42-cell array for Firestore (nested arrays are not supported). */
export function boardToFlat(grid) {
  const out = new Array(C4_ROWS * C4_COLS);
  for (let r = 0; r < C4_ROWS; r += 1) {
    for (let c = 0; c < C4_COLS; c += 1) {
      out[r * C4_COLS + c] = grid?.[r]?.[c] ?? 0;
    }
  }
  return out;
}

/** Normalize stored board (flat or legacy 2D) to a 2D grid. */
export function boardFromStored(board) {
  if (!board) return emptyBoard();
  if (Array.isArray(board[0])) {
    return Array.from({ length: C4_ROWS }, (_, r) => (
      Array.from({ length: C4_COLS }, (_, c) => board[r]?.[c] ?? 0)
    ));
  }
  const grid = emptyBoard();
  for (let i = 0; i < Math.min(board.length, C4_ROWS * C4_COLS); i += 1) {
    grid[Math.floor(i / C4_COLS)][i % C4_COLS] = board[i] ?? 0;
  }
  return grid;
}

/** Sjekk om spiller p har fire på rad gjennom (r, c). */
export function hasConnect4Win(grid, r, c, p) {
  if (!p || r < 0 || c < 0) return false;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  return dirs.some(([dr, dc]) => {
    let n = 1;
    for (const s of [-1, 1]) {
      let rr = r + dr * s;
      let cc = c + dc * s;
      while (
        rr >= 0 && rr < C4_ROWS
        && cc >= 0 && cc < C4_COLS
        && grid[rr]?.[cc] === p
      ) {
        n += 1;
        rr += dr * s;
        cc += dc * s;
      }
    }
    return n >= 4;
  });
}

export function isBoardFull(grid) {
  return (grid || []).every((row) => (row || []).every((cell) => cell !== 0));
}

/** Finn laveste ledige rad i kolonne, eller -1. */
export function dropRow(grid, col) {
  const c = Number(col);
  if (c < 0 || c >= C4_COLS) return -1;
  for (let r = C4_ROWS - 1; r >= 0; r -= 1) {
    if (!grid[r]?.[c]) return r;
  }
  return -1;
}

export function myConnect4Mark(game, uid) {
  if (!game || !uid) return null;
  if (game.player1?.uid === uid) return 1;
  if (game.player2?.uid === uid) return 2;
  return null;
}
