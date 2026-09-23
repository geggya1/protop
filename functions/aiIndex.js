/**
 * Deploy entry for AI / ukeplan-import functions only.
 * Does not import MAIL_API_KEY, so GitHub's deploy SA can ship Gemini callables
 * without secretmanager access to mail secrets.
 *
 * setRegion MUST be the first import so europe-west1 is set before onCall() runs.
 * (Re-exported callables evaluate at import time; body setGlobalOptions is too late.)
 */
import './setRegion.js';
import './geminiEnv.js';

export {
  aiChat,
  aiVoiceNote,
  aiTutor,
  aiMealIngredients,
  aiRecipeImport,
  aiReceiptOcr,
  aiMatcoachWeekPlan,
  aiMatcoachFridgeScan,
  aiMatcoachLunchBoxes,
  aiMatcoachSwapMeal,
  aiImportPlan,
  applyAiImport,
  discardAiImport,
  aiCleanupScheduled,
  uploadDocumentFile,
  createAlbumUploadUrl,
  uploadAlbumFile,
} from './aiCallables.js';
