/**
 * Detect a new Firebase Hosting revision without waiting for a cached
 * Metro/PWA bundle. Local Metro (localhost) is excluded so hot reload wins.
 */

export const BUILD_JSON_PATH = '/build.json';
export const HTML_BUILD_STORAGE_KEY = 'protop_html_build';

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
