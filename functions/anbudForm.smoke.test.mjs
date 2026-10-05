/**
 * Slim generateCompanyForm entry must stay inside functions/ and keep CORS/IAM
 * that browsers need for httpsCallable from protop.no.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const formSrc = readFileSync(join(__dirname, 'anbudForm.js'), 'utf8');
const indexSrc = readFileSync(join(__dirname, 'anbudFormIndex.js'), 'utf8');
const geminiSrc = readFileSync(join(__dirname, 'geminiEnv.js'), 'utf8');
const script = readFileSync(join(__dirname, '../scripts/deploy-slim-functions.sh'), 'utf8');
const workflow = readFileSync(join(__dirname, '../.github/workflows/deploy-hosting.yml'), 'utf8');

assert.match(formSrc, /export const generateCompanyForm/);
assert.match(formSrc, /invoker:\s*'public'/);
assert.match(formSrc, /cors:\s*true/);
assert.match(formSrc, /from '\.\/anbud\/formBuilder\.js'/);
assert.match(formSrc, /touchGeminiEnv/);
assert.doesNotMatch(formSrc, /\.\.\/src\//);

assert.match(indexSrc, /import '\.\/setRegion\.js'/);
assert.match(indexSrc, /initializeApp/);
assert.match(indexSrc, /generateCompanyForm/);
assert.match(indexSrc, /from '\.\/anbudForm\.js'/);

assert.doesNotMatch(geminiSrc, /from 'firebase-functions\/params'/);
assert.doesNotMatch(geminiSrc, /defineString\(/);
assert.match(script, /anbudFormIndex\.js/);
assert.match(script, /functions:generateCompanyForm/);
assert.match(script, /openFeedIndex\.js/);
assert.match(script, /functions:fetchOpenFeed/);
assert.match(script, /friendInviteIndex\.js/);
assert.match(script, /functions:listMyFriends/);
assert.match(script, /indeksIndex\.js/);
assert.match(script, /functions:interpretIndeksAvtale/);
assert.match(script, /return 0/);
assert.match(script, /PROTOP_GEMINI_KEY/);
assert.match(workflow, /scripts\/deploy-slim-functions\.sh/);
assert.match(workflow, /secrets\.PROTOP_GEMINI_KEY/);

const deployed = readFileSync(join(__dirname, 'anbud/formBuilder.js'), 'utf8');
const source = readFileSync(join(__dirname, '../src/anbud/formBuilder.js'), 'utf8');
assert.equal(deployed, source);

const copies = ['catalog.js', 'engine.js', 'interpret.js', 'ssb.js', 'watch.js'];
for (const name of copies) {
  const a = readFileSync(join(__dirname, 'indeksregulering', name), 'utf8');
  const b = readFileSync(join(__dirname, '../src/indeksregulering', name), 'utf8');
  assert.equal(a, b, name);
}

const indeksAi = readFileSync(join(__dirname, 'indeksreguleringAi.js'), 'utf8');
assert.doesNotMatch(indeksAi, /\.\.\/src\//);
assert.match(indeksAi, /from '\.\/indeksregulering\/interpret\.js'/);

console.log('functions/anbudForm.smoke.test.mjs: all passed');
