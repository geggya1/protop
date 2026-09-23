/**
 * Komponer barnetegning inn i rom-mockup (ramme) for nedlasting.
 * Web: canvas. Native: ikke støttet her (mangler canvas).
 */
import { Platform } from 'react-native';
import {
  getRoomScene,
  getFrameRect,
  drawingViewerUrl,
  wallDownloadFilename,
} from './childDrawingMeta';
import { ROOM_IMAGE_CACHE } from './childDrawingRooms';

export { wallDownloadFilename };

function roomPublicUrl(sceneId) {
  const scene = getRoomScene(sceneId);
  return `/assets/child-drawings/${scene.file}?v=${ROOM_IMAGE_CACHE}`;
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image ikke tilgjengelig'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kunne ikke laste bilde'));
    };
    img.src = url;
  });
}

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return loadImageFromBlob(blob);
}

/** Tegn bilde med cover (fyll rektangel, beskær overflød). */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih || !dw || !dh) return;
  const ir = iw / ih;
  const fr = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (ir > fr) {
    sw = ih * fr;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / fr;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * @param {object} drawing
 * @param {string} [sceneId] Rom å komponere i (default: tegningens plassering)
 * @returns {Promise<Blob>} JPEG-blob av rom + tegning i rammen
 */
export async function composeDrawingOnWall(drawing, sceneId) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Vegg-nedlasting er tilgjengelig på web.');
  }
  const artUrl = drawingViewerUrl(drawing);
  if (!artUrl) throw new Error('Fant ikke bildefilen.');

  const scene = getRoomScene(sceneId || drawing?.placement?.scene || 'living');
  const frameRect = getFrameRect(scene.id);
  if (!frameRect) {
    throw new Error('Dette rommet har ingen fotomockup-ramme.');
  }

  const [roomImg, artImg] = await Promise.all([
    fetchImage(roomPublicUrl(scene.id)),
    fetchImage(artUrl),
  ]);

  const w = roomImg.naturalWidth || roomImg.width;
  const h = roomImg.naturalHeight || roomImg.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas ikke tilgjengelig');

  ctx.drawImage(roomImg, 0, 0, w, h);

  const dx = frameRect.left * w;
  const dy = frameRect.top * h;
  const dw = frameRect.width * w;
  const dh = frameRect.height * h;
  // Mat-bakgrunn (matcher LivingRoomWall matSlot)
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(dx, dy, dw, dh);
  drawImageCover(ctx, artImg, dx, dy, dw, dh);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Klarte ikke lage bilde'));
      },
      'image/jpeg',
      0.92,
    );
  });
}
