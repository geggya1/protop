/**
 * Cloud Functions laster bare opp functions/.
 * Import av ../src/... virker på byggemaskinen, men krasjer i beholderen
 * fordi de filene ikke følger med. Da rekker ikke funksjonen å lytte,
 * og helsesjekken feiler.
 *
 * stage kopierer src/ inn i functions/_src og peker importene dit.
 * restore setter filene tilbake etter opplasting.
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function markerPath(root) {
  return join(root, 'functions', '.src-stage.json');
}

function walkJs(dir, functionsDir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '_src') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkJs(path, functionsDir, out);
      continue;
    }
    if (name.endsWith('.js')) out.push(path);
  }
}

export function stageFunctionSrc(root = repoRoot) {
  const functionsDir = join(root, 'functions');
  const marker = markerPath(root);
  if (existsSync(marker)) restoreFunctionSrc(root);
  const dest = join(functionsDir, '_src');
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(root, 'src'), dest, { recursive: true });
  const files = [];
  walkJs(functionsDir, functionsDir, files);
  const originals = {};
  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes("from '../src/") && !text.includes('from "../src/')) continue;
    const rel = relative(dirname(path), dest).split('\\').join('/');
    const prefix = rel.startsWith('.') ? rel : `./${rel}`;
    const next = text.replace(/from (['"])\.\.\/src\//g, `from $1${prefix}/`);
    if (next === text) continue;
    originals[relative(root, path).split('\\').join('/')] = text;
    writeFileSync(path, next);
  }
  writeFileSync(marker, JSON.stringify({ originals }, null, 2));
  return { files: Object.keys(originals), dest };
}

export function restoreFunctionSrc(root = repoRoot) {
  const functionsDir = join(root, 'functions');
  const marker = markerPath(root);
  if (existsSync(marker)) {
    const { originals = {} } = JSON.parse(readFileSync(marker, 'utf8'));
    for (const [rel, text] of Object.entries(originals)) {
      writeFileSync(join(root, rel), text);
    }
    rmSync(marker, { force: true });
  }
  rmSync(join(functionsDir, '_src'), { recursive: true, force: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2];
  if (command === 'stage') {
    const result = stageFunctionSrc();
    console.log(`staged ${result.files.length} imports into functions/_src`);
  } else if (command === 'restore') {
    restoreFunctionSrc();
    console.log('restored function source imports');
  } else {
    console.error('usage: node scripts/stage-function-src.mjs stage|restore');
    process.exit(1);
  }
}
