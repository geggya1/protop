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

export const C4_STATUS = {
  waiting: 'waiting',
  playing: 'playing',
  finished: 'finished',
};

export function resolveConnect4Accept(game, { uid, name } = {}) {
  if (!game) throw new Error('Spill finnes ikke.');
  if (game.player1?.uid === uid || game.player2?.uid === uid) {
    return { alreadyIn: true };
  }
  if (game.player2) throw new Error('Spillet er fullt (2 spillere).');
  if (game.status !== C4_STATUS.waiting) throw new Error('Spillet er ikke lenger åpent.');
  return {
    alreadyIn: false,
    patch: {
      player2: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
      status: C4_STATUS.playing,
      [`inviteStatus.${uid}`]: 'accepted',
    },
  };
}

/** Returns the Firestore patch for one legal drop, or throws the same errors as playConnect4Move. */
export function resolveConnect4Move(game, { uid, col } = {}) {
  const column = Number(col);
  if (column < 0 || column >= C4_COLS) throw new Error('Ugyldig kolonne.');
  if (!game) throw new Error('Spill finnes ikke.');
  if (game.status !== C4_STATUS.playing) throw new Error('Spillet er ikke aktivt.');

  const isP1 = game.player1?.uid === uid;
  const isP2 = game.player2?.uid === uid;
  if (!isP1 && !isP2) throw new Error('Du er ikke med i dette spillet.');
  const mark = isP1 ? 1 : 2;
  if (game.currentTurn !== mark) throw new Error('Ikke din tur.');

  const board = boardFromStored(game.board);
  const row = dropRow(board, column);
  if (row < 0) throw new Error('Kolonnen er full.');

  board[row][column] = mark;
  const won = hasConnect4Win(board, row, column, mark);
  const draw = !won && isBoardFull(board);
  const patch = {
    board: boardToFlat(board),
    currentTurn: won || draw ? game.currentTurn : (mark === 1 ? 2 : 1),
  };
  if (won || draw) {
    patch.status = C4_STATUS.finished;
    patch.winner = won ? mark : 'draw';
  }
  return { patch, row, mark, won, draw };
}
