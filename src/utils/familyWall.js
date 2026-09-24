/**
 * Familievegg — enkle poster (tekst + bilde), samme form som lag-vegg.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, getDoc, query,
  orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

function normalizePostImageUrls(imageUrls, imageUrl) {
  const list = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (list.length) return list.slice(0, 6);
  return imageUrl ? [imageUrl] : [];
}

/** Optional external URL for a wall post. Returns null if empty/invalid. */
export function normalizeWallLinkUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

const BODY_URL_RE = /https?:\/\/[^\s<>"']+/gi;

/**
 * Split plain body text into display text + extracted http(s) links.
 * Used so long pasted URLs become a Link button instead of raw text.
 */
export function splitBodyAndLinks(rawBody, preferredLinkUrl) {
  const preferred = normalizeWallLinkUrl(preferredLinkUrl);
  const source = String(rawBody || '');
  const found = [];
  const seen = new Set();
  if (preferred) {
    found.push(preferred);
    seen.add(preferred);
  }
  const text = source.replace(BODY_URL_RE, (match) => {
    // Trim common trailing punctuation from pasted URLs
    const cleaned = match.replace(/[),.;!?]+$/g, '');
    const href = normalizeWallLinkUrl(cleaned);
    if (href && !seen.has(href)) {
      seen.add(href);
      found.push(href);
    }
    return ' ';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return { text, links: found };
}


export function wallPostsCol(familyId) {
  return collection(db, 'families', familyId, 'wallPosts');
}

export function listenFamilyWall(familyId, cb) {
  if (!familyId) return () => {};
  const qy = query(wallPostsCol(familyId), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function createFamilyWallPost({
  familyId, authorUid, authorName, body, imageUrl, imageUrls, linkUrl,
}) {
  if (!familyId) throw new Error('Mangler familie');
  const urls = normalizePostImageUrls(imageUrls, imageUrl);
  const text = String(body || '').trim();
  const link = normalizeWallLinkUrl(linkUrl);
  if (!text && urls.length === 0 && !link) {
    throw new Error('Skriv noe, legg ved bilde, eller legg til en lenke.');
  }
  const ref = await addDoc(wallPostsCol(familyId), {
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

export async function updateFamilyWallPost(familyId, postId, {
  body, imageUrl, imageUrls, linkUrl, editorUid, isAdmin = false,
}) {
  if (!familyId || !postId) throw new Error('Mangler innlegg');
  const ref = doc(db, 'families', familyId, 'wallPosts', postId);
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

export async function softDeleteFamilyWallPost(familyId, postId) {
  if (!familyId || !postId) return;
  await updateDoc(doc(db, 'families', familyId, 'wallPosts', postId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function reactToFamilyWallPost(familyId, postId, uid, emoji = '❤️') {
  if (!familyId || !postId || !uid) return;
  const ref = doc(db, 'families', familyId, 'wallPosts', postId);
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
