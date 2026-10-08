import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uploadSrc = readFileSync(join(root, 'functions/uploadStorage.js'), 'utf8');
const mediaSrc = readFileSync(join(root, 'src/utils/media.js'), 'utf8');
const deploySrc = readFileSync(join(root, 'scripts/deploy-slim-functions.sh'), 'utf8');
const workflowSrc = readFileSync(join(root, '.github/workflows/deploy-hosting.yml'), 'utf8');
const cors = JSON.parse(readFileSync(join(root, 'cors.json'), 'utf8'));

assert.match(uploadSrc, /handleUploadStorageFile/);
assert.match(uploadSrc, /assertCanWriteObjectPath/);
assert.match(uploadSrc, /families\/personal\//);
assert.match(uploadSrc, /ensureStorageCors/);
assert.match(uploadSrc, /protop-c189c\.firebasestorage\.app/);

assert.match(mediaSrc, /uploadStorageFile/);
assert.match(mediaSrc, /uploadImageViaCallable/);
const uploadImageBlock = mediaSrc.slice(mediaSrc.indexOf('export async function uploadImage'));
assert.match(uploadImageBlock, /uploadImageViaCallable/);
assert.ok(
  uploadImageBlock.indexOf('uploadImageViaCallable') < uploadImageBlock.indexOf('uploadBytes'),
  'web uploadImage should try callable before client Storage',
);

assert.match(deploySrc, /storageIndex\.js/);
assert.match(deploySrc, /uploadStorageFile/);
assert.match(workflowSrc, /apply-storage-cors\.mjs/);

assert.ok(cors[0].origin.includes('https://protop.no'));
assert.ok(cors[0].method.includes('OPTIONS'));
assert.ok(cors[0].responseHeader.includes('x-firebase-storage-version'));

console.log('uploadStorage.test.mjs: ok');
