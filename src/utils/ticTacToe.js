/**
 * Tre på rad — 2-spiller sanntid via Firestore.
 * Invitasjon + godta (uten PIN).
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
import { emptyTttBoard, TTT_STATUS, resolveTttAccept, resolveTttMove } from './ticTacToeLogic';

export { emptyTttBoard, checkWinner, TTT_STATUS } from './ticTacToeLogic';

const ACTIVE = [TTT_STATUS.waiting, TTT_STATUS.playing];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'tttGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'tttGames', gameId);
}

function emptyBoard() {
  return emptyTttBoard();
}

export async function createTttGame(familyId, { uid, name, invitedUids = [] }) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (invites.invitedUids.length !== 1) {
    throw new Error('Velg én spiller å invitere.');
  }

  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: TTT_STATUS.waiting,
    board: emptyBoard(),
    playerX: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    playerO: null,
    currentTurn: 'X',
    winner: null,
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
    gameType: GAME_TYPES.ttt,
    gameTitle: 'Tre på rad',
  });

  return { id: ref.id };
}

export async function acceptTttInvite(familyId, { gameId, uid, name }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const resolved = resolveTttAccept(snap.data() || {}, { uid, name });
  if (resolved.alreadyIn) {
    await setGameInviteResponse(familyId, 'tttGames', gameId, uid, 'accepted');
    return gameId;
  }
  await updateDoc(gameDoc(familyId, gameId), {
    ...resolved.patch,
    updatedAt: serverTimestamp(),
  });
  return gameId;
}

export async function declineTttInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'tttGames', gameId, uid, 'declined');
}

export function listenPendingTttInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'tttGames', uid, ACTIVE, cb);
}

export function listenTttGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export async function playTttMove(familyId, gameId, { uid, cellIndex }) {
  const idx = Number(cellIndex);
  if (idx < 0 || idx > 8) throw new Error('Ugyldig rute.');
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const { patch } = resolveTttMove(snap.data() || {}, { uid, cellIndex });
  await updateDoc(gameDoc(familyId, gameId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function resetTttGame(familyId, gameId) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: TTT_STATUS.playing,
    board: emptyBoard(),
    currentTurn: 'X',
    winner: null,
    updatedAt: serverTimestamp(),
  });
}

export function myTttMark(game, uid) {
  if (!game || !uid) return null;
  if (game.playerX?.uid === uid) return 'X';
  if (game.playerO?.uid === uid) return 'O';
  return null;
}
