#!/usr/bin/env node
/**
 * Fail if a relative firebase import cannot be resolved.
 * Nested files like src/utils/mattehjelp/progress.js need ../../../firebase,
 * not ../../firebase (that looks for src/firebase and breaks expo export → 404).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /from\s+['"](\.\.?\/[^'"]*firebase)['"]/g;
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'web-build', '.git', '.expo']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (EXTS.has(extname(name))) acc.push(p);
  }
  return acc;
}

const files = walk(root);
let failed = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1];
    const base = resolve(dirname(file), spec);
    const ok = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs'].some((ext) => existsSync(base + ext));
    if (!ok) {
      const rel = file.slice(root.length + 1);
      console.error(`${rel}: cannot resolve '${spec}' (expected ${base}.js)`);
      failed += 1;
    }
  }
}

if (failed) {
  console.error(`firebase import check failed: ${failed} unresolved`);
  process.exit(1);
}
console.log(`firebase import check: ok (${files.length} files)`);
