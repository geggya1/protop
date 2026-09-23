/**
 * Pure lager-hjelpere (uten Firebase) — holdbarhet, nøkler, lokasjon, merge-treff.
 */

export const PANTRY_LOCATIONS = [
  { id: 'fridge', label: 'Kjøleskap', emoji: '🧊' },
  { id: 'freezer', label: 'Fryser', emoji: '❄️' },
  { id: 'pantry', label: 'Tørrvare', emoji: '🥫' },
  { id: 'other', label: 'Annet', emoji: '📦' },
];

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function pantryKey(name, unit = '') {
  return `${normalizeName(name)}|${String(unit || '').toLowerCase()}`;
}

/** Status for holdbarhet relativt til i dag (YYYY-MM-DD). */
export function pantryExpiryStatus(expiryKey, todayKey) {
  if (!expiryKey) return null;
  const exp = String(expiryKey);
  const today = String(todayKey || '');
  if (!today) return { kind: 'ok', label: exp };
  if (exp < today) return { kind: 'expired', label: `Utløpt ${exp}` };
  if (exp === today) return { kind: 'today', label: 'Utløper i dag' };
  const inThree = (() => {
    try {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(y, m - 1, d + 3);
      const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    } catch {
      return today;
    }
  })();
  if (exp <= inThree) return { kind: 'soon', label: `Utløper ${exp}` };
  return { kind: 'ok', label: `Best før ${exp}` };
}

/** Kartlegg handleliste-kategori → lagerplass. */
export function pantryLocationForShoppingCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'frozen') return 'freezer';
  if (c === 'dairy' || c === 'meat' || c === 'produce' || c === 'drinks') return 'fridge';
  if (c === 'household' || c === 'other') return 'other';
  return 'pantry';
}

/**
 * Finn treff for sammenslåing: barcode først, deretter navn+enhet.
 * Returnerer eksisterende item eller null.
 */
export function findMergeablePantryItem(existingItems = [], {
  name, amountUnit = '', barcode = null,
} = {}) {
  const key = pantryKey(name, amountUnit);
  return (existingItems || []).find((p) => {
    if (barcode && p.barcode && String(p.barcode) === String(barcode)) return true;
    return pantryKey(p.name, p.amountUnit) === key;
  }) || null;
}
