/**
 * Resolve the mail/SMS key without defineSecret (so friend functions can deploy
 * without secretmanager.secrets.get on the GitHub deploy SA).
 *
 * Prefer WEEKPLAN_MAIL_KEY (CI /.env). Do not write MAIL_API_KEY into .env:
 * Cloud Run already mounts that name as a Secret Manager secret, and the API
 * rejects "secret overlaps non-secret" — which failed every Hosting deploy.
 * process.env.MAIL_API_KEY still works when the secret mount is present.
 * Fall back to Secret Manager at runtime when neither env is set.
 */
let cachedKey = null;

export function mailApiKeyFromEnv() {
  return String(process.env.WEEKPLAN_MAIL_KEY || process.env.MAIL_API_KEY || '').trim();
}

export async function resolveMailApiKey() {
  if (cachedKey != null) return cachedKey;
  const fromEnv = mailApiKeyFromEnv();
  if (fromEnv) {
    cachedKey = fromEnv;
    return fromEnv;
  }
  try {
    const tokenRes = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!tokenRes.ok) {
      cachedKey = '';
      return '';
    }
    const { access_token: token } = await tokenRes.json();
    if (!token) {
      cachedKey = '';
      return '';
    }
    const secRes = await fetch(
      'https://secretmanager.googleapis.com/v1/projects/protop-c189c/secrets/MAIL_API_KEY/versions/latest:access',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!secRes.ok) {
      cachedKey = '';
      return '';
    }
    const data = await secRes.json();
    const b64 = data?.payload?.data || '';
    const key = Buffer.from(b64, 'base64').toString('utf8').trim();
    cachedKey = key;
    return key;
  } catch {
    cachedKey = '';
    return '';
  }
}
