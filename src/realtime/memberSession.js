/**
 * In-memory realtime bus for cross-member sessions.
 * Writes go through the same pure helpers the Firestore modules use.
 */

import { buildChatStampPatch } from '../utils/chatStampLogic.js';
import {
  canManageChatMessage,
  chatIsUnread,
  chatMessagePreview,
  chatVisibleToUser,
  resolveChatRecipients,
  unreadCountForUser,
} from '../utils/chatsLogic.js';
import {
  buildChildMemberRecord,
  buildNewFamilyRecords,
  canChangeBilling,
  deleteGroupPatch,
  deactivateGroupPatch,
  isGroupDeactivated,
  isGroupDeleted,
  isSuperAdmin,
  listMemberOnFamily,
  memberRemovalPlan,
  reactivateGroupPatch,
  revokeMemberOnFamily,
} from '../utils/groupLifecycleLogic.js';
import { isListedOnFamilyData } from '../utils/familyMembershipLogic.js';
import { inviteFields, gameInviteInboxDoc } from '../utils/gameInviteLogic.js';
import {
  C4_STATUS,
  emptyBoard,
  boardToFlat,
  boardFromStored,
  resolveConnect4Accept,
  resolveConnect4Move,
} from '../utils/connect4Logic.js';
import {
  emptyTttBoard,
  resolveTttAccept,
  resolveTttMove,
} from '../utils/ticTacToeLogic.js';
import {
  chessStartFen,
  resolveChessAccept,
  resolveChessOnlineMove,
} from '../utils/chessOnlineLogic.js';
import {
  sanitizeStrokes,
  guessesMatch,
  DRAW_STATUS,
} from '../utils/drawGuessLogic.js';
import { friendChatId, friendshipPairId } from '../utils/friendsLogic.js';
import { usernameToEmail } from '../utils/usernamesLogic.js';
import {
  hasContactAccount,
  isSyntheticEmail,
  isValidEmail,
  passwordStrength,
} from '../utils/accountContact.js';
import { classifyInviteIdentifier } from '../utils/inviteIdentifiers.js';
import { looksLikeAuthUid, memberInviteAuthUid } from '../utils/inviteAuthUid.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function applyPatch(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (!key.includes('.')) {
      target[key] = clone(value);
      continue;
    }
    const parts = key.split('.');
    let cur = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== 'object' || Array.isArray(cur[part])) cur[part] = {};
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = clone(value);
  }
}

export function createMemberWorld() {
  const docs = new Map();
  const listeners = new Set();
  let clock = 1_700_000_000_000;
  let seq = 0;

  function emit(path) {
    for (const listener of listeners) {
      const hit = path === listener.path
        || path.startsWith(`${listener.path}/`)
        || listener.path.startsWith(`${path}/`);
      if (hit) listener.cb(path);
    }
  }

  return {
    tick() {
      clock += 1000;
      return clock;
    },
    now() {
      return clock;
    },
    nextId(prefix) {
      seq += 1;
      return `${prefix}${seq}`;
    },
    get(path) {
      return docs.has(path) ? clone(docs.get(path)) : null;
    },
    list(prefix) {
      const out = [];
      for (const [path, data] of docs) {
        if (path.startsWith(`${prefix}/`)) out.push({ path, ...clone(data) });
      }
      return out;
    },
    set(path, data) {
      docs.set(path, clone(data));
      emit(path);
    },
    merge(path, patch) {
      const cur = docs.get(path) || {};
      applyPatch(cur, patch);
      docs.set(path, cur);
      emit(path);
    },
    delete(path) {
      docs.delete(path);
      emit(path);
    },
    listen(path, cb) {
      const listener = { path, cb };
      listeners.add(listener);
      cb(path);
      return () => listeners.delete(listener);
    },
  };
}

export function createBot(world, profile) {
  const events = [];
  const unsubs = [];
  const bot = {
    ...profile,
    events,
    watch(path) {
      const unsub = world.listen(path, (changed) => {
        events.push({ path: changed, at: world.now() });
      });
      unsubs.push(unsub);
      return unsub;
    },
    stop() {
      unsubs.forEach((unsub) => unsub());
    },
    familyView(familyId) {
      const family = world.get(`families/${familyId}`);
      if (!family || isGroupDeleted(family)) return null;
      if (!isListedOnFamilyData(family, profile.uid)) return null;
      return family;
    },
    seesChat(familyId, chatId) {
      const family = this.familyView(familyId);
      if (!family) return false;
      const chat = world.get(`families/${familyId}/chats/${chatId}`);
      return chatVisibleToUser(chatId, chat, profile.uid);
    },
  };
  return bot;
}

