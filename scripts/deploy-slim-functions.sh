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

# Tom eller "all" deployer alt. Ellers komma-separerte entry-filer fra CI-gaten.
selected_entry() {
  local entry="$1"
  local list="${FUNCTION_ENTRIES-}"
  if [ -z "$list" ] || [ "$list" = "all" ]; then
    return 0
  fi
  case ",${list}," in
    *,"${entry}",*) return 0 ;;
  esac
  echo "Hopper over $entry"
  return 1
}

set_functions_main() {
  node --input-type=module -e "
  import { readFileSync, writeFileSync } from 'node:fs';
  const path = 'functions/package.json';
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.main = process.argv[1];
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  " "$1"
}

firebase_deploy_only() {
  local only="$1"
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

deploy_entry() {
  local entry="$1"
  local only="$2"
  selected_entry "$entry" || return 0
  set_functions_main "$entry"
  firebase_deploy_only "$only"
}

# Scheduler- og Firestore-triggere feiler på deploy-kontoen og må ikke
# ligge i samme firebase-kall som de andre. Resten går i én kodebase,
# i puljer, så vi ikke starter et nytt CLI-kall per funksjon.
BATCH_ENTRIES=()
BATCH_ONLYS=()

queue_entry() {
  local entry="$1"
  local only="$2"
  selected_entry "$entry" || return 0
  BATCH_ENTRIES+=("$entry")
  BATCH_ONLYS+=("$only")
}

deploy_queued() {
  [ "${#BATCH_ENTRIES[@]}" -gt 0 ] || return 0
  node --input-type=module - "${BATCH_ENTRIES[@]}" <<'JS'
import { writeFileSync } from 'node:fs';
const entries = process.argv.slice(2).filter((entry) => entry !== '-');
const lines = [
  'import "./setRegion.js";',
  ...entries.map((entry) => `export * from "./${entry}";`),
];
writeFileSync('functions/ciSlimIndex.js', `${lines.join('\n')}\n`);
JS
  set_functions_main ciSlimIndex.js
  local -a names=()
  local spec part
  for spec in "${BATCH_ONLYS[@]}"; do
    IFS=',' read -ra parts <<< "$spec"
    for part in "${parts[@]}"; do
      [ -n "$part" ] && names+=("$part")
    done
  done
  local -a chunk=()
  local name csv
  for name in "${names[@]}"; do
    chunk+=("$name")
    if [ "${#chunk[@]}" -ge 20 ]; then
      csv=$(IFS=,; echo "${chunk[*]}")
      firebase_deploy_only "$csv"
      chunk=()
    fi
  done
  if [ "${#chunk[@]}" -gt 0 ]; then
    csv=$(IFS=,; echo "${chunk[*]}")
    firebase_deploy_only "$csv"
  fi
  rm -f functions/ciSlimIndex.js
  BATCH_ENTRIES=()
  BATCH_ONLYS=()
}

open_for() {
  local entry="$1"
  local names="$2"
  selected_entry "$entry" || return 0
  open_invokers "$names"
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

queue_entry tenderIndex.js functions:tenderProxy
deploy_entry anbudDigestIndex.js functions:anbudDigestDaily
queue_entry anbudFormIndex.js functions:generateCompanyForm
queue_entry agreementIndex.js functions:agreementTreatment
open_for agreementIndex.js functions:agreementTreatment
queue_entry openFeedIndex.js functions:fetchOpenFeedHttp
queue_entry interpretAvtaleIndex.js functions:interpretAvtaleHttp
queue_entry anbudIntakeIndex.js functions:scanAnbudDocumentHttp
queue_entry friendListIndex.js functions:friendListHttp
FRIENDS="functions:lookupFriendProfile,functions:sendFriendInviteV2,functions:sendFriendInviteSmsV2,functions:listMyFriends,functions:listFriendsForUid,functions:listFriendRequests,functions:listOutgoingFriendRequests,functions:createFriendRequestAdmin,functions:respondFriendRequestAdmin,functions:withdrawFriendRequestAdmin,functions:dismissOutgoingFriendRequestAdmin,functions:resendFriendRequestAdmin,functions:removeFriendAdmin,functions:sendFriendChatAdmin,functions:listFriendChatMessagesAdmin,functions:createPendingFriendInviteAdmin,functions:claimFriendInviteAdmin,functions:shareWithFriendsAdmin,functions:listSharedAlbumsAdmin,functions:listSharedWishlistsAdmin,functions:respondFriendGameInviteAdmin,functions:notifyFriendGameInvitesAdmin"
queue_entry friendInviteIndex.js "$FRIENDS"
open_for friendInviteIndex.js "$FRIENDS"
queue_entry indeksIndex.js functions:interpretIndeksAvtale
queue_entry importIndex.js functions:interpretImport
queue_entry employeeInviteIndex.js functions:claimEmployeeInvite,functions:recordUsage,functions:listEmployeeUsage
open_for employeeInviteIndex.js functions:claimEmployeeInvite,functions:recordUsage,functions:listEmployeeUsage
# Opprettelsen feilet før tilgangen ble satt. Oppdateringer gjør ikke callable offentlig.
open_for importIndex.js functions:interpretImport

# Web CV/bilde-opplasting og PDF-nedlasting omgår Storage CORS via Admin SDK.
queue_entry storageIndex.js functions:uploadStorageFile,functions:downloadStorageFile,functions:applyStorageCors
open_for storageIndex.js functions:uploadStorageFile,functions:downloadStorageFile,functions:applyStorageCors

# Kall som appen bruker, men som aldri lå i slim-listen og derfor svarer 404.
DOFFIN="functions:searchDoffin,functions:searchTed,functions:lookupCompany,functions:fetchDossier,functions:sendTenderAlert,functions:sendAnbudRequest,functions:scanAnbudDocument"
queue_entry doffinIndex.js "$DOFFIN"
open_for doffinIndex.js "$DOFFIN"

AI="functions:aiChat,functions:aiVoiceNote,functions:aiTutor,functions:aiMealIngredients,functions:aiRecipeImport,functions:aiReceiptOcr,functions:aiClassListOcr,functions:aiMatcoachWeekPlan,functions:aiMatcoachFridgeScan,functions:aiMatcoachLunchBoxes,functions:aiMatcoachSwapMeal,functions:aiImportPlan,functions:applyAiImport,functions:discardAiImport,functions:uploadDocumentFile,functions:createAlbumUploadUrl,functions:uploadAlbumFile,functions:aiSupportChat,functions:createSupportTicket,functions:scanTimesheetReview"
queue_entry aiIndex.js "$AI"
open_for aiIndex.js "$AI"

queue_entry vegvesenIndex.js functions:lookupVehicleByReg,functions:lookupVehicleHttp
open_for vegvesenIndex.js functions:lookupVehicleByReg

MEMBERSHIP="functions:resolveJoinCode,functions:submitJoinRequestByCode,functions:listMyFamilies,functions:deleteMyAccount"
queue_entry membershipIndex.js "$MEMBERSHIP"
open_for membershipIndex.js "$MEMBERSHIP"

AUTH="functions:sendInviteV2,functions:sendInviteSmsV2,functions:sendEmailVerificationV2,functions:confirmEmailVerificationV2,functions:sendPasswordResetV2,functions:setMemberPassword,functions:lookupAdultProfile"
queue_entry authIndex.js "$AUTH"
open_for authIndex.js "$AUTH"

HOSP="functions:hospSaveNukiToken,functions:hospGetNukiStatus,functions:hospDisconnectNuki,functions:hospSyncNukiLocks,functions:hospProvisionLockCode,functions:hospRevokeLockCode,functions:hospSyncChannelIcal,functions:hospConnectIcal,functions:hospSyncAllChannels,functions:hospProcessAutomessages,functions:hospGenerateReplyDraft,functions:hospLoginChecklist,functions:hospGetChannelStatus,functions:hospSavePartnerCredentials,functions:hospAirbnbExchangeToken,functions:hospBookingConnectProperty,functions:hospSyncChannelOAuth,functions:hospDisconnectChannel"
queue_entry hospitalityIndex.js "$HOSP"
open_for hospitalityIndex.js "$HOSP"

STRAVA="functions:getStravaAppStatus,functions:saveStravaAppConfig,functions:stravaExchangeToken,functions:stravaSyncActivities,functions:stravaDisconnect,functions:stravaWebhook,functions:registerStravaWebhook"
queue_entry stravaIndex.js "$STRAVA"
open_for stravaIndex.js "$STRAVA"

deploy_queued

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
