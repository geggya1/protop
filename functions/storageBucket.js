/**
 * Finn eller opprett Firebase Storage-bucketen.
 * Default-bucketen er gs://protop-c189c.firebasestorage.app (Firebase Console).
 * appspot.com er fallback hvis den også finnes.
 */
import { getStorage } from 'firebase-admin/storage';

export const STORAGE_BUCKET = 'protop-c189c.firebasestorage.app';
export const STORAGE_BUCKET_CANDIDATES = [
  'protop-c189c.firebasestorage.app',
  'protop-c189c.appspot.com',
];

const PROJECT_ID = 'protop-c189c';
const DEFAULT_LOCATION = 'europe-west1';

let cached = null;
let inflight = null;

async function bucketExists(name) {
  try {
    const [exists] = await getStorage().bucket(name).exists();
    return exists === true;
  } catch {
    return false;
  }
}

async function googleAccessToken() {
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const value = typeof token === 'string' ? token : token?.token;
    if (value) return value;
  } catch {
    // fall through to metadata server (Cloud Functions)
  }
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`Metadata-token ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error('Mangler tilgangstoken');
  return json.access_token;
}

function bucketNameFromDefault(payload) {
  const raw = payload?.bucket?.name || payload?.name || '';
  return String(raw).split('/').pop() || '';
}

async function createGcsBucket(name) {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage({ projectId: PROJECT_ID });
  try {
    await storage.createBucket(name, {
      location: DEFAULT_LOCATION,
      storageClass: 'STANDARD',
    });
    return name;
  } catch (err) {
    const code = Number(err?.code || 0);
    const message = String(err?.message || err);
    if (code === 409 || /already exists/i.test(message)) return name;
    throw err;
  }
}

async function createDefaultFirebaseBucket() {
  const token = await googleAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const getUrl = `https://firebasestorage.googleapis.com/v1alpha/projects/${PROJECT_ID}/defaultBucket`;
  const existing = await fetch(getUrl, { headers });
  if (existing.ok) {
    const body = await existing.json();
    return bucketNameFromDefault(body);
  }
  const created = await fetch(`https://firebasestorage.googleapis.com/v1alpha/projects/${PROJECT_ID}/defaultBucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ location: DEFAULT_LOCATION }),
  });
  const body = await created.json().catch(() => ({}));
  if (created.ok) return bucketNameFromDefault(body);
  if (created.status === 409) {
    const again = await fetch(getUrl, { headers });
    if (again.ok) return bucketNameFromDefault(await again.json());
  }
  for (const name of STORAGE_BUCKET_CANDIDATES) {
    try {
      const createdName = await createGcsBucket(name);
      if (createdName && await bucketExists(createdName)) return createdName;
    } catch {
      // neste kandidat — CI-kontoen mangler ofte firebasestorage.defaultBucket.create
    }
  }
  throw new Error(body?.error?.message || `Klarte ikke opprette bildelager (${created.status}).`);
}

export async function mediaBucket() {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    for (const name of STORAGE_BUCKET_CANDIDATES) {
      if (await bucketExists(name)) {
        cached = getStorage().bucket(name);
        return cached;
      }
    }
    const created = await createDefaultFirebaseBucket();
    for (const candidate of [created, ...STORAGE_BUCKET_CANDIDATES].filter(Boolean)) {
      if (await bucketExists(candidate)) {
        cached = getStorage().bucket(candidate);
        return cached;
      }
    }
    throw new Error(`Lagringsbucket mangler (${STORAGE_BUCKET_CANDIDATES.join(' / ')}).`);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
