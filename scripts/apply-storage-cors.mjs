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

const projectId = process.env.GCLOUD_PROJECT || 'protop-c189c';
const cors = JSON.parse(readFileSync(join(root, 'cors.json'), 'utf8'));
const storage = new Storage({ projectId });

/** Prefer explicit env, else the project's default GCS bucket (usually *.appspot.com). */
async function resolveBucketName() {
  if (process.env.STORAGE_BUCKET) return process.env.STORAGE_BUCKET;
  const candidates = [
    `${projectId}.appspot.com`,
    `${projectId}.firebasestorage.app`,
  ];
  for (const name of candidates) {
    try {
      const [exists] = await storage.bucket(name).exists();
      if (exists) return name;
    } catch {
      // try next
    }
  }
  return candidates[0];
}

const bucketName = await resolveBucketName();
await storage.bucket(bucketName).setCorsConfiguration(cors);
console.log(`Storage CORS applied on gs://${bucketName} (${cors[0]?.origin?.length || 0} origins)`);
