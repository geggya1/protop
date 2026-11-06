/**
 * Velger modell for et nivå (light | standard | deep).
 * Modellene byttes her, ikke i chatten. Fase 2 (test av modeller) kan endre standardvalgene;
 * en modell må stå i pristabellen (pricing.js) for å kunne velges.
 */
import { MODEL_PRICES, priceFor } from './pricing.js';

export const DEFAULT_TIER_MODELS = Object.freeze({
  light: 'claude-haiku-5-5',
  standard: 'claude-sonnet-5-5',
  deep: 'claude-opus-5-5',
});

/** Tak per kall, så ett spørsmål ikke kan løpe løpsk. */
export const TIER_LIMITS = Object.freeze({
  light: { maxOutputTokens: 4_000, maxInputTokens: 60_000, maxToolCalls: 8 },
  standard: { maxOutputTokens: 8_000, maxInputTokens: 60_000, maxToolCalls: 8 },
  deep: { maxOutputTokens: 16_000, maxInputTokens: 120_000, maxToolCalls: 12 },
});

/**
 * Modell og grenser for nivået. `overrides` kan peke et nivå til en annen modell
 * (f.eks. fra en sentral konfigurasjon), men bare til en modell med pris.
 */
export function modelForTier(tier, overrides = {}) {
  const key = TIER_LIMITS[tier] ? tier : 'standard';
  const candidate = overrides?.[key];
  const model = candidate && MODEL_PRICES[candidate] ? candidate : DEFAULT_TIER_MODELS[key];
  const price = priceFor(model);
  return { tier: key, model, provider: price.provider, ...TIER_LIMITS[key] };
}
