import { Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../../firebase';

const STORAGE_BUCKET = 'protop-c189c.firebasestorage.app';
const FILE_UPLOAD_TIMEOUT_MS = 25000;
const REST_UPLOAD_TIMEOUT_MS = 12000;
const CALLABLE_UPLOAD_TIMEOUT_MS = 90000;
/** Callable (base64) — begrenset av Cloud Functions payload. */
const MAX_CALLABLE_DOCUMENT_BYTES = 15 * 1024 * 1024;
/** Direkte Storage-opplasting — nok til filmer / større dokumenter. */
export const MAX_DOCUMENT_BYTES = 500 * 1024 * 1024;
/** Familiealbum — matcher Storage-regler (50 MB). */
export const MAX_ALBUM_MEDIA_BYTES = 50 * 1024 * 1024;

/** Standard filtyper for lekser / AI-import (uten video). */
export const DEFAULT_DOCUMENT_ACCEPT =
  'image/*,application/pdf,.pdf,.doc,.docx,.txt,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Mine filer / delte dokumenter — inkluderer video. */
export const FAMILY_DOCUMENT_ACCEPT =
  `${DEFAULT_DOCUMENT_ACCEPT},video/*,.mp4,.m4v,.mov,.webm,.avi,.mkv,.mpeg,.mpg`;

/**
 * Familiealbum — kun MIME-wildcards.
 * Viktig på iOS Safari: filendelser i accept tvinger ofte «Filer»-appen
 * (én og én fil). image/*,video/* åpner Bilder med flervalg.
 */
export const ALBUM_MEDIA_ACCEPT = 'image/*,video/*';

function restUploadTimeoutMs(byteLength) {
  const size = Number(byteLength) || 0;
  // ~1 MB/s + buffer; minst 12s, maks 10 min
  return Math.min(600000, Math.max(REST_UPLOAD_TIMEOUT_MS, Math.ceil(size / (1024 * 1024)) * 1000 + 15000));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function storageDownloadUrl(objectPath, downloadToken) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encoded}?alt=media&token=${downloadToken}`;
}

async function uploadFileViaRest(objectPath, blob, contentType) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Ikke innlogget');
  const token = await user.getIdToken();
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType || 'application/octet-stream',
    },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`storage-rest-${res.status}`);
  }
  const data = await res.json();
  const downloadToken = String(data.downloadTokens || '').split(',')[0];
  if (!downloadToken) throw new Error('storage-rest-no-token');
  return storageDownloadUrl(data.name || objectPath, downloadToken);
}

/** REST-opplasting med XHR for prosentvis fremdrift (web). */
function uploadFileViaRestWithProgress(objectPath, blob, contentType, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Ikke innlogget');
      const token = await user.getIdToken();
      const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable || !onProgress) return;
        onProgress(Math.min(99, Math.round((e.loaded / Math.max(e.total, 1)) * 100)));
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`storage-rest-${xhr.status}`));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          const downloadToken = String(data.downloadTokens || '').split(',')[0];
          if (!downloadToken) {
            reject(new Error('storage-rest-no-token'));
            return;
          }
          onProgress?.(100);
          resolve(storageDownloadUrl(data.name || objectPath, downloadToken));
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('storage-upload-failed'));
      xhr.ontimeout = () => reject(new Error('storage-rest-timeout'));
      xhr.timeout = restUploadTimeoutMs(blob?.size);
      xhr.send(blob);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Last opp fil med fremdriftscallback (0–100).
 * Web: XHR REST. Native: uploadBytesResumable.
 */
export async function uploadWithProgress(path, picked, {
  contentType,
  onProgress,
} = {}) {
  const blob = await readUploadBlob(picked);
  const type = contentType || picked?.mimeType || blob.type || 'application/octet-stream';
  if (blob.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Filen er for stor (maks 500 MB).');
  }
  const report = (pct) => {
    if (typeof onProgress === 'function') onProgress(Math.max(0, Math.min(100, Math.round(pct))));
  };
  report(0);

  if (Platform.OS === 'web' && typeof XMLHttpRequest !== 'undefined') {
    return uploadFileViaRestWithProgress(path, blob, type, report);
  }

  if (Platform.OS === 'web') {
    const url = await uploadFileViaRest(path, blob, type);
    report(100);
    return url;
  }

  const r = ref(storage, path);
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(r, blob, { contentType: type });
    task.on(
      'state_changed',
      (snap) => {
        const total = snap.totalBytes || blob.size || 1;
        report((snap.bytesTransferred / total) * 100);
      },
      reject,
      resolve,
    );
  });
  report(100);
  return getDownloadURL(r);
}

/**
 * Album-opplasting med fremdrift.
 * Mindre filer (≤ ~12 MB): direkte via uploadAlbumFile (Admin SDK) — mest pålitelig.
 * Større filer: signert URL, deretter callable/REST-fallback.
 */
export async function uploadAlbumObjectWithProgress({
  familyId,
  albumId,
  objectPath,
  picked,
  contentType,
  onProgress,
} = {}) {
  if (!familyId || !albumId || !objectPath) throw new Error('Mangler album-sti');
  const blob = await readUploadBlob(picked);
  const type = contentType || picked?.mimeType || blob.type || 'application/octet-stream';
  if (blob.size > MAX_ALBUM_MEDIA_BYTES) {
    throw new Error('Filen er for stor (maks 50 MB).');
  }
  const report = (pct) => {
    if (typeof onProgress === 'function') onProgress(Math.max(0, Math.min(100, Math.round(pct))));
  };
  report(1);

  const callableLimit = Math.floor(MAX_CALLABLE_DOCUMENT_BYTES * 0.75); // base64 ~33 % større
  const errors = [];

  // 1) Foretrekk server-opplasting for typiske mobilbilder
  if (blob.size <= callableLimit) {
    try {
      report(8);
      const fileBase64 = await blobToBase64(blob);
      report(35);
      const fn = httpsCallable(functions, 'uploadAlbumFile', { timeout: 120000 });
      const res = await fn({
        familyId,
        albumId,
        objectPath,
        contentType: type,
        fileBase64,
      });
      report(100);
      const url = res?.data?.downloadUrl;
      if (!url) throw new Error('Ingen nedlastings-URL fra server');
      return url;
    } catch (err) {
      errors.push(err);
    }
  }

  // 2) Signert URL (store filer / video)
  try {
    const fn = httpsCallable(functions, 'createAlbumUploadUrl', { timeout: 30000 });
    const res = await fn({
      familyId,
      albumId,
      objectPath,
      contentType: type,
      sizeBytes: blob.size,
    });
    const data = res?.data || {};
    if (!data.uploadUrl || !data.downloadUrl) throw new Error('Mangler signert URL');

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', type);
      if (data.metaHeader && data.metaValue) {
        xhr.setRequestHeader(data.metaHeader, data.metaValue);
      }
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        report(Math.min(99, Math.round((e.loaded / Math.max(e.total, 1)) * 100)));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          report(100);
          resolve();
        } else {
          reject(new Error(`Opplasting feilet (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Nettverksfeil under opplasting'));
      xhr.ontimeout = () => reject(new Error('Opplasting tok for lang tid'));
      xhr.timeout = restUploadTimeoutMs(blob.size);
      xhr.send(blob);
    });

    return data.downloadUrl;
  } catch (err) {
    errors.push(err);
  }

  // 3) Direkte Storage REST
  try {
    return await uploadWithProgress(objectPath, { blob, mimeType: type }, {
      contentType: type,
      onProgress,
    });
  } catch (err) {
    errors.push(err);
  }

  const last = errors[errors.length - 1] || new Error('Opplasting feilet');
  const msg = last?.message || last?.code || 'Opplasting feilet';
  // Unngå kryptiske Firebase-koder som bare «internal»
  if (/internal|INTERNAL|not-found|NOT_FOUND/i.test(String(msg))) {
    throw new Error('Kunne ikke laste opp (server). Prøv igjen om litt, eller et mindre bilde.');
  }
  throw last instanceof Error ? last : new Error(String(msg));
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

