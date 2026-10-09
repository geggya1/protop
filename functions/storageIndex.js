/**
 * Slim deploy entry for Storage-opplasting / CORS (uten Gemini/mail-secrets).
 */
import './setRegion.js';

export { uploadStorageFile, downloadStorageFile, applyStorageCors } from './storageUploadCallables.js';
