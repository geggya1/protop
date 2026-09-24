/**
 * Online memory — 2 spillere via Firestore.
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

export const MEMORY_STATUS = {
  waiting: 'waiting',
  playing: 'playing',
  finished: 'finished',
};

const ACTIVE = [MEMORY_STATUS.waiting, MEMORY_STATUS.playing];

export const MEMORY_EMOJIS = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🦁', '🐸'];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'memoryGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'memoryGames', gameId);
}

function shufflePairs(rng = Math.random) {
  const pool = MEMORY_EMOJIS.flatMap((e, i) => [
    { id: `${i}a`, emoji: e, matched: false },
    { id: `${i}b`, emoji: e, matched: false },
  ]);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function createMemoryDeck() {
  return shufflePairs();
}

export async function createMemoryGame(familyId, { uid, name, invitedUids = [] }) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (invites.invitedUids.length !== 1) {
    throw new Error('Velg én spiller å invitere.');
  }

  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: MEMORY_STATUS.waiting,
    cards: shufflePairs(),
    flipped: [],
    scores: { p1: 0, p2: 0 },
    player1: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    player2: null,
    currentTurn: 1,
    winner: null,
    roundId: 1,
    lockUntil: null,
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
    gameType: GAME_TYPES.memory,
    gameTitle: 'Memory',
  });

  return { id: ref.id };
}

export async function acceptMemoryInvite(familyId, { gameId, uid, name }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const data = snap.data() || {};
  if (data.player1?.uid === uid || data.player2?.uid === uid) {
    await setGameInviteResponse(familyId, 'memoryGames', gameId, uid, 'accepted');
    return gameId;
  }
  if (data.player2) throw new Error('Spillet er fullt (2 spillere).');
  if (data.status !== MEMORY_STATUS.waiting) throw new Error('Spillet er ikke lenger åpent.');

  await updateDoc(gameDoc(familyId, gameId), {
    player2: { uid, name: String(name || 'Spiller').trim() || 'Spiller' },
    status: MEMORY_STATUS.playing,
    [`inviteStatus.${uid}`]: 'accepted',
    updatedAt: serverTimestamp(),
  });
  return gameId;
}

export async function declineMemoryInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'memoryGames', gameId, uid, 'declined');
}

export function listenPendingMemoryInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'memoryGames', uid, ACTIVE, cb);
}

export function listenMemoryGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export function myMemorySeat(game, uid) {
  if (!game || !uid) return null;
  if (game.player1?.uid === uid) return 1;
  if (game.player2?.uid === uid) return 2;
  return null;
}

export async function flipMemoryCard(familyId, gameId, { uid, index }) {
  const idx = Number(index);
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  if (g.status !== MEMORY_STATUS.playing) throw new Error('Spillet er ikke aktivt.');

  const seat = myMemorySeat(g, uid);
  if (!seat) throw new Error('Du er ikke med i dette spillet.');
  if (g.currentTurn !== seat) throw new Error('Ikke din tur.');
  if (g.lockUntil && Date.now() < g.lockUntil) throw new Error('Vent litt…');

  const cards = (g.cards || []).map((c) => ({ ...c }));
  if (!cards[idx] || cards[idx].matched) throw new Error('Ugyldig kort.');
  const flipped = [...(g.flipped || [])];
  if (flipped.includes(idx)) return;
  if (flipped.length >= 2) throw new Error('Vent til kortene snur tilbake.');

  flipped.push(idx);

  if (flipped.length < 2) {
    await updateDoc(gameDoc(familyId, gameId), {
      flipped,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const [a, b] = flipped;
  const match = cards[a].emoji === cards[b].emoji;
  const scores = { ...(g.scores || { p1: 0, p2: 0 }) };
  let currentTurn = g.currentTurn;
  let status = g.status;
  let winner = g.winner;

  if (match) {
    cards[a].matched = true;
    cards[b].matched = true;
    const key = seat === 1 ? 'p1' : 'p2';
    scores[key] = (scores[key] || 0) + 1;
    if (cards.every((c) => c.matched)) {
      status = MEMORY_STATUS.finished;
      if (scores.p1 === scores.p2) winner = 'draw';
      else winner = scores.p1 > scores.p2 ? 1 : 2;
    }
    await updateDoc(gameDoc(familyId, gameId), {
      cards,
      flipped: [],
      scores,
      status,
      winner,
      lockUntil: null,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  // Mismatch — vis begge kort kort, deretter snu (klient kaller resolveMemoryFlip)
  const lockUntil = Date.now() + 900;
  currentTurn = seat === 1 ? 2 : 1;
  await updateDoc(gameDoc(familyId, gameId), {
    flipped,
    currentTurn,
    lockUntil,
    updatedAt: serverTimestamp(),
  });
}

export async function resolveMemoryFlip(familyId, gameId) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) return;
  const g = snap.data() || {};
  if (!g.flipped?.length) return;
  await updateDoc(gameDoc(familyId, gameId), {
    flipped: [],
    lockUntil: null,
    updatedAt: serverTimestamp(),
  });
}

export async function resetMemoryGame(familyId, gameId) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  await updateDoc(gameDoc(familyId, gameId), {
    cards: shufflePairs(),
    flipped: [],
    scores: { p1: 0, p2: 0 },
    currentTurn: 1,
    status: MEMORY_STATUS.playing,
    winner: null,
    lockUntil: null,
    roundId: (g.roundId || 1) + 1,
    updatedAt: serverTimestamp(),
  });
}
