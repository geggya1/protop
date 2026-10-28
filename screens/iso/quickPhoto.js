/**
 * Foto til hurtigmeldingen. Bildet gjøres mindre (lengste side 1600 px, JPEG) før det lagres,
 * så det kan ligge i køen uten nett og lastes raskt opp fra byggeplassen.
 * Nettleser: data-url (overlever omlasting). Telefon: fil-uri fra bildebehandleren.
 */
import { Platform } from 'react-native';
import { pickImage } from '../../src/utils/media';

const MAX_SIDE = 1600;
const QUALITY = 0.7;

function canvasShrink(blob) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !blob) { resolve(null); return; }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function nativeShrink(uri) {
  try {
    const mod = await import('expo-image-manipulator');
    const manipulate = mod.manipulateAsync || mod.default?.manipulateAsync;
    const format = (mod.SaveFormat || mod.default?.SaveFormat)?.JPEG || 'jpeg';
    if (typeof manipulate !== 'function') return uri;
    const out = await manipulate(uri, [{ resize: { width: MAX_SIDE } }], { compress: QUALITY, format });
    return out?.uri || uri;
  } catch {
    return uri;
  }
}

/** Ta bilde (camera) eller velg fra biblioteket. Gir { uri, name } eller null. */
export async function pickQuickPhoto({ camera = false } = {}) {
  const picked = await pickImage({ camera, edit: false });
  if (!picked) return null;
  if (Platform.OS === 'web') {
    const data = await canvasShrink(picked.blob);
    return data ? { uri: data, name: picked.name || 'Foto' } : null;
  }
  return { uri: await nativeShrink(picked.uri), name: 'Foto' };
}
