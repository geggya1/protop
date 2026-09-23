import { defineString } from 'firebase-functions/params';

/**
 * Env-basert nøkkel (CI/.env) — unngår Secret Manager som GitHub-SA mangler tilgang til.
 *
 * Viktig: parameteren heter WEEKPLAN_GEMINI_KEY (ikke GEMINI_API_KEY).
 * Produksjon hadde tidligere defineSecret('GEMINI_API_KEY'); Cloud Run nekter
 * å ha samme navn som både secret og vanlig env-variabel.
 *
 * Ikke kall .value() på modul-nivå (deploy-advarsel). Lazy ved første bruk.
 */
const WEEKPLAN_GEMINI_KEY = defineString('WEEKPLAN_GEMINI_KEY', { default: '' });

let touched = false;

export function touchGeminiEnv() {
  if (touched) {
    return String(process.env.GEMINI_API_KEY || process.env.WEEKPLAN_GEMINI_KEY || '').trim();
  }
  touched = true;

  let paramVal = '';
  try {
    // Kun trygt under runtime-invocation — ikke under deploy-analyse.
    paramVal = String(WEEKPLAN_GEMINI_KEY.value() || '').trim();
  } catch {
    paramVal = '';
  }

  const key = String(
    process.env.WEEKPLAN_GEMINI_KEY
    || paramVal
    || process.env.GEMINI_API_KEY
    || '',
  ).trim();

  if (key) {
    // Speil til begge navn så getGeminiKey() og eldre kall finner den.
    process.env.WEEKPLAN_GEMINI_KEY = key;
    process.env.GEMINI_API_KEY = key;
  }
  return key;
}
