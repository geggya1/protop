import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chatMessageNotice, chatNoticeId } from './chatsLogic.js';
import { buildChatStampPatch, nestDottedPatch } from './chatStampLogic.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('varselet for en direktemelding viser avsenderen (SOS-13)', () => {
  // Chattens tittel i en DM er mottakerens navn (satt av avsenderen).
  assert.deepEqual(
    chatMessageNotice({ chatId: 'dm_eva_kim', chatTitle: 'Kim Kollega', senderName: 'Eva Eier', text: 'Møte kl 14?' }),
    { title: 'Eva Eier', body: 'Møte kl 14?' },
  );
  assert.equal(chatMessageNotice({ chatId: 'dm_eva_kim', text: 'Hei' }).title, 'Ny melding');
  // Gruppe og «Alle ansatte»: chattens navn, avsender i teksten.
  assert.deepEqual(
    chatMessageNotice({ chatId: 'family', chatTitle: 'Alle ansatte', senderName: 'Eva Eier', text: 'Lunsj!' }),
    { title: 'Alle ansatte', body: 'Eva Eier: Lunsj!' },
  );
  assert.equal(chatMessageNotice({ chatId: 'g_1', chatTitle: 'Chat', senderName: 'Eva', text: 'x' }).title, 'Eva');
  assert.equal(chatMessageNotice({ chatId: 'family', isDm: true, senderName: 'Eva', text: 'x' }).title, 'Eva');
  assert.ok(chatMessageNotice({ chatId: 'dm_a_b', senderName: 'E', text: 'x'.repeat(500) }).body.length <= 280);
});

test('avsender, server og mottakerens reserve bruker samme varsel-id (SOS-11)', () => {
  assert.equal(chatNoticeId({ chatId: 'dm_eva_kim', messageId: 'm1' }), 'msg_m1');
  assert.equal(chatNoticeId({ chatId: 'dm_eva_kim', messageId: 'm1', friend: true }), 'friendChat_m1');
  // Uten meldings-id (gamle chatter): som før.
  assert.equal(chatNoticeId({ chatId: 'family', stampId: 'eva_123' }), 'chat_family_eva_123');
  assert.equal(chatNoticeId({ chatId: 'dm_a_b', stampId: 's', friend: true }), 'friendChat_dm_a_b_s');

  // Avsenderne.
  assert.match(read('components/ChatDock.jsx'), /notificationId: chatNoticeId\(\{ chatId, messageId: msgRef\.id \}\)/);
  assert.match(read('screens/v2/ChatThreadScreen.jsx'), /chatNoticeId\(\{ chatId, messageId \}\)/);
  assert.match(read('src/utils/friendChats.js'), /notificationId: `friendChat_\$\{msgRef\.id\}`/);
  // Serveren.
  const server = read('functions/friendCallables.js');
  assert.match(server, /notifications\/friendChat_\$\{msgRef\.id\}/);
  assert.match(read('functions/chatNotify.js'), /const notifId = `msg_\$\{messageId\}`/);
  // Mottakerens reserve: samme id, og skriver bare når varselet mangler.
  for (const rel of ['src/hooks/useChatSelfNotify.js', 'src/hooks/useFriendChatSelfNotify.js']) {
    const src = read(rel);
    assert.match(src, /chatNoticeId\(\{/, rel);
    assert.match(src, /messageId: data\.unreadStampId/, rel);
    assert.match(src, /snap\.exists\(\) \? null : setDoc\(notifRef, payload\)/, rel);
  }
});

test('stempelet bærer avsenderens navn, så reserven kan vise det', () => {
  const { patch } = buildChatStampPatch({
    chatId: 'dm_eva_kim', senderId: 'eva', senderName: 'Eva Eier', text: 'Hei', memberIds: ['eva', 'kim'], messageId: 'm1', now: 5,
  });
  assert.equal(patch.lastSenderName, 'Eva Eier');
  assert.match(read('functions/friendCallables.js'), /lastSenderName: senderName,/);
});

test('ulest-tellingen lagres i kartet, ikke i felt med punktum (SOS-14)', () => {
  const { patch } = buildChatStampPatch({
    chatId: 'family', senderId: 'eva', text: 'Hei', memberIds: ['eva', 'kim', 'kari'], messageId: 'm2',
    prev: { unreadCounts: { kim: 2 } }, now: 7,
  });
  // Feltstier for updateDoc.
  assert.equal(patch['unreadCounts.kim'], 3);
  // Nestet for setDoc merge.
  const nested = nestDottedPatch(patch);
  assert.deepEqual(nested.unreadCounts, { eva: 0, kim: 3, kari: 1 });
  assert.deepEqual(nested.reads, { eva: 7 });
  assert.equal(Object.keys(nested).some((k) => k.includes('.')), false);
  assert.equal(nested.lastText, 'Hei');

  const chats = read('src/utils/chats.js');
  const stamp = chats.slice(chats.indexOf('export async function stampChatMessage'), chats.indexOf('function messageDoc'));
  assert.match(stamp, /snap\.exists\(\)\s*\? updateDoc\(ref, patch\)\s*: setDoc\(ref, nestDottedPatch\(patch\), \{ merge: true \}\)/);
  assert.doesNotMatch(stamp, /setDoc\(ref, patch, \{ merge: true \}\)/);
  const read_ = chats.slice(chats.indexOf('export async function markChatRead'));
  assert.match(read_, /setDoc\(ref, nestDottedPatch\(patch\), \{ merge: true \}\)/);

  // Server-triggerne bruker nestede kart med set merge.
  const trigger = read('functions/chatNotify.js');
  assert.doesNotMatch(trigger, /patch\[`unreadCounts\./);
  assert.doesNotMatch(trigger, /patch\[`reads\./);
  assert.match(trigger, /patch\.unreadCounts = \{ \[senderUid\]: 0 \}/);
});
