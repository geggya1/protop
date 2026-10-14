/**
 * Same-origin scanAnbudDocumentHttp must stay inside functions/ and
 * be deployed via Hosting rewrite — not as a CORS-callable from protop.no.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const httpSrc = readFileSync(join(__dirname, 'anbudIntakeHttp.js'), 'utf8');
const scanSrc = readFileSync(join(__dirname, 'anbud/intakeScan.js'), 'utf8');
const indexSrc = readFileSync(join(__dirname, 'anbudIntakeIndex.js'), 'utf8');
const slimFn = readFileSync(join(root, 'scripts/deploy-slim-functions.sh'), 'utf8');
const hosting = readFileSync(join(root, 'firebase.json'), 'utf8');
const client = readFileSync(join(root, 'src/anbud/intakeClient.js'), 'utf8');
const panel = readFileSync(join(root, 'screens/anbud/IntakePanel.jsx'), 'utf8');
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

assert.match(httpSrc, /export const scanAnbudDocumentHttp/);
assert.match(httpSrc, /onRequest/);
assert.match(httpSrc, /invoker:\s*'public'/);
assert.match(httpSrc, /touchGeminiEnv/);
assert.doesNotMatch(httpSrc, /\.\.\/src\//);
assert.doesNotMatch(scanSrc, /\.\.\/src\//);
assert.match(scanSrc, /@kenjiuno\/msgreader/);
assert.match(scanSrc, /\.msg|\.eml/);
assert.match(indexSrc, /import '\.\/setRegion\.js'/);
assert.match(indexSrc, /scanAnbudDocumentHttp/);

assert.match(hosting, /\/api\/scan-anbud/);
assert.match(hosting, /scanAnbudDocumentHttp/);
assert.match(slimFn, /functions:scanAnbudDocumentHttp/);
assert.match(slimFn, /anbudIntakeIndex\.js/);

assert.match(client, /\/api\/scan-anbud/);
assert.doesNotMatch(client, /httpsCallable\(functions, 'scanAnbudDocument'/);
assert.match(panel, /pickDocument|onDropFiles|dataTransfer/);
assert.ok(pkg.dependencies?.['@kenjiuno/msgreader']);

console.log('functions/anbudIntake.smoke.test.mjs: all passed');
