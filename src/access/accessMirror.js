/**
 * Ber serveren speile tilgangsmatrisen for selskapet (Cloud Function syncCompanyAccess).
 *
 * Speilet (families/{id}/accessAcl/{uid}) er det Firestore-reglene leser for selskapsdokumentet,
 * ansatte, HR, fravær, faktura og ISO. Samme kall holder administratorlisten (adminUids) i takt
 * med nivået Administrator. Appen ber om synk når et bedriftsskall åpnes, og straks når noen som
 * kan endre tilgang ser at et nivå, en status eller matrisen er endret. Ellers ikke oftere enn
 * hvert tiende minutt (speilet varer i 12 timer).
 *
 * Lange økter (en fane som står åpen, appen hentet fra bakgrunnen): skallet sjekker speilet hver
 * halvtime og når appen blir aktiv igjen, og fornyer det før det går ut (keepAccessMirrorFresh).
 * Lesing som trenger speilet, venter på det (ensureFreshAccessMirror), og lyttere som ble avvist
 * før speilet fantes, kobler til på nytt når det er skrevet (subscribeAccessMirror).
 *
 * Klienten kan bare be om synk. Speilet skrives av serveren (og av eieren som reserve).
 */

export const ACCESS_SYNC_INTERVAL_MS = 10 * 60 * 1000;
/** Speilet fornyes når det har mindre enn dette igjen. */
export const ACCESS_REFRESH_MARGIN_MS = 3 * 3600 * 1000;
/** Hvor ofte et åpent skall ser etter om speilet snart går ut. */
export const ACCESS_CHECK_MS = 30 * 60 * 1000;
/** En fornyelse fordi speilet mangler eller går ut, kjøres ikke oftere enn dette. */
const STALE_RETRY_MS = 60 * 1000;
const DEBOUNCE_MS = 1500;

const runs = new Map();
/** Når den innloggedes speil går ut (ms), per selskap. Fra synken eller fra dokumentet. */
const expiry = new Map();
const mirrorListeners = new Set();
const keepers = new Map();

/** Varsles med selskaps-id når serveren har skrevet speilet. Returnerer avmelding. */
export function subscribeAccessMirror(fn) {
  if (typeof fn !== 'function') return () => {};
  mirrorListeners.add(fn);
  return () => { mirrorListeners.delete(fn); };
}

function notifyMirror(companyId) {
  mirrorListeners.forEach((fn) => {
    try { fn(companyId); } catch { /* en lytter skal ikke stoppe de andre */ }
  });
}

function expiryMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Date.parse(value) || 0;
}

/** Om den innloggedes speil er kjent gyldig lenge nok. */
export function accessMirrorFresh(companyId, { now = Date.now(), margin = 0 } = {}) {
  return (expiry.get(String(companyId || '').trim()) || 0) - now > margin;
}

/** Feltene på en ansatt som påvirker tilgangen. */
function accessFields(row) {
  const company = row?.company || {};
  return [
    String(row?.id || ''),
    String(row?.personUid || ''),
    String(company.status || ''),
    String(company.accessLevel || ''),
    Array.isArray(company.accessLevels) ? company.accessLevels.join(',') : '',
    String(company.accessRole || ''),
    JSON.stringify(company.accessOverrides || {}),
  ].join('|');
}

/** Fingeravtrykk av matrisen og nivåene. Endres det, må speilet beregnes på nytt. */
export function accessSignature(policy, employees = []) {
  const rows = (employees || []).map(accessFields).sort();
  return `${JSON.stringify(policy || null)}#${rows.join(';')}`;
}

/**
 * Skal appen be om ny synk nå?
 * previous: { at, key } fra forrige synk i denne økten, eller null.
 * force: den innloggede kan endre tilgang, og fingeravtrykket er nytt.
 */
export function accessSyncDue(previous, { now = Date.now(), key = '', force = false } = {}) {
  if (!previous) return true;
  if (force && previous.key !== key) return true;
  return now - (Number(previous.at) || 0) >= ACCESS_SYNC_INTERVAL_MS;
}

async function callSyncCompanyAccess(companyId) {
  const [{ httpsCallable }, { functions }] = await Promise.all([import('firebase/functions'), import('../../firebase.js')]);
  const call = httpsCallable(functions, 'syncCompanyAccess', { timeout: 20000 });
  return call({ companyId });
}

/**
 * Kjør synken (ett kall om gangen per selskap). Gir løftet til kallet, eller null når det ikke
 * er tid for en ny synk. stale: speilet mangler eller går snart ut, så timinuttersregelen gjelder ikke.
 */
