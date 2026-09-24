import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  getGeminiKey,
  assertFamilyAdult,
  checkAndIncrementUsage,
  callGeminiJson,
} from './aiShared.js';

const MEAL_PROMPT = `Du er en norsk matplanlegger. Lag en praktisk handleliste for én middag.
Returner KUN gyldig JSON:
{
  "summary": "kort setning om retten",
  "ingredients": [
    {
      "name": "varenavn på norsk",
      "amount": "mengde for oppgitt antall personer, f.eks. 400 g eller 2 stk",
      "category": "dairy|meat|produce|bread|pantry|frozen|snacks|drinks|household|general|other"
    }
  ]
}
Regler:
- Tilpass mengder til antall voksne og barn (barn ~70% porsjon).
- Kun varer man typisk kjøper — ikke «salt og pepper» med mindre det er hovedingrediens.
- 5–14 ingredienser, konkrete norske produktnavn.
- category = butikkhylle: meieri=dairy (ost, melk, baconost), kjøtt/fisk=meat (servelat, bacon), grønt=produce, bakeri=bread, pålegg & tørrvare=pantry (havregryn, pasta, hermetikk), frys=frozen, snacks, drikke=drinks, husholdning=household (kun vask/papir — ikke mat).`;

const CATEGORY_KEYS = new Set([
  'dairy', 'meat', 'produce', 'bread', 'pantry', 'frozen', 'snacks', 'drinks', 'household', 'general', 'other',
]);

function normalizeIngredient(raw, idx) {
  const category = CATEGORY_KEYS.has(raw?.category) ? raw.category : 'general';
  return {
    id: `i${idx + 1}`,
    name: String(raw?.name || '').trim().slice(0, 80),
    amount: String(raw?.amount || '').trim().slice(0, 40),
    category,
  };
}

function localMealFallback(title, adults, children) {
  const total = Math.max(1, adults + Math.round(children * 0.7));
  const dish = String(title || 'Middag').toLowerCase();
  const base = [
    { name: 'Poteter', amount: `${total * 200} g`, category: 'produce' },
    { name: 'Løk', amount: '1 stk', category: 'produce' },
  ];

  if (/fisk|laks|torsk|sei/.test(dish)) {
    return {
      summary: `Fiskemiddag for ${adults} voksne og ${children} barn`,
      ingredients: [
        { id: 'i1', name: 'Fisk/filet', amount: `${total * 180} g`, category: 'meat' },
        { id: 'i2', name: 'Smør', amount: '50 g', category: 'dairy' },
        { id: 'i3', name: 'Sitron', amount: '1 stk', category: 'produce' },
        ...base.map((x, i) => ({ ...x, id: `i${i + 4}` })),
      ],
      engine: 'local',
    };
  }

  if (/pasta|spaghetti|lasagne/.test(dish)) {
    return {
      summary: `Pastamiddag for ${adults} voksne og ${children} barn`,
      ingredients: [
        { id: 'i1', name: 'Pasta', amount: `${total * 80} g`, category: 'pantry' },
        { id: 'i2', name: 'Kjøttdeig', amount: `${total * 125} g`, category: 'meat' },
        { id: 'i3', name: 'Hermetisk tomater', amount: '1 boks', category: 'pantry' },
        { id: 'i4', name: 'Løk', amount: '1 stk', category: 'produce' },
        { id: 'i5', name: 'Revost', amount: '100 g', category: 'dairy' },
      ],
      engine: 'local',
    };
  }

  if (/taco|wrap|nachos/.test(dish)) {
    return {
      summary: `Tacomiddag for ${adults} voksne og ${children} barn`,
      ingredients: [
        { id: 'i1', name: 'Kjøttdeig', amount: `${total * 150} g`, category: 'meat' },
        { id: 'i2', name: 'Taco-kit / tortillalefser', amount: `${total} porsjoner`, category: 'pantry' },
        { id: 'i3', name: 'Rømme', amount: '1 beger', category: 'dairy' },
        { id: 'i4', name: 'Salat', amount: '1 pose', category: 'produce' },
        { id: 'i5', name: 'Tomat', amount: '3 stk', category: 'produce' },
      ],
      engine: 'local',
    };
  }

  if (/suppe/.test(dish)) {
    return {
      summary: `Suppe for ${adults} voksne og ${children} barn`,
      ingredients: [
        { id: 'i1', name: 'Grønnsaksbuljong', amount: '1 liter', category: 'general' },
        { id: 'i2', name: 'Rotgrønnsaker', amount: `${total * 150} g`, category: 'produce' },
        { id: 'i3', name: 'Kjøtt eller kylling', amount: `${total * 120} g`, category: 'meat' },
        { id: 'i4', name: 'Fløte', amount: '2 dl', category: 'dairy' },
      ],
      engine: 'local',
    };
  }

  return {
    summary: `${title} — ca. ${total} porsjoner`,
    ingredients: [
      { id: 'i1', name: 'Hovedingrediens', amount: `${total} porsjoner`, category: 'general' },
      { id: 'i2', name: 'Tilbehør/grønnsaker', amount: 'passende mengde', category: 'produce' },
      { id: 'i3', name: 'Krydder/saus', amount: '1 pk', category: 'general' },
      ...base.map((x, i) => ({ ...x, id: `i${i + 4}` })),
    ],
    engine: 'local',
  };
}

export async function handleAiMealIngredients(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const title = String(data?.title || '').trim();
  const adults = Math.max(0, Math.min(12, Number(data?.adults) || 2));
  const children = Math.max(0, Math.min(12, Number(data?.children) || 0));

  if (!uid || !familyId || !title) {
    throw new Error('Mangler familie eller rettnavn.');
  }
  if (title.length > 120) throw new Error('Rettnavnet er for langt.');

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);
  await checkAndIncrementUsage(db, familyId, uid, 'meal', AI_LIMITS.mealsPerFamilyPerDay);

  const apiKey = getGeminiKey();
  if (apiKey) {
    try {
      const userText = `Rett: ${title}\nVoksne: ${adults}\nBarn: ${children}`;
      const parsed = await callGeminiJson(apiKey, MEAL_PROMPT, [{ text: userText }]);
      const ingredients = (Array.isArray(parsed?.ingredients) ? parsed.ingredients : [])
        .map(normalizeIngredient)
        .filter((i) => i.name)
        .slice(0, 20);
      if (ingredients.length) {
        return {
          summary: String(parsed?.summary || '').trim().slice(0, 200),
          ingredients,
          engine: 'gemini',
        };
      }
    } catch {
      // fall through
    }
  }

  return localMealFallback(title, adults, children);
}

export async function saveMealIngredients(db, familyId, mealId, payload) {
  await db.doc(`families/${familyId}/meals/${mealId}`).set({
    ingredients: payload.ingredients || [],
    ingredientsSummary: payload.summary || '',
    ingredientsStatus: 'ready',
    ingredientsEngine: payload.engine || 'local',
    ingredientsGeneratedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