async function uploadDocumentViaCallable({ familyId, folderId, fileName, mimeType, blob }) {
  if (blob.size > MAX_CALLABLE_DOCUMENT_BYTES) {
    throw new Error('Filen er for stor for reservedelopplasting (maks 15 MB).');
  }
  const fileBase64 = await blobToBase64(blob);
  const fn = httpsCallable(functions, 'uploadDocumentFile', { timeout: 120000 });
  const res = await fn({
    familyId,
    folderId,
    fileName: fileName || 'dokument',
    mimeType: mimeType || 'application/octet-stream',
    fileBase64,
  });
  return res.data?.downloadUrl || '';
}

async function uriToBlob(uri) {
  if (!uri) throw new Error('Mangler bilde');
  if (uri.startsWith('data:')) {
    const res = await fetch(uri);
    return res.blob();
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Kunne ikke lese bildet');
  return res.blob();
}

async function readUploadBlob(picked) {
  const blob = (picked && picked.blob)
    || (typeof Blob !== 'undefined' && picked instanceof Blob ? picked : null)
    || await uriToBlob(typeof picked === 'string' ? picked : picked?.uri);
  if (!blob) throw new Error('Kunne ikke lese filen');
  return blob;
}


function pickFromFileInput({ camera = false, multiple = false, accept = 'image/*' } = {}) {
  if (typeof document === 'undefined') {
    return Promise.resolve(multiple ? [] : null);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || 'image/*';
    // Sett multiple på flere måter — iOS Safari er kresent.
    if (multiple) {
      input.multiple = true;
      input.setAttribute('multiple', 'multiple');
    }
    if (camera) input.setAttribute('capture', 'environment');
    // synlig=0 men i DOM — mer pålitelig enn display:none på noen WebKit-bygg
    input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;width:1px;height:1px;z-index:-1;';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus);
      }
      // Utsett fjerning så WebKit rekker å lese FileList
      setTimeout(() => {
        try { input.remove(); } catch { /* ignore */ }
      }, 0);
      resolve(value);
    };
    const onWindowFocus = () => {
      setTimeout(() => {
        if (settled) return;
        if (!input.files?.length) finish(multiple ? [] : null);
      }, 700);
    };
    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      if (!files.length) return finish(multiple ? [] : null);
      const picked = files.map((file) => ({
        uri: URL.createObjectURL(file),
        blob: file,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }));
      finish(multiple ? picked : picked[0]);
    });
    input.addEventListener('cancel', () => finish(multiple ? [] : null));
    document.body.appendChild(input);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onWindowFocus);
    }
    // Viktig: click() MÅ skje synkront i brukerens trykk-handler.
    // requestAnimationFrame bryter user-activation på iOS Safari → filvelger åpnes ikke.
    try {
      input.click();
    } catch {
      finish(multiple ? [] : null);
    }
  });
}

