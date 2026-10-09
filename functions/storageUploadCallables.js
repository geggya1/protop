import './setRegion.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import * as logger from 'firebase-functions/logger';
import { handleUploadStorageFile, handleDownloadStorageFile, handleApplyStorageCors } from './uploadStorage.js';
import { STORAGE_BUCKET } from './storageBucket.js';

if (!getApps().length) initializeApp({ storageBucket: STORAGE_BUCKET });

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

/** Last ned bilde via Admin SDK — omgår Storage CORS for CV-PDF. */
export const downloadStorageFile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleDownloadStorageFile(req.data, req.auth);
    } catch (error) {
      logger.warn('downloadStorageFile failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke hente bildet.');
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
