/**
 * Satser for bilgodtgjørelse, hentet automatisk.
 *
 * Kallet mileageRates svarer med satsene som er lagret (mileageRates/current). Er de eldre enn ett
 * døgn, hentes de på nytt fra kildene først:
 * - statens sats: særavtalen for reiser innenlands (PDF på regjeringen.no).
 * - trekkfri sats: Skatteetatens satsside.
 * AI-en leser satsen og året ut av teksten, så det tåler at sidene endrer form. En sats lagres bare
 * når den er rimelig (acceptFetchedRate). Feiler hentingen, gjelder forrige lagrede sats, og ellers
 * de kjente satsene i src/mileage/mileageRates.js.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { callGeminiJson, getGeminiKey } from './aiShared.js';
import { KNOWN_MILEAGE_RATES, acceptFetchedRate } from '../src/mileage/mileageRates.js';

export const RATE_SOURCES = {
  state: [
    'https://www.regjeringen.no/contentassets/2baeb58f246849a1ba137bbeb7f20732/no/pdfs/saeravtale-reise-i-norge.pdf',
  ],
  taxFree: [
    'https://www.skatteetaten.no/satser/bilgodtgjorelse/',
  ],
};

const REFRESH_MS = 24 * 60 * 60 * 1000;
// Etter en feilet henting prøves det igjen etter seks timer, ikke ved hvert kall.
const RETRY_MS = 6 * 60 * 60 * 1000;
const DOC = 'mileageRates/current';

const PROMPTS = {
  state: `Teksten er statens særavtale om dekning av utgifter til reise og kost innenlands.
Finn satsen for kilometergodtgjørelse ved bruk av egen bil (personbil, også elbil), i kroner per km,
uten tillegg for passasjerer, utstyr eller vei. Returner KUN JSON:
{ "rate": 5.30, "year": 2026, "validFrom": "YYYY-MM-DD", "quote": "setningen satsen står i" }
Står satsen ikke i teksten, returner { "rate": null }.`,
  taxFree: `Teksten er fra Skatteetaten om bilgodtgjørelse.
Finn den trekkfrie satsen (skattefri godtgjørelse) per kilometer for yrkeskjøring med egen bil
for inneværende år, i kroner per km. Returner KUN JSON:
{ "rate": 3.50, "year": 2026, "quote": "setningen satsen står i" }
Står satsen ikke i teksten, returner { "rate": null }.`,
};

/** HTML til ren tekst, avgrenset rundt omtalen av kilometer. */
export function pageText(html) {
  const plain = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const at = plain.search(/per km|pr\.? km|kilometer/i);
  return at < 0 ? plain.slice(0, 20000) : plain.slice(Math.max(0, at - 6000), at + 14000);
}

async function readSource(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'ProTop/1.0 (satser)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '');
  if (/pdf/i.test(type) || /\.pdf$/i.test(url)) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return [{ inline_data: { mime_type: 'application/pdf', data: buffer.toString('base64') } }];
  }
  return [{ text: pageText(await res.text()) }];
}

/** Leser én sats fra kildene. Gir { rate, year, source } eller kaster. */
export async function fetchRate(kind, { fetchImpl = globalThis.fetch, callModel, today = new Date() } = {}) {
  const errors = [];
  for (const url of RATE_SOURCES[kind]) {
    try {
      const parts = await readSource(url, fetchImpl);
      const answer = await callModel(PROMPTS[kind], parts);
      const rate = Number(String(answer?.rate ?? '').replace(',', '.'));
      const year = Number(answer?.year) || today.getFullYear();
      const previous = KNOWN_MILEAGE_RATES[year]?.[kind] ?? KNOWN_MILEAGE_RATES[year - 1]?.[kind];
      if (!acceptFetchedRate(rate, { year, previous, today })) {
        errors.push(`${url}: urimelig sats ${answer?.rate} (${year})`);
        continue;
      }
      return { rate: Math.round(rate * 100) / 100, year, source: url, quote: String(answer?.quote || '').slice(0, 300) };
    } catch (err) {
      errors.push(String(err?.message || err).slice(0, 200));
    }
  }
  throw new Error(errors.join(' | ') || 'Ingen kilde svarte.');
}

/** Henter begge satsene og fletter dem inn i det lagrede. Gir { rates, errors }. */
export async function refreshRates(stored = {}, options = {}) {
  const rates = { ...(stored.rates || {}) };
  const errors = [];
  for (const kind of ['state', 'taxFree']) {
    try {
      const hit = await fetchRate(kind, options);
      const key = String(hit.year);
      rates[key] = { ...(rates[key] || {}), [kind]: hit.rate, [`${kind}Source`]: hit.source, [`${kind}Quote`]: hit.quote };
    } catch (err) {
      errors.push(`${kind}: ${err.message}`);
    }
  }
  return { rates, errors };
}

export async function handleMileageRates(auth, { now = Date.now() } = {}) {
  if (!auth?.uid) throw new Error('Ikke innlogget');
  const db = getFirestore();
  const ref = db.doc(DOC);
  const snap = await ref.get();
  const stored = snap.exists ? (snap.data() || {}) : {};
  const checked = Date.parse(stored.checkedAt || '') || 0;
  const wait = stored.errors?.length ? RETRY_MS : REFRESH_MS;
  if (checked && now - checked < wait) {
    return { rates: stored.rates || {}, checkedAt: stored.checkedAt || '', known: KNOWN_MILEAGE_RATES };
  }
  const apiKey = getGeminiKey();
  if (!apiKey) return { rates: stored.rates || {}, checkedAt: stored.checkedAt || '', known: KNOWN_MILEAGE_RATES };
  const { rates, errors } = await refreshRates(stored, {
    callModel: (prompt, parts) => callGeminiJson(apiKey, prompt, parts, { maxOutputTokens: 512, perModelTimeoutMs: 30000, maxModels: 3 }),
  });
  const checkedAt = new Date(now).toISOString();
  await ref.set({ rates, checkedAt, errors, updatedAt: FieldValue.serverTimestamp() }, { merge: false });
  if (errors.length) console.warn('[mileageRates] henting feilet', errors);
  return { rates, checkedAt, known: KNOWN_MILEAGE_RATES };
}
