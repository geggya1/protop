/**
 * Detect a new Firebase Hosting revision without waiting for a cached
 * Metro/PWA bundle. Local Metro (localhost) is excluded so hot reload wins.
 */

export const BUILD_JSON_PATH = '/build.json';
export const HTML_BUILD_STORAGE_KEY = 'protop_html_build';
/** One hard reload per tab. A stale immutable bundle must not spin forever. */
export const BUILD_RELOAD_SESSION_KEY = 'protop_build_reload_once';

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

/** Returns true only the first time this tab tries to reload for a new build. */
export function claimBuildReload(storage) {
  if (!storage) return false;
  try {
    if (storage.getItem(BUILD_RELOAD_SESSION_KEY) === '1') return false;
    storage.setItem(BUILD_RELOAD_SESSION_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
