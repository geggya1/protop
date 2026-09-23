import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  BOOK_STATUS,
  progressPatchForPages,
  finishedPatchForBook,
  reopenReadingPatch,
  isBookUnread,
  effectiveBookStatus,
  progressPct,
  normalizeBookPages,
  bookNavPayload,
} from './booksProgress';

export {
  BOOK_STATUS,
  progressPatchForPages,
  finishedPatchForBook,
  reopenReadingPatch,
  isBookUnread,
  effectiveBookStatus,
  progressPct,
  normalizeBookPages,
  bookNavPayload,
};

export const BOOK_OWNER = {
  child: 'child',
  parent: 'parent',
};

export const STATUS_LABELS = {
  reading: 'Leser nå',
  finished: 'Lest ferdig',
  wishlist: 'Ønskeliste',
};

function booksCol(familyId, ownerKind, ownerId) {
  if (ownerKind === BOOK_OWNER.parent) {
    return collection(db, 'families', familyId, 'parentBooks', ownerId, 'books');
  }
  return collection(db, 'families', familyId, 'children', ownerId, 'books');
}

function bookDoc(familyId, ownerKind, ownerId, bookId) {
  if (ownerKind === BOOK_OWNER.parent) {
    return doc(db, 'families', familyId, 'parentBooks', ownerId, 'books', bookId);
  }
  return doc(db, 'families', familyId, 'children', ownerId, 'books', bookId);
}

function mapBook(d) {
  const data = d.data() || {};
  const { totalPages, pagesRead } = normalizeBookPages(data);
  return {
    id: d.id,
    ...data,
    totalPages,
    pagesRead,
    status: typeof data.status === 'string' ? data.status : BOOK_STATUS.reading,
    reviewRating: Math.max(0, Math.min(5, Number(data.reviewRating) || 0)),
    reviewText: data.reviewText || '',
  };
}

export function listenBooks(familyId, ownerKind, ownerId, cb) {
  if (!familyId || !ownerId) return () => {};
  const q = query(booksCol(familyId, ownerKind, ownerId), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(mapBook));
  }, () => cb([]));
}

export function listenChildBooks(familyId, childId, cb) {
  return listenBooks(familyId, BOOK_OWNER.child, childId, cb);
}

export function listenParentBooks(familyId, parentUid, cb) {
  return listenBooks(familyId, BOOK_OWNER.parent, parentUid, cb);
}

export async function addBook(familyId, ownerKind, ownerId, uid, data) {
  const rating = Math.max(0, Math.min(5, Number(data.reviewRating) || 0));
  const ref = booksCol(familyId, ownerKind, ownerId);
  return addDoc(ref, {
    title: String(data.title || '').trim(),
    author: String(data.author || '').trim(),
    isbn: data.isbn ? String(data.isbn).replace(/\D/g, '') : null,
    coverUrl: data.coverUrl || null,
    totalPages: data.totalPages != null ? Number(data.totalPages) : null,
    pagesRead: Number(data.pagesRead) || 0,
    status: data.status || BOOK_STATUS.reading,
    notes: String(data.notes || '').trim(),
    reviewRating: rating,
    reviewText: String(data.reviewText || '').trim(),
    ownerKind,
    ownerId,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    startedAt: serverTimestamp(),
    finishedAt: data.status === BOOK_STATUS.finished ? serverTimestamp() : null,
  });
}

export async function updateBook(familyId, ownerKind, ownerId, bookId, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (patch.reviewRating != null) {
    next.reviewRating = Math.max(0, Math.min(5, Number(patch.reviewRating) || 0));
  }
  if (patch.reviewText != null) {
    next.reviewText = String(patch.reviewText || '').trim();
  }
  if (patch.status === BOOK_STATUS.finished) {
    next.finishedAt = serverTimestamp();
  } else if (patch.status && patch.status !== BOOK_STATUS.finished) {
    next.finishedAt = null;
  }
  await updateDoc(bookDoc(familyId, ownerKind, ownerId, bookId), next);
}

export async function deleteBook(familyId, ownerKind, ownerId, bookId) {
  await deleteDoc(bookDoc(familyId, ownerKind, ownerId, bookId));
}

export { lookupIsbn } from './isbnLookup';

export function reviewStarsLabel(rating) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0));
  if (!n) return null;
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}
