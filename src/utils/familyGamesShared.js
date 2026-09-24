/**
 * Felles hjelpere for familiespill med invitasjon og Firestore sanntid.
 */

import {
  collection, doc, getDoc, onSnapshot, query, updateDoc, where, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { notifyUsers } from './notifications';
import { listenAfterAccess, warnPermissionOnce } from './firestoreAccess';
import { normalizeInviteAuthUids } from './inviteAuthUid';

export const GAME_TYPES = {
  quiz: 'quiz',
  ttt: 'ttt',
  rps: 'rps',
  guess: 'guess',
  draw: 'draw',
  connect4: 'connect4',
  chess: 'chess',
  memory: 'memory',
};

export const GAME_TYPE_LABELS = {
  quiz: 'Familiequiz',
  ttt: 'Tre på rad',
  rps: 'Stein-saks-papir',
  guess: 'Gjette tallet',
  draw: 'Tegn og gjett',
  connect4: 'Fire på rad',
  chess: 'Sjakk',
  memory: 'Memory',
};

export const GAME_COLLECTIONS = {
  quiz: 'quizGames',
  ttt: 'tttGames',
  rps: 'rpsGames',
  guess: 'guessGames',
  draw: 'drawGuessGames',
  connect4: 'connect4Games',
  chess: 'chessGames',
  memory: 'memoryGames',
};

export const GAME_TYPE_SCREENS = {
  quiz: null, // shell: more/quiz
  ttt: 'TicTacToe',
  rps: 'RockPaperScissors',
  guess: 'GuessNumber',
  draw: 'DrawGuess',
  connect4: 'Connect4',
  chess: 'Chess',
  memory: 'Memory',
};

export function gameInviteDocId(gameType, gameId) {
  return `${gameType}_${gameId}`;
}

/** Normaliser inviterte uid-er (uten vert) — kun Auth-UIDs. */
export function normalizeInviteUids(invitedUids, hostUid) {
  return normalizeInviteAuthUids(invitedUids, hostUid);
}

/** Felter som legges på nytt spill-dokument. */
export function inviteFields(hostUid, invitedUids = []) {
  const invited = normalizeInviteUids(invitedUids, hostUid);
  const inviteStatus = { [hostUid]: 'accepted' };
  invited.forEach((id) => {
    inviteStatus[id] = 'pending';
  });
  return {
    invitedUids: invited,
    inviteStatus,
  };
}

async function writeGameInviteInbox(inviteeUid, payload) {
  if (!inviteeUid || !payload?.gameId || !payload?.gameType) return;
  const id = gameInviteDocId(payload.gameType, payload.gameId);
  const data = {
    status: 'pending',
    inviteKind: 'game',
    inviteeUid,
    familyId: payload.familyId || null,
    gameId: payload.gameId,
    gameType: payload.gameType,
    hostUid: payload.hostUid || null,
    hostName: payload.hostName || '',
    gameTitle: payload.gameTitle || GAME_TYPE_LABELS[payload.gameType] || 'familiespill',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'users', inviteeUid, 'gameInvites', id), data, { merge: true });
  } catch (err) {
    // Older rules only allow create (not host update). Fall back to create-only fields.
    console.warn('[weekplan-notif] gameInvite inbox merge failed', err?.code, err?.message);
    try {
      await setDoc(doc(db, 'users', inviteeUid, 'gameInvites', id), data);
    } catch (err2) {
      console.warn('[weekplan-notif] gameInvite inbox write failed', err2?.code, err2?.message);
      throw err2;
    }
  }
}

export async function markGameInviteInbox(uid, gameType, gameId, status) {
  if (!uid || !gameType || !gameId) return;
  const id = gameInviteDocId(gameType, gameId);
  await setDoc(doc(db, 'users', uid, 'gameInvites', id), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === 'accepted' ? { acceptedAt: serverTimestamp() } : {}),
    ...(status === 'declined' ? { declinedAt: serverTimestamp() } : {}),
  }, { merge: true }).catch(() => {});
}

