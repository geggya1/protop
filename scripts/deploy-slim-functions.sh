#!/usr/bin/env bash
# Slim Cloud Function deploys used by Hosting CI.
# Each target is independent: one missing param must not skip friends/feed.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
writeFileSync('firebase.functions.json', JSON.stringify({ ...cfg, functions: { source: 'functions' } }));
const key = process.env.PROTOP_GEMINI_KEY || '';
writeFileSync('functions/.env', 'PROTOP_GEMINI_KEY=' + JSON.stringify(key) + '\n');
"

npm ci --prefix functions

node scripts/stage-function-src.mjs stage
restore_src() {
  node scripts/stage-function-src.mjs restore || true
}
trap restore_src EXIT

deploy_entry() {
  local entry="$1"
  local only="$2"
  node --input-type=module -e "
  import { readFileSync, writeFileSync } from 'node:fs';
  const path = 'functions/package.json';
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.main = process.argv[1];
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  " "$entry"
  if npx firebase deploy --only "$only" --config firebase.functions.json --project protop-c189c --non-interactive; then
    echo "OK $only"
    return 0
  fi
  echo "::warning::Failed to deploy $only"
  return 0
}

deploy_entry tenderIndex.js functions:tenderProxy
deploy_entry anbudFormIndex.js functions:generateCompanyForm
deploy_entry openFeedIndex.js functions:fetchOpenFeedHttp
deploy_entry interpretAvtaleIndex.js functions:interpretAvtaleHttp
deploy_entry friendListIndex.js functions:friendListHttp
deploy_entry friendInviteIndex.js functions:listMyFriends,functions:listFriendRequests
deploy_entry indeksIndex.js functions:interpretIndeksAvtale
deploy_entry importIndex.js functions:interpretImport
# Opprettelsen feilet før tilgangen ble satt. Oppdateringer gjør ikke callable offentlig.
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 interpretimport \
  || echo "::warning::Klarte ikke åpne interpretImport for innloggede kall"

# Web CV/bilde-opplasting omgår Storage CORS via Admin SDK.
deploy_entry storageIndex.js functions:uploadStorageFile,functions:applyStorageCors
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 uploadstoragefile \
  || echo "::warning::Klarte ikke åpne uploadStorageFile for innloggede kall"
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 applystoragecors \
  || echo "::warning::Klarte ikke åpne applyStorageCors for innloggede kall"

node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'functions/package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));
pkg.main = 'index.js';
writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"
rm -f firebase.functions.json
restore_src
trap - EXIT