function runAccessSync(companyId, { key, force, call, stale = false }) {
  const previous = runs.get(companyId) || null;
  if (previous?.pending) {
    // Ett kall om gangen. Et nytt fingeravtrykk kjøres når det pågående er ferdig.
    previous.again = { key, force };
    return previous.job;
  }
  const now = Date.now();
  const due = stale
    ? (!previous || now - (Number(previous.at) || 0) >= STALE_RETRY_MS)
    : accessSyncDue(previous, { now, key, force });
  if (!due) return null;
  const run = { at: now, key, pending: true, again: null, job: null };
  runs.set(companyId, run);
  run.job = (async () => {
    let ok = false;
    try {
      const res = await call(companyId);
      ok = res?.data?.ok !== false;
      const until = expiryMs(res?.data?.expiresAt);
      if (until) expiry.set(companyId, until);
    } catch {
      // Nett eller tilgang: neste åpning av skallet (eller neste sjekk) prøver igjen.
    } finally {
      const again = run.again;
      runs.set(companyId, { at: now, key, pending: false });
      if (again) runAccessSync(companyId, { ...again, call });
    }
    if (ok) notifyMirror(companyId);
    return ok;
  })();
  return run.job;
}

async function readOwnMirrorExpiry(companyId, uid) {
  const [{ doc, getDoc }, { db }] = await Promise.all([import('firebase/firestore'), import('../../firebase.js')]);
  const snap = await getDoc(doc(db, 'families', companyId, 'accessAcl', String(uid)));
  return snap.exists() ? expiryMs(snap.data()?.expiresAt) : 0;
}

function within(job, timeoutMs) {
  let timer = null;
  return Promise.race([
    job,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer?.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Sørg for at den innloggedes speil finnes og ikke går ut snart, før noe som trenger det leses
 * (HR, fravær for alle). Ber om synk når det mangler eller har mindre enn tre timer igjen, og
 * venter på den (høyst timeoutMs). force: lesingen ble nettopp avvist, så speilet synkes uansett.
 * Gir true når speilet er kjent gyldig.
 */
export async function ensureFreshAccessMirror(companyId, uid, {
  force = false, timeoutMs = 6000, call = callSyncCompanyAccess, read = readOwnMirrorExpiry,
} = {}) {
  const id = String(companyId || '').trim();
  if (!id || !uid) return false;
  if (!force && accessMirrorFresh(id, { margin: ACCESS_REFRESH_MARGIN_MS })) return true;
  const running = runs.get(id);
  if (running?.pending && running.job) {
    await within(running.job, timeoutMs);
    if (!force || accessMirrorFresh(id)) return accessMirrorFresh(id);
  }
  if (!force && !expiry.has(id)) {
    const until = await read(id, uid).catch(() => 0);
    if (until) expiry.set(id, until);
    if (accessMirrorFresh(id, { margin: ACCESS_REFRESH_MARGIN_MS })) return true;
  }
  const job = runAccessSync(id, { key: runs.get(id)?.key || '', force: true, call, stale: true });
  if (job) await within(job, timeoutMs);
  return accessMirrorFresh(id);
}

/**
 * Hold speilet ferskt mens skallet er åpent: sjekk hver halvtime, og når appen blir aktiv igjen
 * (onResume gir en avmelding). Flere skjermer i samme skall deler én sjekk. Returnerer stopp.
 */
export function keepAccessMirrorFresh(companyId, uid, {
  onResume = null, everyMs = ACCESS_CHECK_MS, call = callSyncCompanyAccess, read = readOwnMirrorExpiry,
} = {}) {
  const id = String(companyId || '').trim();
  if (!id || !uid) return () => {};
  const key = `${id}|${uid}`;
  let keeper = keepers.get(key);
  if (!keeper) {
    const check = () => { ensureFreshAccessMirror(id, uid, { call, read }).catch(() => {}); };
    const timer = setInterval(check, everyMs);
    timer?.unref?.();
    let stopResume = null;
    try { stopResume = typeof onResume === 'function' ? onResume(check) : null; } catch { stopResume = null; }
    keeper = { count: 0, timer, stopResume };
    keepers.set(key, keeper);
  }
  keeper.count += 1;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    keeper.count -= 1;
    if (keeper.count > 0) return;
    clearInterval(keeper.timer);
    try { keeper.stopResume?.(); } catch { /* ignore */ }
    keepers.delete(key);
  };
}

/**
 * Be om synk etter en kort pause (flere skjermer i skallet ber samtidig). Returnerer avbryt.
 */
export function scheduleAccessSync(companyId, {
  key = '', force = false, call = callSyncCompanyAccess, delayMs = DEBOUNCE_MS,
} = {}) {
  const id = String(companyId || '').trim();
  if (!id) return () => {};
  const timer = setTimeout(() => {
    runAccessSync(id, { key, force, call });
  }, delayMs);
  return () => clearTimeout(timer);
}

/** Utlogging eller brukerbytte: det som er kjent om speilet, gjaldt forrige bruker. */
export function forgetAccessMirrors() {
  expiry.clear();
}

/** Bare for tester. */
export function resetAccessSyncState() {
  runs.clear();
  expiry.clear();
  keepers.forEach((keeper) => {
    clearInterval(keeper.timer);
    try { keeper.stopResume?.(); } catch { /* ignore */ }
  });
  keepers.clear();
}