export function registrationVerdict({ name, email, password }) {
  const emailTrimmed = String(email || '').trim().toLowerCase();
  const errors = [];
  if (!String(name || '').trim()) errors.push('name');
  if (!isValidEmail(emailTrimmed) || isSyntheticEmail(emailTrimmed)) errors.push('email');
  if (!passwordStrength(password).strong) errors.push('password');
  return { ok: errors.length === 0, errors, email: emailTrimmed };
}

export function registerOwner(world, { uid, name, email, password, phone, username }) {
  const verdict = registrationVerdict({ name, email, password });
  if (!verdict.ok) {
    const err = new Error(`registration:${verdict.errors.join(',')}`);
    err.errors = verdict.errors;
    throw err;
  }
  if (!hasContactAccount({ email: verdict.email, phoneNumber: phone })) {
    throw new Error('registration:contact');
  }
  const familyId = world.nextId('fam');
  const user = { uid, email: verdict.email, emailVerified: false, displayName: name };
  const records = buildNewFamilyRecords({
    name: `${name}s familie`,
    type: 'family',
    language: 'nb',
    user,
    profile: { displayName: name, phone, username, usernameLower: username },
    familyId,
  });
  const now = world.tick();
  const joinCode = world.nextId('join');
  world.set(`families/${familyId}`, {
    ...records.family,
    createdAt: now,
    updatedAt: now,
    joinCode,
    activeUsers: [uid],
    memberIds: [uid],
    billingPreferredMethod: null,
  });
  world.set(`families/${familyId}/parents/${uid}`, { ...records.parent, familyId, createdAt: now, updatedAt: now });
  world.set(`parents/${uid}`, { ...records.parent, familyId, role: 'admin', createdAt: now, updatedAt: now });
  world.set(`users/${uid}`, { familyIds: [familyId], email: verdict.email, updatedAt: now });
  world.set(`joinCodes/${joinCode}`, { familyId });
  world.set(`usernames/${username}`, { uid });
  return { familyId, joinCode, uid };
}

export function joinByCode(world, { uid, name, email, password, phone, username, code }) {
  const verdict = registrationVerdict({ name, email, password });
  if (!verdict.ok) {
    const err = new Error(`registration:${verdict.errors.join(',')}`);
    err.errors = verdict.errors;
    throw err;
  }
  const kind = classifyInviteIdentifier(email);
  if (kind.kind !== 'email') throw new Error('invite:email');
  const link = world.get(`joinCodes/${code}`);
  if (!link?.familyId) throw new Error('join:missing');
  const family = world.get(`families/${link.familyId}`);
  if (!family || isGroupDeleted(family) || family.joinCode !== code) throw new Error('join:closed');
  const now = world.tick();
  const familyId = link.familyId;
  world.set(`families/${familyId}`, listMemberOnFamily({
    ...family,
    memberIds: [...new Set([...(family.memberIds || []), uid])],
    updatedAt: now,
  }, uid));
  const parent = {
    uid,
    email: verdict.email,
    phone: phone || '',
    name,
    username,
    usernameLower: username,
    admin: false,
    superAdmin: false,
    active: true,
    familyId,
    createdAt: now,
  };
  world.set(`families/${familyId}/parents/${uid}`, parent);
  world.set(`parents/${uid}`, parent);
  world.set(`users/${uid}`, { familyIds: [familyId], email: verdict.email });
  world.set(`usernames/${username}`, { uid });
  return { familyId, uid };
}

export function addChild(world, { familyId, actorUid, name, username, phone, email }) {
  const family = world.get(`families/${familyId}`);
  if (!isSuperAdmin(family, actorUid) && !(family?.adminUids || []).includes(actorUid)) {
    throw new Error('child:forbidden');
  }
  const uname = String(username || '').trim().toLowerCase();
  if (world.get(`usernames/${uname}`)) throw new Error('taken');
  const uid = world.nextId('kid');
  const authUid = `${uid}AuthUidPad00000000000000`.slice(0, 28);
  const authEmail = usernameToEmail(uname);
  const record = buildChildMemberRecord({
    uid: authUid,
    name,
    username: uname,
    phone,
    email,
    familyId,
    createdBy: actorUid,
    authEmail,
  });
  const now = world.tick();
  world.set(`families/${familyId}/children/${authUid}`, { ...record, createdAt: now, updatedAt: now });
  world.set(`children/${authUid}`, { ...record, createdAt: now });
  world.set(`usernames/${uname}`, { uid: authUid });
  world.set(`families/${familyId}`, {
    ...listMemberOnFamily(family, authUid),
    memberIds: [...new Set([...(family.memberIds || []), authUid])],
    updatedAt: now,
  });
  return { uid: authUid, username: uname, synthetic: isSyntheticEmail(authEmail) };
}

