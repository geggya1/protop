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

assert.match(workflow, /anbudFormIndex\.js/);
assert.match(workflow, /functions:generateCompanyForm/);
assert.match(workflow, /openFeedIndex\.js/);
assert.match(workflow, /functions:fetchOpenFeed/);
assert.match(workflow, /friendInviteIndex\.js/);
assert.match(workflow, /functions:listMyFriends/);

const deployed = readFileSync(join(__dirname, 'anbud/formBuilder.js'), 'utf8');
const source = readFileSync(join(__dirname, '../src/anbud/formBuilder.js'), 'utf8');
assert.equal(deployed, source);

console.log('functions/anbudForm.smoke.test.mjs: all passed');
