/**
 * Client helpers for AI Matcoach (ukeplan, matpakker) og AI-lagerskanner.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { createMeal, familyMealHeadcount } from './meals';
import { dateKey, addDays, startOfWeekMonday } from './dates';
import { upsertPantryItem } from './familyPantry';
import { NORWEGIAN_RECIPES } from '../data/norwegianRecipes';
import { getRecipeDisplayImageUrl } from './recipeImages';
import { guardedCallable } from './guardedCallable';
import { addListItems } from './shoppingLists';
import {
  MATCOACH_DIETS,
  MATCOACH_GOAL_OPTIONS,
  DEFAULT_MATCOACH_PREFS,
  collectShoppingFromPlan,
  mergeFridgeSelections,
  lunchBoxIsColdSafe,
  subtractPantryFromShopping,
  restorePlanFromHistoryEntry,
  restoreLunchFromHistoryEntry,
  enrichPlanDays,
  enrichSuggestionDay,
  collectShoppingFromDays,
  dayAsRecipeThumb,
  matchRecipeForSuggestion,
  synthesizeInstructions,
} from './matcoachLogic';

export {
  MATCOACH_DIETS,
  MATCOACH_GOAL_OPTIONS,
  DEFAULT_MATCOACH_PREFS,
  collectShoppingFromPlan,
  mergeFridgeSelections,
  lunchBoxIsColdSafe,
  subtractPantryFromShopping,
  restorePlanFromHistoryEntry,
  restoreLunchFromHistoryEntry,
  enrichPlanDays,
  enrichSuggestionDay,
  collectShoppingFromDays,
  dayAsRecipeThumb,
  matchRecipeForSuggestion,
  synthesizeInstructions,
};

const PREFS_KEY = (familyId) => `matcoach:prefs:${familyId || 'none'}`;

export function prefsFromFamilyMembers(members = []) {
  const head = familyMealHeadcount(members);
  return { ...DEFAULT_MATCOACH_PREFS, ...head };
}

export async function loadMatcoachPrefs(familyId, members = []) {
  const fallback = prefsFromFamilyMembers(members);
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY(familyId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed, adults: parsed.adults ?? fallback.adults, children: parsed.children ?? fallback.children };
  } catch {
    return fallback;
  }
}

export async function saveMatcoachPrefs(familyId, prefs) {
  const next = { ...DEFAULT_MATCOACH_PREFS, ...prefs };
  await AsyncStorage.setItem(PREFS_KEY(familyId), JSON.stringify(next));
  return next;
}

function catalogForAi(limitN = 30) {
  // Foretrekk retter med verifisert bilde når mulig — bedre miniatyrer i UI.
  const dinners = NORWEGIAN_RECIPES.filter((r) => (r.tag || 'Middag') === 'Middag');
  const withImageHint = [...dinners].sort((a, b) => {
    // Stable prefer recipes that appear early and are popular family dishes
    const score = (r) => (/taco|pasta|kjott|fisk|wok|suppe|gryte/i.test(r.id + r.title) ? 0 : 1);
    return score(a) - score(b);
  });
  return withImageHint.slice(0, limitN).map((r) => ({
    id: r.id,
    title: r.title,
    minutes: r.minutes,
    emoji: r.emoji,
    description: r.description,
    ingredients: r.ingredients,
    category: r.category,
  }));
}

export async function generateMatcoachWeekPlan(familyId, { prefs, pantryNames = [], extraRecipes = [] } = {}) {
  const raw = await guardedCallable('aiMatcoachWeekPlan', {
    familyId,
    prefs,
    pantryNames,
    catalog: catalogForAi(28),
  }, { timeout: 90000 });
  return enrichPlanDays(raw, [...extraRecipes, ...NORWEGIAN_RECIPES]);
}

export async function scanMatcoachFridge(familyId, { imageBase64 = '', hintText = '' } = {}) {
  return guardedCallable('aiMatcoachFridgeScan', {
    familyId,
    imageBase64,
    hintText,
  }, { timeout: 90000 });
}

export async function generateMatcoachLunchBoxes(familyId, { prefs } = {}) {
  return guardedCallable('aiMatcoachLunchBoxes', { familyId, prefs }, { timeout: 60000 });
}

export async function swapMatcoachMeal(familyId, { prefs, currentTitle, avoidTitles = [] } = {}) {
  return guardedCallable('aiMatcoachSwapMeal', {
    familyId,
    prefs,
    currentTitle,
    avoidTitles,
  }, { timeout: 60000 });
}

/** Local planner used when offline / for unit tests. */
export function buildLocalWeekPlan(prefs = DEFAULT_MATCOACH_PREFS) {
  const pool = NORWEGIAN_RECIPES.filter((r) => (r.tag || 'Middag') === 'Middag');
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const recipe = pool[i % Math.max(1, pool.length)];
    days.push({
      dayIndex: i,
      dayName: ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'][i],
      title: recipe?.title || `Middag ${i + 1}`,
      minutes: recipe?.minutes || 30,
      kcal: 550,
      tags: [recipe?.category || 'Middag'].filter(Boolean),
      whyChosen: 'Lokal plan fra oppskriftskatalogen.',
      description: recipe?.description || '',
      ingredients: (recipe?.ingredients || []).map((ing, idx) => ({
        id: `i${idx + 1}`,
        name: ing.name,
        amount: ing.amount || '',
        category: 'general',
      })),
      recipeId: recipe?.id || '',
      emoji: recipe?.emoji || '🍽️',
      instructions: recipe?.instructions || '',
    });
  }
  return enrichPlanDays({
    headline: 'Ukeplanen lager seg selv',
    summary: `Lokal plan · ${prefs.adults || 2} voksne, ${prefs.children || 0} barn`,
    estimatedWeeklyCostKr: prefs.budgetKr || 1200,
    days,
    engine: 'local-client',
  }, NORWEGIAN_RECIPES);
}

