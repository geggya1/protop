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
  'functions/package.json',
  'functions/package-lock.json',
];

/** Samme entries som scripts/deploy-slim-functions.sh. */
export const DEPLOY_ENTRIES = [
  'tenderIndex.js',
  'anbudDigestIndex.js',
  'anbudFormIndex.js',
  'agreementIndex.js',
  'openFeedIndex.js',
  'interpretAvtaleIndex.js',
  'anbudIntakeIndex.js',
  'friendListIndex.js',
  'friendInviteIndex.js',
  'indeksIndex.js',
  'importIndex.js',
  'employeeInviteIndex.js',
  'storageIndex.js',
  'doffinIndex.js',
  'aiIndex.js',
  'vegvesenIndex.js',
  'membershipIndex.js',
  'companyAccessIndex.js',
  'authIndex.js',
  'hospitalityIndex.js',
  'stravaIndex.js',
  'pushIndex.js',
  'notifyPushIndex.js',
  'vacationPlanIndex.js',
  'vacationPlanDailyIndex.js',
  'aiCleanupIndex.js',
  'indeksSsbDailyIndex.js',
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

function walkClosure(root, startFiles) {
  const closure = new Set();
  const queue = [...startFiles];
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

export function functionSourceClosure(root = repoRoot) {
  const starts = walkFunctions(root).filter((path) => /\.(js|mjs|cjs)$/.test(path));
  return walkClosure(root, starts);
}

export function closureForEntry(entry, root = repoRoot) {
  return walkClosure(root, [join(root, 'functions', entry)]);
}

export function entriesForChanges(changed, root = repoRoot) {
  const paths = [...changed].map((raw) => String(raw || '').split('\\').join('/').replace(/^\.\//, '')).filter(Boolean);
  if (paths.some((rel) => EXTRA_PATHS.includes(rel))) return [...DEPLOY_ENTRIES];
  const selected = [];
  const covered = new Set();
  for (const entry of DEPLOY_ENTRIES) {
    const closure = closureForEntry(entry, root);
    for (const rel of closure) covered.add(rel);
    if (paths.some((rel) => closure.has(rel))) selected.push(entry);
  }
  if (paths.some((rel) => rel.startsWith('functions/') && !isSkippedFunctionsFile(rel) && !covered.has(rel))) {
    return [...DEPLOY_ENTRIES];
  }
  return selected;
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
  if (!before || /^0+$/.test(before) || !ensureCommit(repoRoot, before) || !ensureCommit(repoRoot, head)) {
    return { deploy: true, entries: 'all' };
  }
  const entries = entriesForChanges(gitDiffNames(repoRoot, before, head));
  if (!entries.length) return { deploy: false, entries: '' };
  if (entries.length === DEPLOY_ENTRIES.length) return { deploy: true, entries: 'all' };
  return { deploy: true, entries: entries.join(',') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flag = process.argv[2];
  if (flag === '--check') {
    const result = checkRange(process.argv[3], process.argv[4]);
    process.stdout.write(`deploy=${result.deploy ? 'true' : 'false'}\n`);
    process.stdout.write(`entries=${result.entries}\n`);
  } else {
    const closure = functionSourceClosure();
    process.stdout.write(`${closure.size} files in the function deploy closure\n`);
  }
}
