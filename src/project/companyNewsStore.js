/**
 * Nyheter for bedriften. Samme sakstype som familieveggen: tekst, bilde, lenke og markering.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, getDoc, query,
  orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeWallLinkUrl } from '../utils/familyWall';

function imageUrls(imageUrlsInput, imageUrl) {
  const list = Array.isArray(imageUrlsInput) ? imageUrlsInput.filter(Boolean) : [];
  if (list.length) return list.slice(0, 6);
  return imageUrl ? [imageUrl] : [];
}

export function companyNewsCol(companyId) {
  return collection(db, 'families', companyId, 'companyNews');
}

export function listenCompanyNews(companyId, cb) {
  if (!companyId) return () => {};
  const qy = query(companyNewsCol(companyId), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
  }, () => cb([]));
}

export async function createCompanyNewsPost({
  companyId, authorUid, authorName, body, imageUrl, imageUrls: images, linkUrl,
}) {
  if (!companyId) throw new Error('Mangler bedrift');
  const urls = imageUrls(images, imageUrl);
  const text = String(body || '').trim();
  const link = normalizeWallLinkUrl(linkUrl);
  if (!text && urls.length === 0 && !link) {
    throw new Error('Skriv en sak, legg ved et bilde, eller legg til en lenke.');
  }
  const ref = await addDoc(companyNewsCol(companyId), {
    body: text,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    linkUrl: link,
    authorUid: authorUid || null,
    authorName: authorName || 'Medarbeider',
    reactionCount: 0,
    reactions: {},
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompanyNewsPost(companyId, postId, {
  body, imageUrl, imageUrls: images, linkUrl, editorUid, isAdmin = false,
}) {
  if (!companyId || !postId) throw new Error('Mangler sak');
  const ref = doc(db, 'families', companyId, 'companyNews', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Saken finnes ikke.');
  const data = snap.data() || {};
  if (data.deleted === true) throw new Error('Saken er fjernet.');
  if (!isAdmin && data.authorUid !== editorUid) {
    throw new Error('Du kan bare redigere egne saker.');
  }
  const urls = imageUrls(
    images !== undefined ? images : data.imageUrls,
    imageUrl !== undefined ? imageUrl : data.imageUrl,
  );
  const text = body !== undefined ? String(body || '').trim() : String(data.body || '').trim();
  const link = linkUrl !== undefined
    ? normalizeWallLinkUrl(linkUrl)
    : normalizeWallLinkUrl(data.linkUrl);
  if (!text && urls.length === 0 && !link) {
    throw new Error('Skriv en sak, legg ved et bilde, eller legg til en lenke.');
  }
  await updateDoc(ref, {
    body: text,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    linkUrl: link,
    updatedAt: serverTimestamp(),
  });
}

export async function removeCompanyNewsPost(companyId, postId) {
  if (!companyId || !postId) return;
  await updateDoc(doc(db, 'families', companyId, 'companyNews', postId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function markCompanyNewsPost(companyId, postId, uid) {
  if (!companyId || !postId || !uid) return;
  const ref = doc(db, 'families', companyId, 'companyNews', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const reactions = { ...(data.reactions || {}) };
  if (reactions[uid] === 'noted') delete reactions[uid];
  else reactions[uid] = 'noted';
  await updateDoc(ref, {
    reactions,
    reactionCount: Object.keys(reactions).length,
    updatedAt: serverTimestamp(),
  });
}
