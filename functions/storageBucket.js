/**
 * ProTops Storage-bucket. Admin SDK / Cloud Functions default er nå
 * {projectId}.firebasestorage.app — den bucketen finnes ikke her.
 */
import { getStorage } from 'firebase-admin/storage';

export const STORAGE_BUCKET = 'protop-c189c.appspot.com';

export function mediaBucket() {
  return getStorage().bucket(STORAGE_BUCKET);
}
