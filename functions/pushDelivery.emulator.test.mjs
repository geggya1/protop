/**
 * Push for varsler (web push og Expo) mot Firestore-emulatoren.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/pushDelivery.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { beforeEach, test } from 'node:test';
import webpush from 'web-push';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { deliverNotificationPush, pushPayloadFor } = await import('./pushDelivery.js');
const { onNotificationPush } = await import('./notifyPushIndex.js');
const { VAPID_PUBLIC_KEY } = await import('./vapid.js');

const db = getFirestore();
const VAPID = webpush.generateVAPIDKeys();

function browserKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}

function fakes() {
  const web = [];
  const expo = [];
  const sender = {
    async sendNotification(sub, body, options) {
      // Ekte kryptering og VAPID-signering, bare uten nettverk.
      webpush.generateRequestDetails(sub, body, options);
      if (sub.endpoint.includes('gammelnokkel')) {
        const err = new Error('VAPID credentials do not correspond');
        err.statusCode = 403;
        throw err;
      }
      if (sub.endpoint.includes('utlopt')) {
        const err = new Error('Gone');
        err.statusCode = 410;
        throw err;
      }
      web.push({ endpoint: sub.endpoint, payload: JSON.parse(body), options });
    },
  };
  const fetchImpl = async (url, init) => {
    const messages = JSON.parse(init.body);
    expo.push(...messages);
    return { json: async () => ({ data: messages.map(() => ({ status: 'ok' })) }) };
  };
  return { web, expo, deps: { webpush: sender, fetch: fetchImpl, vapidKey: VAPID.privateKey, vapidPublicKey: VAPID.publicKey } };
}

async function notify(uid, id, data, deps) {
  const ref = db.doc(`users/${uid}/notifications/${id}`);
  await ref.set(data);
  const result = await deliverNotificationPush({ db, uid, notifId: id, notif: data, ref, deps });
  return { result, stored: (await ref.get()).data()?.push };
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc('users/bente').set({ uid: 'bente', notificationPrefs: { enabled: true } });
  await db.doc('users/bente/pushSubscriptions/pc').set({ endpoint: 'https://push.example/pc', keys: browserKeys() });
  await db.doc('users/bente/pushSubscriptions/gammel').set({ endpoint: 'https://push.example/utlopt', keys: browserKeys() });
  await db.doc('users/bente/pushSubscriptions/telefon').set({ type: 'expo', token: 'ExponentPushToken[abc]' });
});

test('varsel fra en annen bruker gir push på alle enheter; utløpt abonnement fjernes', async () => {
  const { web, expo, deps } = fakes();
  const { result, stored } = await notify('bente', 'msg_1', {
    eventType: 'messageReceived', title: 'Ny melding', body: 'Hei!', chatId: 'c1', familyId: 'fam', createdBy: 'arne',
  }, deps);
  assert.equal(result.sent, 2);
  assert.equal(result.reason, 'user');
  assert.equal(stored.sent, 2);
  assert.equal(web.length, 1);
  assert.equal(web[0].payload.title, 'Ny melding');
  assert.equal(web[0].payload.tag, 'chat_c1');
  assert.equal(web[0].options.vapidDetails.publicKey, VAPID.publicKey);
  assert.equal(expo.length, 1);
  assert.equal(expo[0].to, 'ExponentPushToken[abc]');
  assert.equal((await db.doc('users/bente/pushSubscriptions/gammel').get()).exists, false);
  assert.equal((await db.doc('users/bente/pushSubscriptions/pc').get()).exists, true);
});

test('abonnement laget med en tidligere nøkkel fjernes når push-tjenesten avviser det', async () => {
  await db.doc('users/bente/pushSubscriptions/gammelnokkel').set({ endpoint: 'https://push.example/gammelnokkel', keys: browserKeys(), vapidPublicKey: 'tidligere' });
  await db.doc('users/bente/pushSubscriptions/naa').set({ endpoint: 'https://push.example/gammelnokkel-men-ny', keys: browserKeys(), vapidPublicKey: VAPID.publicKey });
  const { deps } = fakes();
  await notify('bente', 'k_old', { eventType: 'taskReceived', title: 'Oppgave' }, deps);
  assert.equal((await db.doc('users/bente/pushSubscriptions/gammelnokkel').get()).exists, false);
  // Samme feil med dagens nøkkel: behold (feil hos oss, ikke hos abonnementet).
  assert.equal((await db.doc('users/bente/pushSubscriptions/naa').get()).exists, true);
});

test('alle varseltyper gir push, også fra serveren uten avsender', async () => {
  for (const eventType of ['taskReceived', 'familyInvite', 'friendInvite', 'gameInvite', 'eventCreated', 'vacationPlan', 'birthdayReminder', 'albumShared']) {
    const { web, deps } = fakes();
    const { result } = await notify('bente', `n_${eventType}`, { eventType, title: eventType }, deps);
    assert.equal(result.reason, 'server', eventType);
    assert.equal(web.length, 1, eventType);
    assert.equal(web[0].payload.eventType, eventType);
  }
});

test('varsel appen lager til seg selv gir ikke push, men testvarsel gjør', async () => {
  const { web, deps } = fakes();
  const self = await notify('bente', 'chat_c1_1', { eventType: 'messageReceived', createdBy: 'bente' }, deps);
  assert.equal(self.result.reason, 'self');
  assert.equal(web.length, 0);
  const check = await notify('bente', 'pushtest_1', { eventType: 'pushTest', pushTest: true, createdBy: 'bente', title: 'ProTop' }, deps);
  assert.equal(check.result.reason, 'test');
  assert.equal(web.length, 1);
  assert.equal(web[0].payload.title, 'ProTop');
});

test('push av for typen eller alle varsler respekteres', async () => {
  await db.doc('users/bente').set({ notificationPrefs: { enabled: true, events: { messageReceived: { push: false } } } });
  const { web, deps } = fakes();
  const off = await notify('bente', 'm1', { eventType: 'messageReceived', createdBy: 'arne' }, deps);
  assert.equal(off.result.reason, 'prefs');
  const other = await notify('bente', 't1', { eventType: 'taskReceived', createdBy: 'arne' }, deps);
  assert.equal(other.result.reason, 'user');
  await db.doc('users/bente').set({ notificationPrefs: { enabled: false } });
  const all = await notify('bente', 't2', { eventType: 'taskReceived', createdBy: 'arne' }, deps);
  assert.equal(all.result.reason, 'prefs');
  assert.equal(web.length, 1);
});

test('uten VAPID-nøkkel: ingen web push, men app-push går', async () => {
  const { web, expo, deps } = fakes();
  const { result } = await notify('bente', 'k1', { eventType: 'taskReceived', title: 'Oppgave' }, { ...deps, vapidKey: '' });
  assert.equal(result.reason, 'missing-key');
  assert.equal(web.length, 0);
  assert.equal(expo.length, 1);
});

test('privat nøkkel som ikke hører til den offentlige: ingen web push, tydelig grunn', async () => {
  const { web, deps } = fakes();
  const other = webpush.generateVAPIDKeys().privateKey;
  const { result } = await notify('bente', 'mm1', { eventType: 'taskReceived' }, { ...deps, vapidKey: other });
  assert.equal(result.reason, 'key-mismatch');
  assert.equal(web.length, 0);
  // Dagens offentlige nøkkel i appen er gyldig (65 byte, ukomprimert punkt).
  const raw = Buffer.from(VAPID_PUBLIC_KEY, 'base64url');
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4);
});

test('over grensen fra samme avsender: ingen push', async () => {
  const { web, deps } = fakes();
  const rateLimit = async () => { throw new Error('For mange'); };
  const { result } = await notify('bente', 'r1', { eventType: 'messageReceived', createdBy: 'spam' }, { ...deps, rateLimit });
  assert.equal(result.reason, 'limit');
  assert.equal(web.length, 0);
});

test('payload har ProTop som standardtittel og lenkefelt', () => {
  const p = pushPayloadFor('inv_1', { eventType: 'familyInvite', familyId: 'firma', inviteId: 'i1' });
  assert.equal(p.title, 'ProTop');
  assert.equal(p.tag, 'inv_1');
  assert.equal(p.inviteId, 'i1');
  assert.equal(p.familyId, 'firma');
});

test('triggeren er koblet til users/{uid}/notifications og skriver resultatet', async () => {
  await db.collection('users/bente/pushSubscriptions').get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
  const ref = db.doc('users/bente/notifications/via_trigger');
  await ref.set({ eventType: 'taskReceived', title: 'Oppgave', createdBy: 'arne' });
  const snap = await ref.get();
  await onNotificationPush.run({ params: { uid: 'bente', notifId: 'via_trigger' }, data: snap });
  const stored = (await ref.get()).data()?.push;
  assert.equal(stored.reason, 'user');
  assert.equal(stored.devices, 0);
});
