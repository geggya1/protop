import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { dateKey, addDays } from './dates';
import { profileAge } from './age';
import {
  resolveIngredientCategory, SHOPPING_CATEGORY_KEYS, SHOPPING_CATEGORY_LABELS,
} from './groceryCategory';

/** Barn telles som 70 % porsjon, samme som AI-handlelisten. */
export const CHILD_PORTION = 0.7;

export function portionUnits(adults = 0, children = 0) {
  return Math.max(0.1, Number(adults) + Number(children) * CHILD_PORTION);
}

/** Voksen = 18 år eller eldre. Ukjent alder: forelder=voksen, barn=barn. */
export function familyMealHeadcount(members = []) {
  let adults = 0;
  let children = 0;
  for (const m of members) {
    const age = profileAge(m);
    if (age != null) {
      if (age >= 18) adults += 1;
      else children += 1;
    } else if (m.role === 'child') {
      children += 1;
    } else {
      adults += 1;
    }
  }
  if (!adults && !children) return { adults: 2, children: 0 };
  return { adults, children };
}

/**
 * Parse «1/2 stk», «0,2 stk», «600 g», «2 dl».
 * Beholder enhet for summering på tvers av måltider.
 */
export function parseAmountText(amount) {
  const raw = String(amount || '').trim();
  if (!raw) return { qty: null, unit: '', raw: '', matched: null };
  const fraction = raw.match(/(\d+)\s*\/\s*(\d+)/);
  const decimal = raw.match(/(\d+(?:[.,]\d+)?)/);
  let qty = null;
  let matched = null;
  if (fraction) {
    const a = Number(fraction[1]);
    const b = Number(fraction[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
      qty = a / b;
      matched = fraction[0];
    }
  }
  if (qty == null && decimal) {
    qty = Number(decimal[1].replace(',', '.'));
    matched = decimal[0];
  }
  if (qty == null || !Number.isFinite(qty)) {
    return { qty: null, unit: '', raw, matched: null };
  }
  const unit = matched
    ? raw.replace(matched, '').trim().replace(/^x\s*/i, '').trim()
    : '';
  return { qty, unit, raw, matched };
}

/**
 * Formater mengde. forShopping=true runder én gang (etter summering) —
 * aldri Math.ceil per matrett.
 */
export function formatAmountQty(qty, unit = '', { forShopping = false } = {}) {
  if (!Number.isFinite(qty)) return String(unit || '').trim();
  const u = String(unit || '').trim();
  const isGrams = /\bg\b/i.test(u);
  let n;
  if (forShopping) {
    if (isGrams && qty >= 50) n = Math.round(qty / 10) * 10;
    else if (qty >= 10) n = Math.round(qty);
    else if (Math.abs(qty - Math.round(qty)) < 0.08) n = Math.round(qty);
    else n = Math.round(qty * 10) / 10;
  } else if (isGrams && qty >= 50) {
    n = Math.round(qty / 10) * 10;
  } else if (qty >= 10) {
    n = Math.round(qty * 10) / 10;
  } else {
    // Behold to desimaler under skalering (0,18 + 1,82 → 2 i handlelisten)
    n = Math.round(qty * 100) / 100;
  }
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return u ? `${s} ${u}` : s;
}

/** Skaler «600 g», «3 stk», «1/2 stk», «2 dl» med en faktor. Tekst uten tall uendret. */
export function scaleAmount(amount, factor) {
  const text = String(amount || '').trim();
  if (!text || !Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.03) {
    return text;
  }
  const parsed = parseAmountText(text);
  if (parsed.qty == null || !parsed.matched) return text;
  const scaled = parsed.qty * factor;
  const formatted = formatAmountQty(scaled, parsed.unit, { forShopping: false });
  // Bytt kun talldelen + enhet som vi forstår; behold øvrig tekst hvis merkelig
  if (!parsed.unit) {
    return text.replace(parsed.matched, formatted);
  }
  return formatted;
}

export function scaleIngredients(ingredients = [], fromAdults, fromChildren, toAdults, toChildren) {
  const from = portionUnits(fromAdults, fromChildren);
  const to = portionUnits(toAdults, toChildren);
  const factor = to / from;
  return (ingredients || []).map((item) => ({
    ...item,
    amount: scaleAmount(item.amount, factor),
  }));
}

export function normalizeIngredientName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function ingredientMergeKey(name, unit) {
  return `${normalizeIngredientName(name)}|${String(unit || '').trim().toLowerCase()}`;
}

/** «Agurk (0,2 stk)» → { name, amount } */
export function parseShoppingItemTitle(title) {
  const t = String(title || '').trim();
  const m = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), amount: m[2].trim() };
  return { name: t, amount: '' };
}

