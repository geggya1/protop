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
const openFeed = readFileSync(join(__dirname, 'openFeed.js'), 'utf8');
const openFeedIndex = readFileSync(join(__dirname, 'openFeedIndex.js'), 'utf8');
const openFeedClient = readFileSync(join(root, 'src/utils/openFeedClient.js'), 'utf8');
const ocrSrc = readFileSync(join(__dirname, 'ocrPdf.js'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/deploy-hosting.yml'), 'utf8');
const slimFn = readFileSync(join(root, 'scripts/deploy-slim-functions.sh'), 'utf8');
const indexJs = readFileSync(join(root, 'index.js'), 'utf8');
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
assert.match(coreSrc, /from '\.\/ocrPdf\.js'/);
assert.match(ocrSrc, /createWorker/);
assert.match(httpSrc, /timeoutSeconds:\s*120/);

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

assert.match(hosting, /\/api\/open-feed/);
assert.match(hosting, /fetchOpenFeedHttp/);

assert.match(workflow, /branches:\s*\n\s*- main/);
assert.match(workflow, /npx firebase deploy --only hosting/);
assert.match(workflow, /deploy-slim-functions\.sh/);
assert.match(workflow, /WEEKPLAN_GEMINI_KEY/);
assert.doesNotMatch(workflow, /hosting:channel:deploy/);
assert.doesNotMatch(workflow, /offentlig/);

assert.match(slimFn, /functions:interpretAvtaleHttp/);
assert.match(slimFn, /functions:friendListHttp/);
assert.match(slimFn, /functions:fetchOpenFeedHttp/);
assert.match(slimFn, /interpretAvtaleIndex\.js/);
assert.doesNotMatch(indexJs, /DevHostBanner/);

assert.match(aiClient, /\/api\/interpret-avtale/);
assert.doesNotMatch(aiClient, /httpsCallable|interpretIndeksAvtale|cloudfunctions/);
assert.doesNotMatch(formSrc, /cloudfunctions|interpretIndeksAvtale/);
assert.match(formSrc, /OCR og KI/);
assert.match(friendsSrc, /\/api\/friends/);
assert.match(friendsSrc, /listMyFriends/);
assert.doesNotMatch(friendsSrc, /httpsCallable\(functions, 'listMyFriends'/);
assert.doesNotMatch(friendsSrc, /httpsCallable\(functions, 'listFriendRequests'/);

assert.match(openFeed, /export const fetchOpenFeedHttp/);
assert.match(openFeed, /onRequest/);
assert.match(openFeedIndex, /fetchOpenFeedHttp/);
assert.match(openFeedClient, /\/api\/open-feed/);
assert.doesNotMatch(openFeedClient, /httpsCallable/);

const deployed = readFileSync(join(__dirname, 'indeksregulering/interpret.js'), 'utf8');
const source = readFileSync(join(root, 'src/indeksregulering/interpret.js'), 'utf8');
assert.equal(deployed, source);

console.log('functions/interpretAvtale.smoke.test.mjs: all passed');
