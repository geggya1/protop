/**
 * AI-import av oppskrift fra bilde (OCR/vision) eller nettside-URL.
 * Returnerer ferdig strukturert oppskrift for CreateRecipe-skjemaet.
 */
import { getFirestore } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  getGeminiKey,
  assertFamilyAdult,
  checkAndIncrementUsage,
  callGeminiJson,
  downloadImageBase64,
  friendlyGeminiError,
} from './aiShared.js';

const RECIPE_CATEGORIES = new Set([
  'mine', 'fisk', 'tradisjon', 'rask', 'suppe', 'bakst', 'bakevarer', 'internasjonal',
]);
const MEAL_TAGS = new Set(['Frokost', 'Lunsj', 'Middag']);

const RECIPE_PROMPT = `Du er en norsk kokebok-assistent. Tolker en oppskrift fra bilde eller nettsidetekst.
Returner KUN gyldig JSON:
{
  "title": "matrettens navn",
  "tag": "Frokost|Lunsj|Middag",
  "category": "fisk|tradisjon|rask|suppe|bakst|bakevarer|internasjonal|mine",
  "minutes": 30,
  "prepMinutes": 10,
  "cookMinutes": 20,
  "portions": 4,
  "description": "kort appetittvekkende beskrivelse på norsk (1-3 setninger)",
  "ingredients": [{ "name": "ingrediens", "amount": "mengde" }],
  "instructions": "steg-for-steg tilberedning på norsk, nummererte steg med linjeskift",
  "sourceUrl": "original URL hvis kjent, ellers tom streng",
  "videoUrl": "YouTube/video-URL hvis nevnt, ellers tom streng",
  "suggestedImageUrl": "direkte bilde-URL til retten hvis synlig i kilden, ellers tom streng",
  "emoji": "ett passende mat-emoji"
}
Regler:
- Bruk norske produktnavn og mengder (g, dl, ss, stk).
- instructions skal være konkrete steg, ikke bare en setning.
- Velg category bakevarer for brød, kaker, boller, muffins o.l.; bakst for frokostbakst/vafler/pannekaker.
- Velg tag etter når retten typisk spises (middag er default for varmretter).
- Hvis noe mangler: gjett fornuftig ut fra konteksten, men ikke finn opp rare ingredienser.
- Ikke inkluder HTML, markdown-kodeblokker eller forklaringer utenfor JSON.`;

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim());
}

function extractMeta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i',
  );
  const m = String(html || '').match(re) || String(html || '').match(alt);
  return m ? decodeEntities(String(m[1] || '').trim()) : '';
}

function absolutizeUrl(raw, baseUrl = '') {
  const value = decodeEntities(String(raw || '').trim()).replace(/&amp;/gi, '&');
  if (!value || value.startsWith('data:')) return '';
  try {
    return new URL(value, baseUrl || undefined).toString().slice(0, 500);
  } catch {
    return /^https?:\/\//i.test(value) ? value.slice(0, 500) : '';
  }
}

function looksLikeDecorativeImage(url) {
  const u = String(url || '').toLowerCase();
  return /logo|icon|avatar|sprite|favicon|emoji|badge|button|banner-ad|advert|pixel|1x1|spacer|tracking/i.test(u)
    || /\.(svg)(\?|$)/i.test(u);
}