export async function applyWeekPlanToMeals(familyId, plan, prefs, { weekStart, days } = {}) {
  if (!familyId) throw new Error('Mangler plan');
  const list = Array.isArray(days) && days.length ? days : plan?.days;
  if (!list?.length) throw new Error('Mangler plan');
  const start = weekStart || startOfWeekMonday(new Date());
  const adults = prefs?.adults ?? 2;
  const children = prefs?.children ?? 0;
  const created = [];
  for (const day of list) {
    const dk = dateKey(addDays(start, day.dayIndex ?? 0));
    const thumb = dayAsRecipeThumb(day);
    const imageUrl = day.imageUrl || getRecipeDisplayImageUrl(thumb) || '';
    const ref = await createMeal(familyId, {
      title: day.title,
      dateKey: dk,
      tag: 'Middag',
      adults,
      children,
      minutes: day.minutes || 30,
      recipeId: day.recipeId || day.matchedRecipeId || null,
      description: [day.description, day.whyChosen].filter(Boolean).join(' — '),
      emoji: day.emoji || null,
      imageUrl,
      ingredients: day.ingredients || [],
      recipePortions: day.portions || adults + children,
    });
    created.push({ id: ref.id, dateKey: dk, title: day.title, dayIndex: day.dayIndex });
  }
  return created;
}

export async function applySingleDayToMeal(familyId, day, prefs, { weekStart } = {}) {
  const created = await applyWeekPlanToMeals(familyId, null, prefs, {
    weekStart,
    days: [day],
  });
  return created[0] || null;
}

export async function pushDaysToShopping(familyId, listId, days, { pantryItems = [], skipPantry = true } = {}) {
  if (!familyId || !listId) throw new Error('Mangler handleliste');
  const all = collectShoppingFromDays(days);
  const { needed } = skipPantry
    ? subtractPantryFromShopping(all, pantryItems)
    : { needed: all };
  if (!needed.length) return { added: 0, covered: all.length - needed.length, items: [] };
  await addListItems(familyId, listId, needed.map((item) => ({
    name: item.name,
    amount: item.amount || '',
    category: item.category || 'general',
    note: item.fromDays?.length ? `Matcoach: ${item.fromDays.join(', ')}` : 'Matcoach',
  })));
  return { added: needed.length, covered: all.length - needed.length, items: needed };
}

/**
 * Lagre AI-skannede varer i familielageret.
 * Sammenslår like varer (upsert) når lageret allerede har dem.
 *
 * 5. argument: existingItems-array ELLER { existingItems, locationOverrides }.
 *
 * @returns {{ added: number, merged: number, items: Array<{id:string,name:string,merged:boolean}> }}
 */
export async function applyFridgeItemsToPantry(
  familyId,
  items,
  uid,
  selectedNames = null,
  existingItemsOrOpts = [],
) {
  const opts = Array.isArray(existingItemsOrOpts)
    ? { existingItems: existingItemsOrOpts }
    : (existingItemsOrOpts || {});
  const { existingItems = [], locationOverrides = null } = opts;
  const selected = mergeFridgeSelections(items, selectedNames, locationOverrides);
  const stock = [...(existingItems || [])];
  const out = [];
  let added = 0;
  let merged = 0;
  for (const item of selected) {
    const result = await upsertPantryItem(familyId, {
      name: item.name,
      amountText: item.amountText || '',
      location: item.location || 'fridge',
      category: item.category || 'general',
    }, uid, stock);
    if (result.merged) {
      merged += 1;
    } else {
      added += 1;
      stock.push({
        id: result.id,
        name: item.name,
        amountUnit: '',
        barcode: null,
        amountValue: null,
      });
    }
    out.push({ id: result.id, name: item.name, merged: !!result.merged });
  }
  return { added, merged, items: out };
}

export function listenMatcoachHistory(familyId, cb, max = 12) {
  if (!familyId) return () => {};
  const q = query(
    collection(db, 'families', familyId, 'matcoachHistory'),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function logMatcoachClientEvent(familyId, uid, kind, note) {
  if (!familyId) return;
  try {
    await addDoc(collection(db, 'families', familyId, 'matcoachHistory'), {
      kind,
      headline: note || kind,
      summary: note || '',
      engine: 'client',
      createdBy: uid || null,
      createdAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}
