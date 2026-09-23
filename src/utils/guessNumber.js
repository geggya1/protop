/**
 * Gjette tallet (1–10) — enkel lek for små barn.
 * Verten velger hemmelig tall, andre inviteres og godtar før de gjetter.
 */

import {
  collection, doc, addDoc, setDoc, updateDoc, getDoc,
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

export const GUESS_STATUS = {
  setup: 'setup',
  guessing: 'guessing',
  won: 'won',
  finished: 'finished',
};

const ACTIVE = [GUESS_STATUS.setup, GUESS_STATUS.guessing];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'guessGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'guessGames', gameId);
}

function guessesCol(familyId, gameId) {
  return collection(db, 'families', familyId, 'guessGames', gameId, 'guesses');
}

export async function createGuessGame(familyId, { uid, name, secret, invitedUids = [] }) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (!invites.invitedUids.length) throw new Error('Velg minst én person å invitere.');

  const num = Math.min(10, Math.max(1, Number(secret) || Math.floor(Math.random() * 10) + 1));
  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: GUESS_STATUS.guessing,
    hostUid: uid,
    hostName: String(name || 'Vert').trim() || 'Vert',
    secret: num,
    winnerUid: null,
    winnerName: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await notifyGameInvites(familyId, {
    invitedUids: invites.invitedUids,
    hostUid: uid,
    hostName: name,
    gameId: ref.id,
    gameType: GAME_TYPES.guess,
    gameTitle: 'Gjette tallet',
  });

  return { id: ref.id };
}

export async function acceptGuessInvite(familyId, { gameId, uid, name }) {
  await setGameInviteResponse(familyId, 'guessGames', gameId, uid, 'accepted');
  await setDoc(doc(db, 'families', familyId, 'guessGames', gameId, 'players', uid), {
    uid,
    name: String(name || 'Spiller').trim() || 'Spiller',
    joinedAt: serverTimestamp(),
  }, { merge: true });
  return gameId;
}

export async function declineGuessInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'guessGames', gameId, uid, 'declined');
}

export function listenPendingGuessInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'guessGames', uid, ACTIVE, cb);
}

export function listenGuessGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export function listenGuessAttempts(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(guessesCol(familyId, gameId), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    rows.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    cb(rows);
  }, () => cb([]));
}

export async function submitGuess(familyId, gameId, { uid, name, guess }) {
  const gSnap = await getDoc(gameDoc(familyId, gameId));
  if (!gSnap.exists()) throw new Error('Spill finnes ikke.');
  const g = gSnap.data() || {};
  if (g.status !== GUESS_STATUS.guessing) throw new Error('Spillet er ferdig.');
  if (g.hostUid === uid) throw new Error('Verten kan ikke gjette — du vet svaret!');
  const status = (g.inviteStatus || {})[uid];
  if (status === 'pending') throw new Error('Godta invitasjonen før du gjetter.');
  if (status === 'declined') throw new Error('Du har avslått denne invitasjonen.');
  if (Array.isArray(g.invitedUids) && g.invitedUids.length && status !== 'accepted') {
    throw new Error('Du er ikke med i dette spillet.');
  }
  const num = Math.min(10, Math.max(1, Number(guess)));
  if (!Number.isFinite(num)) throw new Error('Velg et tall mellom 1 og 10.');

  const hint = num === g.secret ? 'riktig!' : (num < g.secret ? 'høyere ↑' : 'lavere ↓');
  await addDoc(guessesCol(familyId, gameId), {
    uid,
    name: String(name || 'Spiller').trim(),
    guess: num,
    hint,
    correct: num === g.secret,
    createdAt: serverTimestamp(),
  });

  if (num === g.secret) {
    await updateDoc(gameDoc(familyId, gameId), {
      status: GUESS_STATUS.won,
      winnerUid: uid,
      winnerName: String(name || 'Spiller').trim(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function endGuessGame(familyId, gameId) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: GUESS_STATUS.finished,
    updatedAt: serverTimestamp(),
  });
}
