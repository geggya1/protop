import { Platform } from 'react-native';
import { ref, deleteObject } from 'firebase/storage';
import {
  collection, doc, getDoc, getDocs, limit, query, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { storage, functions, db } from '../../firebase';
import { pickImage, pickDocument } from './media';
import { mergePrepTaskSuggestions } from './schedulePrepTasks';
import { isAppleMobileWeb } from './appleMobileWeb';
import { applyHomeworkFocusToSuggestions, isHomeworkFocus } from './homeworkImport';

/** Desktop/tablet — skarpe fag-navn i timeplan-tabeller. */
const DESKTOP_MAX_DIM = 1600;
const DESKTOP_QUALITY = 0.82;
const DESKTOP_MAX_IMAGE_BYTES = 1_500_000;

/** iPhone/iPad PWA — mindre bilde unngår hvit skjerm / minne-krasj i Safari. */
const MOBILE_MAX_DIM = 960;
const MOBILE_QUALITY = 0.7;
const MOBILE_MAX_IMAGE_BYTES = 750_000;

/** Lekseplan-bilder: litt høyere oppløsning så LESING/REGNING-tekst leses. */
const HOMEWORK_MOBILE_MAX_DIM = 1280;
const HOMEWORK_MOBILE_QUALITY = 0.8;
const HOMEWORK_MOBILE_MAX_IMAGE_BYTES = 1_200_000;

const MAX_DOC_BYTES = 4_000_000;
/** Klient må vente lenger enn Cloud Function (180s) + nettverksopplasting. */
const ANALYZE_TIMEOUT_MS = 200000;

export const KIND_LABELS = {
  todo: 'Gjøremål',
  homework: 'Lekse',
  schedule_slot: 'Time / fag',
  event: 'Kalender',
  note: 'Info',
};

export const PLAN_FILE_ACCEPT_HINT = 'Bilde, PDF eller dokument (Word/tekst)';

function isMobileWeb() {
  return Platform.OS === 'web' && isAppleMobileWeb();
}

function imageLimits({ homework = false } = {}) {
  if (isMobileWeb()) {
    if (homework) {
      return {
        maxDim: HOMEWORK_MOBILE_MAX_DIM,
        quality: HOMEWORK_MOBILE_QUALITY,
        maxBytes: HOMEWORK_MOBILE_MAX_IMAGE_BYTES,
      };
    }
    return {
      maxDim: MOBILE_MAX_DIM,
      quality: MOBILE_QUALITY,
      maxBytes: MOBILE_MAX_IMAGE_BYTES,
    };
  }
  return {
    maxDim: DESKTOP_MAX_DIM,
    quality: DESKTOP_QUALITY,
    maxBytes: DESKTOP_MAX_IMAGE_BYTES,
  };
}

function yieldToMain() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve(dataUrl.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Kunne ikke lese filen'));
    reader.readAsDataURL(blob);
  });
}

function guessMime(name, fallback = 'application/octet-stream') {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.heic') || n.endsWith('.heif')) return 'image/jpeg';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.txt')) return 'text/plain';
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (n.endsWith('.doc')) return 'application/msword';
  return fallback;
}

export function isPlanImageMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m.startsWith('image/') || m === 'image/heic' || m === 'image/heif';
}

export function isSupportedPlanMime(mime, fileName) {
  const m = String(mime || guessMime(fileName)).toLowerCase();
  if (m.startsWith('image/') || m === 'image/heic' || m === 'image/heif') return true;
  if (m === 'application/pdf' || m === 'text/plain' || m === 'text/txt') return true;
  if (m === 'application/msword') return true;
  if (m.includes('wordprocessingml') || m.includes('opendocument')) return true;
  const n = String(fileName || '').toLowerCase();
  return /\.(pdf|txt|doc|docx|odt|png|jpe?g|webp|gif|heic|heif)$/.test(n);
}

async function compressViaImageElement(blob, maxDim, quality) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Kunne ikke lese bildet'));
      el.src = url;
    });
    await yieldToMain();
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    return out || blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImageBlob(blob, maxDim, quality, opts = {}) {
  if (!blob || typeof document === 'undefined') return blob;

  const limits = imageLimits({ homework: !!opts.homework });
  const dim = maxDim || limits.maxDim;
  const q = quality ?? limits.quality;

  let current = blob;
  const dims = [dim, Math.round(dim * 0.82), 800, 640];

  for (let i = 0; i < dims.length; i += 1) {
    const targetDim = dims[i];
    const targetQ = Math.max(0.55, q - i * 0.06);

    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(current);
        const scale = Math.min(1, targetDim / Math.max(bitmap.width, bitmap.height, 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const out = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', targetQ);
        });
        if (out) current = out;
      } else {
        current = await compressViaImageElement(current, targetDim, targetQ);
      }
    } catch {
      try {
        current = await compressViaImageElement(current, targetDim, targetQ);
      } catch {
        break;
      }
    }

    await yieldToMain();
    if (current.size <= limits.maxBytes) break;
  }

  return current;
}

