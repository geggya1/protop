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
import { emptyTttBoard, checkWinner } from './ticTacToeLogic';

export { emptyTttBoard, checkWinner } from './ticTacToeLogic';

export const TTT_STATUS = {
  waiting: 'waiting',
  playing: 'playing',
  finished: 'finished',
};

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
  const data = snap.data() || {};
  if (data.playerX?.uid === uid || data.playerO?.uid === uid) {
    await setGameInviteResponse(familyId, 'tttGames', gameId, uid, 'accepted');
    return gameId;
  }
  if (data.playerO) throw new Error('Spillet er fullt (2 spillere).');
  if (data.status !== TTT_STATUS.waiting) throw new Error('Spillet er ikke lenger åpent.');

  await updateDoc(gameDoc(familyId, gameId), {
    playerO: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    status: TTT_STATUS.playing,
    [`inviteStatus.${uid}`]: 'accepted',
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
  const g = snap.data() || {};
  if (g.status !== TTT_STATUS.playing) throw new Error('Spillet er ikke aktivt.');

  const board = [...(g.board || emptyBoard())];
  if (board[idx]) throw new Error('Ruten er opptatt.');

  const isX = g.playerX?.uid === uid;
  const isO = g.playerO?.uid === uid;
  if (!isX && !isO) throw new Error('Du er ikke med i dette spillet.');
  const mark = isX ? 'X' : 'O';
  if (g.currentTurn !== mark) throw new Error('Ikke din tur.');

  board[idx] = mark;
  const result = checkWinner(board);
  const nextTurn = mark === 'X' ? 'O' : 'X';
  const payload = {
    board,
    currentTurn: result ? g.currentTurn : nextTurn,
    updatedAt: serverTimestamp(),
  };
  if (result) {
    payload.status = TTT_STATUS.finished;
    payload.winner = result;
  }
  await updateDoc(gameDoc(familyId, gameId), payload);
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
