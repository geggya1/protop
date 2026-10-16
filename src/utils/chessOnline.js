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
import { createInitialState, toFen } from './chessEngine';
import {
  CHESS_STATUS,
  chessStartFen,
  myChessColor,
  resolveChessAccept,
  resolveChessOnlineMove,
} from './chessOnlineLogic';

export { CHESS_STATUS, myChessColor };

const ACTIVE = [CHESS_STATUS.waiting, CHESS_STATUS.playing];
const START_FEN = chessStartFen();

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'chessGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'chessGames', gameId);
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
  const resolved = resolveChessAccept(snap.data() || {}, { uid, name });
  if (resolved.alreadyIn) {
    await setGameInviteResponse(familyId, 'chessGames', gameId, uid, 'accepted');
    return gameId;
  }
  await updateDoc(gameDoc(familyId, gameId), {
    ...resolved.patch,
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

export async function playChessMove(familyId, gameId, {
  uid, fr, fc, tr, tc, promo,
}) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const patch = resolveChessOnlineMove(snap.data() || {}, { uid, fr, fc, tr, tc, promo });
  await updateDoc(gameDoc(familyId, gameId), {
    ...patch,
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
