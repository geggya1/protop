/**
 * Wait until Auth (+ optional App Check) can actually satisfy Firestore rules.
 * Listeners started too early get permission-denied and never recover.
 */
import { onAuthStateChanged } from 'firebase/auth';
import { auth, ensureAppCheckReady } from '../../firebase';

const permissionWarned = new Set();

function isDev() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function isFirestorePermissionError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '');
  return code.includes('permission-denied')
    || /missing or insufficient permissions/i.test(msg);
}

export function warnPermissionOnce(key, ...args) {
  if (!key || permissionWarned.has(key)) return;
  permissionWarned.add(key);
  // Production: expected during boot / when admin callables are the source of truth.
  if (!isDev()) return;
  console.warn(...args);
}

async function hasUsableIdToken(uid) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) return false;
  try {
    await Promise.race([
      user.getIdToken(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('id-token-timeout')), 5000);
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function waitForFirestoreAccess(uid, timeoutMs = 8000) {
  try {
    await ensureAppCheckReady();
  } catch { /* App Check off / failed — continue with Auth */ }
  if (!uid) return false;
  if (await hasUsableIdToken(uid)) return true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { unsub(); } catch { /* ignore */ }
      resolve(ok);
    };
    const timer = setTimeout(() => {
      hasUsableIdToken(uid).then((ok) => finish(ok));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid) return;
      hasUsableIdToken(uid).then((ok) => {
        if (ok) finish(true);
      });
    });
  });
}

/**
 * Attach an onSnapshot only after Auth can satisfy rules.
 * Two retries on permission-denied (with backoff); no reconnect storm after that.
 * @param {{ unsubOnDenied?: boolean }} [opts] — false keeps sibling listeners (shopping family lists)
 */
export function listenAfterAccess(uid, startListen, onDenied, { unsubOnDenied = true } = {}) {
  let cancelled = false;
  let unsub = () => {};

  const attach = async (attempt) => {
    if (cancelled) return;
    const ok = await waitForFirestoreAccess(uid);
    if (cancelled) return;
    if (!ok) {
      onDenied?.(null);
      return;
    }
    try {
      unsub();
    } catch { /* ignore */ }
    unsub = startListen((err) => {
      if (cancelled) return;
      if (attempt < 2 && isFirestorePermissionError(err)) {
        try { unsub(); } catch { /* ignore */ }
        unsub = () => {};
        setTimeout(() => {
          if (!cancelled) attach(attempt + 1);
        }, 500 * (attempt + 1));
        return;
      }
      if (unsubOnDenied) {
        try { unsub(); } catch { /* ignore */ }
        unsub = () => {};
      }
      onDenied?.(err || null);
    }) || (() => {});
  };

  attach(0);

  return () => {
    cancelled = true;
    try { unsub(); } catch { /* ignore */ }
  };
}
