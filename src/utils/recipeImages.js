import { VERIFIED_RECIPE_IMAGES } from '../data/verifiedRecipeImages';
import { isUserUploadedImage } from './familyRecipes';

/** Kun Firebase-opplastinger og manuelt verifiserte Wikimedia Commons-bilder. */
export function isTrustedRecipeImage(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  if (isUserUploadedImage(u)) return true;
  return /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//i.test(u);
}

function builtinRecipeId(recipe) {
  return String(recipe?.sourceBuiltinId || recipe?.recipeId || recipe?.id || '').trim();
}

/** Visnings-URL: brukeropplasting har prioritet, deretter verifisert innebygd bilde. */
export function getRecipeDisplayImageUrl(recipe) {
  if (!recipe) return null;
  const uploaded = String(recipe.imageUrl || '').trim();
  if (isUserUploadedImage(uploaded)) return uploaded;
  if (isTrustedRecipeImage(uploaded)) return uploaded;

  const cover = String(recipe.coverImageUrl || '').trim();
  if (recipe.isCustom && /^https?:\/\//i.test(cover)) return cover;

  const verified = VERIFIED_RECIPE_IMAGES[builtinRecipeId(recipe)];
  return verified?.url || null;
}

export function hasRecipeDisplayImage(recipe) {
  return !!getRecipeDisplayImageUrl(recipe);
}

export function getVerifiedRecipeImageMeta(recipeId) {
  return VERIFIED_RECIPE_IMAGES[String(recipeId || '')] || null;
}
