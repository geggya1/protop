/**
 * Stein-saks-papir — alle velger samtidig, avsløres når alle har svart.
 * Invitasjon + godta (uten PIN).
 */

import {
  collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  inviteFields,
  notifyGameInvites,
  listenPendingGameInvites,
  setGameInviteResponse,
  rpsWinner,
  GAME_TYPES,
} from './familyGamesShared';

export const RPS_STATUS = {
  lobby: 'lobby',
  choosing: 'choosing',
  reveal: 'reveal',
  finished: 'finished',
};

const ACTIVE = [RPS_STATUS.lobby, RPS_STATUS.choosing, RPS_STATUS.reveal];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'rpsGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'rpsGames', gameId);
}

function playersCol(familyId, gameId) {
  return collection(db, 'families', familyId, 'rpsGames', gameId, 'players');
}

function playerDoc(familyId, gameId, playerUid) {
  return doc(db, 'families', familyId, 'rpsGames', gameId, 'players', playerUid);
}

export async function createRpsGame(familyId, { uid, name, invitedUids = [] }) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (!invites.invitedUids.length) throw new Error('Velg minst én person å invitere.');

  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: RPS_STATUS.lobby,
    hostUid: uid,
    hostName: String(name || 'Spiller').trim() || 'Spiller',
    round: 0,
    roundWinners: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(playerDoc(familyId, ref.id, uid), {
    uid,
    name: String(name || 'Spiller').trim() || 'Spiller',
    score: 0,
    choice: null,
    joinedAt: serverTimestamp(),
  });

  await notifyGameInvites(familyId, {
    invitedUids: invites.invitedUids,
    hostUid: uid,
    hostName: name,
    gameId: ref.id,
    gameType: GAME_TYPES.rps,
    gameTitle: 'Stein-saks-papir',
  });

  return { id: ref.id };
}

export async function acceptRpsInvite(familyId, { gameId, uid, name }) {
  await setGameInviteResponse(familyId, 'rpsGames', gameId, uid, 'accepted');
  await setDoc(playerDoc(familyId, gameId, uid), {
    uid,
    name: String(name || 'Spiller').trim() || 'Spiller',
    score: 0,
    choice: null,
    joinedAt: serverTimestamp(),
  }, { merge: true });
  return gameId;
}

export async function declineRpsInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'rpsGames', gameId, uid, 'declined');
}

export function listenPendingRpsInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'rpsGames', uid, ACTIVE, cb);
}

export function listenRpsGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export function listenRpsPlayers(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(playersCol(familyId, gameId), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    rows.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name)));
    cb(rows);
  }, () => cb([]));
}

export async function startRpsRound(familyId, gameId) {
  const players = await getDocs(playersCol(familyId, gameId));
  const batch = players.docs.map((d) => setDoc(d.ref, { choice: null }, { merge: true }));
  await Promise.all(batch);
  const snap = await getDoc(gameDoc(familyId, gameId));
  const round = (snap.data()?.round || 0) + 1;
  await updateDoc(gameDoc(familyId, gameId), {
    status: RPS_STATUS.choosing,
    round,
    updatedAt: serverTimestamp(),
  });
}

export async function submitRpsChoice(familyId, gameId, { uid, choice }) {
  const gSnap = await getDoc(gameDoc(familyId, gameId));
  if (!gSnap.exists()) throw new Error('Spill finnes ikke.');
  if (gSnap.data()?.status !== RPS_STATUS.choosing) throw new Error('Ikke i valgfase.');
  await setDoc(playerDoc(familyId, gameId, uid), { choice, updatedAt: serverTimestamp() }, { merge: true });

  const players = await getDocs(playersCol(familyId, gameId));
  const allChosen = players.docs.every((d) => d.data()?.choice);
  if (allChosen && players.size >= 2) {
    await revealRpsRound(familyId, gameId, players.docs);
  }
}

async function revealRpsRound(familyId, gameId, playerDocs) {
  const choices = playerDocs.map((d) => ({ uid: d.id, ...d.data() }));
  const tallies = {};
  choices.forEach((p) => {
    if (p.choice) tallies[p.choice] = (tallies[p.choice] || 0) + 1;
  });
  const unique = Object.keys(tallies);
  let roundWinner = null;
  if (unique.length === 2) {
    roundWinner = rpsWinner(unique[0], unique[1]);
  } else if (unique.length === 3) {
    roundWinner = null; // all three = draw
  } else if (unique.length === 1) {
    roundWinner = unique[0]; // everyone picked same = draw, no score
  }

  const updates = [];
  if (roundWinner && unique.length === 2) {
    choices.forEach((p) => {
      if (p.choice === roundWinner) {
        updates.push(setDoc(playerDoc(familyId, gameId, p.uid), {
          score: (p.score || 0) + 1,
        }, { merge: true }));
      }
    });
  }
  await Promise.all(updates);
  await updateDoc(gameDoc(familyId, gameId), {
    status: RPS_STATUS.reveal,
    lastRoundWinner: roundWinner,
    updatedAt: serverTimestamp(),
  });
}

export async function nextRpsRoundOrFinish(familyId, gameId, { maxRounds = 5 } = {}) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  const round = snap.data()?.round || 0;
  if (round >= maxRounds) {
    await updateDoc(gameDoc(familyId, gameId), {
      status: RPS_STATUS.finished,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await startRpsRound(familyId, gameId);
}
