/**
 * Slim interpretAvtaleHttp / friendListHttp must stay inside functions/ and
 * be deployed via Hosting rewrite — never as a CORS-callable from protop.no.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const httpSrc = readFileSync(join(__dirname, 'interpretAvtaleHttp.js'), 'utf8');
const coreSrc = readFileSync(join(__dirname, 'interpretAvtaleCore.js'), 'utf8');
const indexSrc = readFileSync(join(__dirname, 'interpretAvtaleIndex.js'), 'utf8');
const friendHttp = readFileSync(join(__dirname, 'friendListHttp.js'), 'utf8');
const friendIndex = readFileSync(join(__dirname, 'friendListIndex.js'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/deploy-hosting.yml'), 'utf8');
const hosting = readFileSync(join(root, 'firebase.json'), 'utf8');
const aiClient = readFileSync(join(root, 'src/indeksregulering/aiClient.js'), 'utf8');
const formSrc = readFileSync(join(root, 'screens/anbud/DirectAgreementForm.jsx'), 'utf8');
const friendsSrc = readFileSync(join(root, 'src/utils/friends.js'), 'utf8');

assert.match(httpSrc, /export const interpretAvtaleHttp/);
assert.match(httpSrc, /onRequest/);
assert.match(httpSrc, /invoker:\s*'public'/);
assert.match(httpSrc, /touchGeminiEnv/);
assert.doesNotMatch(httpSrc, /\.\.\/src\//);
assert.doesNotMatch(coreSrc, /\.\.\/src\//);
assert.match(coreSrc, /from '\.\/indeksregulering\/interpret\.js'/);

assert.match(indexSrc, /import '\.\/setRegion\.js'/);
assert.match(indexSrc, /interpretAvtaleHttp/);

assert.match(friendHttp, /export const friendListHttp/);
assert.match(friendHttp, /onRequest/);
assert.match(friendHttp, /invoker:\s*'public'/);
assert.doesNotMatch(friendHttp, /defineSecret|MAIL_API_KEY|\.\.\/src\//);
assert.match(friendIndex, /friendListHttp/);

assert.match(hosting, /\/api\/interpret-avtale/);
assert.match(hosting, /interpretAvtaleHttp/);
assert.match(hosting, /\/api\/friends/);
assert.match(hosting, /friendListHttp/);

assert.match(workflow, /interpretAvtaleIndex\.js/);
assert.match(workflow, /functions:interpretAvtaleHttp/);
assert.match(workflow, /friendListIndex\.js/);
assert.match(workflow, /functions:friendListHttp/);

assert.match(aiClient, /\/api\/interpret-avtale/);
assert.doesNotMatch(aiClient, /httpsCallable|interpretIndeksAvtale|cloudfunctions/);
assert.doesNotMatch(formSrc, /cloudfunctions|applyRemoteFile|fileBase64/);
assert.match(friendsSrc, /\/api\/friends/);
assert.match(friendsSrc, /listMyFriends/);
assert.doesNotMatch(friendsSrc, /httpsCallable\(functions, 'listMyFriends'/);
assert.doesNotMatch(friendsSrc, /httpsCallable\(functions, 'listFriendRequests'/);

const deployed = readFileSync(join(__dirname, 'indeksregulering/interpret.js'), 'utf8');
const source = readFileSync(join(root, 'src/indeksregulering/interpret.js'), 'utf8');
assert.equal(deployed, source);

console.log('functions/interpretAvtale.smoke.test.mjs: all passed');
