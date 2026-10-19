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
  # Ett hengende firebase-kall skal ikke holde concurrency-gruppen i timevis.
  local deploy_status=0
  if command -v timeout >/dev/null 2>&1; then
    timeout --signal=TERM --kill-after=20s 480 npx firebase deploy --only "$only" --config firebase.functions.json --project protop-c189c --non-interactive || deploy_status=$?
  else
    npx firebase deploy --only "$only" --config firebase.functions.json --project protop-c189c --non-interactive || deploy_status=$?
  fi
  if [ "$deploy_status" -eq 0 ]; then
    echo "OK $only"
    return 0
  fi
  if [ "$deploy_status" -eq 124 ]; then
    echo "::warning::Timed out deploying $only"
  else
    echo "::warning::Failed to deploy $only"
  fi
  return 0
}

open_invokers() {
  local name service
  local names="${1//functions:/}"
  IFS=',' read -ra parts <<< "$names"
  for name in "${parts[@]}"; do
    [ -n "$name" ] || continue
    service=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
    NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 "$service" \
      || echo "::warning::Klarte ikke å åpne $name for innloggede kall"
  done
}

deploy_entry tenderIndex.js functions:tenderProxy
deploy_entry anbudDigestIndex.js functions:anbudDigestDaily
deploy_entry anbudFormIndex.js functions:generateCompanyForm
deploy_entry agreementIndex.js functions:agreementTreatment
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 agreementtreatment \
  || echo "::warning::Klarte ikke å åpne agreementTreatment for innloggede kall"
deploy_entry openFeedIndex.js functions:fetchOpenFeedHttp
deploy_entry interpretAvtaleIndex.js functions:interpretAvtaleHttp
deploy_entry anbudIntakeIndex.js functions:scanAnbudDocumentHttp
deploy_entry friendListIndex.js functions:friendListHttp
FRIENDS="functions:lookupFriendProfile,functions:sendFriendInviteV2,functions:sendFriendInviteSmsV2,functions:listMyFriends,functions:listFriendsForUid,functions:listFriendRequests,functions:listOutgoingFriendRequests,functions:createFriendRequestAdmin,functions:respondFriendRequestAdmin,functions:withdrawFriendRequestAdmin,functions:dismissOutgoingFriendRequestAdmin,functions:resendFriendRequestAdmin,functions:removeFriendAdmin,functions:sendFriendChatAdmin,functions:listFriendChatMessagesAdmin,functions:createPendingFriendInviteAdmin,functions:claimFriendInviteAdmin,functions:shareWithFriendsAdmin,functions:listSharedAlbumsAdmin,functions:listSharedWishlistsAdmin,functions:respondFriendGameInviteAdmin,functions:notifyFriendGameInvitesAdmin"
deploy_entry friendInviteIndex.js "$FRIENDS"
open_invokers "$FRIENDS"
deploy_entry indeksIndex.js functions:interpretIndeksAvtale
deploy_entry importIndex.js functions:interpretImport
deploy_entry employeeInviteIndex.js functions:claimEmployeeInvite,functions:recordUsage,functions:listEmployeeUsage
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 claimemployeeinvite \
  || echo "::warning::Klarte ikke å åpne claimEmployeeInvite for innloggede kall"
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 recordusage \
  || echo "::warning::Klarte ikke å åpne recordUsage for innloggede kall"
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 listemployeeusage \
  || echo "::warning::Klarte ikke å åpne listEmployeeUsage for innloggede kall"
# Opprettelsen feilet før tilgangen ble satt. Oppdateringer gjør ikke callable offentlig.
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 interpretimport \
  || echo "::warning::Klarte ikke åpne interpretImport for innloggede kall"

# Web CV/bilde-opplasting og PDF-nedlasting omgår Storage CORS via Admin SDK.
deploy_entry storageIndex.js functions:uploadStorageFile,functions:downloadStorageFile,functions:applyStorageCors
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 uploadstoragefile \
  || echo "::warning::Klarte ikke åpne uploadStorageFile for innloggede kall"
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 downloadstoragefile \
  || echo "::warning::Klarte ikke åpne downloadStorageFile for innloggede kall"
NODE_PATH="$ROOT/functions/node_modules" node scripts/open-callable-invoker.mjs protop-c189c europe-west1 applystoragecors \
  || echo "::warning::Klarte ikke åpne applyStorageCors for innloggede kall"

# Kall som appen bruker, men som aldri lå i slim-listen og derfor svarer 404.
DOFFIN="functions:searchDoffin,functions:searchTed,functions:lookupCompany,functions:fetchDossier,functions:sendTenderAlert,functions:sendAnbudRequest,functions:scanAnbudDocument"
deploy_entry doffinIndex.js "$DOFFIN"
open_invokers "$DOFFIN"

AI="functions:aiChat,functions:aiVoiceNote,functions:aiTutor,functions:aiMealIngredients,functions:aiRecipeImport,functions:aiReceiptOcr,functions:aiClassListOcr,functions:aiMatcoachWeekPlan,functions:aiMatcoachFridgeScan,functions:aiMatcoachLunchBoxes,functions:aiMatcoachSwapMeal,functions:aiImportPlan,functions:applyAiImport,functions:discardAiImport,functions:uploadDocumentFile,functions:createAlbumUploadUrl,functions:uploadAlbumFile,functions:aiSupportChat,functions:createSupportTicket,functions:scanTimesheetReview"
deploy_entry aiIndex.js "$AI"
open_invokers "$AI"

deploy_entry vegvesenIndex.js functions:lookupVehicleByReg,functions:lookupVehicleHttp
open_invokers functions:lookupVehicleByReg

MEMBERSHIP="functions:resolveJoinCode,functions:submitJoinRequestByCode,functions:listMyFamilies,functions:deleteMyAccount"
deploy_entry membershipIndex.js "$MEMBERSHIP"
open_invokers "$MEMBERSHIP"

AUTH="functions:sendInviteV2,functions:sendInviteSmsV2,functions:sendEmailVerificationV2,functions:confirmEmailVerificationV2,functions:sendPasswordResetV2,functions:setMemberPassword,functions:lookupAdultProfile"
deploy_entry authIndex.js "$AUTH"
open_invokers "$AUTH"

HOSP="functions:hospSaveNukiToken,functions:hospGetNukiStatus,functions:hospDisconnectNuki,functions:hospSyncNukiLocks,functions:hospProvisionLockCode,functions:hospRevokeLockCode,functions:hospSyncChannelIcal,functions:hospConnectIcal,functions:hospSyncAllChannels,functions:hospProcessAutomessages,functions:hospGenerateReplyDraft,functions:hospLoginChecklist,functions:hospGetChannelStatus,functions:hospSavePartnerCredentials,functions:hospAirbnbExchangeToken,functions:hospBookingConnectProperty,functions:hospSyncChannelOAuth,functions:hospDisconnectChannel"
deploy_entry hospitalityIndex.js "$HOSP"
open_invokers "$HOSP"

STRAVA="functions:getStravaAppStatus,functions:saveStravaAppConfig,functions:stravaExchangeToken,functions:stravaSyncActivities,functions:stravaDisconnect,functions:stravaWebhook,functions:registerStravaWebhook"
deploy_entry stravaIndex.js "$STRAVA"
open_invokers "$STRAVA"

deploy_entry pushIndex.js functions:onChatMessageCreated,functions:onFriendChatMessageCreated

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
