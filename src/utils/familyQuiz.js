/**
 * Familiequiz — Kahoot-stil med Firestore sanntid (onSnapshot).
 * Invitasjon + godta før start (uten PIN).
 */

import {
  collection, doc, addDoc, setDoc, updateDoc, getDocs, getDoc,
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

export const QUIZ_STATUS = {
  lobby: 'lobby',
  question: 'question',
  reveal: 'reveal',
  finished: 'finished',
};

const ACTIVE = [QUIZ_STATUS.lobby, QUIZ_STATUS.question, QUIZ_STATUS.reveal];

export const SAMPLE_QUIZZES = [
  {
    id: 'smabarn',
    title: 'Småbarn-quiz',
    questions: [
      {
        text: 'Hvilken farge har solen?',
        options: ['Blå', 'Gul', 'Grønn', 'Lilla'],
        correctIndex: 1,
        timeLimitSec: 25,
      },
      {
        text: 'Hvor mange øyne har du?',
        options: ['1', '2', '3', '4'],
        correctIndex: 1,
        timeLimitSec: 20,
      },
      {
        text: 'Hva sier kua?',
        options: ['Voff', 'Mjau', 'Mø', 'Kvakk'],
        correctIndex: 2,
        timeLimitSec: 20,
      },
      {
        text: 'Hvilken farge er gress?',
        options: ['Rød', 'Gul', 'Grønn', 'Oransje'],
        correctIndex: 2,
        timeLimitSec: 20,
      },
    ],
  },
  {
    id: 'norge',
    title: 'Norge-quiz',
    questions: [
      {
        text: 'Hva er hovedstaden i Norge?',
        options: ['Bergen', 'Oslo', 'Trondheim', 'Stavanger'],
        correctIndex: 1,
        timeLimitSec: 20,
      },
      {
        text: 'Hvilket dyr er Norges nasjonaldyr?',
        options: ['Elg', 'Rein', 'Ulv', 'Bjørn'],
        correctIndex: 0,
        timeLimitSec: 20,
      },
      {
        text: 'Hvor mange fylker har Norge (2024+)?',
        options: ['11', '15', '19', '20'],
        correctIndex: 1,
        timeLimitSec: 25,
      },
      {
        text: 'Hvilket fjell er høyest i Norge?',
        options: ['Gausta', 'Galdhøpiggen', 'Glittertind', 'Snøhetta'],
        correctIndex: 1,
        timeLimitSec: 20,
      },
    ],
  },
  {
    id: 'familie',
    title: 'Familie & hverdag',
    questions: [
      {
        text: 'Hvor mange dager er det i en uke?',
        options: ['5', '6', '7', '8'],
        correctIndex: 2,
        timeLimitSec: 15,
      },
      {
        text: 'Hvilken farge får du hvis du blander blått og gult?',
        options: ['Lilla', 'Grønn', 'Oransje', 'Rosa'],
        correctIndex: 1,
        timeLimitSec: 15,
      },
      {
        text: 'Hva bruker vi til å måle temperatur?',
        options: ['Linjal', 'Termometer', 'Vekt', 'Kompass'],
        correctIndex: 1,
        timeLimitSec: 15,
      },
      {
        text: 'Hvilken planet er nærmest solen?',
        options: ['Venus', 'Jorden', 'Merkur', 'Mars'],
        correctIndex: 2,
        timeLimitSec: 20,
      },
    ],
  },
];

function gamesCol(familyId) {
  return collection(db, 'families', familyId, 'quizGames');
}

function gameDoc(familyId, gameId) {
  return doc(db, 'families', familyId, 'quizGames', gameId);
}

function playersCol(familyId, gameId) {
  return collection(db, 'families', familyId, 'quizGames', gameId, 'players');
}

function playerDoc(familyId, gameId, playerUid) {
  return doc(db, 'families', familyId, 'quizGames', gameId, 'players', playerUid);
}

export async function createQuizGame(familyId, {
  uid,
  hostName,
  title,
  questions,
  invitedUids = [],
}) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const qs = (questions || []).map((q, i) => ({
    id: `q${i}`,
    text: String(q.text || '').trim(),
    options: (q.options || []).map((o) => String(o)),
    correctIndex: Number(q.correctIndex) || 0,
    timeLimitSec: Math.min(60, Math.max(10, Number(q.timeLimitSec) || 20)),
  })).filter((q) => q.text && q.options.length >= 2);
  if (!qs.length) throw new Error('Quiz trenger minst ett spørsmål.');

  const invites = inviteFields(uid, invitedUids);
  if (!invites.invitedUids.length) throw new Error('Velg minst én person å invitere.');

  const gameTitle = String(title || 'Familiequiz').trim() || 'Familiequiz';
  const ref = await addDoc(gamesCol(familyId), {
    ...invites,
    title: gameTitle,
    status: QUIZ_STATUS.lobby,
    hostUid: uid,
    hostName: hostName || '',
    questionIndex: 0,
    questionStartedAt: null,
    questions: qs,
    playerCount: 1,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(playerDoc(familyId, ref.id, uid), {
    uid,
    name: String(hostName || 'Vert').trim() || 'Vert',
    score: 0,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await notifyGameInvites(familyId, {
    invitedUids: invites.invitedUids,
    hostUid: uid,
    hostName,
    gameId: ref.id,
    gameType: GAME_TYPES.quiz,
    gameTitle,
  });

  return { id: ref.id };
}

export async function acceptQuizInvite(familyId, { gameId, uid, name }) {
  await setGameInviteResponse(familyId, 'quizGames', gameId, uid, 'accepted');
  await setDoc(playerDoc(familyId, gameId, uid), {
    uid,
    name: String(name || 'Spiller').trim() || 'Spiller',
    score: 0,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  try {
    const players = await getDocs(playersCol(familyId, gameId));
    await updateDoc(gameDoc(familyId, gameId), {
      playerCount: players.size,
      updatedAt: serverTimestamp(),
    });
  } catch { /* ignore */ }

  return gameId;
}

export async function declineQuizInvite(familyId, { gameId, uid }) {
  await setGameInviteResponse(familyId, 'quizGames', gameId, uid, 'declined');
}

export function listenPendingQuizInvites(familyId, uid, cb) {
  return listenPendingGameInvites(familyId, 'quizGames', uid, ACTIVE, cb);
}

export function listenQuizGame(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(gameDoc(familyId, gameId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
  }, () => cb(null));
}

export function listenQuizPlayers(familyId, gameId, cb) {
  if (!familyId || !gameId) return () => {};
  return onSnapshot(playersCol(familyId, gameId), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    rows.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name)));
    cb(rows);
  }, () => cb([]));
}

export async function startQuizQuestion(familyId, gameId, questionIndex = 0) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: QUIZ_STATUS.question,
    questionIndex,
    questionStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function revealQuizQuestion(familyId, gameId) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: QUIZ_STATUS.reveal,
    updatedAt: serverTimestamp(),
  });
}

