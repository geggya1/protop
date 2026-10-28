/**
 * Kjører alle sosial-scenarioene (team B) etter hverandre og samler resultatet.
 * Hvert scenario lager sine egne brukere og sitt eget selskap.
 *
 *   cd /home/user/protop && NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/sosial-alle.mjs
 *   (bare noen: ... sosial-alle.mjs venner chat)
 *
 * Avslutter med kode 1 hvis minst ett scenario har AVVIK.
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ALL = ['venner', 'chat', 'notater', 'oppgaver', 'kalender'];
const pick = process.argv.slice(2).filter((a) => ALL.includes(a));
const list = pick.length ? pick : ALL;
const results = [];
for (const name of list) {
  console.log(`\n=== sosial-${name} ===`);
  const r = spawnSync(process.execPath, [join(here, `sosial-${name}.mjs`)], { stdio: 'inherit', env: process.env });
  results.push({ name, code: r.status });
}
console.log('\nSammendrag:');
for (const r of results) console.log(`  sosial-${r.name}: ${r.code === 0 ? 'OK' : `AVVIK (exit ${r.code})`}`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
