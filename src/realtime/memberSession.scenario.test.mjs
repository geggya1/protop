import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSquare } from '../utils/chessEngine.js';
import { buildChatStampPatch } from '../utils/chatStampLogic.js';
import { chatVisibleToUser } from '../utils/chatsLogic.js';
import {
  billingMethodIdsForPlatform,
  trialDaysLeft,
} from '../utils/billingMethods.js';
import { parentTaskVisibleToUser } from '../utils/parentTaskVisibility.js';
import {
  canReserveWish,
  mergeWishSecrets,
  shouldHideReservations,
} from '../utils/wishlistVisibility.js';
import {
  childCanControlLocationSharing,
  distanceMeters,
  effectiveLocationSharing,
  isFreshLocation,
} from '../utils/familyLocationLogic.js';
import { goalProgress } from '../utils/rewardGoalsLogic.js';
import { composeBodyToHtml } from '../utils/mailHtml.js';
import { isListedOnFamilyData } from '../utils/familyMembershipLogic.js';
import {
  acceptChess,
  acceptConnect4,
  acceptFriend,
  acceptTtt,
  addChild,
  addChildWithoutAuth,
  cancelSubscription,
  chatState,
  createBot,
  createMemberWorld,
  deactivateFamily,
  deleteChatMessage,
  drawStroke,
  editChatMessage,
  guessDraw,
  isGroupDeactivated,
  isGroupDeleted,
  joinByCode,
  markChatRead,
  memberCanInvite,
  openChess,
  openConnect4,
  openDraw,
  openTtt,
  playChess,
  playConnect4,
  playTtt,
  postChat,
  reactivateFamily,
  registerOwner,
  registrationVerdict,
  removeMember,
  requestFriend,
  setBilling,
} from './memberSession.js';

const ADA = 'adaAdaAdaAdaAdaAdaAdaAdaAdaA';
const BO = 'boBoBoBoBoBoBoBoBoBoBoBoBoBo';
const EVA = 'evaEvaEvaEvaEvaEvaEvaEvaEv';
const DAN = 'danDanDanDanDanDanDanDanDanD';

function sq(name) {
  return parseSquare(name);
}

