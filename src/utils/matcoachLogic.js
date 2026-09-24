/**
 * Pure Matcoach helpers (no Firebase) — testbare uten app-runtime.
 */

export const MATCOACH_DIETS = [
  { id: 'classic', label: 'Klassisk' },
  { id: 'vegetarian', label: 'Vegetar' },
  { id: 'pescetarian', label: 'Pescetar' },
  { id: 'flexitarian', label: 'Fleksitar' },
];

export const MATCOACH_GOAL_OPTIONS = [
  { id: 'familie', label: 'Familievennlig' },
  { id: 'raskt', label: 'Raske middager' },
  { id: 'sunn', label: 'Sunt' },
  { id: 'budsjett', label: 'Stramt budsjett' },
  { id: 'variasjon', label: 'Mer variasjon' },
  { id: 'matsvinn', label: 'Mindre matsvinn' },
];

export const DEFAULT_MATCOACH_PREFS = {
  diet: 'classic',
  allergies: [],
  dislikes: [],
  maxMinutes: 40,
  budgetKr: 1200,
  adults: 2,
  children: 0,
  goals: ['familie', 'raskt'],
  includeLunchboxes: true,
};

export function collectShoppingFromPlan(plan) {
  const map = new Map();
  for (const day of plan?.days || []) {
    for (const ing of day.ingredients || []) {
      const key = String(ing.name || '').trim().toLowerCase();
      if (!key) continue;
      const prev = map.get(key);
      if (prev) {
        if (ing.amount && !prev.amount) prev.amount = ing.amount;
        prev.fromDays = [...new Set([...(prev.fromDays || []), day.dayName])];
      } else {
        map.set(key, {
          name: ing.name,
          amount: ing.amount || '',
          category: ing.category || 'general',
          fromDays: [day.dayName],
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

const PANTRY_LOCATION_IDS = new Set(['fridge', 'freezer', 'pantry', 'other']);

/** Normaliser lagerplass; fall tilbake til kategori → plass når AI ikke oppga location. */
export function normalizeScanLocation(location, category) {
  const loc = String(location || '').trim().toLowerCase();
  if (PANTRY_LOCATION_IDS.has(loc)) return loc;
  const c = String(category || '').toLowerCase();
  if (c === 'frozen') return 'freezer';
  if (c === 'dairy' || c === 'meat' || c === 'produce' || c === 'drinks') return 'fridge';
  if (c === 'household' || c === 'other') return 'other';
  if (c === 'bread' || c === 'snacks' || c === 'general') return 'pantry';
  return 'fridge';
}

/**
 * Filter/normalize AI fridge-scan items for pantry save.
 * @param {object[]} items
 * @param {string[]|null} selectedNames — null = all; otherwise only these names
 * @param {Record<string, string>|null} locationOverrides — name → pantry location id
 */
export function mergeFridgeSelections(items = [], selectedNames = null, locationOverrides = null) {
  const selected = selectedNames == null
    ? null
    : new Set([...selectedNames].map((n) => String(n).toLowerCase()));
  const overrides = locationOverrides && typeof locationOverrides === 'object'
    ? locationOverrides
    : null;
  return (items || [])
    .filter((it) => {
      const name = String(it?.name || '').trim();
      if (!name) return false;
      if (!selected) return true;
      return selected.has(name.toLowerCase());
    })
    .map((it) => {
      const name = String(it.name).trim();
      const override = overrides
        ? (overrides[name] || overrides[name.toLowerCase()])
        : null;
      return {
        name,
        amountText: String(it.amountText || '').trim(),
        location: override || normalizeScanLocation(it.location, it.category),
        category: it.category || 'general',
        confidence: Number(it.confidence) || 0.5,
      };
    });
}

export function lunchBoxIsColdSafe(box) {
  const hay = `${box?.title || ''} ${(box?.items || []).map((i) => i.name).join(' ')}`.toLowerCase();
  return !/varm|gryte|suppe|wok/i.test(hay);
}

/** Trekk fra varer som allerede finnes i lageret (Mealime/Steamline-mønster). */
export function subtractPantryFromShopping(shoppingItems = [], pantryItems = []) {
  const pantryKeys = new Set(
    (pantryItems || [])
      .map((p) => String(p.name || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const needed = [];
  const covered = [];
  for (const item of shoppingItems || []) {
    const key = String(item.name || '').trim().toLowerCase();
    if (!key) continue;
    if (pantryKeys.has(key)) covered.push(item);
    else needed.push(item);
  }
  return { needed, covered };
}

export function restorePlanFromHistoryEntry(entry) {
  const snap = entry?.snapshot || {};
  if (Array.isArray(snap.days) && snap.days.length) {
    return {
      headline: entry.headline || 'Gjenopprettet ukeplan',
      summary: entry.summary || '',
      estimatedWeeklyCostKr: snap.estimatedWeeklyCostKr || null,
      days: snap.days,
      engine: entry.engine || 'history',
    };
  }
  return null;
}

export function restoreLunchFromHistoryEntry(entry) {
  const snap = entry?.snapshot || {};
  if (Array.isArray(snap.boxes) && snap.boxes.length) {
    return {
      summary: entry.summary || '',
      boxes: snap.boxes,
      engine: entry.engine || 'history',
    };
  }
  return null;
}

function normalizeTitleKey(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .trim();
}

/** Finn beste katalog-oppskrift for et Matcoach-forslag (id eller tittel). */
export function matchRecipeForSuggestion(day, recipes = []) {
  if (!day) return null;
  const pool = Array.isArray(recipes) ? recipes : [];
  const byId = day.recipeId
    ? pool.find((r) => String(r.id) === String(day.recipeId)
      || String(r.sourceBuiltinId) === String(day.recipeId))
    : null;
  if (byId) return byId;

  const key = normalizeTitleKey(day.title);
  if (!key) return null;
  const exact = pool.find((r) => normalizeTitleKey(r.title) === key);
  if (exact) return exact;

  const partial = pool.find((r) => {
    const t = normalizeTitleKey(r.title);
    return t && (key.includes(t) || t.includes(key));
  });
  return partial || null;
}

/** Enkel fremgangsmåte når oppskriften mangler instructions. */
export function synthesizeInstructions(day) {
  const existing = String(day?.instructions || '').trim();
  if (existing) return existing;
  const ings = (day?.ingredients || [])
    .map((i) => i.name)
    .filter(Boolean)
    .slice(0, 6);
  const lines = [
    '1. Samle ingrediensene og sett ovn/panne klar.',
    ings.length
      ? `2. Tilbered hovedingrediensene (${ings.slice(0, 3).join(', ')}).`
      : '2. Tilbered hovedingrediensene etter smak.',
    '3. Kok tilbehør (ris, poteter eller pasta) parallelt.',
    '4. Smak til med salt og pepper, og server varmt.',
  ];
  if (day?.description) {
    lines.push(`Tips: ${String(day.description).trim()}`);
  }
  return lines.join('\n');
}

/**
 * Berik forslag med katalogdata (bilde, instruksjoner, emoji, mengder).
 * imageUrl settes kun når katalogen har en pålitelig URL (ellers håndteres
 * bilde via recipeId + VERIFIED_RECIPE_IMAGES i UI).
 */
export function enrichSuggestionDay(day, recipes = []) {
  if (!day) return day;
  const matched = matchRecipeForSuggestion(day, recipes);
  const ingredients = (day.ingredients?.length
    ? day.ingredients
    : (matched?.ingredients || [])
  ).map((ing, idx) => ({
    id: ing.id || `i${idx + 1}`,
    name: String(ing.name || '').trim(),
    amount: String(ing.amount || '').trim(),
    category: ing.category || 'general',
  })).filter((i) => i.name);

  const next = {
    ...day,
    recipeId: day.recipeId || matched?.id || '',
    matchedRecipeId: matched?.id || day.recipeId || '',
    emoji: day.emoji || matched?.emoji || '🍽️',
    description: day.description || matched?.description || '',
    minutes: day.minutes || matched?.minutes || 30,
    ingredients,
    instructions: synthesizeInstructions({
      ...day,
      instructions: day.instructions || matched?.instructions || '',
      ingredients,
      description: day.description || matched?.description || '',
    }),
    imageUrl: day.imageUrl || matched?.imageUrl || matched?.coverImageUrl || '',
    portions: day.portions || matched?.portions || 4,
  };
  return next;
}

export function enrichPlanDays(plan, recipes = []) {
  if (!plan?.days?.length) return plan;
  return {
    ...plan,
    days: plan.days.map((d) => enrichSuggestionDay(d, recipes)),
  };
}

/** Handleliste for utvalgte dager (én eller flere). */
export function collectShoppingFromDays(days = []) {
  return collectShoppingFromPlan({ days });
}

/** Recipe-lignende objekt for RecipeThumb / bildeoppslag. */
export function dayAsRecipeThumb(day) {
  if (!day) return null;
  return {
    id: day.matchedRecipeId || day.recipeId || `day-${day.dayIndex}`,
    recipeId: day.recipeId || day.matchedRecipeId || '',
    sourceBuiltinId: day.matchedRecipeId || day.recipeId || '',
    title: day.title,
    emoji: day.emoji || '🍽️',
    imageUrl: day.imageUrl || '',
    coverImageUrl: day.imageUrl || '',
  };
}

