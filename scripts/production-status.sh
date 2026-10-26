#!/usr/bin/env bash
# Leser status i protop-c189c og skriver Markdown (brukes av .github/workflows/production-status.yml).
# Endrer ingenting. Kommandoer som deploy-kontoen ikke har tilgang til, vises som «ingen tilgang».
set -uo pipefail

PROJECT=protop-c189c
REGION=europe-west1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

line() { printf '%s\n' "$*"; }

# Kjør en kommando; skriv utdata eller «ingen tilgang» med første feillinje.
run() {
  local out status
  out="$("$@" 2>&1)"
  status=$?
  if [ $status -eq 0 ]; then
    printf '%s' "$out"
    return 0
  fi
  printf 'INGEN_TILGANG: %s' "$( (printf '%s' "$out" | grep -m1 -iE 'error|denied|permission|not found' || printf '%s' "$out" | head -1) | cut -c1-180)"
  return 1
}

line "# Produksjonsstatus for $PROJECT"
line ""
line "Kjørt $(date -u '+%Y-%m-%d %H:%M UTC') med deploy-kontoen github-hosting-deploy."
line ""

# 1. Funksjoner: hva som finnes, mot det koden forventer.
line "## Cloud Functions ($REGION)"
deployed="$(run gcloud functions list --project "$PROJECT" --regions "$REGION" --format='value(name)')"
if [[ "$deployed" == INGEN_TILGANG* ]]; then
  line "❌ Kunne ikke liste funksjoner: ${deployed#INGEN_TILGANG: }"
else
  deployed_names="$(printf '%s\n' "$deployed" | sed 's#.*/##' | sort -u)"
  expected="$( {
    grep -oE 'functions:[A-Za-z0-9_]+' "$ROOT/scripts/deploy-slim-functions.sh" | sed 's/functions://'
    sed -n '/^export {/,/}/p' "$ROOT/functions/calendarIndex.js" | grep -oE '^\s+[A-Za-z0-9_]+' | tr -d ' '
  } | sort -u)"
  missing="$(comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$deployed_names"))"
  line "Deployet: $(printf '%s\n' "$deployed_names" | grep -c .) funksjoner."
  line ""
  if [ -n "$missing" ]; then
    line "❌ Mangler i produksjon:"
    printf '%s\n' "$missing" | sed 's/^/- /'
  else
    line "✅ Alle forventede funksjoner finnes."
  fi
fi
line ""

# 2. API-er som funksjonene trenger.
line "## API-er"
for api in cloudscheduler.googleapis.com eventarc.googleapis.com secretmanager.googleapis.com firestore.googleapis.com firebasestorage.googleapis.com run.googleapis.com; do
  state="$(run gcloud services list --project "$PROJECT" --enabled --filter="config.name=$api" --format='value(config.name)')"
  if [[ "$state" == INGEN_TILGANG* ]]; then
    line "- ❔ $api: ingen tilgang til å lese (${state#INGEN_TILGANG: })"
  elif [ -n "$state" ]; then
    line "- ✅ $api er slått på"
  else
    line "- ❌ $api er **ikke** slått på"
  fi
done
line ""

# 3. Storage-bucket (CV-er, dokumenter, bilder).
line "## Firebase Storage"
found=""
denied=""
for bucket in "gs://$PROJECT.firebasestorage.app" "gs://$PROJECT.appspot.com"; do
  out="$(run gcloud storage buckets describe "$bucket" --format='value(name)')"
  if [[ "$out" != INGEN_TILGANG* ]] && [ -n "$out" ]; then
    found="$bucket"
  elif [[ "${out,,}" =~ (403|denied|does\ not\ have\ permission) ]]; then
    # Cloud Storage svarer 404 for bucketer som ikke finnes, 403 bare for dem som finnes.
    denied="$bucket"
  fi
done
if [ -n "$found" ]; then
  line "✅ Bucket finnes: $found"
elif [ -n "$denied" ]; then
  line "✅ Bucket finnes: $denied (deploy-kontoen har ikke lesetilgang, så CORS settes ikke fra CI; appen bruker firebasestorage.googleapis.com og trenger det ikke)"
else
  line "❌ Fant ingen standard-bucket ($PROJECT.firebasestorage.app / .appspot.com)"
fi
line ""

# 4. Firestore-indekser.
line "## Firestore-indekser"
idx="$(run gcloud firestore indexes composite list --project "$PROJECT" --format='value(name)')"
if [[ "$idx" == INGEN_TILGANG* ]]; then
  line "❌ Kan ikke lese/opprette indekser: ${idx#INGEN_TILGANG: }"
else
  line "✅ $(printf '%s\n' "$idx" | grep -c .) sammensatte indekser i prosjektet."
fi
line ""

