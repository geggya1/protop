/**
 * Apply cors.json to the Firebase Storage bucket (GCS).
 * Used by Hosting CI after Workload Identity Federation auth.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '@google-cloud/storage';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bucketName = process.env.STORAGE_BUCKET || 'protop-c189c.firebasestorage.app';
const cors = JSON.parse(readFileSync(join(root, 'cors.json'), 'utf8'));

const storage = new Storage({ projectId: process.env.GCLOUD_PROJECT || 'protop-c189c' });
await storage.bucket(bucketName).setCorsConfiguration(cors);
console.log(`Storage CORS applied on gs://${bucketName} (${cors[0]?.origin?.length || 0} origins)`);
