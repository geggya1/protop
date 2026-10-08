/**
 * Write the deploy build id into src/constants/build.js before Expo hashes
 * the bundle, then restore the placeholder. The hashed filename then changes
 * on every Hosting deploy, so immutable /_expo caching cannot pin an old
 * APP_BUILD_ID and reload the page forever.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveBuildId } = require('./resolve-build-id');

const constantsPath = path.join(__dirname, '..', 'src', 'constants', 'build.js');
const original = fs.readFileSync(constantsPath, 'utf8');
const buildId = resolveBuildId();
if (!/^[\w.-]+$/.test(buildId)) {
  console.error(`Refusing unsafe build id: ${buildId}`);
  process.exit(1);
}
const stamped = original.replace(
  /APP_BUILD_ID\s*=\s*['"][^'"]+['"]/,
  `APP_BUILD_ID = '${buildId}'`,
);
if (stamped === original) {
  console.error('Could not stamp APP_BUILD_ID into src/constants/build.js');
  process.exit(1);
}

let status = 1;
try {
  fs.writeFileSync(constantsPath, stamped);
  console.log(`export:web with APP_BUILD_ID=${buildId}`);
  const result = spawnSync('npm', ['run', 'export:web'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env,
  });
  status = result.status === null ? 1 : result.status;
} finally {
  fs.writeFileSync(constantsPath, original);
}
process.exit(status);
