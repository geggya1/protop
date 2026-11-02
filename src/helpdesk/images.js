/**
 * Bilder til saker: velg, lim inn (Ctrl+V) eller dra inn. Bildet krympes
 * til JPEG under ~850 KB før det sendes, så skjermbilder fra store skjermer
 * og mobilkamera går gjennom uten at brukeren må gjøre noe.
 */
import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { pickImages } from '../utils/media';
import { LIMITS } from './model';

const TARGET_BYTES = 850 * 1024;

function base64Bytes(b64) {
  return Math.floor((String(b64).length * 3) / 4);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bildet kunne ikke leses.'));
    img.src = src;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Filen kunne ikke leses.'));
    reader.readAsDataURL(file);
  });
}

/** Web: File → { name, type, data(base64), preview, size } */
export async function fileToAttachment(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Velg et bilde (JPG, PNG eller skjermbilde).');
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  let maxSide = 1800;
  let quality = 0.85;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = window.document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', quality);
    const data = out.split(',')[1] || '';
    if (base64Bytes(data) <= TARGET_BYTES || attempt === 5) {
      const base = String(file.name || 'skjermbilde').replace(/\.[a-z0-9]+$/i, '') || 'skjermbilde';
      return { name: `${base}.jpg`, type: 'image/jpeg', data, preview: out, size: base64Bytes(data) };
    }
    maxSide = Math.round(maxSide * 0.8);
    quality = Math.max(0.5, quality - 0.08);
  }
  throw new Error('Bildet er for stort.');
}

function pickWebFiles() {
  return new Promise((resolve) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(Array.from(input.files || []));
      input.remove();
    };
    window.document.body.appendChild(input);
    input.click();
  });
}

async function nativeToAttachment(uri, i) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.72,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return {
    name: `bilde-${i + 1}.jpg`,
    type: 'image/jpeg',
    data: out.base64,
    preview: `data:image/jpeg;base64,${out.base64}`,
    size: base64Bytes(out.base64),
  };
}

/** Velg ett eller flere bilder. `room` = hvor mange som fortsatt får plass. */
export async function pickAttachments({ room = LIMITS.attachments } = {}) {
  if (room <= 0) return [];
  if (Platform.OS === 'web') {
    const files = (await pickWebFiles()).slice(0, room);
    return Promise.all(files.map(fileToAttachment));
  }
  const picked = await pickImages({ max: room });
  return Promise.all((picked || []).slice(0, room).map((p, i) => nativeToAttachment(p.uri, i)));
}

/** Web: bilder fra utklippstavlen eller dra-og-slipp. */
export async function attachmentsFromDataTransfer(dt, room = LIMITS.attachments) {
  const files = Array.from(dt?.files || []).filter((f) => /^image\//.test(f.type));
  const items = Array.from(dt?.items || [])
    .filter((it) => it.kind === 'file' && /^image\//.test(it.type))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  const all = (files.length ? files : items).slice(0, room);
  return Promise.all(all.map(fileToAttachment));
}

/** Til callablen: bare feltene serveren trenger. */
export function toUpload(list = []) {
  return list.map(({ name, type, data }) => ({ name, type, data }));
}
