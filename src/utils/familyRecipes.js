/**
 * Oppskriftskatalog:
 * - Innebygde forslag: NORWEGIAN_RECIPES (kan skjules/redigeres per familie)
 * - Familier: families/{familyId}/recipes
 * - Valgfri global katalog: recipeCatalog/{id}
 */

import {
  collection, doc, addDoc, updateDoc, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';

export function recipesCol(familyId) {
  return collection(db, 'families', familyId, 'recipes');
}

export function recipeDoc(familyId, recipeId) {
  return doc(db, 'families', familyId, 'recipes', recipeId);
}

export function familyDoc(familyId) {
  return doc(db, 'families', familyId);
}

export function recipeCatalogCol() {
  return collection(db, 'recipeCatalog');
}

/** Kun Firebase Storage-bilder — blokker Unsplash/stock. */
export function isUserUploadedImage(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  return /firebasestorage\.googleapis\.com|storage\.googleapis\.com/i.test(u);
}

function sanitizeRecipe(data) {
  const imageUrl = isUserUploadedImage(data?.imageUrl) ? String(data.imageUrl).trim() : '';
  return { ...data, imageUrl };
}

export function listenFamilyRecipes(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(recipesCol(familyId), (snap) => {
    const recipes = snap.docs
      .map((d) => sanitizeRecipe({ id: d.id, ...d.data(), isCustom: true }))
      .filter((r) => !r.deleted);
    cb(recipes);
  }, () => cb([]));
}

/** Skjulte innebygde oppskrifter for denne familien. */
export function listenHiddenBuiltinRecipeIds(familyId, cb) {
  if (!familyId) {
    cb([]);
    return () => {};
  }
  return onSnapshot(familyDoc(familyId), (snap) => {
    const ids = snap.exists() ? (snap.data()?.hiddenBuiltinRecipeIds || []) : [];
    cb(Array.isArray(ids) ? ids.map(String) : []);
  }, () => cb([]));
}

export async function hideBuiltinRecipe(familyId, recipeId) {
  if (!familyId || !recipeId) return;
  await updateDoc(familyDoc(familyId), {
    hiddenBuiltinRecipeIds: arrayUnion(String(recipeId)),
    updatedAt: serverTimestamp(),
  });
}

export async function unhideBuiltinRecipe(familyId, recipeId) {
  if (!familyId || !recipeId) return;
  await updateDoc(familyDoc(familyId), {
    hiddenBuiltinRecipeIds: arrayRemove(String(recipeId)),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Global forslagskatalog. Tom når ingen dokumenter / alle disabled.
 */
export function listenRecipeCatalog(cb) {
  return onSnapshot(recipeCatalogCol(), (snap) => {
    try {
      const recipes = snap.docs
        .map((d) => sanitizeRecipe({ id: d.id, ...d.data(), isCustom: false, fromCatalog: true }))
        .filter((r) => !r.deleted && r.enabled !== false && r.title);
      cb(recipes);
    } catch {
      cb([]);
    }
  }, () => cb([]));
}

function recipePayload(data, extras = {}) {
  const ingredients = (data.ingredients || [])
    .filter((i) => i?.name?.trim())
    .map((i) => ({ name: i.name.trim(), amount: String(i.amount || '').trim() }));

  const coverImageUrl = String(data.coverImageUrl || '').trim();
  const safeCover = /^https?:\/\//i.test(coverImageUrl) ? coverImageUrl.slice(0, 500) : '';

  return {
    title: String(data.title || '').trim(),
    tag: data.tag || 'Middag',
    category: data.category || 'mine',
    emoji: data.emoji || '🍽️',
    imageUrl: isUserUploadedImage(data.imageUrl) ? String(data.imageUrl).trim() : '',
    coverImageUrl: safeCover,
    minutes: Math.max(1, Number(data.minutes) || 30),
    prepMinutes: Math.max(0, Number(data.prepMinutes) || 0),
    cookMinutes: Math.max(0, Number(data.cookMinutes) || Number(data.minutes) || 30),
    portions: Math.max(1, Number(data.portions) || 4),
    description: String(data.description || '').trim(),
    instructions: String(data.instructions || '').trim(),
    sourceUrl: String(data.sourceUrl || '').trim().slice(0, 500),
    videoUrl: String(data.videoUrl || '').trim().slice(0, 500),
    ingredients,
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    isCustom: true,
    deleted: false,
    ...extras,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function createFamilyRecipe(familyId, data) {
  const extras = {};
  if (data.sourceBuiltinId) {
    extras.sourceBuiltinId = String(data.sourceBuiltinId);
  }
  if (data.sourceCatalogId) {
    extras.sourceCatalogId = String(data.sourceCatalogId);
  }
  return addDoc(recipesCol(familyId), recipePayload(data, extras));
}

/**
 * Rediger innebygd forslag: lag familie-kopi og skjul originalen.
 * Returnerer den nye dokument-referansen.
 */
export async function saveBuiltinRecipeAsCustom(familyId, builtinRecipe, patch, meta = {}) {
  const sourceId = builtinRecipe.id;
  const extras = {
    createdBy: meta.createdBy || '',
    createdByName: meta.createdByName || '',
  };
  if (builtinRecipe.fromCatalog || patch.sourceCatalogId) {
    extras.sourceCatalogId = String(patch.sourceCatalogId || sourceId);
  } else {
    extras.sourceBuiltinId = String(patch.sourceBuiltinId || sourceId);
  }
  const merged = {
    ...builtinRecipe,
    ...patch,
    category: patch.category || 'mine',
    ...extras,
  };
  const ref = await createFamilyRecipe(familyId, merged);
  await hideBuiltinRecipe(familyId, sourceId);
  return ref;
}

export async function updateFamilyRecipe(familyId, recipeId, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (Array.isArray(patch.ingredients)) {
    next.ingredients = patch.ingredients
      .filter((i) => i?.name?.trim())
      .map((i) => ({ name: i.name.trim(), amount: String(i.amount || '').trim() }));
  }
  if (typeof patch.title === 'string') {
    next.title = patch.title.trim();
  }
  if (patch.imageUrl !== undefined) {
    next.imageUrl = isUserUploadedImage(patch.imageUrl) ? String(patch.imageUrl).trim() : '';
  }
  if (patch.coverImageUrl !== undefined) {
    const cover = String(patch.coverImageUrl || '').trim();
    next.coverImageUrl = /^https?:\/\//i.test(cover) ? cover.slice(0, 500) : '';
  }
  if (patch.instructions !== undefined) {
    next.instructions = String(patch.instructions || '').trim();
  }
  if (patch.sourceUrl !== undefined) {
    next.sourceUrl = String(patch.sourceUrl || '').trim().slice(0, 500);
  }
  if (patch.videoUrl !== undefined) {
    next.videoUrl = String(patch.videoUrl || '').trim().slice(0, 500);
  }
  if (patch.category !== undefined) {
    next.category = patch.category || 'mine';
  }
  await updateDoc(recipeDoc(familyId, recipeId), next);
}

export async function deleteFamilyRecipe(familyId, recipeId) {
  await updateDoc(recipeDoc(familyId, recipeId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

/** AI-import av oppskrift fra bilde (base64/storage) eller nettside-URL. */
export async function importRecipeWithAi(familyId, {
  sourceUrl = '',
  imageBase64 = '',
  storagePath = '',
} = {}) {
  const fn = httpsCallable(functions, 'aiRecipeImport', { timeout: 120000 });
  const result = await fn({
    familyId,
    sourceUrl: String(sourceUrl || '').trim(),
    imageBase64: String(imageBase64 || '').trim(),
    storagePath: String(storagePath || '').trim(),
  });
  return result?.data || {};
}
