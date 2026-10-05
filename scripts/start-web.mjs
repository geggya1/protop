#!/usr/bin/env node
/**
 * Local Metro for daily web work. F5 in Chrome does not start this process.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_WEB_HINT = [
  'ProTop lokal web',
  '  http://localhost:8081',
  '  http://127.0.0.1:8081',
  'La denne terminalen stå åpen. F5 i Chrome starter ikke serveren.',
  'ERR_CONNECTION_REFUSED = Metro er stoppet. Kjør npm run web på nytt.',
].join('\n');

export function localWebExpoArgs() {
  return ['start', '--web', '--port', '8081'];
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  console.log(`\n${LOCAL_WEB_HINT}\n`);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
  const child = spawn(process.execPath, [expoCli, ...localWebExpoArgs()], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}
