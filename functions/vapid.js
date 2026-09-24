/**
 * Web Push VAPID keys.
 * Private key MUST come from Secret Manager / env — never commit it.
 *
 * Set with:
 *   firebase functions:secrets:set VAPID_PRIVATE_KEY
 * or WEEKPLAN_VAPID_PRIVATE_KEY in the Functions runtime env.
 */
export const VAPID_PUBLIC_KEY = 'BCLzemr5fBU85YOc7FiIsf-6KwWxVg-478pjeHyyj6TFOZs7vV2rCMHnjMHZ2A5wUoYJqbOV3_CIex6f-JwIip4';
export const VAPID_SUBJECT = 'mailto:hei@protop.no';

/** Resolve private key at call time (secret may be injected after cold start). */
export function getVapidPrivateKey() {
  const key = String(
    process.env.VAPID_PRIVATE_KEY
    || process.env.WEEKPLAN_VAPID_PRIVATE_KEY
    || '',
  ).trim();
  if (!key) {
    throw new Error(
      'VAPID_PRIVATE_KEY mangler. Sett secret/env før web push kan sendes.',
    );
  }
  return key;
}

/** @deprecated Use getVapidPrivateKey() — kept so accidental imports fail closed. */
export const VAPID_PRIVATE_KEY = '';
