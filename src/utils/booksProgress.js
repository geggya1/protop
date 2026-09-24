/** Pure helpers for bokhylle-fremgang (uten Firebase). */

export const BOOK_STATUS = {
  reading: 'reading',
  finished: 'finished',
  wishlist: 'wishlist',
};

/**
 * Når sidetall endres: 0 sider (eller under total) skal ikke bli stående som «Lest ferdig».
 * Ferdig-status settes kun eksplisitt via finishedPatchForBook.
 */
export function progressPatchForPages(book, pagesReadInput) {
  const read = Math.max(0, Math.round(Number(pagesReadInput) || 0));
  const total = Number(book?.totalPages);
  const hasTotal = Number.isFinite(total) && total > 0;
  const capped = hasTotal ? Math.min(read, total) : read;
  const patch = { pagesRead: capped };

  const wasFinished = book?.status === BOOK_STATUS.finished;
  if (capped <= 0) {
    if (wasFinished || book?.status === BOOK_STATUS.reading) {
      patch.status = BOOK_STATUS.reading;
      patch.finishedAt = null;
    }
  } else if (wasFinished && hasTotal && capped < total) {
    patch.status = BOOK_STATUS.reading;
    patch.finishedAt = null;
  }

  return patch;
}

/** Patch for eksplisitt «Registrer ferdiglest». */
export function finishedPatchForBook(book, pagesReadInput) {
  const read = Math.max(0, Math.round(Number(pagesReadInput) || 0));
  const total = Number(book?.totalPages);
  const hasTotal = Number.isFinite(total) && total > 0;
  const pagesRead = hasTotal ? Math.max(read, total) : Math.max(read, 1);
  return {
    pagesRead,
    status: BOOK_STATUS.finished,
  };
}

/** Patch for å åpne boken igjen til «Leser nå». */
export function reopenReadingPatch(book, pagesReadInput) {
  const read = Math.max(0, Math.round(Number(pagesReadInput) || 0));
  const total = Number(book?.totalPages);
  const hasTotal = Number.isFinite(total) && total > 0;
  let pagesRead = read;
  if (hasTotal && pagesRead >= total) {
    pagesRead = Math.max(0, total - 1);
  }
  return {
    pagesRead,
    status: BOOK_STATUS.reading,
    finishedAt: null,
  };
}

/** Ulest = 0 sider. */
export function isBookUnread(book) {
  return (Number(book?.pagesRead) || 0) <= 0;
}

/** Visningsstatus: 0 sider kan ikke være «Lest ferdig». */
export function effectiveBookStatus(book) {
  if (isBookUnread(book) && book?.status === BOOK_STATUS.finished) {
    return BOOK_STATUS.reading;
  }
  return book?.status || BOOK_STATUS.reading;
}

/**
 * Prosent lest (0–100), eller null når total mangler.
 * Aldri NaN — ugyldig pagesRead behandles som 0 (unngår width: "NaN%" i UI).
 */
export function progressPct(book) {
  const total = Number(book?.totalPages);
  if (!Number.isFinite(total) || total <= 0) return null;
  const read = Number(book?.pagesRead);
  const safeRead = Number.isFinite(read) && read > 0 ? read : 0;
  return Math.min(100, Math.round((safeRead / total) * 100));
}

/** Normaliser sidetall fra Firestore / skjema (unngå undefined/NaN i UI). */
export function normalizeBookPages(data = {}) {
  const totalRaw = data?.totalPages;
  const totalNum = totalRaw == null || totalRaw === '' ? null : Number(totalRaw);
  const totalPages = Number.isFinite(totalNum) && totalNum > 0 ? totalNum : null;
  const readNum = Number(data?.pagesRead);
  const pagesRead = Number.isFinite(readNum) && readNum > 0 ? Math.round(readNum) : 0;
  return { totalPages, pagesRead };
}

/** Serialiserbar bok-payload for React Navigation (uten Firestore Timestamp). */
export function bookNavPayload(book) {
  if (!book) return undefined;
  const { totalPages, pagesRead } = normalizeBookPages(book);
  const status = typeof book.status === 'string' ? book.status : BOOK_STATUS.reading;
  return {
    id: book.id,
    title: book.title || '',
    author: book.author || '',
    isbn: book.isbn || null,
    coverUrl: typeof book.coverUrl === 'string' ? book.coverUrl : null,
    totalPages,
    pagesRead,
    status,
    notes: book.notes || '',
    reviewRating: Math.max(0, Math.min(5, Number(book.reviewRating) || 0)),
    reviewText: book.reviewText || '',
  };
}
