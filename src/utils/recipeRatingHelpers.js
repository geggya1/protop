/** Pure helpers for recipe ratings (no Firebase). */

export function recipeRatingKey(recipe) {
  if (!recipe) return '';
  if (recipe.isCustom) return `custom:${recipe.id}`;
  if (recipe.fromCatalog) return `catalog:${recipe.id}`;
  return `builtin:${recipe.id}`;
}

export function summarizeRatingEntries(entries = {}) {
  const list = Object.values(entries || {}).filter((e) => Number(e?.stars) > 0);
  const count = list.length;
  if (!count) {
    return { averageRating: 0, ratingCount: 0 };
  }
  const sum = list.reduce((acc, e) => acc + Math.max(1, Math.min(5, Number(e.stars) || 0)), 0);
  return {
    averageRating: Math.round((sum / count) * 10) / 10,
    ratingCount: count,
  };
}

export function ratingForRecipe(ratingsMap, recipe) {
  const key = recipeRatingKey(recipe);
  if (!key) return null;
  return ratingsMap?.[key] || null;
}

/** Sorter oppskrifter: høyt vurdert først, deretter egne, deretter tittel. */
export function sortRecipesByRating(recipes, ratingsMap = {}) {
  return [...(recipes || [])].sort((a, b) => {
    const ra = ratingForRecipe(ratingsMap, a);
    const rb = ratingForRecipe(ratingsMap, b);
    const aAvg = Number(ra?.averageRating) || 0;
    const bAvg = Number(rb?.averageRating) || 0;
    const aCount = Number(ra?.ratingCount) || 0;
    const bCount = Number(rb?.ratingCount) || 0;
    if (bAvg !== aAvg) return bAvg - aAvg;
    if (bCount !== aCount) return bCount - aCount;
    if (!!b.isCustom !== !!a.isCustom) return a.isCustom ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''), 'nb');
  });
}