export function addChildWithoutAuth(world, { familyId, actorUid, name }) {
  const family = world.get(`families/${familyId}`);
  if (!isSuperAdmin(family, actorUid)) throw new Error('child:forbidden');
  const docId = world.nextId('doc').slice(0, 20);
  const now = world.tick();
  world.set(`families/${familyId}/children/${docId}`, {
    id: docId,
    uid: docId,
    name,
    role: 'child',
    active: true,
    familyId,
    createdBy: actorUid,
    createdAt: now,
  });
  world.set(`families/${familyId}`, listMemberOnFamily(family, docId));
  return { uid: docId, invitable: looksLikeAuthUid(docId) };
}

export function removeMember(world, { familyId, actorUid, role, member, wipePersonal = false }) {
  const family = world.get(`families/${familyId}`);
  if (!isSuperAdmin(family, actorUid) && !(family?.adminUids || []).includes(actorUid)) {
    throw new Error('remove:forbidden');
  }
  const plan = memberRemovalPlan({ role, member, wipePersonal });
  const now = world.tick();
  const path = `families/${familyId}/${plan.collection}/${plan.id}`;
  if (plan.keepProfile) {
    world.merge(path, { active: false, deleted: false, leftAt: now, familyId: null });
  } else if (role === 'child') {
    world.delete(path);
    world.merge(`children/${plan.id}`, { deleted: true, active: false, familyId: null, wipedAt: now });
  } else {
    world.delete(path);
  }
  if (plan.username) world.delete(`usernames/${plan.username}`);
  world.set(`families/${familyId}`, { ...revokeMemberOnFamily(family, plan.id), updatedAt: now });
  const user = world.get(`users/${plan.id}`);
  if (user) {
    world.merge(`users/${plan.id}`, {
      familyIds: (user.familyIds || []).filter((id) => id !== familyId),
      familyId: user.familyId === familyId ? null : user.familyId,
    });
  }
  return plan;
}

export function postChat(world, {
  familyId, chatId, senderId, text, memberIds, unreadFor, type = 'text',
}) {
  const now = world.tick();
  const chatPath = `families/${familyId}/chats/${chatId}`;
  const prev = world.get(chatPath) || {};
  const messageId = world.nextId('msg');
  const preview = chatMessagePreview({ text, type, deleted: false });
  const built = buildChatStampPatch({
    chatId,
    senderId,
    text: preview,
    memberIds,
    unreadFor,
    messageId,
    prev,
    now,
  });
  if (!prev.type) {
    world.set(chatPath, {
      type: String(chatId).startsWith('dm_') ? 'dm' : 'family',
      title: chatId,
      createdAtMs: now,
      memberIds: built.ids,
    });
  }
  world.merge(chatPath, built.patch);
  world.set(`${chatPath}/messages/${messageId}`, {
    senderId,
    text,
    type,
    createdAt: now,
    deleted: false,
  });
  const recipients = resolveChatRecipients({
    chatId,
    senderUid: senderId,
    memberIds: built.ids,
    familyMemberIds: (world.get(`families/${familyId}`) || {}).members || [],
  });
  recipients.forEach((uid) => {
    const id = world.nextId('ntf');
    world.set(`users/${uid}/notifications/${id}`, {
      chatId,
      familyId,
      senderId,
      text: String(text || '').slice(0, 140),
      createdAt: now,
    });
  });
  return { messageId, recipients, bump: built.bump };
}

export function markChatRead(world, { familyId, chatId, uid }) {
  const now = world.tick();
  world.merge(`families/${familyId}/chats/${chatId}`, {
    [`reads.${uid}`]: now,
    [`unreadCounts.${uid}`]: 0,
  });
}

export function editChatMessage(world, { familyId, chatId, messageId, uid, text, isAdmin = false }) {
  const path = `families/${familyId}/chats/${chatId}/messages/${messageId}`;
  const message = world.get(path);
  if (!canManageChatMessage(message, uid, isAdmin)) throw new Error('message:forbidden');
  const now = world.tick();
  world.merge(path, { text: String(text || '').trim(), editedAt: now, editedBy: uid });
  refreshPreview(world, familyId, chatId);
}