export async function pickImage({ camera = false, edit = true, aspect = [1, 1] } = {}) {
  if (Platform.OS === 'web') {
    return pickFromFileInput({ camera });
  }

  if (camera) {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') throw new Error('camera-denied');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: !!edit,
      ...(edit && aspect ? { aspect } : {}),
      quality: 0.85,
    });
    if (result.canceled) return null;
    const uri = result.assets?.[0]?.uri || null;
    return uri ? { uri, blob: null } : null;
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('library-denied');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: !!edit,
    ...(edit && aspect ? { aspect } : {}),
    quality: 0.85,
  });
  if (result.canceled) return null;
  const uri = result.assets?.[0]?.uri || null;
  return uri ? { uri, blob: null } : null;
}

/** Pick one or more images (web: multi-select; native: library multi when supported). */
export async function pickImages({ max = 8 } = {}) {
  const limit = Math.max(1, Math.min(12, Number(max) || 8));
  if (Platform.OS === 'web') {
    const picked = await pickFromFileInput({ multiple: true });
    return (picked || []).slice(0, limit);
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('library-denied');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.85,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  if (result.canceled) return [];
  return (result.assets || [])
    .map((asset) => (asset?.uri ? { uri: asset.uri, blob: null } : null))
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Velg ett eller flere album-media (bilder + video).
 * Web: multi-select filvelger. Native: bildebibliotek med multi når støttet.
 *
 * NB: Ikke vis Alert rett før filvelgeren på web — iOS Safari krever at
 * input.click() skjer direkte i brukerens trykk-handler.
 */
export async function pickAlbumMedia({ max = 24 } = {}) {
  const limit = Math.max(1, Math.min(40, Number(max) || 24));
  if (Platform.OS === 'web') {
    const picked = await pickFromFileInput({
      multiple: true,
      accept: ALBUM_MEDIA_ACCEPT,
    });
    return (picked || []).slice(0, limit);
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') throw new Error('library-denied');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsEditing: false,
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: limit,
  });
  if (result.canceled) return [];
  return (result.assets || [])
    .map((asset) => (asset?.uri
      ? {
        uri: asset.uri,
        blob: null,
        name: asset.fileName || asset.uri.split('/').pop() || 'fil',
        mimeType: asset.mimeType
          || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        size: asset.fileSize || 0,
        width: asset.width || 0,
        height: asset.height || 0,
        duration: asset.duration || 0,
      }
      : null))
    .filter(Boolean)
    .slice(0, limit);
}

export async function pickDocument({ multiple = false, accept = DEFAULT_DOCUMENT_ACCEPT } = {}) {
  const resolvedAccept = accept || DEFAULT_DOCUMENT_ACCEPT;
  if (Platform.OS === 'web') {
    const picked = await pickFromFileInput({ accept: resolvedAccept, multiple });
    return multiple ? picked : picked;
  }

  try {
    const DocumentPicker = await import('expo-document-picker');
    const allowVideo = /video|\.mp4|\.mov|\.webm/i.test(String(resolvedAccept));
    const allowPdf = /pdf|\.doc|\.docx|\.txt|application\//i.test(String(resolvedAccept));
    const result = await DocumentPicker.getDocumentAsync({
      multiple: !!multiple,
      copyToCacheDirectory: true,
      type: allowPdf || allowVideo ? '*/*' : 'image/*',
    });
    if (result.canceled) return multiple ? [] : null;
    const assets = (result.assets || [])
      .map((asset) => (asset?.uri
        ? {
          uri: asset.uri,
          blob: null,
          name: asset.name || asset.uri.split('/').pop() || 'fil',
          mimeType: asset.mimeType || 'application/octet-stream',
          size: asset.size || 0,
        }
        : null))
      .filter(Boolean);
    if (assets.length) return multiple ? assets : (assets[0] || null);
  } catch (e) {
    console.warn('[media] DocumentPicker failed, falling back', e?.message || e);
  }

  // Fallback: media library for images (+ video når tillatt).
  const allowVideo = /video|\.mp4|\.mov|\.webm/i.test(String(resolvedAccept));
  if (allowVideo) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') throw new Error('library-denied');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.85,
      allowsMultipleSelection: !!multiple,
      selectionLimit: multiple ? 8 : 1,
    });
    if (result.canceled) return multiple ? [] : null;
    const assets = (result.assets || [])
      .map((asset) => (asset?.uri
        ? {
          uri: asset.uri,
          blob: null,
          name: asset.fileName || asset.uri.split('/').pop() || 'fil',
          mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          size: asset.fileSize || 0,
        }
        : null))
      .filter(Boolean);
    return multiple ? assets : (assets[0] || null);
  }

  return pickImage({ edit: false });
}

