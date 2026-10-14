/**
 * Sikrer functions/node_modules før verify:web.
 * intakeScan.test.mjs importerer kode som trenger firebase-functions / msgreader.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const marker = join(root, 'functions', 'node_modules', 'firebase-functions');
if (existsSync(marker)) {
  console.log('ensure-functions-modules: ok');
  process.exit(0);
}

const install = spawnSync('npm', ['ci', '--prefix', 'functions'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(install.status ?? 1);