export function deleteChatMessage(world, { familyId, chatId, messageId, uid, isAdmin = false }) {
  const path = `families/${familyId}/chats/${chatId}/messages/${messageId}`;
  const message = world.get(path);
  if (!canManageChatMessage(message, uid, isAdmin)) throw new Error('message:forbidden');
  const now = world.tick();
  world.merge(path, { deleted: true, deletedAt: now, deletedBy: uid, text: '', imageUrl: null });
  refreshPreview(world, familyId, chatId);
}

function refreshPreview(world, familyId, chatId) {
  const messages = world.list(`families/${familyId}/chats/${chatId}/messages`)
    .filter((m) => !m.deleted)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const latest = messages[0];
  world.merge(`families/${familyId}/chats/${chatId}`, latest ? {
    lastText: chatMessagePreview(latest).slice(0, 140),
    lastSenderId: latest.senderId || null,
    lastAt: latest.createdAt,
  } : {
    lastText: '',
    lastSenderId: null,
  });
}

export function chatState(world, familyId, chatId, uid) {
  const data = world.get(`families/${familyId}/chats/${chatId}`);
  return {
    data,
    unread: unreadCountForUser(data, uid),
    isUnread: chatIsUnread(data, uid),
    visible: chatVisibleToUser(chatId, data, uid),
  };
}

export function openConnect4(world, { familyId, hostUid, hostName, inviteUid }) {
  const invites = inviteFields(hostUid, [inviteUid]);
  if (invites.invitedUids.length !== 1) throw new Error('Velg én spiller å invitere.');
  const id = world.nextId('c4');
  const now = world.tick();
  world.set(`families/${familyId}/connect4Games/${id}`, {
    ...invites,
    status: C4_STATUS.waiting,
    board: boardToFlat(emptyBoard()),
    player1: { uid: hostUid, name: hostName },
    player2: null,
    currentTurn: 1,
    winner: null,
    hostUid,
    hostName,
    createdAt: now,
  });
  world.set(`users/${inviteUid}/gameInvites/connect4_${id}`, gameInviteInboxDoc(inviteUid, {
    familyId, gameId: id, gameType: 'connect4', hostUid, hostName, gameTitle: 'Fire på rad',
  }));
  return id;
}

export function acceptConnect4(world, { familyId, gameId, uid, name }) {
  const path = `families/${familyId}/connect4Games/${gameId}`;
  const resolved = resolveConnect4Accept(world.get(path), { uid, name });
  if (!resolved.alreadyIn) world.merge(path, resolved.patch);
  world.merge(`users/${uid}/gameInvites/connect4_${gameId}`, { status: 'accepted' });
}

export function playConnect4(world, { familyId, gameId, uid, col }) {
  const path = `families/${familyId}/connect4Games/${gameId}`;
  const { patch } = resolveConnect4Move(world.get(path), { uid, col });
  world.merge(path, patch);
  return { ...world.get(path), board: boardFromStored(world.get(path).board) };
}

export function openTtt(world, { familyId, hostUid, hostName, inviteUid }) {
  const invites = inviteFields(hostUid, [inviteUid]);
  if (invites.invitedUids.length !== 1) throw new Error('Velg én spiller å invitere.');
  const id = world.nextId('ttt');
  world.set(`families/${familyId}/tttGames/${id}`, {
    ...invites,
    status: 'waiting',
    board: emptyTttBoard(),
    playerX: { uid: hostUid, name: hostName },
    playerO: null,
    currentTurn: 'X',
    winner: null,
    hostUid,
    hostName,
  });
  world.set(`users/${inviteUid}/gameInvites/ttt_${id}`, gameInviteInboxDoc(inviteUid, {
    familyId, gameId: id, gameType: 'ttt', hostUid, hostName, gameTitle: 'Tre på rad',
  }));
  return id;
}

export function acceptTtt(world, { familyId, gameId, uid, name }) {
  const path = `families/${familyId}/tttGames/${gameId}`;
  const resolved = resolveTttAccept(world.get(path), { uid, name });
  if (!resolved.alreadyIn) world.merge(path, resolved.patch);
}

export function playTtt(world, { familyId, gameId, uid, cellIndex }) {
  const path = `families/${familyId}/tttGames/${gameId}`;
  const { patch } = resolveTttMove(world.get(path), { uid, cellIndex });
  world.merge(path, patch);
  return world.get(path);
}