export function shoppingItemTitle(name, amountText) {
  const n = String(name || '').trim();
  const a = String(amountText || '').trim();
  return a ? `${n} (${a})` : n;
}

/**
 * Summer mengder for samme vare+enhet på tvers av matretter, rund først etter sum.
 * existingItems: handleliste-rader (åpne). newIngredients: skalerte ingredienser fra ett måltid.
 */
export function mergeIngredientsIntoShopping(existingItems = [], newIngredients = [], meta = {}) {
  const open = (existingItems || []).filter((i) => !i.deleted && !i.done);
  const byKey = new Map();

  for (const item of open) {
    const fromMeta = item.ingredientName
      ? { name: item.ingredientName, amount: item.amountText || '' }
      : parseShoppingItemTitle(item.title);
    let qty = item.amountValue != null ? Number(item.amountValue) : null;
    let unit = item.amountUnit || '';
    if (qty == null || !Number.isFinite(qty)) {
      const parsed = parseAmountText(fromMeta.amount);
      qty = parsed.qty;
      unit = parsed.unit || unit;
    }
    if (qty == null || !Number.isFinite(qty)) continue;
    const name = fromMeta.name || item.title;
    const key = ingredientMergeKey(name, unit);
    byKey.set(key, {
      id: item.id,
      name,
      qty,
      unit,
      category: item.category,
      createIndex: -1,
    });
  }

  const updates = [];
  const creates = [];

  const pushFormattedUpdate = (cur) => {
    const amountText = formatAmountQty(cur.qty, cur.unit, { forShopping: true });
    const patch = {
      title: shoppingItemTitle(cur.name, amountText),
      ingredientName: cur.name,
      amountText,
      amountValue: cur.qty,
      amountUnit: cur.unit,
      category: cur.category,
    };
    if (cur.id) {
      updates.push({ id: cur.id, ...patch });
    } else if (cur.createIndex >= 0 && creates[cur.createIndex]) {
      Object.assign(creates[cur.createIndex], patch);
    }
  };

  for (const ing of newIngredients || []) {
    const name = String(ing.name || ing.title || '').trim();
    if (!name) continue;
    const parsed = parseAmountText(ing.amount);
    const key = ingredientMergeKey(name, parsed.unit || '');
    const cat = resolveIngredientCategory(ing);

    if (parsed.qty != null && byKey.has(key)) {
      const cur = byKey.get(key);
      cur.qty += parsed.qty;
      if (!cur.category) cur.category = cat;
      pushFormattedUpdate(cur);
      byKey.set(key, cur);
      continue;
    }

    if (parsed.qty != null) {
      const amountText = formatAmountQty(parsed.qty, parsed.unit, { forShopping: true });
      const row = {
        title: shoppingItemTitle(name, amountText),
        ingredientName: name,
        amountText,
        amountValue: parsed.qty,
        amountUnit: parsed.unit,
        category: cat,
        done: false,
        recurring: false,
        addedBy: meta.addedBy || null,
        addedByName: meta.addedByName || '',
        assignedTo: null,
        mealId: meta.mealId || null,
        mealTitle: meta.mealTitle || '',
        mealDateKey: meta.mealDateKey || '',
      };
      const createIndex = creates.length;
      creates.push(row);
      byKey.set(key, {
        id: null,
        name,
        qty: parsed.qty,
        unit: parsed.unit,
        category: cat,
        createIndex,
      });
      continue;
    }

    creates.push({
      title: shoppingItemTitle(name, String(ing.amount || '').trim()),
      ingredientName: name,
      amountText: String(ing.amount || '').trim(),
      category: cat,
      done: false,
      recurring: false,
      addedBy: meta.addedBy || null,
      addedByName: meta.addedByName || '',
      assignedTo: null,
      mealId: meta.mealId || null,
      mealTitle: meta.mealTitle || '',
      mealDateKey: meta.mealDateKey || '',
    });
  }

  return { updates, creates };
}

export function mealsCol(familyId) {
  return collection(db, 'families', familyId, 'meals');
}

export function mealDoc(familyId, mealId) {
  return doc(db, 'families', familyId, 'meals', mealId);
}

