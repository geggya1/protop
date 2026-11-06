/**
 * Felles kode fra src/ for AI-assistenten (functions/aiAssistent/).
 * Ligger i functions/ rett under roten fordi stage-function-src.mjs bare skriver om
 * importer som starter med '../src/'. Undermappene importerer herfra.
 */
export {
  aiAccessDecision,
  aiMonthKey,
  crossedAlertThresholds,
  normalizeAiPlan,
} from '../src/ai/aiPlan.js';
export { aiPersonFor } from '../src/ai/aiPeople.js';
export { companyAiAllowed } from '../src/privacy/companyPrivacy.js';