export function openChess(world, { familyId, hostUid, hostName, inviteUid }) {
  const invites = inviteFields(hostUid, [inviteUid]);
  if (invites.invitedUids.length !== 1) throw new Error('Velg én spiller å invitere.');
  const id = world.nextId('chess');
  world.set(`families/${familyId}/chessGames/${id}`, {
    ...invites,
    status: 'waiting',
    fen: chessStartFen(),
    playerWhite: { uid: hostUid, name: hostName },
    playerBlack: null,
    currentTurn: 'w',
    winner: null,
    resultStatus: 'playing',
    roundId: 1,
    hostUid,
    hostName,
    keys: [],
  });
  return id;
}

export function acceptChess(world, { familyId, gameId, uid, name }) {
  const path = `families/${familyId}/chessGames/${gameId}`;
  const resolved = resolveChessAccept(world.get(path), { uid, name });
  if (!resolved.alreadyIn) world.merge(path, resolved.patch);
}

export function playChess(world, { familyId, gameId, uid, from, to }) {
  const path = `families/${familyId}/chessGames/${gameId}`;
  const patch = resolveChessOnlineMove(world.get(path), {
    uid, fr: from.r, fc: from.c, tr: to.r, tc: to.c,
  });
  world.merge(path, patch);
  return world.get(path);
}

export function openDraw(world, { familyId, hostUid, hostName, inviteUid, secret }) {
  const invites = inviteFields(hostUid, [inviteUid]);
  const id = world.nextId('draw');
  world.set(`families/${familyId}/drawGuessGames/${id}`, {
    ...invites,
    status: DRAW_STATUS.drawing,
    secret,
    drawerUid: hostUid,
    hostUid,
    hostName,
    strokes: [],
    winnerUid: null,
  });
  return id;
}

export function drawStroke(world, { familyId, gameId, strokes }) {
  const path = `families/${familyId}/drawGuessGames/${gameId}`;
  const game = world.get(path);
  const next = sanitizeStrokes([...(game.strokes || []), ...strokes]);
  world.merge(path, { strokes: next });
  return next;
}

export function guessDraw(world, { familyId, gameId, uid, text }) {
  const path = `families/${familyId}/drawGuessGames/${gameId}`;
  const game = world.get(path);
  const correct = guessesMatch(text, game.secret);
  if (correct) {
    world.merge(path, { status: DRAW_STATUS.won, winnerUid: uid });
  }
  return { correct, seenSecret: game.secret };
}

export function requestFriend(world, { fromUid, toUid }) {
  const id = friendshipPairId(fromUid, toUid);
  world.set(`friendRequests/${id}`, { id, fromUid, toUid, status: 'pending' });
  world.set(`users/${toUid}/friendInvites/${id}`, { fromUid, status: 'pending' });
  return id;
}

export function acceptFriend(world, { fromUid, toUid }) {
  const id = friendshipPairId(fromUid, toUid);
  const req = world.get(`friendRequests/${id}`);
  if (!req || req.status !== 'pending') throw new Error('friend:missing');
  world.merge(`friendRequests/${id}`, { status: 'accepted' });
  const chatId = friendChatId(fromUid, toUid);
  return { id, chatId };
}

export function setBilling(world, { familyId, uid, method }) {
  const family = world.get(`families/${familyId}`);
  if (!canChangeBilling(family, uid)) throw new Error('billing:forbidden');
  world.merge(`families/${familyId}`, { billingPreferredMethod: method });
}

export function deactivateFamily(world, { familyId, uid }) {
  const family = world.get(`families/${familyId}`);
  if (!isSuperAdmin(family, uid)) throw new Error('billing:forbidden');
  world.merge(`families/${familyId}`, deactivateGroupPatch());
}

export function reactivateFamily(world, { familyId, uid }) {
  const family = world.get(`families/${familyId}`);
  if (!isSuperAdmin(family, uid)) throw new Error('billing:forbidden');
  world.merge(`families/${familyId}`, reactivateGroupPatch());
}

export function cancelSubscription(world, { familyId, uid }) {
  const family = world.get(`families/${familyId}`);
  if (!isSuperAdmin(family, uid)) throw new Error('billing:forbidden');
  const patch = deleteGroupPatch(family);
  const code = family.joinCode;
  world.merge(`families/${familyId}`, {
    ...patch,
    deletedAt: world.tick(),
    subscriptionCancelledAt: world.tick(),
  });
  if (code) world.delete(`joinCodes/${code}`);
  return world.get(`families/${familyId}`);
}

export function memberCanInvite(member) {
  return memberInviteAuthUid(member);
}

export { isGroupDeactivated, isGroupDeleted };
