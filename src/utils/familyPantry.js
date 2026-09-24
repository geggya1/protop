/**
 * Familielager (kjøl / fryser / pantry) — trekker fra når måltid → handleliste.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { parseAmountText, formatAmountQty } from './meals.js';
import { guessShoppingCategory } from './groceryCategory.js';
import {
  pantryKey,
  pantryExpiryStatus,
  pantryLocationForShoppingCategory,
  findMergeablePantryItem,
  PANTRY_LOCATIONS,
} from './pantryLogic.js';

export {
  pantryKey,
  pantryExpiryStatus,
  pantryLocationForShoppingCategory,
  findMergeablePantryItem,
  PANTRY_LOCATIONS,
};

export function pantryCol(familyId) {
  return collection(db, 'families', familyId, 'pantryItems');
}

export function pantryDoc(familyId, itemId) {
  return doc(db, 'families', familyId, 'pantryItems', itemId);
}

export function mapPantryItem(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    name: String(d.name || '').trim(),
    amountValue: d.amountValue != null ? Number(d.amountValue) : null,
    amountUnit: d.amountUnit || '',
    amountText: d.amountText || '',
    location: d.location || 'pantry',
    category: d.category || 'pantry',
    barcode: d.barcode || null,
    expiryKey: d.expiryKey || null,
    updatedAt: d.updatedAt || null,
    createdAt: d.createdAt || null,
    createdBy: d.createdBy || null,
  };
}

export function listenPantry(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(pantryCol(familyId), (snap) => {
    const list = snap.docs.map(mapPantryItem)
      .filter((i) => i.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
    cb(list);
  }, () => cb([]));
}

export async function addPantryItem(familyId, data, uid) {
  if (!familyId) throw new Error('Mangler familyId');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Mangler navn');
  let amountValue = data.amountValue != null ? Number(data.amountValue) : null;
  let amountUnit = data.amountUnit || '';
  let amountText = data.amountText || '';
  if ((amountValue == null || !Number.isFinite(amountValue)) && amountText) {
    const parsed = parseAmountText(amountText);
    amountValue = parsed.qty;
    amountUnit = parsed.unit || amountUnit;
  }
  if (!amountText && amountValue != null) {
    amountText = formatAmountQty(amountValue, amountUnit, { forShopping: true });
  }
  const ref = await addDoc(pantryCol(familyId), {
    name,
    amountValue: Number.isFinite(amountValue) ? amountValue : null,
    amountUnit: amountUnit || '',
    amountText: amountText || '',
    location: data.location || 'pantry',
    category: data.category || guessShoppingCategory(name),
    barcode: data.barcode || null,
    expiryKey: data.expiryKey || null,
    createdBy: uid || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePantryItem(familyId, itemId, patch) {
  if (!familyId || !itemId) return;
  await updateDoc(pantryDoc(familyId, itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePantryItem(familyId, itemId) {
  if (!familyId || !itemId) return;
  await deleteDoc(pantryDoc(familyId, itemId));
}

/**
 * Finn eksisterende vare (barcode eller navn+enhet) og slå sammen mengde,
 * eller opprett ny. Returnerer { id, merged }.
 */
export async function upsertPantryItem(familyId, data, uid, existingItems = []) {
  if (!familyId) throw new Error('Mangler familyId');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Mangler navn');

  let amountValue = data.amountValue != null ? Number(data.amountValue) : null;
  let amountUnit = data.amountUnit || '';
  let amountText = data.amountText || '';
  if ((amountValue == null || !Number.isFinite(amountValue)) && amountText) {
    const parsed = parseAmountText(amountText);
    amountValue = parsed.qty;
    amountUnit = parsed.unit || amountUnit;
  }
  if (!amountText && amountValue != null) {
    amountText = formatAmountQty(amountValue, amountUnit, { forShopping: true });
  }

  const barcode = data.barcode || null;
  const hit = findMergeablePantryItem(existingItems, { name, amountUnit, barcode });

  if (hit) {
    let nextValue = hit.amountValue;
    if (amountValue != null && Number.isFinite(amountValue)) {
      const base = hit.amountValue != null && Number.isFinite(Number(hit.amountValue))
        ? Number(hit.amountValue)
        : 0;
      nextValue = base + amountValue;
    }
    const nextText = nextValue != null && Number.isFinite(nextValue)
      ? formatAmountQty(nextValue, amountUnit || hit.amountUnit, { forShopping: true })
      : (amountText || hit.amountText || '');
    const patch = {
      amountValue: nextValue != null && Number.isFinite(nextValue) ? nextValue : hit.amountValue,
      amountText: nextText,
      amountUnit: amountUnit || hit.amountUnit || '',
    };
    if (data.expiryKey) patch.expiryKey = data.expiryKey;
    if (barcode) patch.barcode = barcode;
    if (data.location) patch.location = data.location;
    await updatePantryItem(familyId, hit.id, patch);
    return { id: hit.id, merged: true };
  }

  const id = await addPantryItem(familyId, {
    ...data,
    name,
    amountValue,
    amountUnit,
    amountText,
  }, uid);
  return { id, merged: false };
}

