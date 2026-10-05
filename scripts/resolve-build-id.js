const { execSync } = require('child_process');

/**
 * Unique id per web build so clients can detect a new Hosting revision.
 * CI should pass APP_BUILD_ID (git SHA). Local preview uses short SHA + time
 * so two previews never share the stale placeholder in src/constants/build.js.
 */
function resolveBuildId({ env = process.env, exec = execSync, now = Date.now } = {}) {
  const fromEnv = String(env.APP_BUILD_ID || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const sha = String(exec('git rev-parse --short HEAD', { encoding: 'utf8' })).trim();
    if (sha) return `${sha}-${now().toString(36)}`;
  } catch { /* not a git checkout */ }
  return `dev-${now().toString(36)}`;
}

module.exports = { resolveBuildId };
