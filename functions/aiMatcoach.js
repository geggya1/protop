/**
 * AI Matcoach — ukeplan, AI-lagerskanner og matpakker.
 * Inspirert av matbokser.no / Mealime / Ollie: familietilpasset plan + forklaring.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  AI_LIMITS,
  getGeminiKey,
  assertFamilyAdult,
  checkAndIncrementUsage,
  callGeminiJson,
} from './aiShared.js';

const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

const WEEK_PROMPT = `Du er en norsk AI-matcoach for familier (som matbokser.no / Mealime).
Lag en realistisk middagsuke. Returner KUN gyldig JSON:
{
  "headline": "kort slagord",
  "summary": "1-2 setninger om hvorfor planen passer familien",
  "estimatedWeeklyCostKr": 900,
  "days": [
    {
      "dayIndex": 0,
      "dayName": "Mandag",
      "title": "rettnavn",
      "minutes": 30,
      "kcal": 580,
      "tags": ["Sunn", "Raskt"],
      "whyChosen": "hvorfor denne dagen",
      "description": "kort beskrivelse av retten",
      "instructions": "nummererte steg for tilberedning (3-6 steg)",
      "ingredients": [{"name": "vare", "amount": "mengde", "category": "produce"}],
      "recipeId": "valgfri-id-fra-katalog-eller-tom",
      "emoji": "🍲"
    }
  ]
}
Regler:
- dayIndex 0=mandag … 6=søndag. Alle 7 dager.
- Varier protein (ikke samme hovedprotein to dager på rad).
- Respekter allergier, unngåelser, maksMinutter, budsjett og kosthold.
- Bruk gjerne oppskrifter fra katalogen (recipeId) når de passer — prioriter katalog-id-er.
- instructions: konkrete norske steg med linjeskift.
- Norske produktnavn. 5–12 ingredienser per rett.
- category: dairy|meat|produce|bread|pantry|frozen|snacks|drinks|household|general|other
  (meieri=dairy inkl. baconost; kjøtt/fisk=meat inkl. servelat; tørrvare/pålegg=pantry inkl. havregryn; husholdning kun vask/papir)
- Barnvennlig når children > 0. Hold estimert ukekost under budsjett hvis oppgitt.`;

const FRIDGE_PROMPT = `Du er en norsk AI-lagerskanner for familier. Analyser bildet (kjøleskap, fryser, skap eller disk) og list synlige matvarer.
Returner KUN gyldig JSON:
{
  "summary": "kort oppsummering",
  "items": [
    {
      "name": "varenavn på norsk",
      "amountText": "ca. mengde hvis synlig, ellers tom",
      "location": "fridge|freezer|pantry|other",
      "category": "produce|dairy|meat|bread|pantry|frozen|snacks|drinks|household|general|other",
      "confidence": 0.0
    }
  ],
  "mealIdeas": [
    { "title": "rettforslag", "minutes": 25, "why": "bruker X og Y", "emoji": "🥗" }
  ]
}
Regler:
- Kun matvarer du faktisk ser (ikke spekuler vilt).
- 3–20 items. confidence 0–1.
- location: fridge (kjøleskap), freezer (fryser), pantry (tørrvare/skap), other (annet).
- Velg location ut fra bildet og typisk oppbevaring (f.eks. iskrem → freezer, hermetikk → pantry, melk → fridge).
- 2–4 mealIdeas som bruker det som er i bildet.`;

const PANTRY_LOCATION_IDS = new Set(['fridge', 'freezer', 'pantry', 'other']);

function normalizeScanLocation(location, category) {
  const loc = String(location || '').trim().toLowerCase();
  if (PANTRY_LOCATION_IDS.has(loc)) return loc;
  const c = String(category || '').toLowerCase();
  if (c === 'frozen') return 'freezer';
  if (c === 'dairy' || c === 'meat' || c === 'produce' || c === 'drinks') return 'fridge';
  if (c === 'household' || c === 'other') return 'other';
  if (c === 'bread' || c === 'snacks' || c === 'general' || c === 'pantry') return 'pantry';
  return 'fridge';
}

const LUNCH_PROMPT = `Du er en norsk matpakke-coach for skole/jobb.
Returner KUN gyldig JSON:
{
  "summary": "kort tekst",
  "boxes": [
    {
      "dayIndex": 0,
      "dayName": "Mandag",
      "title": "matpakke-navn",
      "minutes": 10,
      "tags": ["Matro", "Barn"],
      "whyChosen": "hvorfor",
      "items": [{"name": "element", "amount": "mengde"}],
      "emoji": "🥪"
    }
  ]
}
Regler:
- 5 skoledager (Mandag–Fredag) med dayIndex 0–4.
- Enkel å forberede kvelden før. Variasjon. Allergivennlig.
- Kun kaldsikre matpakker (ingen varme gryter). Merk tags med «Kald» når relevant.
- Skill våte og tørre komponenter i items når det gir mening.`;

const SWAP_PROMPT = `Du er en norsk AI-matcoach. Foreslå ÉN alternativ middag som erstatter den oppgitte.
Returner KUN gyldig JSON:
{
  "title": "rettnavn",
  "minutes": 30,
  "kcal": 550,
  "tags": ["Raskt"],
  "whyChosen": "hvorfor bytte",
  "description": "kort",
  "ingredients": [{"name": "vare", "amount": "mengde", "category": "general"}],
  "recipeId": "",
  "emoji": "🍽️"
}`;

const CATEGORY_KEYS = new Set([
  'dairy', 'meat', 'produce', 'bread', 'frozen', 'snacks', 'drinks', 'household', 'general', 'other',
]);

const LOCAL_DINNERS = [
  {
    title: 'Kyllingwok med grønnsaker',
    minutes: 25, kcal: 490, tags: ['Raskt', 'Sunn', 'Wok'],
    emoji: '🥡', recipeId: 'middag-wok',
    description: 'Rask wok med kylling, wokgrønnsaker og ris.',
    whyChosen: 'Bruker restgrønnsaker og er ferdig på 25 min.',
    instructions: '1. Skjær kylling i strimler.\n2. Wok kylling, tilsett grønnsaker.\n3. Smak til med soya og server med ris.',
    ingredients: [
      { name: 'Kyllingfilet', amount: '500 g', category: 'meat' },
      { name: 'Wokgrønnsaker', amount: '500 g', category: 'frozen' },
      { name: 'Ris', amount: '300 g', category: 'pantry' },
      { name: 'Soyasaus', amount: '3 ss', category: 'pantry' },
    ],
  },
  {
    title: 'Kremet tomatpasta',
    minutes: 25, kcal: 610, tags: ['Raskt', 'Familiefavoritt', 'Pasta'],
    emoji: '🍝', recipeId: 'tomatpasta',
    description: 'Rask pasta med tomat, hvitløk og fløte.',
    whyChosen: 'Under 30 minutter og barna elsker den.',
    instructions: '1. Kok pasta.\n2. Fres løk og hvitløk, tilsett tomater og fløte.\n3. Bland med pasta og server.',
    ingredients: [
      { name: 'Pasta', amount: '400 g', category: 'pantry' },
      { name: 'Hermetiske tomater', amount: '2 bokser', category: 'pantry' },
      { name: 'Fløte', amount: '2 dl', category: 'dairy' },
      { name: 'Hvitløk', amount: '2 fedd', category: 'produce' },
      { name: 'Løk', amount: '1 stk', category: 'produce' },
    ],
  },
  {
    title: 'Kjøttkaker i brun saus',
    minutes: 45, kcal: 640, tags: ['Tradisjon', 'Familiefavoritt'],
    emoji: '🍖', recipeId: 'kjottkaker',
    description: 'Klassiske kjøttkaker med poteter og erter.',
    whyChosen: 'Trygg familiefavoritt midt i uka.',
    instructions: '1. Form kjøttkaker og stek dem.\n2. Lag brun saus.\n3. Kok poteter og erter, server sammen.',
    ingredients: [
      { name: 'Kjøttdeig', amount: '600 g', category: 'meat' },
      { name: 'Poteter', amount: '1 kg', category: 'produce' },
      { name: 'Erter', amount: '300 g', category: 'frozen' },
      { name: 'Melk', amount: '2 dl', category: 'dairy' },
      { name: 'Løk', amount: '1 stk', category: 'produce' },
    ],
  },
  {
    title: 'Taco med kjøttdeig',
    minutes: 30, kcal: 670, tags: ['Familiefavoritt', 'Fredag'],
    emoji: '🌮', recipeId: 'taco',
    description: 'Fredagstaco med kjøttdeig, lefser og tilbehør.',
    whyChosen: 'Fredagsfavoritt som hele familien blir enige om.',
    instructions: '1. Stek kjøttdeig med tacokrydder.\n2. Sett frem lefser og tilbehør.\n3. La alle bygge sin egen taco.',
    ingredients: [
      { name: 'Kjøttdeig', amount: '600 g', category: 'meat' },
      { name: 'Tortillalefser', amount: '12 stk', category: 'bread' },
      { name: 'Rømme', amount: '1 beger', category: 'dairy' },
      { name: 'Salat', amount: '1 pose', category: 'produce' },
      { name: 'Tomat', amount: '3 stk', category: 'produce' },
    ],
  },
  {
    title: 'Fiskeboller i hvit saus',
    minutes: 30, kcal: 520, tags: ['Sunn', 'Fisk', 'Familiefavoritt'],
    emoji: '🐟', recipeId: 'fiskeboller',
    description: 'Klassiske fiskeboller i mild hvit saus med poteter.',
    whyChosen: 'Mild fiskemiddag som de fleste barn liker.',
    instructions: '1. Kok poteter.\n2. Varm fiskeboller i hvit saus.\n3. Server med gulrøtter eller erter.',
    ingredients: [
      { name: 'Fiskeboller', amount: '2 pk', category: 'meat' },
      { name: 'Poteter', amount: '1 kg', category: 'produce' },
      { name: 'Melk', amount: '4 dl', category: 'dairy' },
      { name: 'Smør', amount: '50 g', category: 'dairy' },
    ],
  },
  {
    title: 'Kremet fiskesuppe',
    minutes: 35, kcal: 430, tags: ['Sunn', 'Suppe', 'Fisk'],
    emoji: '🥣', recipeId: 'fiskesuppe',
    description: 'Mild fiskesuppe med rotgrønnsaker og fløte.',
    whyChosen: 'Lett søndagsmiddag med god smak.',
    instructions: '1. Kok rotgrønnsaker i buljong.\n2. Tilsett fisk og fløte.\n3. Smak til og server med brød.',
    ingredients: [
      { name: 'Hvitfisk', amount: '500 g', category: 'meat' },
      { name: 'Gulrot', amount: '3 stk', category: 'produce' },
      { name: 'Sellerirot', amount: '200 g', category: 'produce' },
      { name: 'Fløte', amount: '2 dl', category: 'dairy' },
      { name: 'Fiskebuljong', amount: '1 liter', category: 'pantry' },
    ],
  },
  {
    title: 'Pytt i panne',
    minutes: 25, kcal: 580, tags: ['Raskt', 'Restemat'],
    emoji: '🍳', recipeId: 'pyttipanne',
    description: 'Rask panne med poteter, løk og kjøttrester.',
    whyChosen: 'Perfekt når dere vil bruke det som er i kjøleskapet.',
    instructions: '1. Terning poteter og stek sprø.\n2. Tilsett løk og kjøtt.\n3. Server med speilegg om ønskelig.',
    ingredients: [
      { name: 'Poteter', amount: '800 g', category: 'produce' },
      { name: 'Løk', amount: '1 stk', category: 'produce' },
      { name: 'Kjøttrester', amount: '300 g', category: 'meat' },
      { name: 'Egg', amount: '4 stk', category: 'dairy' },
    ],
  },
];

const LOCAL_LUNCHBOXES = [
  { title: 'Grove knekkebrød med ost og skinke', minutes: 8, emoji: '🥪', tags: ['Klassisk', 'Kald'], items: [{ name: 'Knekkebrød', amount: '4 stk' }, { name: 'Ost', amount: '4 skiver' }, { name: 'Skinke', amount: '4 skiver' }, { name: 'Agurk', amount: '½ stk' }] },
  { title: 'Wrap med kylling og salat', minutes: 12, emoji: '🌯', tags: ['Matro', 'Kald'], items: [{ name: 'Tortilla', amount: '2 stk' }, { name: 'Kyllingrest', amount: '150 g' }, { name: 'Salat', amount: '1 neve' }, { name: 'Majones (egen beholder)', amount: '1 ss' }] },
  { title: 'Pastasalat med grønnsaker', minutes: 15, emoji: '🥗', tags: ['Sunn', 'Kald'], items: [{ name: 'Kokt pasta', amount: '200 g' }, { name: 'Paprika', amount: '½ stk' }, { name: 'Mais', amount: '50 g' }, { name: 'Osteterninger', amount: '40 g' }] },
  { title: 'Grove rundstykker med egg og tomat', minutes: 10, emoji: '🥚', tags: ['Protein', 'Kald'], items: [{ name: 'Rundstykke', amount: '2 stk' }, { name: 'Egg', amount: '2 stk' }, { name: 'Tomat', amount: '1 stk' }, { name: 'Smør', amount: '1 ss' }] },
  { title: 'Restemiddag i boks + frukt', minutes: 5, emoji: '🍱', tags: ['Restemat', 'Kald'], items: [{ name: 'Restemiddag (avkjølt)', amount: '1 porsjon' }, { name: 'Eple', amount: '1 stk' }, { name: 'Yoghurt', amount: '1 beger' }] },
];

function normalizeIngredient(raw, idx) {
  const category = CATEGORY_KEYS.has(raw?.category) ? raw.category : 'general';
  return {
    id: `i${idx + 1}`,
    name: String(raw?.name || '').trim().slice(0, 80),
    amount: String(raw?.amount || raw?.amountText || '').trim().slice(0, 40),
    category,
  };
}

function normalizePrefs(raw = {}) {
  return {
    diet: String(raw.diet || 'classic').trim().slice(0, 40),
    allergies: Array.isArray(raw.allergies) ? raw.allergies.map((a) => String(a).trim()).filter(Boolean).slice(0, 20) : [],
    dislikes: Array.isArray(raw.dislikes) ? raw.dislikes.map((a) => String(a).trim()).filter(Boolean).slice(0, 30) : [],
    maxMinutes: Math.max(15, Math.min(120, Number(raw.maxMinutes) || 40)),
    budgetKr: Math.max(200, Math.min(5000, Number(raw.budgetKr) || 1200)),
    adults: Math.max(0, Math.min(12, Number(raw.adults) || 2)),
    children: Math.max(0, Math.min(12, Number(raw.children) || 0)),
    goals: Array.isArray(raw.goals) ? raw.goals.map((g) => String(g).trim()).filter(Boolean).slice(0, 10) : ['familie', 'raskt'],
    includeLunchboxes: raw.includeLunchboxes !== false,
  };
}

function dishBlocked(dish, prefs) {
  const hay = `${dish.title} ${dish.description || ''} ${(dish.ingredients || []).map((i) => i.name).join(' ')}`.toLowerCase();
  for (const a of prefs.allergies) {
    if (a && hay.includes(String(a).toLowerCase())) return true;
  }
  for (const d of prefs.dislikes) {
    if (d && hay.includes(String(d).toLowerCase())) return true;
  }
  if (prefs.diet === 'vegetarian' || prefs.diet === 'vegetar') {
    if (/svine|kjøtt|kylling|biff|fisk|laks|taco med kjøtt|kjøttkaker/i.test(hay) && !/vegetar|linse/i.test(hay)) {
      return !/linse|vegetar/i.test(dish.title);
    }
  }
  if ((dish.minutes || 99) > prefs.maxMinutes) return true;
  return false;
}

function localWeekPlan(prefs, catalog = []) {
  const pool = [
    ...LOCAL_DINNERS,
    ...(Array.isArray(catalog) ? catalog : []).map((r) => ({
      title: r.title,
      minutes: r.minutes || 30,
      kcal: r.kcal || 550,
      tags: r.tags || [r.category || 'Middag'].filter(Boolean),
      emoji: r.emoji || '🍽️',
      recipeId: r.id || r.recipeId || '',
      description: r.description || '',
      whyChosen: 'Valgt fra familiens oppskriftskatalog.',
      ingredients: (r.ingredients || []).map((ing, i) => normalizeIngredient(ing, i)),
    })),
  ].filter((d) => !dishBlocked(d, prefs));

  const usable = pool.length ? pool : LOCAL_DINNERS;
  const days = [];
  let cost = 0;
  for (let i = 0; i < 7; i += 1) {
    const dish = usable[(i * 3) % usable.length];
    const next = usable[(i * 3 + 1) % usable.length];
    const pick = i === 5 && usable.find((d) => /taco/i.test(d.title)) ? usable.find((d) => /taco/i.test(d.title)) : (i % 2 === 0 ? dish : next);
    cost += Math.round((prefs.budgetKr || 1200) / 7);
    days.push({
      dayIndex: i,
      dayName: WEEKDAYS[i],
      title: pick.title,
      minutes: pick.minutes || 30,
      kcal: pick.kcal || 550,
      tags: pick.tags || [],
      whyChosen: pick.whyChosen || 'Passer familiens preferanser.',
      description: pick.description || '',
      instructions: pick.instructions || '',
      ingredients: (pick.ingredients || []).map((ing, idx) => normalizeIngredient(ing, idx)),
      recipeId: pick.recipeId || '',
      emoji: pick.emoji || '🍽️',
    });
  }
  return {
    headline: 'Ukeplanen lager seg selv',
    summary: `Familietilpasset plan for ${prefs.adults} voksne og ${prefs.children} barn · maks ${prefs.maxMinutes} min.`,
    estimatedWeeklyCostKr: Math.min(prefs.budgetKr, cost || prefs.budgetKr),
    days,
    engine: 'local',
  };
}

function localFridgeScan(hintText = '') {
  const base = [
    { name: 'Melk', amountText: '1 liter', location: 'fridge', category: 'dairy', confidence: 0.55 },
    { name: 'Egg', amountText: '6 stk', location: 'fridge', category: 'dairy', confidence: 0.5 },
    { name: 'Ost', amountText: '', location: 'fridge', category: 'dairy', confidence: 0.45 },
    { name: 'Gulrot', amountText: 'pose', location: 'fridge', category: 'produce', confidence: 0.4 },
    { name: 'Smør', amountText: '', location: 'fridge', category: 'dairy', confidence: 0.4 },
  ];
  const fromHint = String(hintText || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((name) => {
      const lower = name.toLowerCase()
        .replace(/ø/g, 'o')
        .replace(/æ/g, 'ae')
        .replace(/å/g, 'a');
      let category = 'general';
      let location = 'pantry';
      // Meieri før kjøtt (baconost)
      if (/\bost\b/.test(lower) || /(?:^|[^a-z])[a-z]+ost(?:[^a-z]|$)/.test(lower) || /melk|egg|smor|yoghurt|flote|krem|romme/.test(lower)) {
        category = 'dairy';
        location = 'fridge';
      } else if (/servelat|salami|palse|polse|skinke|kylling|kjott|fisk|bacon/.test(lower)) {
        category = 'meat';
        location = 'fridge';
      } else if (/salat|gulrot|agurk|tomat|paprika|eple|banan/.test(lower)) {
        category = 'produce';
        location = 'fridge';
      } else if (/is|frossen|pizza|baer/.test(lower)) {
        category = 'frozen';
        location = 'freezer';
      } else if (/havregryn|havre|pasta|ris|mel\b|hermetikk|boks|musli|gryn/.test(lower)) {
        category = 'pantry';
        location = 'pantry';
      } else if (/brod|knekkebrod/.test(lower)) {
        category = 'bread';
        location = 'pantry';
      }
      return {
        name,
        amountText: '',
        location,
        category,
        confidence: 0.7,
      };
    });
  const items = fromHint.length ? fromHint : base;
  return {
    summary: fromHint.length
      ? `Fant ${items.length} varer fra listen din.`
      : 'AI-bildeanalyse utilgjengelig — legg til varer manuelt eller prøv igjen.',
    items,
    mealIdeas: [
      { title: 'Omelett med ost og gulrotstav', minutes: 15, why: 'Bruker egg, ost og gulrot', emoji: '🍳' },
      { title: 'Grøt eller yoghurt-frokost + restemiddag', minutes: 10, why: 'Rask bruk av meieri', emoji: '🥣' },
    ],
    engine: 'local',
  };
}

function localLunchBoxes(prefs) {
  const boxes = LOCAL_LUNCHBOXES.map((b, i) => ({
    dayIndex: i,
    dayName: WEEKDAYS[i],
    title: b.title,
    minutes: b.minutes,
    tags: b.tags,
    whyChosen: prefs.children > 0 ? 'Enkel matpakke som funker for skolebarn.' : 'Rask jobb-matpakke.',
    items: b.items,
    emoji: b.emoji,
  }));
  return {
    summary: 'Fem matpakker klare for skolen / jobben.',
    boxes,
    engine: 'local',
  };
}

function normalizeWeekPlan(parsed, prefs, engine) {
  const daysIn = Array.isArray(parsed?.days) ? parsed.days : [];
  const days = WEEKDAYS.map((dayName, i) => {
    const raw = daysIn.find((d) => Number(d?.dayIndex) === i) || daysIn[i] || {};
    return {
      dayIndex: i,
      dayName,
      title: String(raw.title || `Middag ${dayName}`).trim().slice(0, 120),
      minutes: Math.max(10, Math.min(180, Number(raw.minutes) || 30)),
      kcal: Math.max(200, Math.min(1500, Number(raw.kcal) || 550)),
      tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).slice(0, 30)).slice(0, 6) : [],
      whyChosen: String(raw.whyChosen || '').trim().slice(0, 240),
      description: String(raw.description || '').trim().slice(0, 400),
      instructions: String(raw.instructions || '').trim().slice(0, 1200),
      ingredients: (Array.isArray(raw.ingredients) ? raw.ingredients : [])
        .map(normalizeIngredient)
        .filter((x) => x.name)
        .slice(0, 16),
      recipeId: String(raw.recipeId || '').trim().slice(0, 80),
      emoji: String(raw.emoji || '🍽️').slice(0, 4),
    };
  });
  return {
    headline: String(parsed?.headline || 'Ukeplanen lager seg selv').trim().slice(0, 80),
    summary: String(parsed?.summary || '').trim().slice(0, 300),
    estimatedWeeklyCostKr: Math.max(
      100,
      Math.min(8000, Number(parsed?.estimatedWeeklyCostKr) || prefs.budgetKr || 1200),
    ),
    days,
    engine,
  };
}

export async function handleAiMatcoachWeekPlan(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  if (!uid || !familyId) throw new Error('Mangler familie.');

  const prefs = normalizePrefs(data?.prefs);
  const catalog = Array.isArray(data?.catalog) ? data.catalog.slice(0, 40) : [];
  const pantryNames = Array.isArray(data?.pantryNames)
    ? data.pantryNames.map((n) => String(n).trim()).filter(Boolean).slice(0, 40)
    : [];

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);
  await checkAndIncrementUsage(db, familyId, uid, 'meal', AI_LIMITS.mealsPerFamilyPerDay);

  const apiKey = getGeminiKey();
  if (apiKey) {
    try {
      const userText = [
        `Preferanser: ${JSON.stringify(prefs)}`,
        pantryNames.length ? `Lager hjemme: ${pantryNames.join(', ')}` : '',
        catalog.length
          ? `Oppskriftskatalog (bruk recipeId når mulig):\n${catalog.map((r) => `- ${r.id || ''}: ${r.title} (${r.minutes || '?'} min)`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n');
      const parsed = await callGeminiJson(apiKey, WEEK_PROMPT, [{ text: userText }], {
        maxOutputTokens: 4096,
        perModelTimeoutMs: 50000,
      });
      const plan = normalizeWeekPlan(parsed, prefs, 'gemini');
      if (plan.days.every((d) => d.title)) {
        await saveMatcoachHistory(db, familyId, uid, 'weekPlan', plan);
        return plan;
      }
    } catch {
      // fall through
    }
  }

  const plan = localWeekPlan(prefs, catalog);
  await saveMatcoachHistory(db, familyId, uid, 'weekPlan', plan);
  return plan;
}

export async function handleAiMatcoachFridgeScan(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const imageBase64 = String(data?.imageBase64 || '').trim();
  const hintText = String(data?.hintText || '').trim().slice(0, 500);

  if (!uid || !familyId) throw new Error('Mangler familie.');
  if (!imageBase64 && !hintText) throw new Error('Send bilde av lageret eller en vareliste.');

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);
  await checkAndIncrementUsage(db, familyId, uid, 'meal', AI_LIMITS.mealsPerFamilyPerDay);

  const apiKey = getGeminiKey();
  if (apiKey && imageBase64.length > 80) {
    try {
      const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/i);
      const userParts = [
        { text: `Skann lageret (kjøleskap/fryser/skap).${hintText ? ` Ekstra hint: ${hintText}` : ''}` },
        {
          inline_data: {
            mime_type: mimeMatch?.[1] || 'image/jpeg',
            data: cleaned,
          },
        },
      ];
      const parsed = await callGeminiJson(apiKey, FRIDGE_PROMPT, userParts, {
        maxOutputTokens: 3072,
        perModelTimeoutMs: 45000,
      });
      const items = (Array.isArray(parsed?.items) ? parsed.items : [])
        .map((it) => {
          const category = CATEGORY_KEYS.has(it?.category) ? it.category : 'general';
          return {
            name: String(it?.name || '').trim().slice(0, 80),
            amountText: String(it?.amountText || '').trim().slice(0, 40),
            location: normalizeScanLocation(it?.location, category),
            category,
            confidence: Math.max(0, Math.min(1, Number(it?.confidence) || 0.5)),
          };
        })
        .filter((it) => it.name)
        .slice(0, 25);
      if (items.length) {
        return {
          summary: String(parsed?.summary || '').trim().slice(0, 240),
          items,
          mealIdeas: (Array.isArray(parsed?.mealIdeas) ? parsed.mealIdeas : [])
            .map((m) => ({
              title: String(m?.title || '').trim().slice(0, 100),
              minutes: Number(m?.minutes) || 25,
              why: String(m?.why || '').trim().slice(0, 160),
              emoji: String(m?.emoji || '🍽️').slice(0, 4),
            }))
            .filter((m) => m.title)
            .slice(0, 6),
          engine: 'gemini',
        };
      }
    } catch {
      // fall through
    }
  }

  return localFridgeScan(hintText);
}

export async function handleAiMatcoachLunchBoxes(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  if (!uid || !familyId) throw new Error('Mangler familie.');

  const prefs = normalizePrefs(data?.prefs);
  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);
  await checkAndIncrementUsage(db, familyId, uid, 'meal', AI_LIMITS.mealsPerFamilyPerDay);

  const apiKey = getGeminiKey();
  if (apiKey) {
    try {
      const parsed = await callGeminiJson(
        apiKey,
        LUNCH_PROMPT,
        [{ text: `Preferanser: ${JSON.stringify(prefs)}` }],
        { maxOutputTokens: 3072, perModelTimeoutMs: 40000 },
      );
      const boxes = (Array.isArray(parsed?.boxes) ? parsed.boxes : [])
        .map((b, i) => ({
          dayIndex: Number.isFinite(Number(b?.dayIndex)) ? Number(b.dayIndex) : i,
          dayName: String(b?.dayName || WEEKDAYS[i] || `Dag ${i + 1}`).slice(0, 20),
          title: String(b?.title || '').trim().slice(0, 120),
          minutes: Number(b?.minutes) || 10,
          tags: Array.isArray(b?.tags) ? b.tags.map((t) => String(t).slice(0, 30)).slice(0, 5) : [],
          whyChosen: String(b?.whyChosen || '').trim().slice(0, 200),
          items: (Array.isArray(b?.items) ? b.items : [])
            .map((it, idx) => ({
              id: `l${idx + 1}`,
              name: String(it?.name || '').trim().slice(0, 80),
              amount: String(it?.amount || '').trim().slice(0, 40),
            }))
            .filter((it) => it.name)
            .slice(0, 12),
          emoji: String(b?.emoji || '🥪').slice(0, 4),
        }))
        .filter((b) => b.title)
        .slice(0, 5);
      if (boxes.length >= 3) {
        const result = {
          summary: String(parsed?.summary || '').trim().slice(0, 240),
          boxes,
          engine: 'gemini',
        };
        await saveMatcoachHistory(db, familyId, uid, 'lunchBoxes', result);
        return result;
      }
    } catch {
      // fall through
    }
  }

  const result = localLunchBoxes(prefs);
  await saveMatcoachHistory(db, familyId, uid, 'lunchBoxes', result);
  return result;
}

export async function handleAiMatcoachSwapMeal(data, auth) {
  const uid = auth?.uid;
  const familyId = String(data?.familyId || '').trim();
  const currentTitle = String(data?.currentTitle || '').trim();
  if (!uid || !familyId || !currentTitle) throw new Error('Mangler rett å bytte.');

  const prefs = normalizePrefs(data?.prefs);
  const avoidTitles = Array.isArray(data?.avoidTitles)
    ? data.avoidTitles.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];

  const db = getFirestore();
  await assertFamilyAdult(db, uid, familyId);
  await checkAndIncrementUsage(db, familyId, uid, 'meal', AI_LIMITS.mealsPerFamilyPerDay);

  const apiKey = getGeminiKey();
  if (apiKey) {
    try {
      const parsed = await callGeminiJson(
        apiKey,
        SWAP_PROMPT,
        [{
          text: `Bytt ut: ${currentTitle}\nUnngå: ${avoidTitles.join(', ')}\nPreferanser: ${JSON.stringify(prefs)}`,
        }],
        { maxOutputTokens: 2048, perModelTimeoutMs: 30000 },
      );
      const title = String(parsed?.title || '').trim();
      if (title && title.toLowerCase() !== currentTitle.toLowerCase()) {
        return {
          title: title.slice(0, 120),
          minutes: Number(parsed?.minutes) || 30,
          kcal: Number(parsed?.kcal) || 550,
          tags: Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 6) : [],
          whyChosen: String(parsed?.whyChosen || '').trim().slice(0, 240),
          description: String(parsed?.description || '').trim().slice(0, 400),
          ingredients: (Array.isArray(parsed?.ingredients) ? parsed.ingredients : [])
            .map(normalizeIngredient)
            .filter((i) => i.name)
            .slice(0, 16),
          recipeId: String(parsed?.recipeId || '').trim().slice(0, 80),
          emoji: String(parsed?.emoji || '🍽️').slice(0, 4),
          engine: 'gemini',
        };
      }
    } catch {
      // fall through
    }
  }

  const pool = LOCAL_DINNERS.filter(
    (d) => !dishBlocked(d, prefs)
      && d.title.toLowerCase() !== currentTitle.toLowerCase()
      && !avoidTitles.includes(d.title.toLowerCase()),
  );
  const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))] || LOCAL_DINNERS[0];
  return {
    ...pick,
    ingredients: (pick.ingredients || []).map(normalizeIngredient),
    engine: 'local',
  };
}

async function saveMatcoachHistory(db, familyId, uid, kind, payload) {
  try {
    await db.collection(`families/${familyId}/matcoachHistory`).add({
      kind,
      headline: payload.headline || payload.summary || kind,
      summary: payload.summary || '',
      engine: payload.engine || 'local',
      dayCount: Array.isArray(payload.days) ? payload.days.length : (Array.isArray(payload.boxes) ? payload.boxes.length : 0),
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      snapshot: {
        days: payload.days || null,
        boxes: payload.boxes || null,
        estimatedWeeklyCostKr: payload.estimatedWeeklyCostKr || null,
      },
    });
  } catch {
    // history is best-effort
  }
}

export const __test = {
  normalizePrefs,
  dishBlocked,
  localWeekPlan,
  localFridgeScan,
  localLunchBoxes,
  normalizeWeekPlan,
  LOCAL_DINNERS,
};
