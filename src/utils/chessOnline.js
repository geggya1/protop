/**
 * Online sjakk — 2 spillere via Firestore (FEN-basert, uten nested arrays).
 */

import {
  collection, doc, addDoc, updateDoc, getDoc,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  inviteFields,
  notifyGameInvites,
  listenPendingGameInvites,
  setGameInviteResponse,
  GAME_TYPES,
} from './familyGamesShared';
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
} from './chessEngine';

export const CHESS_STATUS = {
  waiting: 'waiting',
  playing: 'playing',
  finished: 'finished',
};

const ACTIVE = [CHESS_STATUS.waiting, CHESS_STATUS.playing];
const START_FEN = toFen(createInitialState());

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'chessGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'chessGames', gameId);
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

export async function createChessGame(familyId, { uid, name, invitedUids = [] }) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (invites.invitedUids.length !== 1) {
    throw new Error('Velg én spiller å invitere.');
  }

  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: CHESS_STATUS.waiting,
    fen: START_FEN,
    lastMove: null,
    playerWhite: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    playerBlack: null,
    currentTurn: 'w',
    winner: null,
    resultStatus: 'playing',
    roundId: 1,
    hostUid: uid,
    hostName: String(name || 'Spiller').trim() || 'Spiller',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await notifyGameInvites(familyId, {
    invitedUids: invites.invitedUids,
    hostUid: uid,
    hostName: name,
    gameId: ref.id,
    gameType: GAME_TYPES.chess,
    gameTitle: 'Sjakk',
  });

  return { id: ref.id };
}

export async function acceptChessInvite(familyId, { gameId, uid, name }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const data = snap.data() || {};
  if (data.playerWhite?.uid === uid || data.playerBlack?.uid === uid) {
    await setGameInviteResponse(familyId, 'chessGames', gameId, uid, 'accepted');
    return gameId;
  }
  if (data.playerBlack) throw new Error('Spillet er fullt (2 spillere).');
  if (data.status !== CHESS_STATUS.waiting) throw new Error('Spillet er ikke lenger åpent.');

  await updateDoc(gameDoc(familyId, gameId), {
    playerBlack: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    status: CHESS_STATUS.playing,
    [`inviteStatus.${uid}`]: 'accepted',
    updatedAt: serverTimestamp(),
  });
  return gameId;
}

export async function declineChessInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'chessGames', gameId, uid, 'declined');
}

export function listenPendingChessInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'chessGames', uid, ACTIVE, cb);
}

export function listenChessGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export function myChessColor(game, uid) {
  if (!game || !uid) return null;
  if (game.playerWhite?.uid === uid) return 'w';
  if (game.playerBlack?.uid === uid) return 'b';
  return null;
}

export async function playChessMove(familyId, gameId, {
  uid, fr, fc, tr, tc, promo,
}) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  if (g.status !== CHESS_STATUS.playing) throw new Error('Spillet er ikke aktivt.');

  const color = myChessColor(g, uid);
  if (!color) throw new Error('Du er ikke med i dette spillet.');
  if (g.currentTurn !== color) throw new Error('Ikke din tur.');

  const state = fromFen(g.fen || START_FEN);
  // Rebuild keys so draw-by-repetition still works for online games.
  if (Array.isArray(g.keys) && g.keys.length) {
    state.keys = g.keys.slice();
  }
  const move = findMove(state, fr, fc, tr, tc, promo);
  if (!move) throw new Error('Ugyldig trekk.');

  const next = makeMove(state, move);
  const roundId = g.roundId || 1;
  const outcome = resultPayload(next, roundId);
  const keys = (next.keys || []).slice(-40);

  await updateDoc(gameDoc(familyId, gameId), {
    fen: toFen(next),
    keys,
    lastMove: {
      fr: move.fr, fc: move.fc, tr: move.tr, tc: move.tc,
      ...(move.promo ? { promo: move.promo } : {}),
    },
    currentTurn: next.turn,
    ...outcome,
    updatedAt: serverTimestamp(),
  });
}

export async function resetChessGame(familyId, gameId) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  const start = createInitialState();
  await updateDoc(gameDoc(familyId, gameId), {
    fen: toFen(start),
    keys: start.keys.slice(),
    lastMove: null,
    currentTurn: 'w',
    status: CHESS_STATUS.playing,
    winner: null,
    resultStatus: 'playing',
    roundId: (g.roundId || 1) + 1,
    updatedAt: serverTimestamp(),
  });
}
