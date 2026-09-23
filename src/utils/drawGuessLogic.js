/**
 * Ren logikk for Tegn og gjett (uten Firebase).
 */

export const DRAW_STATUS = {
  waiting: 'waiting',
  drawing: 'drawing',
  won: 'won',
  finished: 'finished',
};

/** Barnevennlige norske ord til tegning. */
export const DRAW_WORDS = [
  'katt', 'hund', 'hus', 'bil', 'sol', 'tre', 'blomst', 'fisk', 'ball', 'kake',
  'stjerne', 'måne', 'regnbue', 'dinosaur', 'robot', 'iskrem', 'pizza', 'eple',
  'banan', 'fugl', 'sommerfugl', 'frosk', 'hjerte', 'båt', 'fly', 'sykkel',
  'snømann', 'juletre', 'elefant', 'løve', 'gris', 'hest', 'kanin', 'slange',
  'hai', 'krabbe', 'skilpadde', 'traktor', 'tog', 'buss', 'helikopter', 'rakett',
  'paraply', 'hatt', 'sko', 'bok', 'blyant', 'klokke', 'kamera', 'gitar',
  'tromme', 'ballong', 'flagg', 'slott', 'bro', 'fjell', 'sky', 'regn',
  'snø', 'ild', 'vann', 'eikenøtt', 'gulrot', 'jordbær', 'vannmelon', 'ost',
  'hamburger', 'pølse', 'suppe', 'sjokolade', 'smiley', 'øyne', 'nese', 'munn',
];

const MAX_STROKES = 120;
const MAX_POINTS_PER_STROKE = 200;

export function normalizeGuess(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9æøåäöü]+/gi, '');
}

export function pickDrawWord(exclude = []) {
  const excluded = new Set((exclude || []).map((w) => normalizeGuess(w)));
  const pool = DRAW_WORDS.filter((w) => !excluded.has(normalizeGuess(w)));
  const list = pool.length ? pool : DRAW_WORDS;
  return list[Math.floor(Math.random() * list.length)];
}

export function buildDistractors(secret, count = 3) {
  const answer = String(secret || '').trim().toLowerCase();
  const pool = DRAW_WORDS
    .filter((w) => normalizeGuess(w) !== normalizeGuess(answer))
    .sort(() => Math.random() - 0.5);
  const picks = pool.slice(0, Math.max(0, count));
  return [...picks, answer].sort(() => Math.random() - 0.5);
}

export function sanitizeStroke(stroke) {
  if (!stroke || typeof stroke !== 'object') return null;
  const color = typeof stroke.color === 'string' && stroke.color.length <= 20
    ? stroke.color
    : '#1a2744';
  const width = Math.min(24, Math.max(2, Number(stroke.width) || 4));
  const pts = Array.isArray(stroke.points) ? stroke.points : [];
  const points = pts
    .slice(0, MAX_POINTS_PER_STROKE)
    .map((p) => ({
      x: Math.min(1, Math.max(0, Number(p?.x) || 0)),
      y: Math.min(1, Math.max(0, Number(p?.y) || 0)),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 1) return null;
  return { color, width, points };
}

export function sanitizeStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes
    .slice(0, MAX_STROKES)
    .map(sanitizeStroke)
    .filter(Boolean);
}

export function guessesMatch(guess, secret) {
  const a = normalizeGuess(guess);
  const b = normalizeGuess(secret);
  if (!a || !b) return false;
  return a === b;
}
