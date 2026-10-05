#!/usr/bin/env bash
# Additive Cloud Functions only. Never deploys hosting / live protop.no.
set -euo pipefail

node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
writeFileSync('firebase.functions.json', JSON.stringify({ ...cfg, functions: { source: 'functions' } }));
"
npm ci --prefix functions

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
  npx firebase deploy --only "$only" --config firebase.functions.json --project protop-c189c --non-interactive
}

deploy_entry tenderIndex.js functions:tenderProxy
deploy_entry anbudFormIndex.js functions:generateCompanyForm
deploy_entry openFeedIndex.js functions:fetchOpenFeedHttp
deploy_entry interpretAvtaleIndex.js functions:interpretAvtaleHttp
deploy_entry friendListIndex.js functions:friendListHttp
deploy_entry friendInviteIndex.js functions:listMyFriends,functions:listFriendRequests

node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'functions/package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));
pkg.main = 'index.js';
writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"
rm -f firebase.functions.json
