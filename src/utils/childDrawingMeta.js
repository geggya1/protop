/** Ren metadata for barnetegninger (ramme, plassering) — uten Firebase/RN. */
import { calculateAge } from './age.js';

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} FrameRect
 * Normalized 0–1 coords relative to the room photo (inner mat inside wall frame).
 * @typedef {{ id: string, label: string, file: string, slot: { x: number, y: number, scale: number }, kind: 'photo'|'gallery', frameRect?: FrameRect }} RoomScene
 */

/** Tomme fotomockups + galleriscener. */
export const ROOM_SCENES = [
  {
    id: 'living',
    label: 'Stue',
    file: 'room-living.jpg',
    slot: { x: 0.50, y: 0.22, scale: 1.05 },
    /** Inner mat of the empty wall frame (502×502 asset). */
    frameRect: { left: 0.3127, top: 0.1036, width: 0.3665, height: 0.3247 },
    kind: 'photo',
  },
  {
    id: 'bedroom',
    label: 'Soverom',
    file: 'room-bedroom.jpg',
    slot: { x: 0.50, y: 0.24, scale: 1.0 },
    frameRect: { left: 0.3187, top: 0.1016, width: 0.3606, height: 0.3167 },
    kind: 'photo',
  },
  {
    id: 'dining',
    label: 'Spisestue',
    file: 'room-dining.jpg',
    slot: { x: 0.50, y: 0.26, scale: 0.95 },
    frameRect: { left: 0.3386, top: 0.1474, width: 0.3745, height: 0.2948 },
    kind: 'photo',
  },
  {
    id: 'hallway',
    label: 'Gang',
    file: 'room-hallway.jpg',
    slot: { x: 0.52, y: 0.28, scale: 0.85 },
    frameRect: { left: 0.3984, top: 0.0956, width: 0.2550, height: 0.3127 },
    kind: 'photo',
  },
  {
    id: 'kids',
    label: 'Barnerom',
    file: 'room-kids.jpg',
    slot: { x: 0.50, y: 0.24, scale: 1.0 },
    frameRect: { left: 0.3426, top: 0.0538, width: 0.3426, height: 0.3506 },
    kind: 'photo',
  },
  {
    id: 'office',
    label: 'Kontor',
    file: 'room-office.jpg',
    slot: { x: 0.48, y: 0.26, scale: 0.95 },
    frameRect: { left: 0.3247, top: 0.0677, width: 0.3347, height: 0.3367 },
    kind: 'photo',
  },
  {
    id: 'gallery-living',
    label: 'Galleri-stue',
    file: 'gallery-living.jpg',
    slot: { x: 0.42, y: 0.20, scale: 0.72 },
    kind: 'gallery',
  },
  {
    id: 'gallery-bedroom',
    label: 'Galleri-soverom',
    file: 'gallery-bedroom.jpg',
    slot: { x: 0.48, y: 0.22, scale: 0.7 },
    kind: 'gallery',
  },
  {
    id: 'gallery-playroom',
    label: 'Lekerom',
    file: 'gallery-playroom.jpg',
    slot: { x: 0.38, y: 0.22, scale: 0.75 },
    kind: 'gallery',
  },
  {
    id: 'gallery-stairs',
    label: 'Trapp',
    file: 'gallery-stairs.jpg',
    slot: { x: 0.45, y: 0.30, scale: 0.65 },
    kind: 'gallery',
  },
  {
    id: 'gallery-nook',
    label: 'Lesekrok',
    file: 'gallery-nook.jpg',
    slot: { x: 0.42, y: 0.22, scale: 0.78 },
    kind: 'gallery',
  },
];

const ROOM_BY_ID = new Map(ROOM_SCENES.map((r) => [r.id, r]));

export function getRoomScene(id) {
  return ROOM_BY_ID.get(id) || ROOM_SCENES[0];
}

export function defaultSlotForScene(sceneId) {
  return getRoomScene(sceneId).slot;
}

/** Inner mat rect for photo rooms; null for gallery scenes. */
export function getFrameRect(sceneId) {
  const room = getRoomScene(sceneId);
  if (room?.kind !== 'photo' || !room.frameRect) return null;
  const r = room.frameRect;
  return {
    left: Math.max(0, Math.min(1, r.left)),
    top: Math.max(0, Math.min(1, r.top)),
    width: Math.max(0.05, Math.min(1, r.width)),
    height: Math.max(0.05, Math.min(1, r.height)),
  };
}

/**
 * Map normalized image coords → view coords when bg uses resizeMode cover.
 * Room assets are square; cover scales to fill and crops overflow.
 * Prefer a square wall viewport so frameRect maps 1:1 without vertical clip.
 * @param {number} imageAspect width/height of the background image
 */
export function coverImageBox(viewW, viewH, imageAspect = 1) {
  const vw = Math.max(1, viewW || 1);
  const vh = Math.max(1, viewH || 1);
  const ia = Math.max(0.2, imageAspect || 1);
  const iw = ia;
  const ih = 1;
  const scale = Math.max(vw / iw, vh / ih);
  const width = iw * scale;
  const height = ih * scale;
  return {
    left: (vw - width) / 2,
    top: (vh - height) / 2,
    width,
    height,
  };
}

/**
 * Same mapping for resizeMode contain (letterbox). Used when the wall
 * viewport is not square so the full room frame stays visible.
 */
