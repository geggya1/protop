/**
 * Ren tre-på-rad-logikk (uten Firestore).
 */

export function emptyTttBoard() {
  return Array(9).fill(null);
}

export const TTT_STATUS = {
  waiting: 'waiting',
  playing: 'playing',
  finished: 'finished',
};

export function resolveTttAccept(game, { uid, name } = {}) {
  if (!game) throw new Error('Spill finnes ikke.');
  if (game.playerX?.uid === uid || game.playerO?.uid === uid) {
    return { alreadyIn: true };
  }
  if (game.playerO) throw new Error('Spillet er fullt (2 spillere).');
  if (game.status !== TTT_STATUS.waiting) throw new Error('Spillet er ikke lenger åpent.');
  return {
    alreadyIn: false,
    patch: {
      playerO: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
      status: TTT_STATUS.playing,
      [`inviteStatus.${uid}`]: 'accepted',
    },
  };
}

export function resolveTttMove(game, { uid, cellIndex } = {}) {
  const idx = Number(cellIndex);
  if (idx < 0 || idx > 8) throw new Error('Ugyldig rute.');
  if (!game) throw new Error('Spill finnes ikke.');
  if (game.status !== TTT_STATUS.playing) throw new Error('Spillet er ikke aktivt.');

  const board = [...(game.board || emptyTttBoard())];
  if (board[idx]) throw new Error('Ruten er opptatt.');

  const isX = game.playerX?.uid === uid;
  const isO = game.playerO?.uid === uid;
  if (!isX && !isO) throw new Error('Du er ikke med i dette spillet.');
  const mark = isX ? 'X' : 'O';
  if (game.currentTurn !== mark) throw new Error('Ikke din tur.');

  board[idx] = mark;
  const result = checkWinner(board);
  const nextTurn = mark === 'X' ? 'O' : 'X';
  const patch = {
    board,
    currentTurn: result ? game.currentTurn : nextTurn,
  };
  if (result) {
    patch.status = TTT_STATUS.finished;
    patch.winner = result;
  }
  return { patch, mark, result };
}

export function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell)) return 'draw';
  return null;
}
