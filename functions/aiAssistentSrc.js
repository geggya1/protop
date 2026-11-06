/**
 * Felles kode fra src/ for AI-assistenten (functions/aiAssistent/).
 * Ligger i functions/ rett under roten fordi stage-function-src.mjs bare skriver om
 * importer som starter med '../src/'. Undermappene importerer herfra.
 */
export {
  AI_EXTERNAL_LEVELS,
  aiAccessDecision,
  aiMonthKey,
  crossedAlertThresholds,
  normalizeAiPlan,
} from '../src/ai/aiPlan.js';
export { companyAiAllowed } from '../src/privacy/companyPrivacy.js';
