/**
 * Fire på rad — 2-spiller sanntid via Firestore.
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
import {
  C4_COLS,
  C4_STATUS,
  emptyBoard,
  boardToFlat,
  resolveConnect4Accept,
  resolveConnect4Move,
} from './connect4Logic';

export {
  C4_ROWS,
  C4_COLS,
  emptyBoard,
  boardToFlat,
  boardFromStored,
  hasConnect4Win,
  isBoardFull,
  dropRow,
  myConnect4Mark,
} from './connect4Logic';

export { C4_STATUS };

const ACTIVE = [C4_STATUS.waiting, C4_STATUS.playing];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'connect4Games');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'connect4Games', gameId);
}

export async function createConnect4Game(familyId, { uid, name, invitedUids = [] }) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (invites.invitedUids.length !== 1) {
    throw new Error('Velg én spiller å invitere.');
  }

  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: C4_STATUS.waiting,
    board: boardToFlat(emptyBoard()),
    player1: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    player2: null,
    currentTurn: 1,
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
    gameType: GAME_TYPES.connect4,
    gameTitle: 'Fire på rad',
  });

  return { id: ref.id };
}

export async function acceptConnect4Invite(familyId, { gameId, uid, name }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const resolved = resolveConnect4Accept(snap.data() || {}, { uid, name });
  if (resolved.alreadyIn) {
    await setGameInviteResponse(familyId, 'connect4Games', gameId, uid, 'accepted');
    return gameId;
  }
  await updateDoc(gameDoc(familyId, gameId), {
    ...resolved.patch,
    updatedAt: serverTimestamp(),
  });
  return gameId;
}

export async function declineConnect4Invite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'connect4Games', gameId, uid, 'declined');
}

export function listenPendingConnect4Invites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'connect4Games', uid, ACTIVE, cb);
}

export function listenConnect4Game(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = snap.data() || {};
    cb({ id: snap.id, ...data, board: boardFromStored(data.board) });
  }, () => cb(null));
}

export async function playConnect4Move(familyId, gameId, { uid, col }) {
  const column = Number(col);
  if (column < 0 || column >= C4_COLS) throw new Error('Ugyldig kolonne.');
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const { patch } = resolveConnect4Move(snap.data() || {}, { uid, col });
  await updateDoc(gameDoc(familyId, gameId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function resetConnect4Game(familyId, gameId) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: C4_STATUS.playing,
    board: boardToFlat(emptyBoard()),
    currentTurn: 1,
    winner: null,
    updatedAt: serverTimestamp(),
  });
}
