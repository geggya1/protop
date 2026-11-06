/**
 * Gjør forbruket fra ulike leverandører om til samme form, så loggen og prisen
 * ikke trenger å kjenne leverandøren:
 *   { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens }
 * inputTokens er tokens inn som verken er lest fra eller skrevet til cache.
 */

function n(value) {
  const v = Number(value);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/** Claude (Messages API, også på Vertex AI): `response.usage`. */
export function claudeUsage(usage) {
  return {
    inputTokens: n(usage?.input_tokens),
    cachedInputTokens: n(usage?.cache_read_input_tokens),
    cacheWriteTokens: n(usage?.cache_creation_input_tokens),
    outputTokens: n(usage?.output_tokens),
  };
}

/**
 * Gemini: `response.usageMetadata`. promptTokenCount inkluderer cachede tokens,
 * og tankene (thoughtsTokenCount) faktureres som tokens ut.
 */
export function geminiUsage(meta) {
  const prompt = n(meta?.promptTokenCount);
  const cached = Math.min(prompt, n(meta?.cachedContentTokenCount));
  return {
    inputTokens: prompt - cached,
    cachedInputTokens: cached,
    cacheWriteTokens: 0,
    outputTokens: n(meta?.candidatesTokenCount) + n(meta?.thoughtsTokenCount),
  };
}

export function normalizeUsage(provider, raw) {
  if (provider === 'claude-vertex' || provider === 'claude') return claudeUsage(raw);
  if (provider === 'gemini-vertex' || provider === 'gemini') return geminiUsage(raw);
  throw new Error(`Ukjent AI-leverandør: ${provider}`);
}

export function addUsage(a, b) {
  return {
    inputTokens: n(a?.inputTokens) + n(b?.inputTokens),
    cachedInputTokens: n(a?.cachedInputTokens) + n(b?.cachedInputTokens),
    cacheWriteTokens: n(a?.cacheWriteTokens) + n(b?.cacheWriteTokens),
    outputTokens: n(a?.outputTokens) + n(b?.outputTokens),
  };
}
