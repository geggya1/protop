/**
 * Client-side cost / spike guards.
 * Complements server assertRateLimit — stops accidental stampede from
 * login, family switch, remounts, or buggy retry loops before they hit
 * Google/Firebase/Graph APIs.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Soft caps for expensive httpsCallable names (client-side). */
export const CALLABLE_BUDGETS = {
  fetchExternalCalendarEvents: { perMinute: 4, perHour: 36, perDay: 120 },
  listCalendarConnections: { perMinute: 8, perHour: 60, perDay: 200 },
  listMailFolders: { perMinute: 8, perHour: 80, perDay: 300 },
  listMailMessages: { perMinute: 10, perHour: 120, perDay: 400 },
  syncOutlookMailbox: { perMinute: 6, perHour: 80, perDay: 300 },
  getMailMessage: { perMinute: 20, perHour: 200, perDay: 800 },
  sendOutlookMail: { perMinute: 6, perHour: 40, perDay: 100 },
  replyOutlookMail: { perMinute: 6, perHour: 40, perDay: 100 },
  forwardOutlookMail: { perMinute: 4, perHour: 30, perDay: 80 },
  aiChat: { perMinute: 8, perHour: 50, perDay: 80 },
  aiImportPlan: { perMinute: 2, perHour: 12, perDay: 30 },
  aiTutor: { perMinute: 6, perHour: 40, perDay: 70 },
  aiVoiceNote: { perMinute: 4, perHour: 30, perDay: 60 },
  aiMealIngredients: { perMinute: 4, perHour: 20, perDay: 40 },
  aiReceiptOcr: { perMinute: 2, perHour: 12, perDay: 30 },
  aiClassListOcr: { perMinute: 2, perHour: 10, perDay: 24 },
  aiMatcoachWeekPlan: { perMinute: 2, perHour: 10, perDay: 20 },
  aiMatcoachFridgeScan: { perMinute: 2, perHour: 10, perDay: 20 },
  aiMatcoachLunchBoxes: { perMinute: 2, perHour: 12, perDay: 24 },
  aiMatcoachSwapMeal: { perMinute: 4, perHour: 20, perDay: 40 },
  hospSyncAllChannels: { perMinute: 2, perHour: 10, perDay: 30 },
  stravaSyncActivities: { perMinute: 2, perHour: 12, perDay: 40 },
  lookupVehicleByReg: { perMinute: 4, perHour: 20, perDay: 60 },
  lookupAdultProfile: { perMinute: 10, perHour: 50, perDay: 120 },
};

/** Max concurrent shared Firestore listeners before circuit opens. */
export const MAX_CONCURRENT_LISTENERS = 48;
/** Family switches / listener opens for same path within a short window. */
export const MAX_LISTENER_OPENS_PER_MINUTE = 80;

/** @type {Map<string, number[]>} */
const callableHits = new Map();
/** @type {Map<string, number>} */
const openListeners = new Map();
/** @type {number[]} */
let listenerOpenTimes = [];
let circuitOpenUntil = 0;
let circuitReason = '';

function prune(timestamps, windowMs, now = Date.now()) {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i += 1;
  if (i > 0) timestamps.splice(0, i);
  return timestamps;
}

function countInWindow(timestamps, windowMs, now = Date.now()) {
  prune(timestamps, windowMs, now);
  return timestamps.length;
}

export function isCostCircuitOpen() {
  if (Date.now() < circuitOpenUntil) {
    return { open: true, until: circuitOpenUntil, reason: circuitReason };
  }
  return { open: false, until: 0, reason: '' };
}

export function tripCostCircuit(reason, cooldownMs = 60 * 1000) {
  circuitOpenUntil = Date.now() + cooldownMs;
  circuitReason = String(reason || 'Kostnadsvern aktivert midlertidig.');
  if (typeof console !== 'undefined') {
    console.warn('[costGuards] circuit open', circuitReason, cooldownMs);
  }
}

export function resetCostGuards() {
  callableHits.clear();
  openListeners.clear();
  listenerOpenTimes = [];
  circuitOpenUntil = 0;
  circuitReason = '';
}

/**
 * @param {string} name
 * @returns {{ allowed: boolean, reason?: string, retryAfterMs?: number }}
 */
export function assertClientCallableBudget(name) {
  const circuit = isCostCircuitOpen();
  if (circuit.open) {
    return {
      allowed: false,
      reason: circuit.reason || 'Kostnadsvern midlertidig aktivt.',
      retryAfterMs: Math.max(0, circuit.until - Date.now()),
    };
  }

  const budget = CALLABLE_BUDGETS[name];
  if (!budget) return { allowed: true };

  const now = Date.now();
  const hits = callableHits.get(name) || [];
  prune(hits, DAY_MS, now);

  const perMin = countInWindow(hits, MINUTE_MS, now);
  const perHour = countInWindow(hits, HOUR_MS, now);
  const perDay = hits.length;

  if (budget.perMinute && perMin >= budget.perMinute) {
    return {
      allowed: false,
      reason: `For mange kall til ${name} (${budget.perMinute}/min).`,
      retryAfterMs: MINUTE_MS,
    };
  }
  if (budget.perHour && perHour >= budget.perHour) {
    return {
      allowed: false,
      reason: `For mange kall til ${name} (${budget.perHour}/time).`,
      retryAfterMs: HOUR_MS,
    };
  }
  if (budget.perDay && perDay >= budget.perDay) {
    return {
      allowed: false,
      reason: `Daglig grense for ${name} er nådd (${budget.perDay}/dag).`,
      retryAfterMs: DAY_MS,
    };
  }

  hits.push(now);
  callableHits.set(name, hits);
  return { allowed: true };
}

export function trackListenerOpen(path) {
  const now = Date.now();
  listenerOpenTimes.push(now);
  prune(listenerOpenTimes, MINUTE_MS, now);
  const concurrent = [...openListeners.values()].reduce((s, n) => s + n, 0);
  openListeners.set(path, (openListeners.get(path) || 0) + 1);

  if (listenerOpenTimes.length > MAX_LISTENER_OPENS_PER_MINUTE) {
    tripCostCircuit(
      'For mange Firestore-lyttere åpnet raskt (mulig switch-loop).',
      90 * 1000,
    );
  }
  if (concurrent + 1 > MAX_CONCURRENT_LISTENERS) {
    tripCostCircuit(
      'For mange samtidige Firestore-lyttere.',
      90 * 1000,
    );
  }
}

export function releaseListener(path) {
  const n = openListeners.get(path) || 0;
  if (n <= 1) openListeners.delete(path);
  else openListeners.set(path, n - 1);
}

/** In-flight promise dedupe for identical network work. */
const inflight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} factory
 * @returns {Promise<T>}
 */
export function dedupeInflight(key, factory) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

export function costGuardStats() {
  return {
    circuit: isCostCircuitOpen(),
    callableKeys: [...callableHits.keys()],
    openListeners: Object.fromEntries(openListeners),
    listenerOpensLastMinute: countInWindow(listenerOpenTimes, MINUTE_MS),
    inflight: [...inflight.keys()],
  };
}
