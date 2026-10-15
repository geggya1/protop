import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(join(ROOT, 'components/ShellErrorBoundary.jsx'), 'utf8');
const appShell = readFileSync(join(ROOT, 'components/AppShell.jsx'), 'utf8');

assert.match(src, /nativeID="shell-error-retry"/);
assert.match(src, /Prøv igjen/);
assert.match(src, /componentDidCatch/);
assert.match(src, /console\.error\('\[ShellErrorBoundary\]'/);
assert.match(appShell, /ShellErrorBoundary key=\{`\$\{tab\}:\$\{moreSubView/);

console.log('shellErrorBoundary.test.mjs: ok');
