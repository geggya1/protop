/**
 * Apply cors.json to the Firebase Storage bucket (GCS).
 * Used by Hosting CI after Workload Identity Federation auth.
 *
 * ESM cannot resolve packages via NODE_PATH, so we load Storage from
 * functions/node_modules through createRequire.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const { Storage } = require('@google-cloud/storage');

const bucketName = process.env.STORAGE_BUCKET || 'protop-c189c.firebasestorage.app';
const cors = JSON.parse(readFileSync(join(root, 'cors.json'), 'utf8'));

const storage = new Storage({ projectId: process.env.GCLOUD_PROJECT || 'protop-c189c' });
await storage.bucket(bucketName).setCorsConfiguration(cors);
console.log(`Storage CORS applied on gs://${bucketName} (${cors[0]?.origin?.length || 0} origins)`);