export async function uploadDocument({ familyId, folderId, path, picked, contentType }) {
  const blob = await readUploadBlob(picked);
  const type = contentType || picked?.mimeType || blob.type || 'application/octet-stream';
  const fileName = picked?.name || path.split('/').pop() || 'dokument';

  if (blob.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Filen er for stor (maks 500 MB).');
  }

  if (Platform.OS === 'web') {
    try {
      return await withTimeout(
        uploadFileViaRest(path, blob, type),
        restUploadTimeoutMs(blob.size),
        'storage-rest-timeout',
      );
    } catch (err) {
      // Callable (base64) tåler ikke store filmer — kun reservedel for mindre filer.
      if (!familyId || !folderId || blob.size > MAX_CALLABLE_DOCUMENT_BYTES) {
        if (err?.message === 'storage-rest-timeout') throw err;
        throw new Error(err?.message?.includes('for stor') ? err.message : 'storage-upload-failed');
      }
      const url = await withTimeout(
        uploadDocumentViaCallable({ familyId, folderId, fileName, mimeType: type, blob }),
        CALLABLE_UPLOAD_TIMEOUT_MS,
        'callable-timeout',
      );
      if (!url) throw new Error('storage-upload-failed');
      return url;
    }
  }

  const r = ref(storage, path);
  await withTimeout(
    uploadBytes(r, blob, { contentType: type }),
    restUploadTimeoutMs(blob.size),
    'storage-upload-timeout',
  );
  return getDownloadURL(r);
}

