/** Max stored custom banner (data URI). Keeps AsyncStorage payloads phone-friendly. */
export const MAX_BANNER_DATA_URI_CHARS = 750000;

/**
 * Longest edge for custom fullscreen backgrounds.
 * iPhone 17 Pro Max is ~1320×2868 px at 3x; 2200 px is sharp at 2–3x without 12MP originals.
 */
export const MAX_BANNER_EDGE = 2200;

/** JPEG quality after downscale — sharp enough, much smaller than camera originals. */
export const BANNER_ENCODE_QUALITY = 0.7;

export function bannerDownscaleSize(width, height, maxEdge = MAX_BANNER_EDGE) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const longest = Math.max(w, h, 1);
  if (longest <= maxEdge) {
    return {
      width: Math.max(1, Math.round(w) || 1),
      height: Math.max(1, Math.round(h) || 1),
      scale: 1,
    };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

function guessMime(mimeType) {
  return String(mimeType || 'image/jpeg').split(';')[0] || 'image/jpeg';
}

function dataUriFromBase64(base64, mimeType) {
  const raw = String(base64 || '').replace(/\s/g, '');
  if (!raw) return null;
  return `data:${guessMime(mimeType)};base64,${raw}`;
}

/**
 * Prefer a durable data-URI so iOS ph:// and web blob: URLs survive restarts.
 * Falls back to the picker URI when the image is too large.
 */
export function resolvePersistedBannerUri({ uri, base64, mimeType } = {}) {
  const dataUri = dataUriFromBase64(base64, mimeType);
  if (dataUri && dataUri.length <= MAX_BANNER_DATA_URI_CHARS) return dataUri;
  return uri || null;
}

function canUseCanvas() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

async function inputToBlob({ uri, base64, mimeType }) {
  const dataUri = dataUriFromBase64(base64, mimeType);
  if (dataUri && typeof fetch === 'function') {
    const res = await fetch(dataUri);
    if (res.ok || res.blob) return res.blob();
  }
  if (uri && typeof fetch === 'function') {
    const res = await fetch(uri);
    if (!res.ok) return null;
    return res.blob();
  }
  return null;
}

async function blobToDataUri(blob) {
  if (!blob) return null;
  if (typeof FileReader === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '') || null);
    reader.onerror = () => reject(reader.error || new Error('banner-read'));
    reader.readAsDataURL(blob);
  });
}

async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(blob);
      } catch {
        // fall through to HTMLImageElement
      }
    }
  }
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('banner-image-load'));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bitmapSize(src) {
  return {
    width: src.naturalWidth || src.width || 0,
    height: src.naturalHeight || src.height || 0,
  };
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('banner-encode'))), mime, quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL(mime, quality);
      fetch(dataUrl).then((r) => r.blob()).then(resolve).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function downscaleWithCanvas({ uri, base64, mimeType }) {
  if (!canUseCanvas()) return null;
  const blob = await inputToBlob({ uri, base64, mimeType });
  if (!blob) return null;
  const src = await loadBitmap(blob);
  if (!src) return null;
  try {
    const { width, height } = bitmapSize(src);
    if (!width || !height) return null;
    const next = bannerDownscaleSize(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = next.width;
    canvas.height = next.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, next.width, next.height);
    let quality = BANNER_ENCODE_QUALITY;
    for (let i = 0; i < 3; i += 1) {
      const out = await canvasToBlob(canvas, 'image/jpeg', quality);
      const dataUri = await blobToDataUri(out);
      if (dataUri && dataUri.length <= MAX_BANNER_DATA_URI_CHARS) return dataUri;
      quality = Math.max(0.55, quality - 0.1);
    }
    return null;
  } finally {
    src.close?.();
  }
}

async function downscaleWithManipulator({ uri, width, height }) {
  if (!uri) return null;
  let ImageManipulator;
  try {
    ImageManipulator = await import('expo-image-manipulator');
  } catch {
    return null;
  }
  const manipulateAsync = ImageManipulator.manipulateAsync
    || ImageManipulator.default?.manipulateAsync;
  const SaveFormat = ImageManipulator.SaveFormat
    || ImageManipulator.default?.SaveFormat;
  if (typeof manipulateAsync !== 'function') return null;

  const srcW = Number(width) || 0;
  const srcH = Number(height) || 0;
  const actions = [];
  if (srcW && srcH) {
    const next = bannerDownscaleSize(srcW, srcH);
    if (next.scale < 1) {
      actions.push({ resize: { width: next.width, height: next.height } });
    }
  }

  const result = await manipulateAsync(uri, actions, {
    compress: BANNER_ENCODE_QUALITY,
    format: SaveFormat?.JPEG || 'jpeg',
    base64: true,
  });
  const dataUri = dataUriFromBase64(result?.base64, 'image/jpeg');
  if (dataUri && dataUri.length <= MAX_BANNER_DATA_URI_CHARS) return dataUri;
  return null;
}

/**
 * Downscale a picked photo for a fullscreen home background, then persist as data URI.
 * Uses canvas on web (EXIF orientation baked in) and expo-image-manipulator on native.
 */
export async function preparePersistedBannerUri(input = {}) {
  try {
    const canvasUri = await downscaleWithCanvas(input);
    if (canvasUri) return canvasUri;
  } catch {
    // fall through
  }
  try {
    const nativeUri = await downscaleWithManipulator(input);
    if (nativeUri) return nativeUri;
  } catch {
    // fall through
  }
  return resolvePersistedBannerUri(input);
}
