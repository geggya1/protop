/**
 * Bedriftsvegg — offentlige nyheter for selskapet.
 * Samme form som familieveggen, egen subcollection under families/{id}.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, getDoc, query,
  orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeWallLinkUrl } from '../utils/familyWall';

function normalizePostImageUrls(imageUrls, imageUrl) {
  const list = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (list.length) return list.slice(0, 6);
  return imageUrl ? [imageUrl] : [];
}

export function companyWallPostsCol(companyId) {
  return collection(db, 'families', companyId, 'companyWallPosts');
}

export function listenCompanyWall(companyId, cb) {
  if (!companyId) return () => {};
  const qy = query(companyWallPostsCol(companyId), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createCompanyWallPost({
  companyId, authorUid, authorName, body, imageUrl, imageUrls, linkUrl,
}) {
  if (!companyId) throw new Error('Mangler selskap');
  const urls = normalizePostImageUrls(imageUrls, imageUrl);
  const text = String(body || '').trim();
  const link = normalizeWallLinkUrl(linkUrl);
  if (!text && urls.length === 0 && !link) {
    throw new Error('Skriv noe, legg ved bilde, eller legg til en lenke.');
  }
  const ref = await addDoc(companyWallPostsCol(companyId), {
    body: text,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    linkUrl: link,
    authorUid: authorUid || null,
    authorName: authorName || 'Ukjent',
    reactionCount: 0,
    reactions: {},
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompanyWallPost(companyId, postId, {
  body, imageUrl, imageUrls, linkUrl, editorUid, isAdmin = false,
}) {
  if (!companyId || !postId) throw new Error('Mangler innlegg');
  const ref = doc(db, 'families', companyId, 'companyWallPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Innlegget finnes ikke.');
  const data = snap.data() || {};
  if (data.deleted === true) throw new Error('Innlegget er slettet.');
  if (!isAdmin && data.authorUid !== editorUid) {
    throw new Error('Du kan bare redigere egne innlegg.');
  }
  const urls = normalizePostImageUrls(
    imageUrls !== undefined ? imageUrls : data.imageUrls,
    imageUrl !== undefined ? imageUrl : data.imageUrl,
  );
  const text = body !== undefined ? String(body || '').trim() : String(data.body || '').trim();
  const link = linkUrl !== undefined
    ? normalizeWallLinkUrl(linkUrl)
    : normalizeWallLinkUrl(data.linkUrl);
  if (!text && urls.length === 0 && !link) {
    throw new Error('Skriv noe, legg ved bilde, eller legg til en lenke.');
  }
  await updateDoc(ref, {
    body: text,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    linkUrl: link,
    updatedAt: serverTimestamp(),
  });
}

export async function softDeleteCompanyWallPost(companyId, postId) {
  if (!companyId || !postId) return;
  await updateDoc(doc(db, 'families', companyId, 'companyWallPosts', postId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function reactToCompanyWallPost(companyId, postId, uid, emoji = '❤️') {
  if (!companyId || !postId || !uid) return;
  const ref = doc(db, 'families', companyId, 'companyWallPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const reactions = { ...(data.reactions || {}) };
  if (reactions[uid] === emoji) delete reactions[uid];
  else reactions[uid] = emoji;
  await updateDoc(ref, {
    reactions,
    reactionCount: Object.keys(reactions).length,
    updatedAt: serverTimestamp(),
  });
}