/**
 * Legg kryssede handlevarer inn i familielageret (etter handletur).
 * Sammenslår like varer når lageret allerede har dem.
 */
export async function addDoneShoppingToPantry(familyId, items = [], uid = null, existingItems = []) {
  if (!familyId) return { added: 0, merged: 0 };
  const stock = [...(existingItems || [])];
  const done = (items || []).filter((i) => i && i.done && !i.deleted && String(i.title || '').trim());
  let added = 0;
  let merged = 0;
  for (const item of done) {
    const name = String(item.title || '').trim();
    if (!name) continue;
    const category = item.category || guessShoppingCategory(name);
    const result = await upsertPantryItem(familyId, {
      name,
      amountText: String(item.description || '').trim() || '',
      location: pantryLocationForShoppingCategory(category),
      category,
      barcode: item.barcode || null,
    }, uid, stock);
    if (result.merged) merged += 1;
    else {
      added += 1;
      stock.push({
        id: result.id,
        name,
        amountUnit: '',
        barcode: item.barcode || null,
        amountValue: null,
      });
    }
  }
  return { added, merged };
}

/** Parse manuelt limte kvitteringslinjer (én vare per linje) til lager. */
export async function addReceiptLinesToPantry(familyId, text, uid = null, existingItems = []) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  let merged = 0;
  const stock = [...(existingItems || [])];
  for (const line of lines) {
    const category = guessShoppingCategory(line);
    const result = await upsertPantryItem(familyId, {
      name: line,
      location: pantryLocationForShoppingCategory(category),
      category,
    }, uid, stock);
    if (result.merged) merged += 1;
    else {
      added += 1;
      stock.push({ id: result.id, name: line, amountUnit: '', barcode: null });
    }
  }
  return { added, merged, lines: lines.length };
}

/**
 * Trekk lager fra planlagte handle-creates.
 * createRows: [{ ingredientName|title, amountValue, amountUnit, ... }]
 * Returnerer { creates, pantryUpdates } der creates er filtrert/justert.
 */
export function subtractPantryFromCreates(creates = [], pantryItems = []) {
  const stock = new Map();
  for (const p of pantryItems || []) {
    const key = pantryKey(p.name, p.amountUnit);
    const qty = p.amountValue != null && Number.isFinite(Number(p.amountValue))
      ? Number(p.amountValue)
      : null;
    stock.set(key, { ...p, qty });
  }

  const nextCreates = [];
  const pantryUpdates = [];

  for (const row of creates || []) {
    const name = row.ingredientName || row.title || '';
    const unit = row.amountUnit || '';
    const need = row.amountValue != null ? Number(row.amountValue) : null;
    const key = pantryKey(name, unit);
    const hit = stock.get(key);

    if (!hit || need == null || !Number.isFinite(need) || hit.qty == null) {
      nextCreates.push(row);
      continue;
    }

    if (hit.qty >= need) {
      const left = hit.qty - need;
      hit.qty = left;
      pantryUpdates.push({
        id: hit.id,
        amountValue: left,
        amountText: formatAmountQty(left, hit.amountUnit || unit, { forShopping: true }),
        delete: left <= 0,
      });
      stock.set(key, hit);
      continue;
    }

    const remaining = need - hit.qty;
    pantryUpdates.push({
      id: hit.id,
      amountValue: 0,
      amountText: formatAmountQty(0, hit.amountUnit || unit, { forShopping: true }),
      delete: true,
    });
    hit.qty = 0;
    stock.set(key, hit);
    const amountText = formatAmountQty(remaining, unit, { forShopping: true });
    nextCreates.push({
      ...row,
      amountValue: remaining,
      amountText,
      title: row.ingredientName
        ? `${amountText} ${row.ingredientName}`.trim()
        : row.title,
    });
  }

  return { creates: nextCreates, pantryUpdates };
}

export async function applyPantryUpdates(familyId, updates = []) {
  if (!familyId || !updates.length) return;
  await Promise.all(updates.map(async (u) => {
    if (u.delete || (u.amountValue != null && u.amountValue <= 0)) {
      await deletePantryItem(familyId, u.id);
      return;
    }
    await updatePantryItem(familyId, u.id, {
      amountValue: u.amountValue,
      amountText: u.amountText || '',
    });
  }));
}
