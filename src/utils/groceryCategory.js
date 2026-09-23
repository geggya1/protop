/** Handleliste-kategorier brukt i matplan og handleliste. */
export const SHOPPING_CATEGORY_KEYS = [
  'produce', 'meat', 'dairy', 'bread', 'pantry', 'frozen', 'general',
  'snacks', 'drinks', 'household', 'other',
];

export const SHOPPING_CATEGORY_LABELS = {
  produce: 'Frukt & grønt',
  meat: 'Kjøtt & fisk',
  dairy: 'Meieri',
  bread: 'Bakeri',
  pantry: 'Pålegg & tørrvare',
  frozen: 'Frys',
  general: 'Generelt',
  snacks: 'Snacks',
  drinks: 'Drikke',
  household: 'Husholdning',
  other: 'Annet',
};

/**
 * Typisk norsk butikk-rekkefølge (inngang → frukt → … → kasse).
 * Meieri før kjøttdisk — speiler vanlig Rema/Kiwi/Coop-flyt der ost/melk
 * kommer før ferskvare, og pålegg/tørrvare etterpå.
 */
export const AISLE_ORDER = [
  'produce',
  'bread',
  'dairy',
  'meat',
  'pantry',
  'frozen',
  'drinks',
  'snacks',
  'household',
  'general',
  'other',
];

const KNOWN = new Set(SHOPPING_CATEGORY_KEYS);

