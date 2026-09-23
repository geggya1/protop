/**
 * Shared httpsCallable wrapper with client budget + in-flight dedupe.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { assertClientCallableBudget, dedupeInflight } from './costGuards';

/**
 * @param {string} name
 * @param {object} [data]
 * @param {{ timeout?: number, softFail?: boolean }} [opts]
 */
export async function guardedCallable(name, data = {}, opts = {}) {
  const budget = assertClientCallableBudget(name);
  if (!budget.allowed) {
    if (opts.softFail) {
      return {
        ok: false,
        error: budget.reason || 'For mange forespørsler. Prøv igjen senere.',
        rateLimited: true,
      };
    }
    const err = new Error(budget.reason || 'For mange forespørsler. Prøv igjen senere.');
    err.code = 'resource-exhausted';
    err.retryAfterMs = budget.retryAfterMs;
    throw err;
  }
  const payload = data || {};
  const key = `${name}:${JSON.stringify(payload)}`;
  return dedupeInflight(key, async () => {
    const fn = httpsCallable(functions, name, { timeout: opts.timeout || 60000 });
    const res = await fn(payload);
    return res.data;
  });
}
