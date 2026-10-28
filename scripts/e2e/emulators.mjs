/**
 * Starter emulatorene for flyt-boten: Auth, Firestore (med de ekte reglene),
 * Storage og Functions med alle funksjonene appen bruker (samme inngangsfiler
 * som slim-deployen i scripts/deploy-slim-functions.sh).
 *
 *   node scripts/e2e/emulators.mjs
 *
 * E-post og SMS fanges av mailcatcher.js og skrives til e2e-out/mail.jsonl.
 * Kjører bare lokalt, aldri mot protop-c189c i skyen. Avslutt med Ctrl+C.
 */

import { mkdirSync, symlinkSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fnDir = join(root, '.e2e-fn');
const outDir = join(root, 'e2e-out');
const mailLog = join(outDir, 'mail.jsonl');

/** Inngangsfilene som deployes, lest fra deploy-skriptet så nye funksjoner kommer med. */
function deployEntries() {
  const script = readFileSync(join(root, 'scripts', 'deploy-slim-functions.sh'), 'utf8');
  const entries = new Set();
  for (const m of script.matchAll(/^(?:queue_entry|deploy_entry)\s+(\S+\.js)/gm)) entries.add(m[1]);
  // Firestore-triggerne for tilgang deployes manuelt, men hører med i testen.
  entries.add('companyAccessTriggerIndex.js');
  // Kalender og Outlook deployes manuelt (trenger nøkler), men appen kaller dem.
  entries.add('calendarIndex.js');
  return [...entries].sort();
}

function prepareFunctions() {
  if (!existsSync(join(root, 'functions', 'node_modules'))) {
    console.error('Mangler functions/node_modules. Kjør «npm ci --prefix functions» først.');
    process.exit(2);
  }
  rmSync(fnDir, { recursive: true, force: true });
  mkdirSync(fnDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(fnDir, 'package.json'), `${JSON.stringify({
    name: 'e2e-functions',
    private: true,
    type: 'module',
    main: 'index.js',
    engines: { node: '22' },
  }, null, 2)}\n`);
  const lines = [
    '// Generert av scripts/e2e/emulators.mjs. Fangeren lastes først.',
    "import '../scripts/e2e/mailcatcher.js';",
    "import '../functions/setRegion.js';",
    ...deployEntries().map((e) => `export * from '../functions/${e}';`),
  ];
  writeFileSync(join(fnDir, 'index.js'), `${lines.join('\n')}\n`);
  // Falske nøkler: e-post går til fangeren, AI og eksterne API-er svarer med feil.
  writeFileSync(join(fnDir, '.secret.local'), 'MAIL_API_KEY=xkeysib-e2e-fanger\n');
  writeFileSync(join(fnDir, '.env.local'), `E2E_MAIL_LOG=${mailLog}\nPROTOP_MAIL_KEY=xkeysib-e2e-fanger\n`);
  symlinkSync('../functions/node_modules', join(fnDir, 'node_modules'), 'dir');
}

function writeConfig() {
  writeFileSync(join(root, '.e2e-storage.rules'), [
    "rules_version = '2';",
    'service firebase.storage {',
    '  match /b/{bucket}/o {',
    '    match /{all=**} { allow read, write: if request.auth != null; }',
    '  }',
    '}',
    '',
  ].join('\n'));
  writeFileSync(join(root, '.e2e-firebase.json'), `${JSON.stringify({
    firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
    storage: { rules: '.e2e-storage.rules' },
    functions: { source: '.e2e-fn' },
    emulators: {
      auth: { host: '127.0.0.1', port: 9099 },
      firestore: { host: '127.0.0.1', port: 8085 },
      storage: { host: '127.0.0.1', port: 9199 },
      functions: { host: '127.0.0.1', port: 5001 },
      hub: { host: '127.0.0.1', port: 4410 },
      logging: { host: '127.0.0.1', port: 4510 },
      ui: { enabled: false },
      singleProjectMode: true,
    },
  }, null, 2)}\n`);
}

prepareFunctions();
writeConfig();
const child = spawn('npx', [
  'firebase', 'emulators:start',
  '--only', 'auth,firestore,storage,functions',
  '--config', '.e2e-firebase.json',
  '--project', 'protop-c189c',
  // F.eks. --import=.e2e-data for å starte med data eksportert med «firebase emulators:export».
  ...process.argv.slice(2),
], { cwd: root, stdio: 'inherit', env: { ...process.env, E2E_MAIL_LOG: mailLog } });

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