function norm(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Ord som slutter på «ost» men ikke er ost (kost, most/eplemost). */
function isNonCheeseOstWord(t) {
  return /(?:^|[^a-z])(?:[a-z]*kost|[a-z]*most)(?:[^a-z]|$)/.test(t);
}

/** Sammensatte ostenavn (baconost, skinkeost) + vanlige meieriord. */
function matchesDairy(t) {
  if (/\b(melk|flote|romme|kesam|yoghurt|yogurt|smor|parmesan|gulost|brunost|egg|cottage|creme fraiche|kremost|skyr|kvarg|biola|cultura|lettmelk|helmelk|skimmet)\b/.test(t)) {
    return true;
  }
  if (/seterromme|revost|matflote|matlagingsflote|vispflote|rorom|snofrisk|norvegia|jarlsberg|gamalost|nokkelost|hvitost|blaamugg|feta\b|mozarella|mozzarella|ricotta|mascarpone|camembert|\bbrie\b|cheddar|philadelphia/.test(t)) {
    return true;
  }
  // «ost» alene, eller sammensatt *ost (baconost) — ikke kost/most
  if (/\bost\b/.test(t)) return true;
  if (/(?:^|[^a-z])[a-z]+ost(?:[^a-z]|$)/.test(t) && !isNonCheeseOstWord(t)) return true;
  return false;
}

/** Fersk kjøtt/fisk + spekemat/pålegg av kjøtt (servelat, salami). */
function matchesMeat(t) {
  return /laks|torsk|sei|makrell|orret|reke|scampi|fiskeboll|fiskekake|kjottdeig|kjottkake|bacon|flesk|kylling|kalkun|svinekjott|oksekjott|lammekjott|pinnekjott|spekeskinke|skinke|palse|polse|kjott|biff|burger|karbonade|filet|servelat|salami|mortadella|pepperoni|chorizo|kabanoss|medister|ribbe|kotelett|entrecote|ytrefilet|indrefilet|spekemat|spekepolse|hotdog|wienerpolse|grillpolse|pulled.?pork|kjottpalegg/
    .test(t)
    || /\bfisk\b/.test(t);
}

/**
 * Tørrvare, hermetikk, frokostblanding, samt leverpostei/kaviar (pålegg-disken).
 * Havregryn m.m. skal hit — ikke husholdning.
 */
function matchesPantry(t) {
  return /pasta|ris\b|buljong|mel\b|hvetemel|sukker|salt|pepper|krydder|olje|olivenolje|soyasaus|hermetisk|\bboks\b|tomatpure|ketchup|sennep|syltetoy|honning|sirup|taco|\bkit\b|mais|bonner|linse|kokosmelk|nudler|spaghetti|lasagne|nachos|saus|pesto|bouillon|havregryn|havre\b|gryn\b|bygggryn|hirse|quinoa|couscous|musli|muesli|granola|cornflakes|corn.?flakes|weetabix|frokostblanding|\bgrot\b|grotblanding|hermetikk|konserves|peanott|nutella|sjokoladepalegg|\bprim\b|kaviar|makrell.?i.?tomat|tubepalegg|palegg|torrvare|hvitlokspulver|kanel|laurbaer|bakepulver|gjaer|vaniljesukker|kakao.?pulver|kokosmasse|mandelmel|havremel|rugmel|leverpostei|leverpate|\bpate\b/
    .test(t);
}

function matchesFrozen(t) {
  return /frossen|frys|iskrem|isbit/.test(t);
}

function matchesSnacks(t) {
  return /chips|godteri|sjokolade|kjeks|popcorn|snacks|smagodt|seigmenn|lakris|vingummi|potetgull|ostepop|notteblanding/.test(t);
}

function matchesBread(t) {
  return /lefse|tortilla|wrap|baguette|rundstykke|knekkebrod|pita|naan|ciabatta|hamburgerbrod|polsebrod|\bbrod\b|lompe|flatbrod|bagel|croissant|gjaerbakst/.test(t);
}

function matchesDrinks(t) {
  // most (eplemost) før produce treffer «eple»
  return /juice|saft|brus|vann|kaffe|\bte\b|\bol\b|vin|kakao|smoothie|most\b|mineralvann|sportsdrikk|energidrikk|is.?kaffe|\biste\b|appelsinjuice|solkysset/.test(t);
}

function matchesHousehold(t) {
  return /oppvask|vaskemiddel|toalettpapir|torkerull|sope|shampoo|tannkrem|hushold|barber|barberhovel|razor|deodorant|vaskepulver|skyllemiddel|renholds|soppelpose|plastfolie|bakeark|bomull|plaster|tampong|bleie|vaskeklut/
    .test(t)
    || /pipe|ror|skyvelaer|verktoy|skru|mutter|hammer|\bbor\b|tape|\blim\b|spiker|plugger|elektro|lampe|paere|batteri|jernvare|bygg/.test(t);
}

function matchesProduce(t) {
  return /potet|gulrot|\blok\b|hvitlok|brokkoli|blomkal|salat|tomat|agurk|paprika|\bkal\b|kalrot|erter|spinat|squash|sopp|eple|banan|sitron|lime|appelsin|baer|avokado|purre|selleri|ingefaer|urter|persille|dill|basilikum|koriander|gronnsak|kiwi|drue|paere|nektarin|fersken/.test(t);
}

/**
 * Gjett butikkhylle ut fra norsk varenavn — uten AI.
 * Rekkefølge speiler typisk butikkflyt + unngår kjente feiltreff
 * (baconost ≠ kjøtt, eplemost ≠ frukt, havregryn ≠ husholdning).
 */
export function guessShoppingCategory(name = '') {
  const t = norm(name);
  if (!t) return 'general';

  // 1) Frys / snacks først (tydelige signaler)
  if (matchesFrozen(t)) return 'frozen';
  if (matchesSnacks(t)) return 'snacks';

  // 2) Meieri før kjøtt — «baconost», «skinkeost» er ost, ikke bacon/skinke
  if (matchesDairy(t)) return 'dairy';

  // 3) Drikke før frukt — «eplemost» / juice
  if (matchesDrinks(t)) return 'drinks';

  // 4) Typisk kjøttpålegg i tube/boks før generelt «makrell»/kjøtt
  if (/leverpostei|leverpate|\bpate\b|makrell.?i.?tomat|tubepalegg|kaviar|\bprim\b/.test(t)) {
    return 'pantry';
  }

  if (matchesMeat(t)) return 'meat';
  if (matchesBread(t)) return 'bread';
  if (matchesHousehold(t)) return 'household';
  if (matchesPantry(t)) return 'pantry';
  if (matchesProduce(t)) return 'produce';
  return 'general';
}

export function resolveIngredientCategory(item) {
  const raw = String(item?.category || '').trim();
  if (raw && raw !== 'general' && KNOWN.has(raw)) return raw;
  return guessShoppingCategory(item?.name || item?.title || '');
}

/** Score alle kategorier som matcher varenavn (for forslag når usikker). */
function scoreShoppingCategories(name = '') {
  const t = norm(name);
  const scores = {};
  const bump = (cat, n = 1) => { scores[cat] = (scores[cat] || 0) + n; };

  if (!t) return scores;

  if (matchesFrozen(t)) bump('frozen', 2);
  if (matchesSnacks(t)) bump('snacks', 2);
  if (matchesDairy(t)) bump('dairy', 3);
  if (matchesDrinks(t)) bump('drinks', 2);
  if (matchesMeat(t)) bump('meat', 3);
  if (matchesBread(t)) bump('bread', 3);
  if (matchesHousehold(t)) bump('household', 2);
  if (matchesPantry(t)) bump('pantry', 2);
  if (matchesProduce(t)) bump('produce', 2);

  // Ved konflikt ost+kjøtt (baconost): meieri vinner tydelig
  if (matchesDairy(t) && matchesMeat(t)) {
    bump('dairy', 2);
  }
  // Kjøttpålegg i tube/boks (makrell i tomat, leverpostei) → tørrvare/pålegg
  if (/leverpostei|leverpate|\bpate\b|makrell.?i.?tomat|tubepalegg|kaviar|\bprim\b/.test(t)) {
    bump('pantry', 3);
  }

  return scores;
}

/**
 * Klassifiser vare for handleliste.
 * confident=true → auto-kategori, ingen manuelt valg.
 * confident=false → vis suggestions (topp treff + general).
 *
 * Ukjente matvarer faller til «general» (ikke husholdning),
 * så handlelisten ikke blander tørrvare inn under vaskemidler.
 */
export function classifyShoppingItem(name = '') {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2) {
    return { category: 'general', confident: true, suggestions: [] };
  }

  const scores = scoreShoppingCategories(trimmed);
  const ranked = Object.entries(scores)
    .filter(([cat]) => KNOWN.has(cat))
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 1 && ranked[0][1] >= 2) {
    return { category: ranked[0][0], confident: true, suggestions: [] };
  }

  if (ranked.length >= 2 && ranked[0][1] >= 2 && ranked[0][1] > ranked[1][1]) {
    return { category: ranked[0][0], confident: true, suggestions: [] };
  }

  const guessed = guessShoppingCategory(trimmed);
  if (guessed !== 'general' && ranked.length === 0) {
    return { category: guessed, confident: true, suggestions: [] };
  }

  // Usikker: foreslå hyller nær mat — ikke husholdning først
  const suggestions = ranked.length
    ? ranked.slice(0, 4).map(([cat]) => cat)
    : ['general', 'pantry', 'other', 'household'];

  const uniq = [...new Set(suggestions.filter((c) => KNOWN.has(c)))];
  return {
    category: uniq[0] || guessed || 'general',
    confident: false,
    suggestions: uniq.length ? uniq : ['general', 'pantry', 'other'],
  };
}