# 5. Hemmeligheter (bare navn, aldri verdier).
line "## Hemmeligheter (Secret Manager)"
for secret in MAIL_API_KEY VAPID_PRIVATE_KEY; do
  out="$(run gcloud secrets describe "$secret" --project "$PROJECT" --format='value(name)')"
  if [[ "$out" == INGEN_TILGANG* ]]; then
    if [[ "$out" == *"not found"* || "$out" == *"NOT_FOUND"* ]]; then
      line "- ❌ $secret finnes ikke"
    else
      line "- ❔ $secret: ingen tilgang til å lese (${out#INGEN_TILGANG: })"
    fi
  else
    line "- ✅ $secret finnes"
  fi
done
vapid_versions="$(run gcloud secrets versions list VAPID_PRIVATE_KEY --project "$PROJECT" --filter='state=ENABLED' --format='value(name)')"
if [[ "$vapid_versions" != INGEN_TILGANG* ]]; then
  line "- VAPID_PRIVATE_KEY: $(printf '%s\n' "$vapid_versions" | grep -c .) aktive versjoner (push trenger minst én med innhold)"
fi
all_secrets="$(run gcloud secrets list --project "$PROJECT" --format='value(name)')"
if [[ "$all_secrets" == INGEN_TILGANG* ]]; then
  line "- ❔ Kan ikke liste hemmeligheter (${all_secrets#INGEN_TILGANG: })"
else
  line "- Alle hemmeligheter i prosjektet: $(printf '%s\n' "$all_secrets" | sed 's#.*/##' | grep . | tr '\n' ' ' || true)"
fi
line ""

# 6. Hvilke nøkler funksjonene får ved kjøring. Bare navn; verdier skrives aldri ut.
line "## Nøkler i funksjonene (bare navn)"
for svc in sendinvitev2 sendfriendinvitev2 onnotificationpush; do
  out="$(run gcloud run services describe "$svc" --project "$PROJECT" --region "$REGION" --format=json)"
  if [[ "$out" == INGEN_TILGANG* ]]; then
    line "- $svc: ${out#INGEN_TILGANG: }"
    continue
  fi
  names="$(printf '%s' "$out" | jq -r '[.spec.template.spec.containers[0].env[]? | .name + (if .valueFrom.secretKeyRef then " (fra secret " + .valueFrom.secretKeyRef.name + ")" else "" end)] | join(", ")')"
  line "- $svc: ${names:-ingen}"
done
line ""

# 7. AI-nøkkelen: bare om den er satt eller tom. Ingen del av verdien skrives ut.
line "## AI-nøkkel (Gemini)"
out="$(run gcloud run services describe aichat --project "$PROJECT" --region "$REGION" --format=json)"
if [[ "$out" == INGEN_TILGANG* ]]; then
  line "- aichat: ${out#INGEN_TILGANG: }"
elif printf '%s' "$out" | jq -e '[.spec.template.spec.containers[0].env[]? | select(.name == "PROTOP_GEMINI_KEY" or .name == "GEMINI_API_KEY") | (.value // "") | select(length > 0)] | length > 0' >/dev/null; then
  line "- ✅ aichat har en AI-nøkkel"
else
  line "- ❌ aichat har ingen AI-nøkkel (GitHub-hemmeligheten PROTOP_GEMINI_KEY er tom eller mangler)"
fi
line ""

# 8. Push: resultatet av testvarsler siste døgn («Send testvarsel» i profilen).
# Bare antall og grunn fra feltet push på varselet; ikke innhold eller hvem.
line "## Push (testvarsler siste døgn)"
token="$(gcloud auth print-access-token 2>/dev/null)"
since="$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')"
query='{"structuredQuery":{"from":[{"collectionId":"notifications","allDescendants":true}],"where":{"fieldFilter":{"field":{"fieldPath":"eventType"},"op":"EQUAL","value":{"stringValue":"pushTest"}}},"limit":50}}'
resp="$(curl -s -m 30 -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
  "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents:runQuery" -d "$query")"
summary="$(printf '%s' "$resp" | jq -r --arg since "$since" '
  if type != "array" then "FEIL: " + ((.error.message // tostring)[0:160])
  else [ .[] | select(.document) | .document
         | select((.fields.createdAt.timestampValue // .createTime) >= $since)
         | .fields.push.mapValue.fields as $p
         | "- " + ((.fields.createdAt.timestampValue // .createTime)[0:16]) + " UTC: sendt til "
           + (($p.sent.integerValue // "?") | tostring) + " av " + (($p.devices.integerValue // "?") | tostring)
           + " enheter (" + ($p.reason.stringValue // "ikke behandlet") + ")" ] | join("\n")
  end' 2>/dev/null)"
if [[ "$summary" == FEIL:* ]]; then
  line "❔ Kunne ikke lese: ${summary#FEIL: }"
elif [ -n "$summary" ]; then
  line "$summary"
else
  line "Ingen testvarsler siste døgn. Trykk «Send testvarsel» under Profil → Varsler og kjør statussjekken igjen."
fi