export async function notifyGameInvites(familyId, {
  invitedUids,
  hostUid,
  hostName,
  gameId,
  gameType,
  gameTitle,
}) {
  const invited = normalizeInviteUids(invitedUids, hostUid);
  if (!invited.length || !gameId || !gameType) {
    console.warn('[weekplan-notif] notifyGameInvites skipped', {
      invited: invited.length,
      raw: (invitedUids || []).length,
      gameId,
      gameType,
    });
    return { notified: 0, failed: 0, skippedInvalid: (invitedUids || []).length };
  }
  const label = gameTitle || GAME_TYPE_LABELS[gameType] || 'familiespill';

  // Prefer Admin for peer-friends — client rules often block host→invitee inbox writes.
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../firebase');
    const fn = httpsCallable(functions, 'notifyFriendGameInvitesAdmin');
    await fn({
      familyId,
      gameId,
      gameType,
      gameTitle: label,
      hostName,
      invitedUids: invited,
    });
  } catch (err) {
    console.warn('[weekplan-notif] notifyFriendGameInvitesAdmin failed', err?.code || err?.message);
  }

  const inboxResults = await Promise.allSettled(
    invited.map((inviteeUid) => writeGameInviteInbox(inviteeUid, {
      familyId,
      gameId,
      gameType,
      hostUid,
      hostName,
      gameTitle: label,
    })),
  );
  const inboxFailed = inboxResults.filter((r) => r.status === 'rejected').length;
  if (inboxFailed) {
    console.warn('[weekplan-notif] gameInvite inbox writes failed', inboxFailed);
  }

  const notif = await notifyUsers(invited, {
    eventType: 'gameInvite',
    title: 'Spillinvitasjon',
    body: `${hostName || 'Noen'} inviterer deg til ${label}. Godta eller avslå.`,
    familyId,
    gameId,
    gameType,
    createdBy: hostUid,
    notificationId: `gameInvite_${gameType}_${gameId}`,
  });
  return { ...notif, inboxFailed };
}

/** Lytt etter spill der brukeren er invitert og ikke har svart ennå. */
export function listenPendingGameInvites(familyId, colName, uid, activeStatuses, cb) {
  if (!familyId || !uid) return () => {};
  return onSnapshot(
    query(
      collection(db, 'families', familyId, colName),
      where('invitedUids', 'array-contains', uid),
    ),
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((g) => {
          const statusOk = (activeStatuses || []).includes(g.status);
          const pending = (g.inviteStatus || {})[uid] === 'pending';
          return statusOk && pending;
        })
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      cb(rows);
    },
    () => cb([]),
  );
}

/** Global pending game invites for mandatory overlay (across families). */
export function listenIncomingGameInvites(uid, cb) {
  if (!uid) {
    cb([]);
    return () => {};
  }
  const qy = query(
    collection(db, 'users', uid, 'gameInvites'),
    where('status', '==', 'pending'),
  );

  return listenAfterAccess(uid, (onErr) => onSnapshot(qy, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, inviteId: d.id, ...d.data() }));
    list.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
      const bt = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
      return bt - at;
    });
    cb(list);
  }, onErr), (err) => {
    if (err) {
      warnPermissionOnce(
        `gameInvites:${uid}`,
        '[listenIncomingGameInvites]',
        err?.code || err?.message || err,
      );
    }
    cb([]);
  });
}

/** Statuses where a pending invite still matters (union across game types). */
export const PENDING_INVITE_GAME_STATUSES = [
  'waiting', 'lobby', 'setup', 'playing', 'choosing', 'guessing',
  'drawing', 'question', 'reveal',
];

/**
 * Listen to all game collections in a family for invites to `uid`.
 * Used as self-heal when users/{uid}/gameInvites was never written.
 */
