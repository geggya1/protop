/**
 * Env-basert nøkkel (CI functions/.env) — unngår Secret Manager som GitHub-SA mangler.
 *
 * Do not declare Firebase params here. Non-interactive firebase-tools
 * then requires WEEKPLAN_GEMINI_KEY in dotenv even with an empty default,
 * and aborts the rest of the slim deploy (404 → CORS / «AI-scan er nede»).
 */
export function touchGeminiEnv() {
  const key = String(process.env.WEEKPLAN_GEMINI_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (key) {
    process.env.WEEKPLAN_GEMINI_KEY = key;
    process.env.GEMINI_API_KEY = key;
  }
  return key;
}