export function containImageBox(viewW, viewH, imageAspect = 1) {
  const vw = Math.max(1, viewW || 1);
  const vh = Math.max(1, viewH || 1);
  const ia = Math.max(0.2, imageAspect || 1);
  if (vw / vh > ia) {
    const height = vh;
    const width = height * ia;
    return { left: (vw - width) / 2, top: 0, width, height };
  }
  const width = vw;
  const height = width / ia;
  return { left: 0, top: (vh - height) / 2, width, height };
}

export function frameRectToViewStyle(frameRect, imageBox) {
  if (!frameRect || !imageBox) return null;
  return {
    left: imageBox.left + frameRect.left * imageBox.width,
    top: imageBox.top + frameRect.top * imageBox.height,
    width: frameRect.width * imageBox.width,
    height: frameRect.height * imageBox.height,
  };
}

export const FRAME_SHAPES = [
  { id: 'classic', label: 'Klassisk' },
  { id: 'rounded', label: 'Avrundet' },
  { id: 'arch', label: 'Bue' },
  { id: 'scalloped', label: 'Bølgekant' },
  { id: 'oval', label: 'Oval' },
  { id: 'circle', label: 'Rund' },
  { id: 'flower', label: 'Blomst' },
  { id: 'heart', label: 'Hjerte' },
  { id: 'bear', label: 'Bamseører' },
  { id: 'wavy', label: 'Bølge' },
  { id: 'gallery', label: 'Galleri' },
  { id: 'polaroid', label: 'Polaroid' },
];

export const FRAME_COLORS = [
  { id: 'oak', label: 'Eik', hex: '#C4A574' },
  { id: 'walnut', label: 'Valnøtt', hex: '#5C4033' },
  { id: 'cream', label: 'Krem', hex: '#F0E6D8' },
  { id: 'pink', label: 'Rosa', hex: '#E8A0B0' },
  { id: 'sage', label: 'Salvie', hex: '#8FA890' },
  { id: 'sky', label: 'Himmel', hex: '#8BB4D4' },
  { id: 'butter', label: 'Smørgul', hex: '#E8D48A' },
  { id: 'white', label: 'Hvit', hex: '#F7F5F0' },
  { id: 'black', label: 'Svart', hex: '#2A2A2A' },
  { id: 'gold', label: 'Gull', hex: '#C9A227' },
];

const DEFAULT_FRAME = {
  shape: 'classic',
  colorId: 'oak',
  matColor: '#ffffff',
};

export function frameColorHex(colorId) {
  return FRAME_COLORS.find((c) => c.id === colorId)?.hex || FRAME_COLORS[0].hex;
}

export function normalizeFrame(frame) {
  const shape = FRAME_SHAPES.some((s) => s.id === frame?.shape)
    ? frame.shape
    : DEFAULT_FRAME.shape;
  const colorId = FRAME_COLORS.some((c) => c.id === frame?.colorId)
    ? frame.colorId
    : DEFAULT_FRAME.colorId;
  return {
    shape,
    colorId,
    colorHex: frameColorHex(colorId),
    matColor: frame?.matColor || DEFAULT_FRAME.matColor,
  };
}

export function normalizePlacement(placement) {
  const scene = ROOM_SCENES.some((s) => s.id === placement?.scene)
    ? placement.scene
    : 'living';
  const defaults = defaultSlotForScene(scene);
  const x = Number(placement?.x);
  const y = Number(placement?.y);
  const scale = Number(placement?.scale);
  return {
    scene,
    x: Number.isFinite(x) ? Math.max(0.05, Math.min(0.95, x)) : defaults.x,
    y: Number.isFinite(y) ? Math.max(0.05, Math.min(0.72, y)) : defaults.y,
    scale: Number.isFinite(scale) ? Math.max(0.4, Math.min(1.5, scale)) : defaults.scale,
  };
}

export function ageAtDate(birthday, asOf) {
  return calculateAge(birthday, asOf || new Date());
}

export function drawingThumbUrl(drawing) {
  return drawing?.thumbUrl || drawing?.imageUrl || null;
}

/** Fullskjerm / detalj — preferer høyoppløst display. */
export function drawingViewerUrl(drawing) {
  return drawing?.imageUrl || drawing?.thumbUrl || null;
}

/** Filnavn for nedlasting av rom + tegning. */
export function wallDownloadFilename(drawing, sceneId) {
  const safeTitle = String(drawing?.title || 'tegning')
    .replace(/[^\w\-æøåÆØÅ ]+/gi, '')
    .trim()
    .slice(0, 40) || 'tegning';
  const room = getRoomScene(sceneId || drawing?.placement?.scene || 'living');
  const roomSlug = String(room.label || room.id)
    .toLowerCase()
    .replace(/\s+/g, '-');
  return `${safeTitle}-${roomSlug}.jpg`;
}

export function formatDrawingDrawnAt(value) {
  try {
    const d = value?.toDate ? value.toDate() : (value ? new Date(value) : null);
    if (!d || Number.isNaN(d.getTime())) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return new Date(value).toLocaleDateString('nb-NO', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
      }
      return null;
    }
    return d.toLocaleDateString('nb-NO', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function formatDrawingUploadedAt(value) {
  try {
    const d = value?.toDate ? value.toDate() : (value ? new Date(value) : null);
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('nb-NO', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}
