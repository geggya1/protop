/**
 * Starter Auth-, Firestore- og Functions-emulatorene for hjelpe-boten og
 * frør testbedriften. Functions kjører bare AI-/supportfunksjonene
 * (functions/aiIndex.js), samme inngang som slim-deployen.
 *
 *   node scripts/help-bot/emulators.mjs
 *
 * Avslutt med Ctrl+C.
 */

import { mkdirSync, symlinkSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { seed } from './seed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fnDir = join(root, '.helpbot-fn');

function prepareFunctions() {
  if (!existsSync(join(root, 'functions', 'node_modules'))) {
    console.error('Mangler functions/node_modules. Kjør «npm ci --prefix functions» først.');
    process.exit(2);
  }
  rmSync(fnDir, { recursive: true, force: true });
  mkdirSync(fnDir, { recursive: true });
  writeFileSync(join(fnDir, 'package.json'), `${JSON.stringify({
    name: 'helpbot-functions',
    private: true,
    type: 'module',
    main: 'index.js',
    engines: { node: '22' },
  }, null, 2)}\n`);
  writeFileSync(join(fnDir, 'index.js'), "// Bare AI-/support-funksjonene, samme inngang som slim-deployen.\nexport * from '../functions/aiIndex.js';\n");
  symlinkSync('../functions/node_modules', join(fnDir, 'node_modules'), 'dir');
}

async function waitForAuth(timeoutMs = 180000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch('http://127.0.0.1:9099/');
      if (res.ok || res.status < 500) return true;
    } catch { /* ikke klar ennå */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

prepareFunctions();
const child = spawn('npx', [
  'firebase', 'emulators:start',
  '--only', 'auth,firestore,functions',
  '--config', 'firebase.helpbot.json',
  '--project', 'protop-c189c',
], { cwd: root, stdio: 'inherit' });

process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));

if (await waitForAuth()) {
  // Firestore og Functions trenger litt mer tid etter Auth.
  await new Promise((r) => setTimeout(r, 8000));
  try {
    console.log('frødd', await seed());
    console.log('\nKlar. Start web med:\n  EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo start --web --port 8081\nog kjør boten med:\n  node scripts/help-bot/run.mjs');
  } catch (err) {
    console.error('Frøing feilet:', err?.message || err);
  }
} else {
  console.error('Emulatorene startet ikke i tide.');
}
