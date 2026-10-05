/**
 * Same-origin friend lists. Browseren treffer /api/friends på protop.no,
 * ikke listMyFriends / listFriendRequests på cloudfunctions.net.
 */
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { applyCors, requireBearerUid } from './httpAuth.js';
import { assertParentCanManageChildFriends, resolveFriendActorUid } from './friendActor.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

function jsonValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) return value.map(jsonValue);
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = jsonValue(entry);
  return out;
}

async function listFriends(uid) {
  const snap = await db.collection(`users/${uid}/friends`).get();
  const friends = snap.docs
    .map((d) => jsonValue({ id: d.id, friendUid: d.id, ...d.data() }))
    .filter((f) => f.status !== 'removed');
  return { ok: true, friends, targetUid: uid };
}

async function listRequests(uid) {
  const snap = await db.collection(`users/${uid}/friendRequests`)
    .where('status', '==', 'pending')
    .get();
  const requests = snap.docs.map((d) => jsonValue({ id: d.id, requestId: d.id, ...d.data() }));
  return { ok: true, requests, actorUid: uid };
}

export const friendListHttp = onRequest(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 20, memory: '256MiB' },
  async (req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Bruk POST.' });
      return;
    }
    const callerUid = await requireBearerUid(req, res);
    if (!callerUid) return;
    const body = req.body || {};
    const action = String(body.action || '').trim();
    try {
      if (action === 'friends') {
        const targetUid = String(body.targetUid || '').trim();
        const familyId = String(body.familyId || '').trim();
        if (targetUid && targetUid !== callerUid) {
          await assertParentCanManageChildFriends(familyId, callerUid, targetUid);
          const data = await listFriends(targetUid);
          res.json(data);
          return;
        }
        res.json(await listFriends(callerUid));
        return;
      }
      if (action === 'requests') {
        const uid = await resolveFriendActorUid(callerUid, {
          asUid: body.asUid || body.targetUid,
          familyId: body.familyId,
        });
        res.json(await listRequests(uid));
        return;
      }
      res.status(400).json({ ok: false, error: 'Ukjent handling.' });
    } catch (error) {
      if (error instanceof HttpsError) {
        const status = error.code === 'permission-denied' ? 403 : error.code === 'unauthenticated' ? 401 : 400;
        res.status(status).json({ ok: false, error: error.message || 'forbidden' });
        return;
      }
      logger.warn('friendListHttp failed', { message: error?.message });
      res.status(500).json({ ok: false, error: 'Kunne ikke hente venner.' });
    }
  },
);
