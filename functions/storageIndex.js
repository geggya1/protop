/**
 * Slim deploy entry for Storage-opplasting / CORS (uten Gemini/mail-secrets).
 */
import './setRegion.js';

export { uploadStorageFile, applyStorageCors } from './storageUploadCallables.js';
