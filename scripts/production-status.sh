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
