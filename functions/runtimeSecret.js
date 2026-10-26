/**
 * Hemmeligheter fra Secret Manager i kjøring, uten defineSecret, så GitHub-deployen
 * ikke trenger tilgang til hemmelighetene. Miljøvariabler går foran.
 * Bare en funnet verdi huskes: mangler hemmeligheten, slås den opp på nytt neste gang,
 * så den virker straks den er opprettet.
 */
const cache = new Map();

export function secretFromEnv(envNames = []) {
  for (const name of envNames) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export async function resolveRuntimeSecret(name, { envNames = [name], fetchImpl = fetch } = {}) {
  if (cache.get(name)) return cache.get(name);
  const fromEnv = secretFromEnv(envNames);
  if (fromEnv) {
    cache.set(name, fromEnv);
    return fromEnv;
  }
  const project = process.env.GCLOUD_PROJECT || 'protop-c189c';
  try {
    const tokenRes = await fetchImpl(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) },
    );
    if (!tokenRes.ok) return '';
    const { access_token: token } = await tokenRes.json();
    if (!token) return '';
    const secRes = await fetchImpl(
      `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${name}/versions/latest:access`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!secRes.ok) return '';
    const data = await secRes.json();
    const value = Buffer.from(data?.payload?.data || '', 'base64').toString('utf8').trim();
    if (value) cache.set(name, value);
    return value;
  } catch {
    return '';
  }
}
