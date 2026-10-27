/**
 * Resolve the mail/SMS key without defineSecret (so friend functions can deploy
 * without secretmanager.secrets.get on the GitHub deploy SA).
 *
 * Prefer PROTOP_MAIL_KEY (CI /.env). Do not write MAIL_API_KEY into .env:
 * Cloud Run already mounts that name as a Secret Manager secret, and the API
 * rejects "secret overlaps non-secret" — which failed every Hosting deploy.
 * process.env.MAIL_API_KEY still works when the secret mount is present.
 * Fall back to Secret Manager at runtime when neither env is set (runtimeSecret.js).
 */
import { resolveRuntimeSecret, secretFromEnv } from './runtimeSecret.js';

const ENV_NAMES = ['PROTOP_MAIL_KEY', 'MAIL_API_KEY'];

export function mailApiKeyFromEnv() {
  return secretFromEnv(ENV_NAMES);
}

export async function resolveMailApiKey(fetchImpl = fetch) {
  return resolveRuntimeSecret('MAIL_API_KEY', { envNames: ENV_NAMES, fetchImpl });
}
