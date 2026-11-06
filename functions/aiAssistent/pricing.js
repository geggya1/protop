/**
 * Pristabell for AI-assistenten. Hvert kall prises etter tabellen og føres i aiLedger.
 *
 * - En modell som ikke står her, kan ikke kalles (priceFor kaster). Ingen kall uten pris.
 * - PRICE_VERSION lagres på hver føring, så gamle føringer kan forklares når prisene endres.
 * - Priser i USD per million tokens. Kilde: Anthropics listepriser (oktober 2026).
 *   Prisen på Vertex AI i EU er ikke bekreftet; EU_MULTIPLIER legger på 10 % til den er det.
 *   Gemini legges til i fase 2, med priser hentet fra Googles prisliste.
 * - Vekslingskurs: AI_USD_NOK i miljøet, ellers DEFAULT_USD_NOK (heller litt høy enn lav).
 */

export const PRICE_VERSION = '2026-11-claude-v1';
export const DEFAULT_USD_NOK = 11;
export const EU_MULTIPLIER = 1.1;

/**
 * input / output: vanlige tokens. cacheRead: tokens lest fra cache. cacheWrite: tokens skrevet til cache (5 min).
 * longInput: priser når prompten er over longThreshold tokens (Haiku 5.5).
 */
export const MODEL_PRICES = Object.freeze({
  'claude-haiku-5-5': {
    provider: 'claude-vertex',
    tier: 'light',
    input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125,
    longThreshold: 100_000,
    longInput: 0.50, longOutput: 2.50, longCacheRead: 0.05, longCacheWrite: 0.625,
  },
  'claude-sonnet-5-5': {
    provider: 'claude-vertex',
    tier: 'standard',
    input: 2.00, output: 10.00, cacheRead: 0.20, cacheWrite: 2.50,
  },
  'claude-opus-5-5': {
    provider: 'claude-vertex',
    tier: 'deep',
    input: 4.00, output: 20.00, cacheRead: 0.20, cacheWrite: 5.00,
  },
});

export function usdToNokRate(env = process.env) {
  const n = Number(env?.AI_USD_NOK);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_NOK;
}

export function priceFor(model) {
  const row = MODEL_PRICES[model];
  if (!row) {
    const err = new Error(`Modellen ${model || '(tom)'} har ingen pris i pristabellen og kan ikke brukes.`);
    err.code = 'failed-precondition';
    throw err;
  }
  return row;
}

/**
 * Pris for ett kall. `usage` er normalisert (se usage.js):
 * { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens }.
 * Svarer { usd, nok, priceVersion }. Beløpene rundes opp til hele øre, aldri ned.
 */
export function costForUsage(model, usage, { rate = usdToNokRate(), multiplier = EU_MULTIPLIER } = {}) {
  const p = priceFor(model);
  const input = Math.max(0, Number(usage?.inputTokens) || 0);
  const cached = Math.max(0, Number(usage?.cachedInputTokens) || 0);
  const written = Math.max(0, Number(usage?.cacheWriteTokens) || 0);
  const output = Math.max(0, Number(usage?.outputTokens) || 0);
  const promptTotal = input + cached + written;
  const long = p.longThreshold && promptTotal > p.longThreshold;
  const pick = (key) => {
    const longKey = `long${key[0].toUpperCase()}${key.slice(1)}`;
    return long && p[longKey] != null ? p[longKey] : p[key];
  };
  const usd = (
    input * pick('input')
    + cached * pick('cacheRead')
    + written * pick('cacheWrite')
    + output * pick('output')
  ) / 1_000_000 * multiplier;
  const nok = Math.ceil(usd * rate * 100) / 100;
  return { usd: Math.round(usd * 1_000_000) / 1_000_000, nok, priceVersion: PRICE_VERSION };
}

/** Grovt anslag før kallet: tokens inn og maks tokens ut, uten cache. Brukes i budsjettsjekken. */
export function estimateCostNok(model, { inputTokens = 0, maxOutputTokens = 0 } = {}, opts) {
  return costForUsage(model, { inputTokens, outputTokens: maxOutputTokens }, opts).nok;
}
