/**
 * Opprett Firebase Storage-defaultbucket hvis den mangler, og sett CORS.
 * Brukes av Hosting CI etter Workload Identity Federation-auth.
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
const { GoogleAuth } = require('google-auth-library');

const projectId = process.env.GCLOUD_PROJECT || 'protop-c189c';
const cors = JSON.parse(readFileSync(join(root, 'cors.json'), 'utf8'));
const storage = new Storage({ projectId });
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

const CANDIDATES = [
  `${projectId}.firebasestorage.app`,
  `${projectId}.appspot.com`,
];

function bucketIdFromDefault(payload) {
  const raw = payload?.bucket?.name || payload?.name || '';
  return String(raw).split('/').pop() || '';
}

async function firebaseJson(method, url, body) {
  const client = await auth.getClient();
  try {
    const res = await client.request({ url, method, data: body });
    return { status: res.status, data: res.data };
  } catch (err) {
    return {
      status: Number(err?.response?.status || err?.status || 0),
      data: err?.response?.data || { error: { message: err?.message || String(err) } },
    };
  }
}

async function existingGcsBucket() {
  if (process.env.STORAGE_BUCKET) {
    const [exists] = await storage.bucket(process.env.STORAGE_BUCKET).exists();
    if (exists) return process.env.STORAGE_BUCKET;
  }
  for (const name of CANDIDATES) {
    try {
      const [exists] = await storage.bucket(name).exists();
      if (exists) return name;
    } catch {
      // try next
    }
  }
  return '';
}

async function ensureDefaultBucket() {
  const found = await existingGcsBucket();
  if (found) return found;

  await firebaseJson(
    'POST',
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/firebasestorage.googleapis.com:enable`,
  );

  const getUrl = `https://firebasestorage.googleapis.com/v1alpha/projects/${projectId}/defaultBucket`;
  const existing = await firebaseJson('GET', getUrl);
  if (existing.status === 200) {
    const name = bucketIdFromDefault(existing.data);
    if (name) return name;
  }

  const created = await firebaseJson('POST', `https://firebasestorage.googleapis.com/v1alpha/projects/${projectId}/defaultBucket`, {
    location: 'europe-west1',
  });
  if (created.status === 200 || created.status === 201) {
    const name = bucketIdFromDefault(created.data);
    if (name) return name;
  }
  if (created.status === 409) {
    const again = await firebaseJson('GET', getUrl);
    const name = bucketIdFromDefault(again.data);
    if (name) return name;
  }

  const fallback = await existingGcsBucket();
  if (fallback) return fallback;

  const gcsErrors = [];
  for (const name of CANDIDATES) {
    try {
      await storage.createBucket(name, {
        location: 'europe-west1',
        storageClass: 'STANDARD',
      });
      console.log(`Opprettet GCS-bucket gs://${name}`);
      return name;
    } catch (err) {
      const code = Number(err?.code || 0);
      const message = String(err?.message || err);
      if (code === 409 || /already exists/i.test(message)) return name;
      gcsErrors.push(`${name}: ${message.split('\n')[0]}`);
    }
  }

  const again = await existingGcsBucket();
  if (again) return again;

  const detail = created.data?.error?.message || JSON.stringify(created.data || {}).slice(0, 400);
  const message = (
    `Firebase Storage-bucket mangler og kunne ikke opprettes `
    + `(defaultBucket ${created.status}: ${detail}; GCS: ${gcsErrors.join(' | ') || 'ingen'}). `
    + 'Gi github-hosting-deploy Storage Admin, eller trykk Get started under Storage i Firebase Console.'
  );
  const err = new Error(message);
  err.code = 'STORAGE_BUCKET_MISSING';
  throw err;
}

try {
  const bucketName = await ensureDefaultBucket();
  const bucket = storage.bucket(bucketName);
  const [exists] = await bucket.exists();
  if (!exists) {
    throw new Error(`Lagringsbucket mangler etter oppretting (gs://${bucketName}).`);
  }

  await bucket.setCorsConfiguration(cors);

  const probe = bucket.file(`_health/storage-probe-${Date.now()}`);
  await probe.save(Buffer.from('protop-storage-ok'), { contentType: 'text/plain' });
  await probe.delete({ ignoreNotFound: true });

  console.log(`Storage klar: gs://${bucketName} (${cors[0]?.origin?.length || 0} CORS-origins, skriveprobe ok)`);
} catch (err) {
  const text = String(err?.message || err);
  if (/storage\.buckets\.create|defaultBucket\.create|STORAGE_BUCKET_MISSING|Permission/i.test(text)) {
    console.error(`::warning::${text}`);
    console.error(
      'Storage-bucket mangler. Hosting deployes videre, men CV-bilder feiler til bucketen er opprettet '
      + '(Firebase Console → Build → Storage → Get started).',
    );
    process.exit(1);
  }
  throw err;
}
