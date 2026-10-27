/**
 * Bedriftsvegg — offentlige nyheter for selskapet.
 * Samme form som familieveggen, egen subcollection under families/{id}.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, getDoc, getDocs, query,
  orderBy, limit, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeWallLinkUrl } from '../utils/familyWall';
import { clipWallTitle, normalizeWallCategory } from './companyPage';

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

/** Finnes det allerede et innlegg fra en import (samme importKey)? Brukes så gjentatt import ikke dobler nyheter. */
/** Er innlegget med denne nøkkelen allerede lagt ut? Kaster ved feil, så kalleren ikke legger ut to ganger. */
export async function companyWallHasImport(companyId, importKey) {
  if (!companyId || !importKey) return false;
  const snap = await getDocs(query(companyWallPostsCol(companyId), where('importKey', '==', String(importKey)), limit(1)));
  return !snap.empty;
}

export async function createCompanyWallPost({
  companyId, authorUid, authorName, body, imageUrl, imageUrls, linkUrl, title, category, importKey,
}) {
  if (!companyId) throw new Error('Mangler selskap');
  const urls = normalizePostImageUrls(imageUrls, imageUrl);
  const text = String(body || '').trim();
  const link = normalizeWallLinkUrl(linkUrl);
  const headline = clipWallTitle(title);
  if (!text && urls.length === 0 && !link && !headline) {
    throw new Error('Skriv en overskrift eller tekst, legg ved bilde, eller legg til en lenke.');
  }
  const ref = await addDoc(companyWallPostsCol(companyId), {
    body: text,
    title: headline,
    category: normalizeWallCategory(category) || null,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    linkUrl: link,
    authorUid: authorUid || null,
    authorName: authorName || 'Ukjent',
    reactionCount: 0,
    reactions: {},
    deleted: false,
    ...(importKey ? { importKey: String(importKey).slice(0, 200) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCompanyWallPost(companyId, postId, {
  body, imageUrl, imageUrls, linkUrl, title, category, editorUid, isAdmin = false,
}) {
  if (!companyId || !postId) throw new Error('Mangler innlegg');
  const ref = doc(db, 'families', companyId, 'companyWallPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Innlegget finnes ikke.');
  const data = snap.data() || {};
  if (data.deleted === true) throw new Error('Innlegget er slettet.');
  if (!isAdmin && (!editorUid || data.authorUid !== editorUid)) {
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
  const nextTitle = title !== undefined ? clipWallTitle(title) : clipWallTitle(data.title);
  if (!text && urls.length === 0 && !link && !nextTitle) {
    throw new Error('Skriv en overskrift eller tekst, legg ved bilde, eller legg til en lenke.');
  }
  const nextCategory = category !== undefined
    ? (normalizeWallCategory(category) || null)
    : (normalizeWallCategory(data.category) || null);
  await updateDoc(ref, {
    body: text,
    title: nextTitle,
    category: nextCategory,
    imageUrl: urls[0] || null,
    imageUrls: urls,
    linkUrl: link,
    updatedAt: serverTimestamp(),
  });
}

export async function softDeleteCompanyWallPost(companyId, postId, { editorUid, isAdmin = false } = {}) {
  if (!companyId || !postId) return;
  const ref = doc(db, 'families', companyId, 'companyWallPosts', postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (!isAdmin && (!editorUid || snap.data()?.authorUid !== editorUid)) {
    throw new Error('Du kan bare slette egne innlegg.');
  }
  await updateDoc(ref, {
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
