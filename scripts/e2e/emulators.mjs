/**
 * Emulatorer for e2e-testene (Auth, Firestore, Functions) med konsernfunksjonene og triggerne,
 * frødd med hjelpe-botens testbedrift og de to selskapene i konserntesten.
 *
 *   node scripts/e2e/emulators.mjs
 */
import { mkdirSync, symlinkSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { seed } from '../help-bot/seed.mjs';
import { seedIntercompany } from './seed-intercompany.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fnDir = join(root, '.helpbot-fn');

if (!existsSync(join(root, 'functions', 'node_modules'))) {
  console.error('Mangler functions/node_modules.');
  process.exit(2);
}
rmSync(fnDir, { recursive: true, force: true });
mkdirSync(fnDir, { recursive: true });
writeFileSync(join(fnDir, 'package.json'), `${JSON.stringify({ name: 'e2e-functions', private: true, type: 'module', main: 'index.js', engines: { node: '22' } }, null, 2)}\n`);
writeFileSync(join(fnDir, 'index.js'), [
  "import '../functions/setRegion.js';",
  "export * from '../functions/intercompanyIndex.js';",
  "export * from '../functions/intercompanyTriggerIndex.js';",
  "export { findCompanyByOrgnr, claimCompanyOrgnr, requestCompanyJoin } from '../functions/companyJoin.js';",
  '',
].join('\n'));
symlinkSync('../functions/node_modules', join(fnDir, 'node_modules'), 'dir');

async function waitFor(url, timeoutMs = 240000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch { /* ikke klar */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

const child = spawn('npx', ['firebase', 'emulators:start', '--only', 'auth,firestore,functions', '--config', 'firebase.helpbot.json', '--project', 'protop-c189c'], { cwd: root, stdio: 'inherit' });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));

if (await waitFor('http://127.0.0.1:9099/') && await waitFor('http://127.0.0.1:5001/')) {
  await new Promise((r) => setTimeout(r, 6000));
  try {
    console.log('frødd hjelpebot', await seed());
    console.log('frødd konsern', await seedIntercompany());
    writeFileSync(join(root, '.e2e-ready'), new Date().toISOString());
  } catch (err) {
    console.error('Frøing feilet:', err?.message || err);
    process.exit(1);
  }
} else {
  console.error('Emulatorene startet ikke i tide.');
  process.exit(1);
}