export function listenMeals(familyId, cb) {
  if (!familyId) return () => {};
  // Shared hub — module badges + home widgets reuse one onSnapshot.
  // eslint-disable-next-line global-require
  const { subscribeFamilyCollection } = require('./sharedCollectionListeners');
  return subscribeFamilyCollection(
    familyId,
    'meals',
    (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cb,
  );
}

export function listenMeal(familyId, mealId, cb) {
  if (!familyId || !mealId) return () => {};
  return onSnapshot(mealDoc(familyId, mealId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => cb(null));
}

export async function createMeal(familyId, data) {
  const adults = Math.max(0, Number(data.adults) || 0);
  const children = Math.max(0, Number(data.children) || 0);
  const safeAdults = adults || (children ? 0 : 2);
  const hasIngredients = !!data.ingredients?.length;
  const recipePortions = Number(data.recipePortions) || 0;
  return addDoc(mealsCol(familyId), {
    title: String(data.title || '').trim(),
    dateKey: data.dateKey,
    tag: data.tag || 'Middag',
    adults: safeAdults,
    children,
    minutes: Number(data.minutes) || 30,
    recipeId: data.recipeId || null,
    imageUrl: data.imageUrl || '',
    description: data.description || '',
    emoji: data.emoji || null,
    ingredients: hasIngredients ? data.ingredients.map((i) => ({
      id: i.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: i.name,
      amount: i.amount || '',
      category: resolveIngredientCategory(i),
    })) : [],
    ingredientsStatus: hasIngredients ? 'ready' : 'pending',
    ingredientsForAdults: data.ingredientsForAdults != null
      ? Math.max(0, Number(data.ingredientsForAdults))
      : (hasIngredients ? (recipePortions || safeAdults) : safeAdults),
    ingredientsForChildren: data.ingredientsForChildren != null
      ? Math.max(0, Number(data.ingredientsForChildren))
      : (hasIngredients ? 0 : children),
    portionCustomized: !!data.portionCustomized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMeal(familyId, mealId, patch) {
  await updateDoc(mealDoc(familyId, mealId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMeal(familyId, mealId) {
  await deleteDoc(mealDoc(familyId, mealId));
}

export async function generateMealIngredients(familyId, meal) {
  const fn = httpsCallable(functions, 'aiMealIngredients', { timeout: 60000 });
  const result = await fn({
    familyId,
    title: meal.title,
    adults: meal.adults ?? 2,
    children: meal.children ?? 0,
  });
  const data = result?.data || {};
  const adults = meal.adults ?? 2;
  const children = meal.children ?? 0;
  await updateMeal(familyId, meal.id, {
    ingredients: data.ingredients || [],
    ingredientsSummary: data.summary || '',
    ingredientsStatus: 'ready',
    ingredientsEngine: data.engine || 'local',
    ingredientsGeneratedAt: serverTimestamp(),
    ingredientsForAdults: adults,
    ingredientsForChildren: children,
  });
  return data;
}

export function formatMealPortions(meal) {
  const adults = meal?.adults ?? 2;
  const children = meal?.children ?? 0;
  const parts = [];
  if (adults) parts.push(`${adults} voksne`);
  if (children) parts.push(`${children} barn`);
  return parts.length ? parts.join(' · ') : '2 voksne';
}

export function mealSlotKey(dateKey, tag) {
  return `${dateKey}:${tag}`;
}

export function findMealForSlot(meals, dateKey, tag) {
  return meals.find((m) => m.dateKey === dateKey && (m.tag || 'Middag') === tag) || null;
}

export function mealsInWeek(meals, weekStart) {
  const keys = Array.from({ length: 7 }, (_, i) => dateKey(addDays(weekStart, i)));
  return meals.filter((m) => keys.includes(m.dateKey));
}

export function formatWeekRange(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

export function ingredientsByCategory(ingredients = []) {
  const groups = {};
  for (const item of ingredients) {
    const cat = resolveIngredientCategory(item);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ ...item, category: cat });
  }
  const known = SHOPPING_CATEGORY_KEYS.filter((k) => groups[k]?.length);
  const extra = Object.keys(groups).filter((k) => !SHOPPING_CATEGORY_KEYS.includes(k));
  return [...known, ...extra].map((k) => ({
    key: k,
    label: SHOPPING_CATEGORY_LABELS[k] || 'Annet',
    items: groups[k],
  }));
}