export async function uploadFile(path, picked, contentType) {
  const blob = await readUploadBlob(picked);
  const type = contentType || picked?.mimeType || blob.type || 'application/octet-stream';

  if (Platform.OS === 'web') {
    try {
      return await withTimeout(
        uploadFileViaRest(path, blob, type),
        REST_UPLOAD_TIMEOUT_MS,
        'storage-rest-timeout',
      );
    } catch {
      throw new Error('storage-upload-failed');
    }
  }

  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: type });
  return getDownloadURL(r);
}

export async function uploadImage(path, picked) {
  const blob = (picked && picked.blob)
    || (typeof Blob !== 'undefined' && picked instanceof Blob ? picked : null)
    || await uriToBlob(typeof picked === 'string' ? picked : picked?.uri);
  if (!blob) throw new Error('Kunne ikke lese bildet');
  try {
    // On web, Storage CORS can block or hang the request.
    // We must not leave the UI stuck waiting for upload.
    if (Platform.OS === 'web') {
      const timeoutMs = 4500;
      const uploadAttempt = (async () => {
        const r = ref(storage, path);
        await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
        return getDownloadURL(r);
      })();

      const timeoutP = new Promise((resolve) => {
        setTimeout(() => resolve('TIMEOUT'), timeoutMs);
      });

      const res = await Promise.race([uploadAttempt, timeoutP]);
      if (res === 'TIMEOUT') return blobToJpegDataUrl(blob);
      return res;
    }

    const r = ref(storage, path);
    await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(r);
  } catch (err) {
    if (Platform.OS === 'web') {
      return blobToJpegDataUrl(blob);
    }
    throw err;
  }
}

async function blobToJpegDataUrl(blob, max = 512, quality = 0.72) {
  // Best-effort: try fast canvas path first, but always fall back to FileReader.
  try {
    if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    }
  } catch {
    // ignore + fallback
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Kunne ikke lese bildet'));
    reader.readAsDataURL(blob);
  });
}

export function photoErrorMessage(err, t) {
  const code = err?.code || err?.message || '';
  if (code === 'camera-denied' || code === 'library-denied') {
    return t ? t('profile.photoDenied') : 'Mangler tillatelse til kamera/bilder.';
  }
  if (/storage\/unauthorized|permission/i.test(String(code))) {
    return t ? t('profile.photoDenied') : 'Ingen tilgang til fillagring. Logg inn på nytt.';
  }
  return (t && t('profile.photoFail')) || 'Kunne ikke bruke bildet. Prøv et annet, eller velg en figur.';
}

export function alertPhotoError(err, t) {
  Alert.alert(t ? t('common.error') : 'Feil', photoErrorMessage(err, t));
}
