import assert from 'node:assert/strict';

function isFirestorePermissionError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '');
  return code.includes('permission-denied')
    || /missing or insufficient permissions/i.test(msg);
}

assert.equal(isFirestorePermissionError({ code: 'permission-denied' }), true);
assert.equal(isFirestorePermissionError({ message: 'Missing or insufficient permissions.' }), true);
assert.equal(isFirestorePermissionError({ code: 'unavailable', message: 'offline' }), false);

let attachCount = 0;
let liveUnsub = 0;
function listenAfterAccess(uid, startListen, onDenied, waitFn) {
  let cancelled = false;
  let unsub = () => {};
  const attach = async (retried) => {
    if (cancelled) return;
    const ok = await waitFn(uid);
    if (cancelled) return;
    if (!ok) {
      onDenied?.(null);
      return;
    }
    try { unsub(); } catch { /* ignore */ }
    attachCount += 1;
    unsub = startListen((err) => {
      if (cancelled) return;
      if (!retried && String(err?.code || '').includes('permission-denied')) {
        try { unsub(); } catch { /* ignore */ }
        unsub = () => {};
        attach(true);
        return;
      }
      try { unsub(); } catch { /* ignore */ }
      unsub = () => {};
      onDenied?.(err || null);
    }) || (() => {});
  };
  attach(false);
  return () => {
    cancelled = true;
    try { unsub(); } catch { /* ignore */ }
  };
}

const denied = [];
const stop = listenAfterAccess('u1', (onErr) => {
  liveUnsub += 1;
  onErr({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
  return () => { liveUnsub -= 1; };
}, (err) => denied.push(err), async () => true);

await new Promise((r) => setTimeout(r, 20));
assert.equal(attachCount, 2, 'one retry then stop');
assert.equal(liveUnsub, 0, 'snapshot unsubscribed after deny');
assert.equal(denied.length, 1);
assert.equal(denied[0].code, 'permission-denied');
stop();

console.log('firestorePermission.test.mjs: ok');