test('flere boter gjennom registrering, samhandling og avsluttet abonnement', () => {
  assert.equal(ADA.length, 28);
  assert.deepEqual(
    registrationVerdict({ name: '', email: 'ada@example.com', password: 'Hemmelig1' }).errors,
    ['name'],
  );
  assert.ok(registrationVerdict({
    name: 'Ada',
    email: 'ikke-en-epost',
    password: 'Hemmelig1',
  }).errors.includes('email'));
  assert.ok(registrationVerdict({
    name: 'Ada',
    email: 'katt@weekplan.app',
    password: 'Hemmelig1',
  }).errors.includes('email'));
  assert.ok(registrationVerdict({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'kort',
  }).errors.includes('password'));

  const world = createMemberWorld();
  const adaReg = registerOwner(world, {
    uid: ADA,
    name: 'Ada',
    email: 'ada@example.com',
    password: 'Hemmelig1',
    phone: '+4790000001',
    username: 'ada',
  });
  const familyId = adaReg.familyId;
  const ada = createBot(world, { uid: ADA, name: 'Ada' });
  ada.watch(`families/${familyId}`);
  ada.watch(`families/${familyId}/chats/family`);
  ada.watch(`users/${ADA}/notifications`);

  const created = world.get(`families/${familyId}`);
  assert.equal(created.ownerUid, ADA);
  assert.equal(trialDaysLeft(created.createdAt, created.createdAt), 14);
  assert.equal(trialDaysLeft(null), 14);
  assert.ok(isListedOnFamilyData(created, ADA));

  assert.throws(
    () => joinByCode(world, {
      uid: BO,
      name: 'Bo',
      email: 'bo@example.com',
      password: 'Hemmelig1',
      username: 'bo',
      code: 'feil-kode',
    }),
    /join:missing/,
  );

  const boJoin = joinByCode(world, {
    uid: BO,
    name: 'Bo',
    email: 'bo@example.com',
    password: 'Hemmelig1',
    phone: '+4790000002',
    username: 'bo',
    code: adaReg.joinCode,
  });
  assert.equal(boJoin.familyId, familyId);
  const bo = createBot(world, { uid: BO, name: 'Bo' });
  bo.watch(`families/${familyId}`);
  bo.watch(`families/${familyId}/chats/family`);
  bo.watch(`users/${BO}/notifications`);
  assert.ok(bo.familyView(familyId).members.includes(ADA));
  assert.ok(ada.familyView(familyId).members.includes(BO));

  const evaJoin = joinByCode(world, {
    uid: EVA,
    name: 'Eva',
    email: 'eva@example.com',
    password: 'Hemmelig1',
    phone: '+4790000003',
    username: 'eva',
    code: adaReg.joinCode,
  });
  assert.equal(evaJoin.familyId, familyId);
  const eva = createBot(world, { uid: EVA, name: 'Eva' });
  eva.watch(`families/${familyId}`);
  eva.watch(`families/${familyId}/chats/family`);

  const cari = addChild(world, {
    familyId,
    actorUid: ADA,
    name: 'Cari',
    username: 'cari',
  });
  assert.equal(cari.synthetic, true);
  const cariBot = createBot(world, { uid: cari.uid, name: 'Cari' });
  cariBot.watch(`families/${familyId}`);
  cariBot.watch(`families/${familyId}/chats/family`);
  cariBot.watch(`users/${cari.uid}/notifications`);
  assert.ok(cariBot.familyView(familyId).members.includes(cari.uid));

  const placeholder = addChildWithoutAuth(world, {
    familyId, actorUid: ADA, name: 'Uten innlogging',
  });
  assert.equal(placeholder.invitable, false);
  assert.equal(memberCanInvite({
    role: 'child', uid: placeholder.uid, docId: placeholder.uid,
  }), null);

  const danReg = registerOwner(world, {
    uid: DAN,
    name: 'Dan',
    email: 'dan@example.com',
    password: 'Hemmelig1',
    phone: '+4790000004',
    username: 'dan',
  });
  const dan = createBot(world, { uid: DAN, name: 'Dan' });
  dan.watch(`users/${DAN}/friendInvites`);
  dan.watch(`users/${DAN}/notifications`);
  assert.equal(dan.familyView(familyId), null);
  assert.notEqual(danReg.familyId, familyId);

  const friendId = requestFriend(world, { fromUid: ADA, toUid: DAN });
  assert.equal(world.get(`users/${DAN}/friendInvites/${friendId}`).status, 'pending');
  const friendship = acceptFriend(world, { fromUid: ADA, toUid: DAN });
  const dm = postChat(world, {
    familyId: danReg.familyId,
    chatId: friendship.chatId,
    senderId: ADA,
    text: 'Hei Dan, bare mellom oss',
    memberIds: [ADA, DAN],
  });
  assert.deepEqual(dm.recipients, [DAN]);
  assert.equal(chatState(world, danReg.familyId, friendship.chatId, DAN).unread, 1);
  assert.equal(chatState(world, danReg.familyId, friendship.chatId, cari.uid).visible, false);

  const beforeBo = bo.events.length;
  const hello = postChat(world, {
    familyId,
    chatId: 'family',
    senderId: ADA,
    text: 'Hei alle sammen',
    memberIds: [ADA, BO, EVA, cari.uid],
  });
  assert.ok(bo.events.length > beforeBo);
  assert.ok(hello.recipients.includes(BO));
  assert.ok(hello.recipients.includes(cari.uid));
  assert.equal(chatState(world, familyId, 'family', ADA).unread, 0);
  assert.equal(chatState(world, familyId, 'family', BO).unread, 1);
  assert.equal(chatState(world, familyId, 'family', cari.uid).isUnread, true);

  postChat(world, {
    familyId,
    chatId: 'family',
    senderId: BO,
    text: 'Vi sees i kveld',
    memberIds: [ADA, BO, EVA, cari.uid],
  });
  assert.equal(chatState(world, familyId, 'family', ADA).unread, 1);
  assert.equal(chatState(world, familyId, 'family', BO).unread, 0);
  markChatRead(world, { familyId, chatId: 'family', uid: ADA });
  assert.equal(chatState(world, familyId, 'family', ADA).unread, 0);

  const image = postChat(world, {
    familyId,
    chatId: 'family',
    senderId: ADA,
    text: '',
    type: 'image',
    memberIds: [ADA, BO, EVA, cari.uid],
  });
  assert.equal(world.get(`families/${familyId}/chats/family`).lastText, '📷 Bilde');
  editChatMessage(world, {
    familyId, chatId: 'family', messageId: image.messageId, uid: ADA, text: 'Bildet er fra turen',
  });
  assert.equal(world.get(`families/${familyId}/chats/family`).lastText, 'Bildet er fra turen');
  assert.throws(
    () => editChatMessage(world, {
      familyId, chatId: 'family', messageId: image.messageId, uid: BO, text: 'nei',
    }),
    /message:forbidden/,
  );
  deleteChatMessage(world, {
    familyId, chatId: 'family', messageId: image.messageId, uid: ADA,
  });
  assert.notEqual(world.get(`families/${familyId}/chats/family`).lastText, 'Bildet er fra turen');

  const group = postChat(world, {
    familyId,
    chatId: 'g_voksne',
    senderId: ADA,
    text: 'Bare voksne',
    memberIds: [ADA, BO],
  });
  assert.deepEqual(group.recipients, [BO]);
  assert.equal(bo.seesChat(familyId, 'g_voksne'), true);
  assert.equal(cariBot.seesChat(familyId, 'g_voksne'), false);

  const stale = world.get(`families/${familyId}/chats/family`);
  const baseUnread = Number(stale.unreadCounts?.[BO] || 0);
  const raced = ['race-a', 'race-b'].map((messageId) => buildChatStampPatch({
    chatId: 'family',
    senderId: ADA,
    text: messageId,
    memberIds: [ADA, BO],
    messageId,
    prev: stale,
    now: world.tick(),
  }));
  assert.equal(raced[0].patch[`unreadCounts.${BO}`], baseUnread + 1);
  assert.equal(raced[1].patch[`unreadCounts.${BO}`], baseUnread + 1);

  const privateTask = { assignedTo: null, createdBy: ADA, active: true };
  const familyTask = { assignedTo: 'family', createdBy: ADA, active: true };
  const forBo = { assignedTo: BO, createdBy: ADA, active: true };
  assert.equal(parentTaskVisibleToUser(privateTask, { uid: BO, asChild: false }), false);
  assert.equal(parentTaskVisibleToUser(privateTask, { uid: ADA }), true);
  assert.equal(parentTaskVisibleToUser(familyTask, { uid: cari.uid, asChild: true }), true);
  assert.equal(parentTaskVisibleToUser(forBo, { uid: BO, ids: [BO] }), true);
  assert.equal(parentTaskVisibleToUser(forBo, { uid: cari.uid, ids: [cari.uid], asChild: true }), false);

  const wish = {
    id: 'wish1',
    forChildId: cari.uid,
    subjectUid: cari.uid,
    ownerUid: ADA,
    createdBy: ADA,
  };
  const item = { id: 'item1', title: 'Sykkel' };
  const secret = { id: 'item1', reservedByUid: ADA, reservedByName: 'Ada', status: 'reserved' };
  assert.equal(canReserveWish(wish, item, { uid: ADA }), true);
  assert.equal(canReserveWish(wish, item, { uid: cari.uid, childId: cari.uid }), false);
  const hidden = mergeWishSecrets([item], [secret], {
    hideReservations: shouldHideReservations(wish, { uid: cari.uid, childId: cari.uid }),
  });
  assert.equal(hidden[0].reservedByName, undefined);
  const shown = mergeWishSecrets([item], [secret], { hideReservations: false });
  assert.equal(shown[0].reservedByName, 'Ada');

  const childRecord = {
    locationSharingEnabled: true,
    locationSharingChildCanControl: false,
  };
  assert.equal(childCanControlLocationSharing(childRecord), false);
  assert.equal(effectiveLocationSharing({
    userProfile: { locationSharingEnabled: false },
    childRecord,
  }), true);
  const here = { lat: 59.91, lng: 10.75, updatedAt: Date.now() };
  world.set(`families/${familyId}/locations/${cari.uid}`, here);
  assert.equal(isFreshLocation(world.get(`families/${familyId}/locations/${cari.uid}`)), true);
  assert.ok(distanceMeters(here, { lat: 59.92, lng: 10.76 }) > 1000);

  const goal = {
    shared: false,
    childIds: [cari.uid],
    milestones: [{ points: 10, claims: {} }],
  };
  const progress = goalProgress(goal, { [cari.uid]: 4 }, cari.uid);
  assert.equal(progress.earned, 4);
  assert.equal(progress.pct, 40);
  assert.equal(goalProgress(goal, { [cari.uid]: 4 }, BO).earned, 0);

  const mailHtml = composeBodyToHtml('Hei **Bo**, møtet er flyttet');
  assert.match(mailHtml, /<b>Bo<\/b>/);
  world.set(`users/${ADA}/mail/${world.nextId('mail')}`, {
    from: ADA,
    to: [BO],
    html: mailHtml,
  });
  const mail = world.list(`users/${ADA}/mail`).find((row) => row.to?.includes(BO));
  assert.ok(mail);
  assert.equal(mail.to.includes(cari.uid), false);

  assert.throws(
    () => openConnect4(world, {
      familyId, hostUid: ADA, hostName: 'Ada', inviteUid: placeholder.uid,
    }),
    /Velg én spiller/,
  );

  const c4 = openConnect4(world, {
    familyId, hostUid: ADA, hostName: 'Ada', inviteUid: BO,
  });
  bo.watch(`families/${familyId}/connect4Games/${c4}`);
  bo.watch(`users/${BO}/gameInvites`);
  assert.equal(world.get(`users/${BO}/gameInvites/connect4_${c4}`).status, 'pending');
  acceptConnect4(world, { familyId, gameId: c4, uid: BO, name: 'Bo' });
  assert.throws(
    () => playConnect4(world, { familyId, gameId: c4, uid: BO, col: 0 }),
    /Ikke din tur/,
  );
  assert.throws(
    () => playConnect4(world, { familyId, gameId: c4, uid: cari.uid, col: 0 }),
    /ikke med/,
  );
  const cols = [0, 1, 0, 1, 0, 1, 0];
  let c4View = null;
  cols.forEach((col, index) => {
    const uid = index % 2 === 0 ? ADA : BO;
    c4View = playConnect4(world, { familyId, gameId: c4, uid, col });
  });
  assert.equal(c4View.status, 'finished');
  assert.equal(c4View.winner, 1);
  assert.equal(c4View.board[2][0], 1);
  assert.ok(bo.events.some((event) => event.path.includes('connect4Games')));

  const ttt = openTtt(world, {
    familyId, hostUid: ADA, hostName: 'Ada', inviteUid: cari.uid,
  });
  cariBot.watch(`families/${familyId}/tttGames/${ttt}`);
  acceptTtt(world, { familyId, gameId: ttt, uid: cari.uid, name: 'Cari' });
  playTtt(world, { familyId, gameId: ttt, uid: ADA, cellIndex: 0 });
  playTtt(world, { familyId, gameId: ttt, uid: cari.uid, cellIndex: 3 });
  playTtt(world, { familyId, gameId: ttt, uid: ADA, cellIndex: 1 });
  playTtt(world, { familyId, gameId: ttt, uid: cari.uid, cellIndex: 4 });
  const tttDone = playTtt(world, { familyId, gameId: ttt, uid: ADA, cellIndex: 2 });
  assert.equal(tttDone.winner, 'X');
  assert.equal(tttDone.status, 'finished');

  const chess = openChess(world, {
    familyId, hostUid: ADA, hostName: 'Ada', inviteUid: BO,
  });
  bo.watch(`families/${familyId}/chessGames/${chess}`);
  acceptChess(world, { familyId, gameId: chess, uid: BO, name: 'Bo' });
  assert.throws(
    () => playChess(world, { familyId, gameId: chess, uid: ADA, from: sq('e2'), to: sq('e5') }),
    /Ugyldig trekk/,
  );
  const line = [
    [ADA, 'e2', 'e4'],
    [BO, 'e7', 'e5'],
    [ADA, 'd1', 'h5'],
    [BO, 'b8', 'c6'],
    [ADA, 'f1', 'c4'],
    [BO, 'g8', 'f6'],
    [ADA, 'h5', 'f7'],
  ];
  let chessView = null;
  line.forEach(([uid, from, to]) => {
    chessView = playChess(world, {
      familyId, gameId: chess, uid, from: sq(from), to: sq(to),
    });
  });
  assert.equal(chessView.status, 'finished');
  assert.equal(chessView.winner, 'w');
  assert.match(chessView.fen, / w | b /);

  const draw = openDraw(world, {
    familyId, hostUid: ADA, hostName: 'Ada', inviteUid: BO, secret: 'katt',
  });
  bo.watch(`families/${familyId}/drawGuessGames/${draw}`);
  drawStroke(world, {
    familyId,
    gameId: draw,
    strokes: [{ color: '#1099F4', width: 4, points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }] }],
  });
  const miss = guessDraw(world, { familyId, gameId: draw, uid: BO, text: 'hund' });
  assert.equal(miss.correct, false);
  assert.equal(miss.seenSecret, 'katt');
  const hit = guessDraw(world, { familyId, gameId: draw, uid: BO, text: 'Katt!' });
  assert.equal(hit.correct, true);
  assert.equal(world.get(`families/${familyId}/drawGuessGames/${draw}`).winnerUid, BO);

  assert.throws(() => setBilling(world, { familyId, uid: BO, method: 'card' }), /billing:forbidden/);
  assert.deepEqual(billingMethodIdsForPlatform('web'), ['card', 'vipps']);
  assert.deepEqual(billingMethodIdsForPlatform('ios'), ['appstore']);
  setBilling(world, { familyId, uid: ADA, method: 'vipps' });
  assert.equal(bo.familyView(familyId).billingPreferredMethod, 'vipps');

  deactivateFamily(world, { familyId, uid: ADA });
  assert.equal(isGroupDeactivated(world.get(`families/${familyId}`)), true);
  assert.equal(isGroupDeleted(world.get(`families/${familyId}`)), false);
  assert.throws(() => deactivateFamily(world, { familyId, uid: BO }), /billing:forbidden/);
  reactivateFamily(world, { familyId, uid: ADA });
  assert.equal(bo.familyView(familyId).active, true);

  const removed = removeMember(world, {
    familyId,
    actorUid: ADA,
    role: 'parent',
    member: { uid: EVA, email: 'eva@example.com', phone: '+4790000003', username: 'eva' },
  });
  assert.equal(removed.keepProfile, true);
  assert.equal(eva.familyView(familyId), null);
  assert.equal(world.get(`families/${familyId}/parents/${EVA}`).active, false);
  assert.equal(world.get(`usernames/eva`).uid, EVA);
  postChat(world, {
    familyId,
    chatId: 'family',
    senderId: ADA,
    text: 'Eva er ute',
    memberIds: [ADA, BO, cari.uid],
  });
  assert.equal(eva.seesChat(familyId, 'family'), false);

  const wiped = removeMember(world, {
    familyId,
    actorUid: ADA,
    role: 'child',
    member: { uid: placeholder.uid, name: 'Uten innlogging', username: '' },
    wipePersonal: true,
  });
  assert.equal(wiped.keepProfile, false);
  assert.equal(world.get(`families/${familyId}/children/${placeholder.uid}`), null);
  assert.equal(world.get(`children/${placeholder.uid}`).deleted, true);

  const closed = cancelSubscription(world, { familyId, uid: ADA });
  assert.equal(closed.subscriptionStatus, 'cancelled');
  assert.equal(closed.subscriptionCancelReason, 'group_deleted');
  assert.equal(closed.joinCode, null);
  assert.equal(isGroupDeleted(closed), true);
  assert.equal(ada.familyView(familyId), null);
  assert.equal(bo.familyView(familyId), null);
  assert.equal(cariBot.familyView(familyId), null);
  assert.throws(
    () => joinByCode(world, {
      uid: 'nyNyNyNyNyNyNyNyNyNyNyNyNyNyN',
      name: 'Ny',
      email: 'ny@example.com',
      password: 'Hemmelig1',
      username: 'nybruker',
      code: adaReg.joinCode,
    }),
    /join:missing/,
  );
  assert.equal(chatVisibleToUser('family', { memberIds: [] }, 'fremmed'), true);

  ada.stop();
  bo.stop();
  eva.stop();
  cariBot.stop();
  dan.stop();
});
