/** Bridge så push/notifikasjoner / deep links kan åpne chat-dock uten React-hooks. */

let openFn = null;
let preferredFn = null;
let pendingThread = null;
const pendingListeners = new Set();

export function registerChatDockBridge({ openThread, isPreferred }) {
  openFn = openThread || null;
  preferredFn = isPreferred || null;
  // If dock just became ready and we have a queued deep link, open it.
  if (openFn && pendingThread && (!preferredFn || preferredFn())) {
    const t = pendingThread;
    pendingThread = null;
    try { openFn(t); } catch { /* ignore */ }
  }
}

export function tryOpenChatInDock(thread) {
  if (!thread?.chatId) return false;
  if (typeof preferredFn === 'function' && !preferredFn()) return false;
  if (typeof openFn !== 'function') return false;
  openFn(thread);
  return true;
}

/**
 * Queue a friend/family thread for ChatDock. Used by linking before the
 * React tree is ready — ChatDockProvider consumes via subscribe/consume.
 */
export function queueChatDockThread(thread) {
  if (!thread?.chatId) return false;
  if (tryOpenChatInDock(thread)) {
    pendingThread = null;
    return true;
  }
  pendingThread = thread;
  pendingListeners.forEach((fn) => {
    try { fn(thread); } catch { /* ignore */ }
  });
  return false;
}

export function consumePendingChatDockThread() {
  const t = pendingThread;
  pendingThread = null;
  return t;
}

export function subscribePendingChatDockThread(fn) {
  if (typeof fn !== 'function') return () => {};
  pendingListeners.add(fn);
  if (pendingThread) {
    try { fn(pendingThread); } catch { /* ignore */ }
  }
  return () => pendingListeners.delete(fn);
}
