/** Online chess move resolution (no Firebase). */

import {
  createInitialState,
  fromFen,
  toFen,
  makeMove,
  findMove,
  getGameResult,
  isGameOver,
  WHITE,
  BLACK,
} from './chessEngine.js';

export const CHESS_STATUS = {
  waiting: 'waiting',
  playing: 'playing',
  finished: 'finished',
};

const START_FEN = toFen(createInitialState());

export function chessStartFen() {
  return START_FEN;
}

function resultPayload(state, roundId) {
  const result = getGameResult(state);
  if (!isGameOver(result)) {
    return {
      status: CHESS_STATUS.playing,
      winner: null,
      resultStatus: result.status,
      roundId,
    };
  }
  return {
    status: CHESS_STATUS.finished,
    winner: result.winner === WHITE ? 'w' : result.winner === BLACK ? 'b' : 'draw',
    resultStatus: result.status,
    roundId,
  };
}

export function myChessColor(game, uid) {
  if (!game || !uid) return null;
  if (game.playerWhite?.uid === uid) return 'w';
  if (game.playerBlack?.uid === uid) return 'b';
  return null;
}

export function resolveChessAccept(game, { uid, name } = {}) {
  if (!game) throw new Error('Spill finnes ikke.');
  if (game.playerWhite?.uid === uid || game.playerBlack?.uid === uid) {
    return { alreadyIn: true };
  }
  if (game.playerBlack) throw new Error('Spillet er fullt (2 spillere).');
  if (game.status !== CHESS_STATUS.waiting) throw new Error('Spillet er ikke lenger åpent.');
  return {
    alreadyIn: false,
    patch: {
      playerBlack: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
      status: CHESS_STATUS.playing,
      [`inviteStatus.${uid}`]: 'accepted',
    },
  };
}

export function resolveChessOnlineMove(game, { uid, fr, fc, tr, tc, promo } = {}) {
  if (!game) throw new Error('Spill finnes ikke.');
  if (game.status !== CHESS_STATUS.playing) throw new Error('Spillet er ikke aktivt.');

  const color = myChessColor(game, uid);
  if (!color) throw new Error('Du er ikke med i dette spillet.');
  if (game.currentTurn !== color) throw new Error('Ikke din tur.');

  const state = fromFen(game.fen || START_FEN);
  if (Array.isArray(game.keys) && game.keys.length) {
    state.keys = game.keys.slice();
  }
  const move = findMove(state, fr, fc, tr, tc, promo);
  if (!move) throw new Error('Ugyldig trekk.');

  const next = makeMove(state, move);
  const roundId = game.roundId || 1;
  const outcome = resultPayload(next, roundId);
  const keys = (next.keys || []).slice(-40);
  return {
    fen: toFen(next),
    keys,
    lastMove: {
      fr: move.fr,
      fc: move.fc,
      tr: move.tr,
      tc: move.tc,
      ...(move.promo ? { promo: move.promo } : {}),
    },
    currentTurn: next.turn,
    ...outcome,
  };
}
