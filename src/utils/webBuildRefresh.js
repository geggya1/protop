/**
 * Detect a new Firebase Hosting revision without waiting for a cached
 * Metro/PWA bundle. Local Metro (localhost) is excluded so hot reload wins.
 */

export const BUILD_JSON_PATH = '/build.json';
export const HTML_BUILD_STORAGE_KEY = 'protop_html_build';
/**
 * Last remote build id this tab already tried to reload for.
 * A new id may reload once. The same id must not spin if HTML stays cached.
 */
export const BUILD_RELOAD_SESSION_KEY = 'protop_build_reload_target';

export function isLocalWebHost(hostname) {
  const host = String(hostname || '');
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host.endsWith('.localhost');
}

export function shouldSkipWebBuildRefresh({ hostname, oauthReturn } = {}) {
  if (oauthReturn) return true;
  return isLocalWebHost(hostname);
}

export function shouldReloadForRemoteBuild(localId, remoteId) {
  const local = String(localId || '').trim();
  const remote = String(remoteId || '').trim();
  if (!local || !remote) return false;
  return local !== remote;
}

/** True the first time this tab tries to reload onto `targetId`. */
export function claimBuildReload(storage, targetId = '1') {
  if (!storage) return false;
  const target = String(targetId || '').trim() || '1';
  try {
    if (storage.getItem(BUILD_RELOAD_SESSION_KEY) === target) return false;
    storage.setItem(BUILD_RELOAD_SESSION_KEY, target);
    return true;
  } catch {
    return false;
  }
}