export async function advanceOrFinishQuiz(familyId, gameId) {
  const snap = await getDoc(gameDoc(familyId, gameId));
  if (!snap.exists()) return;
  const g = snap.data() || {};
  const next = (g.questionIndex || 0) + 1;
  const total = Array.isArray(g.questions) ? g.questions.length : 0;
  if (next >= total) {
    await updateDoc(gameDoc(familyId, gameId), {
      status: QUIZ_STATUS.finished,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await startQuizQuestion(familyId, gameId, next);
}

export async function submitQuizAnswer(familyId, gameId, {
  uid, choiceIndex, questionIndex,
}) {
  const gSnap = await getDoc(gameDoc(familyId, gameId));
  if (!gSnap.exists()) throw new Error('Quiz finnes ikke.');
  const g = gSnap.data() || {};
  if (g.status !== QUIZ_STATUS.question) throw new Error('Ikke aktivt spørsmål.');
  if ((g.questionIndex || 0) !== questionIndex) throw new Error('Feil spørsmål.');

  const q = (g.questions || [])[questionIndex];
  if (!q) throw new Error('Spørsmål mangler.');

  const pRef = playerDoc(familyId, gameId, uid);
  const pSnap = await getDoc(pRef);
  const prev = pSnap.exists() ? (pSnap.data() || {}) : {};
  const answers = { ...(prev.answers || {}) };
  if (answers[String(questionIndex)]) return prev; // already answered

  const started = g.questionStartedAt?.toMillis?.() || g.questionStartedAt?.seconds * 1000 || Date.now();
  const elapsed = Math.max(0, Date.now() - started);
  const limitMs = (q.timeLimitSec || 20) * 1000;
  const correct = Number(choiceIndex) === Number(q.correctIndex);
  const speedBonus = correct
    ? Math.max(0, Math.round(500 * (1 - Math.min(1, elapsed / limitMs))))
    : 0;
  const points = correct ? 500 + speedBonus : 0;

  answers[String(questionIndex)] = {
    choiceIndex: Number(choiceIndex),
    correct,
    points,
    elapsedMs: elapsed,
  };

  await setDoc(pRef, {
    ...prev,
    uid,
    score: (prev.score || 0) + points,
    answers,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { correct, points };
}

export async function endQuizGame(familyId, gameId) {
  await updateDoc(gameDoc(familyId, gameId), {
    status: QUIZ_STATUS.finished,
    updatedAt: serverTimestamp(),
  });
}

export function optionColors() {
  return ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
}
