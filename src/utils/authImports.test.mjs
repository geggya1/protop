/**
 * Funksjoner fra firebase/auth som kalles direkte i oppstarten og bekreftelsessiden, må være importert.
 * App.jsx kalte `reload(auth.currentUser)` uten import: kallet kastet ReferenceError inne i en
 * try/catch, appen fikk aldri vite at e-posten var bekreftet, og en ny bruker ble stående på
 * «Bekreft e-posten din» eller profilsteget etter bekreftelseslenken (SLUTT-01).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as firebaseAuth from 'firebase/auth';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTH_FUNCTIONS = Object.keys(firebaseAuth).filter((name) => typeof firebaseAuth[name] === 'function');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Navnene som er importert fra firebase/auth i filen. */
function importedFromAuth(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]firebase\/auth['"]/g)) {
    for (const part of m[1].split(',')) {
      const local = part.trim().split(/\s+as\s+/).pop();
      if (local) names.add(local);
    }
  }
  return names;
}

/** Navn som er definert i filen (funksjon, variabel, parameter i en enkel pil, annen import). */
function definedLocally(src, name) {
  const n = name.replace(/[$]/g, '\\$');
  return new RegExp(`(function\\s+${n}\\b|(const|let|var)\\s+${n}\\b|import\\s+${n}\\b|import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from\\s*['"](?!firebase/auth))`).test(src);
}

/** firebase/auth-funksjoner som kalles som fritt navn (ikke som metode, f.eks. `u.reload()`). */
function bareAuthCalls(src) {
  const code = stripComments(src);
  return AUTH_FUNCTIONS.filter((name) => new RegExp(`(^|[^.\\w$])${name}\\s*\\(`).test(code));
}

for (const file of ['App.jsx', 'screens/VerifyEmailScreen.jsx']) {
  test(`${file}: alle firebase/auth-funksjoner som kalles, er importert`, () => {
    const src = readFileSync(join(root, file), 'utf8');
    const imported = importedFromAuth(src);
    const missing = bareAuthCalls(src).filter((name) => !imported.has(name) && !definedLocally(src, name));
    assert.deepEqual(missing, [], `${file} kaller ${missing.join(', ')} uten å importere fra firebase/auth`);
  });
}

test('App.jsx: bekreftet e-post leses inn på nytt før oppstarten går videre (SLUTT-01)', () => {
  const src = readFileSync(join(root, 'App.jsx'), 'utf8');
  assert.ok(importedFromAuth(src).has('reload'), 'reload må importeres fra firebase/auth');
  assert.match(src, /onEmailVerified=\{async \(\) => \{[\s\S]*?await reload\(auth\.currentUser\);[\s\S]*?setReloadKey/);
});