export async function pickPlanImage({ camera = false, homework = false } = {}) {
  const picked = await pickImage({ camera, edit: false });
  if (!picked?.uri && !picked?.blob) return null;
  let blob = picked.blob;
  if (!blob && picked.uri) {
    const res = await fetch(picked.uri);
    blob = await res.blob();
  }
  if (Platform.OS === 'web' && blob) {
    await yieldToMain();
    blob = await compressImageBlob(blob, undefined, undefined, { homework });
  }
  const { maxBytes } = imageLimits({ homework });
  if (blob && blob.size > maxBytes) {
    throw new Error('Bildet er for stort etter komprimering. Ta nærmere bilde.');
  }
  return {
    uri: picked.uri,
    blob,
    name: picked.name,
    mimeType: 'image/jpeg',
  };
}

/**
 * Velg ukeplan som bilde, PDF eller dokument. Kamera = kun bilde.
 * @param {{ camera?: boolean, homework?: boolean }} [opts]
 */
export async function pickPlanFile({ camera = false, homework = false } = {}) {
  if (camera) return pickPlanImage({ camera: true, homework });

  const picked = await pickDocument();
  if (!picked?.uri && !picked?.blob) return null;

  let blob = picked.blob;
  if (!blob && picked.uri) {
    const res = await fetch(picked.uri);
    blob = await res.blob();
  }
  if (!blob) return null;

  let mimeType = blob.type || picked.mimeType || guessMime(picked.name, 'application/octet-stream');
  if (/heic|heif/i.test(mimeType) || /\.heic$/i.test(picked.name || '')) {
    mimeType = 'image/jpeg';
  }
  if (!isSupportedPlanMime(mimeType, picked.name)) {
    throw new Error('Filtypen støttes ikke. Bruk bilde, PDF eller Word/tekst.');
  }

  const { maxBytes } = imageLimits({ homework });
  const maxFileBytes = isPlanImageMime(mimeType) ? maxBytes : MAX_DOC_BYTES;
  if (blob.size > maxFileBytes * 4) {
    throw new Error(
      isPlanImageMime(mimeType)
        ? 'Bildet er for stort. Zoom inn på timeplanen og ta bilde på nytt.'
        : 'Filen er for stor (maks 4 MB). Lagre som PDF eller ta et bilde.',
    );
  }

  return {
    uri: picked.uri,
    blob,
    name: picked.name || 'ukeplan',
    mimeType: isPlanImageMime(mimeType) ? 'image/jpeg' : mimeType,
  };
}

/**
 * Send filen direkte til Cloud Function som base64.
 * Unngår Firebase Storage CORS fra nettleser (protop.no → firebasestorage).
 */
export async function uploadTempPlanImage(familyId, uid, blob, opts = {}) {
  if (!blob) throw new Error('Mangler fil.');
  let mimeType = opts.mimeType || blob.type || 'image/jpeg';
  const fileName = opts.fileName || null;
  const homework = isHomeworkFocus(opts.focusMode) || !!opts.homework;
  let payload = blob;

  if (isPlanImageMime(mimeType) && Platform.OS === 'web') {
    await yieldToMain();
    payload = await compressImageBlob(blob, undefined, undefined, { homework });
    mimeType = 'image/jpeg';
  }

  const { maxBytes } = imageLimits({ homework });
  const maxFileBytes = isPlanImageMime(mimeType) ? maxBytes : MAX_DOC_BYTES;
  if (payload.size > maxFileBytes) {
    throw new Error(
      isPlanImageMime(mimeType)
        ? 'Bildet er for stort. Prøv et mindre utsnitt (f.eks. kun én dag).'
        : 'Filen er for stor (maks 4 MB).',
    );
  }

  await yieldToMain();
  const imageBase64 = await blobToBase64(payload);
  if (!imageBase64) throw new Error('Kunne ikke lese filen for analyse.');
  return {
    storagePath: null,
    imageBase64,
    mimeType: isPlanImageMime(mimeType) ? 'image/jpeg' : mimeType,
    fileName,
  };
}

export async function deleteTempPlanImage(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // best effort
  }
}

export async function analyzePlanImage({
  familyId, childId, childName, storagePath, imageBase64, mimeType, fileName, focusMode,
}) {
  const homework = isHomeworkFocus(focusMode);
  const fn = httpsCallable(functions, 'aiImportPlan', { timeout: ANALYZE_TIMEOUT_MS });
  const call = fn({
    familyId,
    childId,
    childName,
    storagePath: storagePath || '',
    imageBase64: imageBase64 || '',
    mimeType: mimeType || '',
    fileName: fileName || '',
    focusMode: homework ? 'homework' : '',
  });
  const result = await withTimeout(
    call,
    ANALYZE_TIMEOUT_MS,
    homework
      ? 'Analysen tok for lang tid. Prøv igjen med et tydeligere bilde av lekseplanen.'
      : 'Analysen tok for lang tid. Prøv igjen med et tydeligere dokument.',
  );
  const data = result?.data || {};
  if (Array.isArray(data.suggestions)) {
    if (homework) {
      data.suggestions = applyHomeworkFocusToSuggestions(data.suggestions);
    } else {
      try {
        data.suggestions = mergePrepTaskSuggestions(data.suggestions);
      } catch {
        // Ikke la prep-logikk krasje hele importen
      }
    }
  }
  return data;
}

