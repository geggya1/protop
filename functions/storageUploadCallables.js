import './setRegion.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import * as logger from 'firebase-functions/logger';
import { handleUploadStorageFile, handleApplyStorageCors } from './uploadStorage.js';

if (!getApps().length) initializeApp();

function rethrowCallable(error, fallback) {
  if (error instanceof HttpsError) throw error;
  const message = String(error?.message || fallback || 'Noe gikk galt.').slice(0, 400);
  throw new HttpsError('failed-precondition', message);
}

/** Last opp bilde/fil via Admin SDK — omgår Storage CORS på web. */
export const uploadStorageFile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleUploadStorageFile(req.data, req.auth);
    } catch (error) {
      logger.warn('uploadStorageFile failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke laste opp filen.');
    }
  },
);

/** Sett GCS CORS for Firebase Storage-bucketen. */
export const applyStorageCors = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleApplyStorageCors(req.data, req.auth);
    } catch (error) {
      logger.warn('applyStorageCors failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke oppdatere Storage CORS.');
    }
  },
);
