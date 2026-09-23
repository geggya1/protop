/**
 * Tegn og gjett — verten tegner et hemmelig ord, familien gjetter i sanntid.
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
  DRAW_STATUS,
  pickDrawWord,
  buildDistractors,
  sanitizeStroke,
  sanitizeStrokes,
  guessesMatch,
} from './drawGuessLogic';

export {
  DRAW_STATUS,
  DRAW_WORDS,
  normalizeGuess,
  pickDrawWord,
  buildDistractors,
  sanitizeStroke,
  sanitizeStrokes,
  guessesMatch,
} from './drawGuessLogic';

const ACTIVE = [DRAW_STATUS.waiting, DRAW_STATUS.drawing, DRAW_STATUS.won];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'drawGuessGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'drawGuessGames', gameId);
}

function guessesCol(familyId, gameId) {
  return collection(db, 'families', familyId, 'drawGuessGames', gameId, 'guesses');
}

export async function createDrawGuessGame(familyId, { uid, name, invitedUids = [], word } = {}) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const invites = inviteFields(uid, invitedUids);
  if (!invites.invitedUids.length) throw new Error('Velg minst én person å invitere.');

  const secret = String(word || pickDrawWord()).trim().toLowerCase();
  if (!secret) throw new Error('Mangler ord å tegne.');

  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    status: DRAW_STATUS.waiting,
    hostUid: uid,
    hostName: String(name || 'Vert').trim() || 'Vert',
    drawerUid: uid,
    drawerName: String(name || 'Vert').trim() || 'Vert',
    secret,
    options: buildDistractors(secret, 3),
    strokes: [],
    liveStroke: null,
    winnerUid: null,
    winnerName: null,
    round: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await notifyGameInvites(familyId, {
    invitedUids: invites.invitedUids,
    hostUid: uid,
    hostName: name,
    gameId: ref.id,
    gameType: GAME_TYPES.draw,
    gameTitle: 'Tegn og gjett',
  });

  return { id: ref.id };
}

export async function acceptDrawGuessInvite(familyId, { gameId, uid, name }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const data = snap.data() || {};
  const invited = data.invitedUids || [];
  if (!invited.includes(uid) && data.hostUid !== uid) {
    throw new Error('Du er ikke invitert til dette spillet.');
  }

  const updates = {
    [`inviteStatus.${uid}`]: 'accepted',
    updatedAt: serverTimestamp(),
  };
  if (data.status === DRAW_STATUS.waiting) {
    updates.status = DRAW_STATUS.drawing;
  }
  await updateDoc(gameDoc(familyId, gameId), updates);
  return gameId;
}

export async function declineDrawGuessInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'drawGuessGames', gameId, uid, 'declined');
}

export function listenPendingDrawGuessInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'drawGuessGames', uid, ACTIVE, cb);
}

export function listenDrawGuessGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export function listenDrawGuessAttempts(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(guessesCol(familyId, gameId), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    rows.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    cb(rows);
  }, () => cb([]));
}

export async function publishDrawStrokes(familyId, gameId, { uid, strokes, liveStroke = null }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  if (g.drawerUid !== uid) throw new Error('Bare den som tegner kan endre tegningen.');
  if (g.status === DRAW_STATUS.finished) throw new Error('Spillet er avsluttet.');

  const clean = sanitizeStrokes(strokes);
  const live = liveStroke ? sanitizeStroke(liveStroke) : null;
  await updateDoc(gameDoc(familyId, gameId), {
    strokes: clean,
    liveStroke: live,
    status: g.status === DRAW_STATUS.waiting ? DRAW_STATUS.drawing : g.status,
    updatedAt: serverTimestamp(),
  });
}

/** Oppdater kun den pågående streken — uten å røre lagrede streker. */
export async function publishLiveStroke(familyId, gameId, { uid, liveStroke = null }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  if (g.drawerUid !== uid) throw new Error('Bare den som tegner kan endre tegningen.');
  if (g.status === DRAW_STATUS.finished || g.status === DRAW_STATUS.won) return;

  const live = liveStroke ? sanitizeStroke(liveStroke) : null;
  await updateDoc(gameDoc(familyId, gameId), {
    liveStroke: live,
    status: g.status === DRAW_STATUS.waiting ? DRAW_STATUS.drawing : g.status,
    updatedAt: serverTimestamp(),
  });
}

export async function clearDrawing(familyId, gameId, { uid }) {
  return publishDrawStrokes(familyId, gameId, { uid, strokes: [], liveStroke: null });
}

export async function reshuffleWord(familyId, gameId, { uid }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  if (g.drawerUid !== uid && g.hostUid !== uid) {
    throw new Error('Bare tegneren kan bytte ord.');
  }
  if (g.status === DRAW_STATUS.won || g.status === DRAW_STATUS.finished) {
    throw new Error('Start en ny runde for å bytte ord.');
  }
  const secret = pickDrawWord([g.secret]);
  await updateDoc(gameDoc(familyId, gameId), {
    secret,
    options: buildDistractors(secret, 3),
    strokes: [],
    liveStroke: null,
    status: DRAW_STATUS.drawing,
    updatedAt: serverTimestamp(),
  });
}

export async function submitDrawGuess(familyId, gameId, { uid, name, guess }) {
  const gSnap = await getDoc(gameDoc(familyId, gameId));
  if (!gSnap.exists()) throw new Error('Spill finnes ikke.');
  const g = gSnap.data() || {};
  if (g.status === DRAW_STATUS.finished) throw new Error('Spillet er ferdig.');
  if (g.status === DRAW_STATUS.won) throw new Error('Noen har allerede gjettet riktig!');
  if (g.drawerUid === uid || g.hostUid === uid) {
    throw new Error('Du som tegner kan ikke gjette — du vet svaret!');
  }
  const status = (g.inviteStatus || {})[uid];
  if (status === 'pending') throw new Error('Godta invitasjonen før du gjetter.');
  if (status === 'declined') throw new Error('Du har avslått denne invitasjonen.');
  if (Array.isArray(g.invitedUids) && g.invitedUids.length && status !== 'accepted') {
    throw new Error('Du er ikke med i dette spillet.');
  }

  const text = String(guess || '').trim();
  if (!text) throw new Error('Skriv hva du tror det er.');
  if (text.length > 40) throw new Error('Gjettingen er for lang.');

  const correct = guessesMatch(text, g.secret);
  await addDoc(guessesCol(familyId, gameId), {
    uid,
    name: String(name || 'Spiller').trim() || 'Spiller',
    guess: text,
    correct,
    round: g.round || 1,
    createdAt: serverTimestamp(),
  });

  if (correct) {
    await updateDoc(gameDoc(familyId, gameId), {
      status: DRAW_STATUS.won,
      winnerUid: uid,
      winnerName: String(name || 'Spiller').trim() || 'Spiller',
      liveStroke: null,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function startNextDrawRound(familyId, gameId, { uid }) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const g = snap.data() || {};
  if (g.hostUid !== uid && g.drawerUid !== uid) {
    throw new Error('Bare verten kan starte ny runde.');
  }
  const secret = pickDrawWord([g.secret]);
  await updateDoc(gameDoc(familyId, gameId), {
    status: DRAW_STATUS.drawing,
    secret,
    options: buildDistractors(secret, 3),
    strokes: [],
    liveStroke: null,
    winnerUid: null,
    winnerName: null,
    round: (Number(g.round) || 1) + 1,
    updatedAt: serverTimestamp(),
  });
}

export async function endDrawGuessGame(familyId, gameId) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: DRAW_STATUS.finished,
    liveStroke: null,
    updatedAt: serverTimestamp(),
  });
}