export async function applyPlanImport({
  familyId, childId, draftId, suggestions, selectedIds, addToParentCalendar, period,
}) {
  const fn = httpsCallable(functions, 'applyAiImport', { timeout: 60000 });
  const result = await fn({
    familyId,
    childId,
    draftId,
    suggestions,
    selectedIds,
    addToParentCalendar: !!addToParentCalendar,
    period: period || null,
  });
  return result?.data || {};
}

export async function discardPlanImport({ familyId, childId, draftId }) {
  const fn = httpsCallable(functions, 'discardAiImport', { timeout: 30000 });
  const result = await fn({ familyId, childId, draftId });
  return result?.data || {};
}

function draftCreatedAtMs(data) {
  const ts = data?.createdAt;
  if (ts?.toMillis) return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
}

function isBlockingPendingDraft(data) {
  const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
  return suggestions.length > 0 && !data?.parseError && !data?.usedFallback;
}

/** Ventende AI-importutkast for ett barn (samme filter som serveren bruker). */
export async function fetchPendingPlanDrafts(familyId, childId) {
  if (!familyId || !childId) return [];
  const col = collection(db, 'families', familyId, 'children', childId, 'aiDrafts');
  const snap = await getDocs(query(col, where('status', '==', 'pending'), limit(10)));
  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      if (!isBlockingPendingDraft(data)) return null;
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      return {
        draftId: d.id,
        summary: String(data.summary || '').trim(),
        documentType: data.type || 'mixed',
        weekNumber: data.weekNumber ?? null,
        suggestionsCount: suggestions.length,
        parseError: !!data.parseError,
        createdAtMs: draftCreatedAtMs(data),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** Hent fullt utkast til gjennomgang (fortsett der du slapp). */
export async function loadPlanDraft(familyId, childId, draftId) {
  if (!familyId || !childId || !draftId) {
    throw new Error('Mangler utkast.');
  }
  const snap = await getDoc(
    doc(db, 'families', familyId, 'children', childId, 'aiDrafts', draftId),
  );
  if (!snap.exists()) throw new Error('Utkastet finnes ikke lenger.');
  const data = snap.data() || {};
  if (data.status !== 'pending') throw new Error('Utkastet er allerede behandlet.');
  let suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  try {
    suggestions = mergePrepTaskSuggestions(suggestions);
  } catch {
    // prep-logikk skal ikke blokkere gjenopptak
  }
  suggestions = suggestions.map((s) => ({
    ...s,
    selected: s.selected !== false,
  }));
  return {
    draftId: snap.id,
    summary: data.summary || '',
    documentType: data.type || 'mixed',
    focusMode: data.focusMode || null,
    weekNumber: data.weekNumber ?? null,
    parseError: !!data.parseError,
    period: data.period || null,
    suggestions,
  };
}

export function formatPlanDraftWhen(createdAtMs) {
  if (!createdAtMs) return 'Ukjent tidspunkt';
  return new Date(createdAtMs).toLocaleString('nb-NO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function confidenceLabel(c) {
  const n = Number(c);
  if (n >= 0.85) return 'Høy sikkerhet';
  if (n >= 0.6) return 'Middels sikkerhet';
  return 'Usikker — sjekk nøye';
}

/** Skjul tekniske AI-/Firebase-feil for vanlige brukere. */
export function sanitizeImportUserMessage(message, fallback) {
  let raw = String(message || '').trim();
  raw = raw.replace(/^(FirebaseError|Error):\s*/i, '').trim();
  const safeFallback = fallback
    || 'AI klarte ikke tolke dokumentet akkurat nå. Prøv igjen, eller legg til manuelt.';
  if (!raw) return safeFallback;
  if (/\{[\s\S]*"error"|Gemini HTTP|generateContent|models\/|v1beta|INTERNAL|DEADLINE|UNAVAILABLE|functions\//i.test(raw)) {
    return safeFallback;
  }
  if (/^(internal|unknown)$/i.test(raw)) {
    return safeFallback;
  }
  return raw.slice(0, 280);
}

export function emptyManualSuggestion({ homework = false } = {}) {
  return {
    id: `m${Date.now()}`,
    selected: true,
    kind: homework ? 'homework' : 'todo',
    title: '',
    description: '',
    confidence: 1,
    type: homework ? 'once' : 'weekly',
    daysOfWeek: homework ? [] : [1, 2, 3, 4, 5],
    day: null,
    time: null,
    endTime: null,
    subject: homework ? 'annet' : null,
    dateHint: null,
    category: homework ? 'lekser' : null,
    points: homework ? null : 5,
  };
}
