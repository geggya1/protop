import { normalizeBarcode } from './barcode.js';
import { guessShoppingCategory } from './groceryCategory.js';

const USER_AGENT = 'WeekPlan/2.0 (family app; contact@protop.no)';

function pickName(product) {
  return (
    product?.product_name_no
    || product?.product_name_nb
    || product?.product_name
    || product?.generic_name_no
    || product?.generic_name
    || ''
  ).trim();
}

function requestHeaders() {
  // User-Agent er forbudt header i nettlesere. Send kun utenfor web (native / Node).
  if (typeof document !== 'undefined') return undefined;
  return { 'User-Agent': USER_AGENT };
}

function unknownProduct(code) {
  return {
    barcode: code,
    title: `Vare ${code}`,
    brand: '',
    quantity: null,
    imageUrl: null,
    category: 'general',
    kcal100g: null,
    source: null,
    completeness: null,
    notFound: true,
  };
}

function mapOffProduct(code, p) {
  const title = pickName(p);
  const brand = String(p.brands || '').split(',')[0]?.trim() || '';
  const tags = p.categories_tags || [];
  const imageUrl = p.image_front_small_url
    || p.image_front_thumb_url
    || p.image_front_url
    || p.image_url
    || null;
  const quantity = p.quantity || null;
  const nutriments = p.nutriments || {};

  return {
    barcode: code,
    title: title || (brand ? `${brand} (${code})` : `Vare ${code}`),
    brand,
    quantity,
    imageUrl,
    category: guessCategory(tags, title),
    kcal100g: nutriments['energy-kcal_100g'] ?? null,
    source: 'openfoodfacts',
    completeness: p.completeness ?? null,
    notFound: false,
  };
}

/**
 * Kategoriser ut fra Open Food Facts-tags + produktnavn.
 * Pålegg/syltetøy må treffe før «fruit» (tags som en:fruit-jams).
 * Meieri (ost/cheese) før kjøtt — unngår at «baconost» blir meat via bacon-tag/navn.
 */
export function guessCategory(tags = [], productName = '') {
  const t = `${tags.join(' ')} ${productName}`.toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Meieri først (cheese/ost), også sammensatt baconost
  if (/dairy|meieri|milch|milk|cheese|yogurt|yoghurt|\begg\b|egg\b/.test(t)) return 'dairy';
  if (/\bost\b/.test(t) || (/(?:^|[^a-z])[a-z]+ost(?:[^a-z]|$)/.test(t) && !/(?:^|[^a-z])(?:[a-z]*kost|[a-z]*most)(?:[^a-z]|$)/.test(t))) {
    return 'dairy';
  }
  if (/meat|kjott|meats|fish|fisk|poultry|kylling|beef|pork|bacon|palse|polse|servelat|salami/.test(t)) return 'meat';

  // Syltetøy, sirup, honning, hermetikk, tørrvare — ikke frukt & grønt
  if (/jam|jelly|marmalade|syltetoy|preserve|confiture|sirup|syrup|honey|honning|spread|palegg|nutella|peanut.?butter|peanott|hermetikk|canned|konserves|havregryn|havre|cereal|muesli|musli|granola|oat/.test(t)) {
    return 'pantry';
  }

  if (/bread|bakery|bakeri|brod|bagel|rundstykke|knekkebrod/.test(t)) return 'bread';
  if (/frozen|frys|frossen|ice.?cream|\bis\b/.test(t)) return 'frozen';
  if (/snack|chips|godteri|candy|chocolate|sjokolade|kjeks|cookie|biscuit/.test(t)) return 'snacks';
  if (/drink|drikke|juice|water|soda|brus|kaffe|tea|\bte\b|\bol\b|beer|vin|saft|most\b/.test(t)) return 'drinks';
  if (/household|cleaning|hushold|vask|soap|shampoo|papir|toalett|detergent|barber/.test(t)) return 'household';

  // Fersk frukt/grønt — unngå bare «fruit» (treffer fruit-jams)
  if (
    /vegetable|gronnsak|grontsak|salad|salat|produce|fresh.?fruit|fresh.?vegetable/.test(t)
    || /\b(en:fruits|en:vegetables|en:fresh-fruits|en:fresh-vegetables)\b/.test(t)
  ) {
    return 'produce';
  }

  // Fallback: samme norske varenavn-regler som manuell handleliste
  if (productName) {
    const guessed = guessShoppingCategory(productName);
    if (guessed && guessed !== 'general') return guessed;
  }

  return 'general';
}

/**
 * True when Open Food Facts says the barcode is unknown.
 * API v2 returns HTTP 404 + { status: 0 } for missing products (not a transport failure).
 */
export function isOffProductMissing(res, data) {
  if (data?.status === 0) return true;
  if (res?.status === 404) return true;
  return false;
}

/** Oppslag av dagligvare via Open Food Facts (EAN/GTIN). */
export async function lookupProduct(barcode) {
  const code = normalizeBarcode(barcode);
  if (code.length !== 8 && code.length !== 13) {
    throw new Error('Ugyldig strekkode.');
  }

  const fields = [
    'product_name', 'product_name_no', 'product_name_nb', 'generic_name',
    'brands', 'categories_tags',
    'image_front_small_url', 'image_front_thumb_url', 'image_front_url', 'image_url',
    'quantity', 'nutriments', 'completeness',
  ].join(',');

  let res;
  try {
    res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}?fields=${fields}`,
      { headers: requestHeaders() },
    );
  } catch {
    throw new Error('Klarte ikke slå opp varen. Sjekk nettforbindelsen og prøv igjen.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // Ukjent EAN er forventet for mange norske dagligvarer — ikke hard feil.
  if (isOffProductMissing(res, data)) {
    return unknownProduct(code);
  }

  if (!res.ok) {
    throw new Error('Klarte ikke slå opp varen. Prøv igjen om litt.');
  }

  if (data?.status !== 1 || !data?.product) {
    return unknownProduct(code);
  }

  return mapOffProduct(code, data.product);
}