/** Featured recipe photo: og/twitter, WP/Elementor featured, then first large content image. */
function extractFeaturedImage(html, baseUrl = '') {
  const source = String(html || '');
  const candidates = [];

  const push = (raw, score) => {
    const url = absolutizeUrl(raw, baseUrl);
    if (!url || !/^https?:\/\//i.test(url) || looksLikeDecorativeImage(url)) return;
    candidates.push({ url, score });
  };

  push(extractMeta(source, 'og:image'), 100);
  push(extractMeta(source, 'og:image:secure_url'), 99);
  push(extractMeta(source, 'twitter:image'), 90);
  push(extractMeta(source, 'twitter:image:src'), 89);

  const linkImage = source.match(
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ) || source.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
  );
  if (linkImage) push(linkImage[1], 85);

  const featuredJson = source.match(
    /"featuredImage"\s*:\s*"(https?:\\\/\\\/[^"]+|https?:\/\/[^"]+)"/i,
  );
  if (featuredJson) {
    push(featuredJson[1].replace(/\\\//g, '/'), 95);
  }

  const wpPost = source.match(
    /<img[^>]+class=["'][^"']*(?:wp-post-image|attachment-post-thumbnail)[^"']*["'][^>]*>/i,
  );
  if (wpPost) {
    const src = wpPost[0].match(/\ssrc=["']([^"']+)["']/i);
    if (src) push(src[1], 92);
  }

  // Prefer large uploads from the article body (skip tiny thumbs / logos).
  const imgTags = source.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags.slice(0, 40)) {
    const src = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1] || '';
    const w = Number(tag.match(/\swidth=["']?(\d+)/i)?.[1] || 0);
    const h = Number(tag.match(/\sheight=["']?(\d+)/i)?.[1] || 0);
    let score = 40;
    if (/wp-content\/uploads/i.test(src)) score += 20;
    if (w >= 600 || h >= 400) score += 25;
    else if (w >= 300 || h >= 200) score += 10;
    if (w > 0 && w < 120 && h > 0 && h < 120) score -= 30;
    push(src, score);
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || '';
}

function extractPageTitle(html) {
  const og = extractMeta(html, 'og:title');
  if (og) return og.replace(/\s+[–—|-]\s+.*$/, '').trim();
  const h1 = String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const title = stripHtml(h1[1]).trim();
    if (title.length >= 3) return title.slice(0, 120);
  }
  const docTitle = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (docTitle) {
    return stripHtml(docTitle[1]).replace(/\s+[–—|-]\s+.*$/, '').trim().slice(0, 120);
  }
  return '';
}

function extractJsonLdRecipes(html) {
  const blocks = String(html || '').match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
  ) || [];
  const recipes = [];
  for (const block of blocks) {
    const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(raw);
      const graph = parsed && parsed['@graph'];
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(graph)
          ? graph
          : [parsed];
      for (const node of nodes) {
        const type = node?.['@type'];
        const types = Array.isArray(type) ? type : [type];
        if (types.some((t) => String(t || '').toLowerCase() === 'recipe')) {
          recipes.push(node);
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return recipes;
}

function normalizeRecipe(raw, extras = {}) {
  const tag = MEAL_TAGS.has(raw?.tag) ? raw.tag : 'Middag';
  const category = RECIPE_CATEGORIES.has(raw?.category) ? raw.category : 'mine';
  const ingredients = (Array.isArray(raw?.ingredients) ? raw.ingredients : [])
    .map((i) => ({
      name: String(i?.name || '').trim().slice(0, 80),
      amount: String(i?.amount || '').trim().slice(0, 40),
    }))
    .filter((i) => i.name)
    .slice(0, 40);

  const instructions = String(raw?.instructions || '').trim().slice(0, 8000);
  const minutes = Math.max(1, Math.min(480, Number(raw?.minutes) || 30));
  const prepMinutes = Math.max(0, Math.min(240, Number(raw?.prepMinutes) || 0));
  const cookMinutes = Math.max(
    0,
    Math.min(480, Number(raw?.cookMinutes) || minutes),
  );

  return {
    title: String(raw?.title || extras.fallbackTitle || '').trim().slice(0, 120),
    tag,
    category,
    minutes,
    prepMinutes,
    cookMinutes,
    portions: Math.max(1, Math.min(24, Number(raw?.portions) || 4)),
    description: String(raw?.description || '').trim().slice(0, 800),
    ingredients,
    instructions,
    sourceUrl: String(raw?.sourceUrl || extras.sourceUrl || '').trim().slice(0, 500),
    videoUrl: String(raw?.videoUrl || '').trim().slice(0, 500),
    suggestedImageUrl: String(
      raw?.suggestedImageUrl || extras.suggestedImageUrl || '',
    ).trim().slice(0, 500),
    emoji: String(raw?.emoji || '🍽️').trim().slice(0, 8) || '🍽️',
  };
}

function recipeFromJsonLd(node, extras = {}) {
  if (!node) return null;
  const ingredientsRaw = node.recipeIngredient || node.ingredients || [];
  const ingredients = (Array.isArray(ingredientsRaw) ? ingredientsRaw : [ingredientsRaw])
    .map((line) => {
      const text = String(line || '').trim();
      if (!text) return null;
      const m = text.match(/^([\d.,/]+\s*[a-zA-ZæøåÆØÅ.]*)\s+(.*)$/u);
      if (m) return { name: m[2].trim(), amount: m[1].trim() };
      return { name: text, amount: '' };
    })
    .filter(Boolean);

  const instructionsRaw = node.recipeInstructions || node.instructions || [];
  let instructions = '';
  if (typeof instructionsRaw === 'string') {
    instructions = instructionsRaw;
  } else if (Array.isArray(instructionsRaw)) {
    instructions = instructionsRaw.map((step, i) => {
      if (typeof step === 'string') return `${i + 1}. ${step}`;
      const text = step?.text || step?.name || '';
      return text ? `${i + 1}. ${text}` : '';
    }).filter(Boolean).join('\n');
  }

  const image = Array.isArray(node.image)
    ? (node.image[0]?.url || node.image[0] || '')
    : (node.image?.url || node.image || '');

  const totalTime = String(node.totalTime || node.cookTime || '');
  const minutesMatch = totalTime.match(/(\d+)/);
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 30;
  const yieldRaw = node.recipeYield || node.yield || 4;
  const portions = Number(String(yieldRaw).match(/\d+/)?.[0] || 4) || 4;

  return normalizeRecipe({
    title: node.name || '',
    description: node.description || '',
    ingredients,
    instructions,
    portions,
    minutes,
    cookMinutes: minutes,
    suggestedImageUrl: String(image || ''),
    sourceUrl: extras.sourceUrl || '',
    tag: 'Middag',
    category: 'rask',
  }, extras);
}

function parseIngredientsFromText(text) {
  const m = String(text || '').match(
    /INGREDIENSER([\s\S]*?)(?:SLIK GJØR DU|Fremgangsmåte|Instructions|Slik gjør du|TIL SERVERING)/i,
  ) || String(text || '').match(
    /Ingredienser([\s\S]*?)(?:Slik gjør du|Fremgangsmåte|Instructions)/i,
  );
  const body = (m?.[1] || '').trim();
  if (!body) return [];
  return body
    .split(/\n|•|\u2022/)
    .map((line) => line.trim())
    .filter((line) => line && !/^til servering$/i.test(line))
    .slice(0, 40)
    .map((line) => {
      const am = line.match(/^([\d.,/]+\s*(?:g|kg|ml|l|dl|ss|ts|stk|båt|fedd)?)(?:\s+)(.*)$/iu);
      if (am) return { name: am[2].trim(), amount: am[1].trim() };
      return { name: line, amount: '' };
    })
    .filter((i) => i.name);
}

function parseInstructionsFromText(text) {
  const m = String(text || '').match(
    /(?:SLIK GJØR DU|Slik gjør du|Fremgangsmåte|Instructions)([\s\S]{0,4000})$/i,
  );
  const body = (m?.[1] || '').trim();
  if (!body) return '';
  return body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l, i) => (/^\d+[.)]/.test(l) ? l : `${i + 1}. ${l}`))
    .join('\n');
}

async function fetchRecipePage(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      // Browser-like UA — some recipe blogs block generic bots.
      'User-Agent': 'Mozilla/5.0 (compatible; Weekplan/1.0; +https://protop.no)',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nb-NO,nb;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Klarte ikke hente nettsiden (${res.status}).`);
  const html = await res.text();
  const finalUrl = String(res.url || url);
  const text = stripHtml(html).slice(0, 24000);
  const ogImage = extractFeaturedImage(html, finalUrl);
  const title = extractPageTitle(html);
  const jsonLdList = extractJsonLdRecipes(html);
  return {
    text,
    ogImage,
    title,
    finalUrl,
    jsonLd: jsonLdList[0] || null,
  };
}

function localUrlFallback(page) {
  if (page?.jsonLd) {
    const fromLd = recipeFromJsonLd(page.jsonLd, {
      sourceUrl: page.finalUrl || '',
      suggestedImageUrl: page.ogImage || '',
      fallbackTitle: page.title || '',
    });
    if (fromLd?.title && (fromLd.ingredients.length || fromLd.instructions)) {
      return fromLd;
    }
  }

  const text = page?.text || '';
  const ingredients = parseIngredientsFromText(text);
  const instructions = parseInstructionsFromText(text) || text.slice(0, 1500);
  const titleMatch = text.match(
    /^(.{8,80}?)\s+(?:\d{1,2}\.\s+\w+|INGREDIENSER|Porsjoner)/i,
  );

  return normalizeRecipe({
    title: page?.title || titleMatch?.[1] || 'Importert oppskrift',
    description: text.slice(0, 220),
    instructions,
    ingredients,
    sourceUrl: page?.finalUrl || '',
    suggestedImageUrl: page?.ogImage || '',
    minutes: 30,
    portions: 4,
    tag: 'Middag',
    category: 'rask',
  }, {
    sourceUrl: page?.finalUrl || '',
    suggestedImageUrl: page?.ogImage || '',
  });
}

export async function handleAiRecipeImport(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const sourceUrl = String(data?.sourceUrl || data?.url || '').trim();
  const storagePath = String(data?.storagePath || '').trim();
  const imageBase64 = String(data?.imageBase64 || '').trim();

  if (!uid || !familyId) throw new Error('Mangler tilgang.');
  if (!sourceUrl && !storagePath && !imageBase64) {
    throw new Error('Send bilde eller en lenke til oppskriften.');
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error('Lenken må starte med http:// eller https://');
  }

  await assertFamilyAdult(getFirestore(), uid, familyId);
  await checkAndIncrementUsage(
    getFirestore(),
    familyId,
    uid,
    'meal',
    AI_LIMITS.mealsPerFamilyPerDay,
  );

  const apiKey = getGeminiKey();
  const userParts = [];
  let page = null;

  if (sourceUrl) {
    page = await fetchRecipePage(sourceUrl);
    userParts.push({
      text: `Importer denne oppskriften fra nettsiden ${page.finalUrl}.\n`
        + (page.title ? `Tittel-hint: ${page.title}\n` : '')
        + (page.ogImage ? `Forslagsbilde: ${page.ogImage}\n` : '')
        + (page.jsonLd
          ? 'JSON-LD recipe finnes i kilden — bruk den som fasit der den er komplett.\n'
          : '')
        + `\nTekst fra siden:\n${page.text}`,
    });
  }

  if (storagePath) {
    const img = await downloadImageBase64(storagePath);
    userParts.push({
      text: 'Tolker oppskriften på dette bildet. Fyll inn alle felt så komplett som mulig.',
    });
    userParts.push({
      inline_data: { mime_type: img.mime || 'image/jpeg', data: img.base64 },
    });
  } else if (imageBase64 && imageBase64.length > 80) {
    const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/i);
    userParts.push({
      text: 'Tolker oppskriften på dette bildet. Fyll inn alle felt så komplett som mulig.',
    });
    userParts.push({
      inline_data: {
        mime_type: mimeMatch?.[1] || 'image/jpeg',
        data: cleaned,
      },
    });
  }

  if (!apiKey) {
    if (page) {
      return { recipe: localUrlFallback(page), engine: 'local' };
    }
    throw new Error('AI er ikke tilgjengelig akkurat nå. Prøv igjen senere.');
  }

  try {
    const parsed = await callGeminiJson(apiKey, RECIPE_PROMPT, userParts, {
      maxOutputTokens: 4096,
      perModelTimeoutMs: 45000,
    });
    const recipe = normalizeRecipe(parsed, {
      sourceUrl: sourceUrl || page?.finalUrl || '',
      suggestedImageUrl: page?.ogImage || '',
      fallbackTitle: page?.title || '',
    });
    if (!recipe.title) {
      throw new Error('AI fant ingen tydelig oppskriftstittel.');
    }
    if (!recipe.ingredients.length && !recipe.instructions) {
      throw new Error('AI fant for lite informasjon i kilden.');
    }
    if (!recipe.sourceUrl && sourceUrl) recipe.sourceUrl = sourceUrl;
    if (!recipe.suggestedImageUrl && page?.ogImage) {
      recipe.suggestedImageUrl = page.ogImage;
    }
    return { recipe, engine: 'gemini' };
  } catch (err) {
    if (page) {
      const fallback = localUrlFallback(page);
      if (fallback.title && (fallback.ingredients.length || fallback.instructions)) {
        return {
          recipe: fallback,
          engine: 'local',
          warning: friendlyGeminiError(err),
        };
      }
    }
    throw new Error(friendlyGeminiError(err));
  }
}

/** Test helpers (not used in production call path). */
export const __test = {
  stripHtml,
  extractMeta,
  extractFeaturedImage,
  extractPageTitle,
  extractJsonLdRecipes,
  parseIngredientsFromText,
  parseInstructionsFromText,
  localUrlFallback,
  normalizeRecipe,
  recipeFromJsonLd,
};
