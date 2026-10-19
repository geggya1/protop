/**
 * Avgjør om slim-deploy av Cloud Functions må kjøre.
 * Web-endringer utenfor funksjonenes importgraf skal ikke holde
 * functions-protop-c189c opptatt i en halvtime.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXTRA_PATHS = [
  'scripts/deploy-slim-functions.sh',
  'scripts/stage-function-src.mjs',
  'scripts/open-callable-invoker.mjs',
  'scripts/apply-storage-cors.mjs',
  'scripts/functions-deploy-needed.mjs',
  'firebase.json',
  '.github/workflows/deploy-hosting.yml',
];

const SPECIFIER_RE = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function posix(root, path) {
  return relative(root, path).split('\\').join('/');
}

function isSkippedFunctionsFile(rel) {
  if (!rel.startsWith('functions/')) return false;
  if (rel.includes('/node_modules/') || rel.startsWith('functions/node_modules/')) return true;
  if (rel.includes('/_src/') || rel.startsWith('functions/_src/')) return true;
  if (/\.test\.(mjs|cjs|js)$/.test(rel)) return true;
  return false;
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    join(base, 'index.js'),
    join(base, 'index.mjs'),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) || null;
}

function walkFunctions(root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '_src') continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        visit(path);
        continue;
      }
      const rel = posix(root, path);
      if (isSkippedFunctionsFile(rel)) continue;
      out.push(path);
    }
  };
  visit(join(root, 'functions'));
  return out;
}

export function functionSourceClosure(root = repoRoot) {
  const closure = new Set();
  const queue = walkFunctions(root).filter((path) => /\.(js|mjs|cjs)$/.test(path));
  const seen = new Set();

  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const rel = posix(root, path);
    if (rel.startsWith('..') || isSkippedFunctionsFile(rel)) continue;
    closure.add(rel);
    let text = '';
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const re of SPECIFIER_RE) {
      re.lastIndex = 0;
      let match = re.exec(text);
      while (match) {
        const resolved = resolveSpecifier(path, match[1]);
        if (resolved) queue.push(resolved);
        match = re.exec(text);
      }
    }
  }
  return closure;
}

export function deployNeededForPaths(changed, closure = functionSourceClosure()) {
  for (const raw of changed) {
    const rel = String(raw || '').split('\\').join('/').replace(/^\.\//, '');
    if (!rel) continue;
    if (EXTRA_PATHS.includes(rel)) return true;
    if (rel.startsWith('functions/') && !isSkippedFunctionsFile(rel)) return true;
    if (closure.has(rel)) return true;
  }
  return false;
}

function gitDiffNames(root, before, head) {
  const diff = spawnSync('git', ['diff', '--name-only', before, head], {
    cwd: root,
    encoding: 'utf8',
  });
  if (diff.status !== 0) {
    throw new Error(diff.stderr || 'git diff failed');
  }
  return diff.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function ensureCommit(root, sha) {
  const has = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root });
  if (has.status === 0) return true;
  const fetched = spawnSync('git', ['fetch', '--no-tags', '--depth=80', 'origin', 'main'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (fetched.status !== 0) return false;
  const again = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root });
  return again.status === 0;
}

function checkRange(before, head) {
  if (!before || /^0+$/.test(before)) return true;
  if (!ensureCommit(repoRoot, before) || !ensureCommit(repoRoot, head)) return true;
  return deployNeededForPaths(gitDiffNames(repoRoot, before, head));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flag = process.argv[2];
  if (flag === '--check') {
    const needed = checkRange(process.argv[3], process.argv[4]);
    process.stdout.write(`deploy=${needed ? 'true' : 'false'}\n`);
  } else {
    const closure = functionSourceClosure();
    process.stdout.write(`${closure.size} files in the function deploy closure\n`);
  }
}