export function listenFamilyPendingGameInvites(familyId, uid, cb) {
  if (!familyId || !uid) {
    cb([]);
    return () => {};
  }
  const byKey = new Map();
  const emit = () => {
    const list = [...byKey.values()].sort(
      (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
    );
    cb(list);
  };
  const unsubs = Object.entries(GAME_COLLECTIONS).map(([gameType, colName]) => (
    listenPendingGameInvites(
      familyId,
      colName,
      uid,
      PENDING_INVITE_GAME_STATUSES,
      (rows) => {
        // Clear previous rows for this game type, then add current
        [...byKey.keys()].forEach((key) => {
          if (key.startsWith(`${gameType}_`)) byKey.delete(key);
        });
        (rows || []).forEach((g) => {
          const gameId = g.id;
          byKey.set(`${gameType}_${gameId}`, {
            id: `${gameType}_${gameId}`,
            inviteId: `${gameType}_${gameId}`,
            familyId,
            gameId,
            gameType,
            hostUid: g.hostUid || null,
            hostName: g.hostName || '',
            gameTitle: g.title || GAME_TYPE_LABELS[gameType] || 'familiespill',
            status: 'pending',
            createdAt: g.createdAt || null,
            source: 'family-game',
          });
        });
        emit();
      },
    )
  ));
  return () => unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
}

/**
 * Ensure own gameInvites + notification docs exist for pending family games.
 * Mirrors chat self-notify — works even when host could not write cross-user inbox.
 */
export async function selfHealGameInviteInbox(uid, invite) {
  if (!uid || !invite?.gameId || !invite?.gameType) return;
  const label = invite.gameTitle || GAME_TYPE_LABELS[invite.gameType] || 'familiespill';
  try {
    await writeGameInviteInbox(uid, {
      familyId: invite.familyId || null,
      gameId: invite.gameId,
      gameType: invite.gameType,
      hostUid: invite.hostUid || null,
      hostName: invite.hostName || '',
      gameTitle: label,
    });
  } catch (err) {
    console.warn('[weekplan-notif] self-heal gameInvite inbox', err?.code, err?.message);
  }
  try {
    await notifyUsers([uid], {
      eventType: 'gameInvite',
      title: 'Spillinvitasjon',
      body: `${invite.hostName || 'Noen'} inviterer deg til ${label}. Godta eller avslå.`,
      familyId: invite.familyId || null,
      gameId: invite.gameId,
      gameType: invite.gameType,
      // Self-authored so rules always allow create under own users/{uid}
      createdBy: uid,
      notificationId: `gameInvite_${invite.gameType}_${invite.gameId}`,
    });
  } catch (err) {
    console.warn('[weekplan-notif] self-heal gameInvite notif', err?.code, err?.message);
  }
}

export async function setGameInviteResponse(familyId, colName, gameId, uid, response) {
  if (!familyId || !gameId || !uid) throw new Error('Mangler familie, spill eller bruker.');
  if (response !== 'accepted' && response !== 'declined') {
    throw new Error('Ugyldig svar på invitasjon.');
  }
  const ref = doc(db, 'families', familyId, colName, gameId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Spill finnes ikke.');
  const data = snap.data() || {};
  const invited = data.invitedUids || [];
  if (!invited.includes(uid) && data.hostUid !== uid) {
    throw new Error('Du er ikke invitert til dette spillet.');
  }
  await updateDoc(ref, {
    [`inviteStatus.${uid}`]: response,
    updatedAt: serverTimestamp(),
  });

  const gameType = Object.entries(GAME_COLLECTIONS).find(([, col]) => col === colName)?.[0];
  if (gameType) {
    await markGameInviteInbox(uid, gameType, gameId, response);
  }

  return { id: snap.id, ...data, inviteStatus: { ...(data.inviteStatus || {}), [uid]: response } };
}

export function inviteSummary(game, members = []) {
  const invited = game?.invitedUids || [];
  const statusMap = game?.inviteStatus || {};
  return invited.map((id) => {
    const member = members.find((m) => m.uid === id || m.id === id);
    return {
      uid: id,
      name: member?.name || 'Familiemedlem',
      status: statusMap[id] || 'pending',
    };
  });
}

export const RPS_CHOICES = [
  { id: 'rock', label: 'Stein', emoji: '✊' },
  { id: 'paper', label: 'Papir', emoji: '✋' },
  { id: 'scissors', label: 'Saks', emoji: '✌️' },
];

/** Returnerer vinner-id (rock/paper/scissors) eller null ved uavgjort. */
export function rpsWinner(a, b) {
  if (!a || !b || a === b) return null;
  if (a === 'rock' && b === 'scissors') return 'rock';
  if (a === 'scissors' && b === 'paper') return 'scissors';
  if (a === 'paper' && b === 'rock') return 'paper';
  return b;
}
