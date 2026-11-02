#!/usr/bin/env bash
# Sikkerhetskopi av Firestore i protop-c189c (brukes av .github/workflows/firestore-backup.yml).
#
#   status   Leser og viser: PITR, slettebeskyttelse, backupplaner, siste backup, arkiv. Endrer ingenting.
#   oppsett  Slår på PITR (7 dager, minuttnivå) og slettebeskyttelse, og lager backupplanene
#            (daglig, 14 dager, og ukentlig, 14 uker). Rører ikke det som allerede er riktig.
#   arkiv    Full eksport av databasen til arkivbøtta (månedlig, beholdes i ett år).
#   test     Gjenopprettingstest: siste backup gjenopprettes til en egen testdatabase,
#            antall timeføringer sammenlignes med produksjon, og testdatabasen slettes.
#
# Skriver Markdown til stdout. Avslutter med 1 hvis noe som skulle være på plass, mangler,
# så en planlagt kjøring blir rød og eieren får e-post fra GitHub.
set -uo pipefail

PROJECT="${PROJECT:-protop-c189c}"
DB='(default)'
ARCHIVE_BUCKET="${ARCHIVE_BUCKET:-gs://${PROJECT}-firestore-arkiv}"
TEST_DB="${TEST_DB:-gjenoppretting-test}"
DAILY_RETENTION="${DAILY_RETENTION:-14d}"
WEEKLY_RETENTION="${WEEKLY_RETENTION:-14w}"
WEEKLY_DAY="${WEEKLY_DAY:-SUN}"
# Arkivet: kan ikke slettes de første 365 dagene (låsen er ikke permanent, eieren kan fjerne den),
# slettes automatisk etter 400 dager.
ARCHIVE_HOLD="${ARCHIVE_HOLD:-365d}"
ARCHIVE_DELETE_AFTER_DAYS="${ARCHIVE_DELETE_AFTER_DAYS:-400}"

MODE="${1:-status}"
FAILED=0

line() { printf '%s\n' "$*"; }
fail() { line "- ❌ $*"; FAILED=1; }
ok() { line "- ✅ $*"; }
warn() { line "- ⚠️ $*"; }

# Første linje med feil fra gcloud, til visning.
first_error() {
  printf '%s' "$1" | grep -m1 -iE 'error|denied|permission|not found|failed' | cut -c1-220 \
    || printf '%s' "$1" | head -1 | cut -c1-220
}

# Varighet som 14d / 14w / 1209600s → sekunder.
to_seconds() {
  local v="$1"
  case "$v" in
    *s) printf '%s' "${v%s}" ;;
    *d) printf '%s' "$(( ${v%d} * 86400 ))" ;;
    *w) printf '%s' "$(( ${v%w} * 604800 ))" ;;
    *) printf '%s' "$v" ;;
  esac
}

describe_db() {
  gcloud firestore databases describe --database="$DB" --project="$PROJECT" --format=json 2>&1
}

json_field() {
  # json_field '<json>' 'a.b' → verdien, eller tom.
  node -e '
    let data; try { data = JSON.parse(process.argv[1]); } catch { process.exit(0); }
    const v = process.argv[2].split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
    if (v !== undefined && v !== null) process.stdout.write(typeof v === "object" ? JSON.stringify(v) : String(v));
  ' "$1" "$2"
}

# Lokasjonen til databasen → lokasjonen til arkivbøtta (samme område).
bucket_location() {
  case "$1" in
    eur3|eur*) printf 'EU' ;;
    nam5|nam*) printf 'US' ;;
    *) printf '%s' "$1" ;;
  esac
}

schedules_json() {
  gcloud firestore backups schedules list --database="$DB" --project="$PROJECT" --format=json 2>&1
}

# Planene som { daily: {name, retention}, weekly: {name, retention, day} }.
schedule_summary() {
  node -e '
    let rows; try { rows = JSON.parse(process.argv[1]); } catch { process.exit(2); }
    const out = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const retention = String(row.retention || "").replace(/s$/, "");
      if (row.dailyRecurrence) out.daily = { name: row.name, retention };
      if (row.weeklyRecurrence) out.weekly = { name: row.name, retention, day: row.weeklyRecurrence.day || "" };
    }
    process.stdout.write(JSON.stringify(out));
  ' "$1"
}

latest_backup_json() {
  local raw
  raw="$(gcloud firestore backups list --project="$PROJECT" --format=json 2>&1)" || { printf 'ERR:%s' "$raw"; return; }
  node -e '
    let rows; try { rows = JSON.parse(process.argv[1]); } catch { process.exit(0); }
    const ready = (Array.isArray(rows) ? rows : [])
      .filter((row) => row.state === "READY" && String(row.database || "").endsWith("/databases/(default)"))
      .sort((a, b) => String(b.snapshotTime).localeCompare(String(a.snapshotTime)));
    if (ready.length) process.stdout.write(JSON.stringify({ count: ready.length, latest: ready[0] }));
  ' "$raw"
}

hours_since() {
  node -e 'const t = Date.parse(process.argv[1]); process.stdout.write(Number.isFinite(t) ? String(Math.floor((Date.now() - t) / 3600000)) : "")' "$1"
}

# Antall timeføringer (alle bedrifter) i en database, via count-aggregering (billig: 1 lesing per 1000).
count_time_entries() {
  local database="$1" token body out
  token="$(gcloud auth print-access-token 2>/dev/null)" || return 1
  body='{"structuredAggregationQuery":{"structuredQuery":{"from":[{"collectionId":"timeEntries","allDescendants":true}]},"aggregations":[{"alias":"n","count":{}}]}}'
  out="$(curl -sS -X POST -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database")/documents:runAggregationQuery" \
    -d "$body" 2>&1)" || return 1
  node -e '
    let rows; try { rows = JSON.parse(process.argv[1]); } catch { process.exit(1); }
    const row = (Array.isArray(rows) ? rows : []).find((r) => r.result);
    const n = row?.result?.aggregateFields?.n?.integerValue;
    if (n === undefined) process.exit(1);
    process.stdout.write(String(n));
  ' "$out"
}

section_database() {
  local db
  line "## Databasen"
  db="$(describe_db)"
  if [ -z "$(json_field "$db" 'name')" ]; then
    fail "Kunne ikke lese databasen: $(first_error "$db")"
    DB_JSON=''
    return
  fi
  DB_JSON="$db"
  local loc pitr del window earliest
  loc="$(json_field "$db" 'locationId')"
  pitr="$(json_field "$db" 'pointInTimeRecoveryEnablement')"
  del="$(json_field "$db" 'deleteProtectionState')"
  window="$(json_field "$db" 'versionRetentionPeriod')"
  earliest="$(json_field "$db" 'earliestVersionTime')"
  line "- Lokasjon: \`$loc\`"
  if [ "$pitr" = 'POINT_IN_TIME_RECOVERY_ENABLED' ]; then
    ok "Gjenoppretting til tidspunkt (PITR) er på. Vindu: ${window:-ukjent}, tidligste tidspunkt: ${earliest:-ukjent}."
  else
    fail "Gjenoppretting til tidspunkt (PITR) er av (${pitr:-ukjent})."
  fi
  if [ "$del" = 'DELETE_PROTECTION_ENABLED' ]; then
    ok 'Slettebeskyttelse er på. Databasen kan ikke slettes ved et uhell.'
  else
    fail "Slettebeskyttelse er av (${del:-ukjent})."
  fi
  line ''
}

section_schedules() {
  local raw summary daily weekly
  line '## Backupplaner'
  raw="$(schedules_json)"
  summary="$(schedule_summary "$raw")" || { fail "Kunne ikke lese backupplanene: $(first_error "$raw")"; line ''; return; }
  daily="$(json_field "$summary" 'daily.retention')"
  weekly="$(json_field "$summary" 'weekly.retention')"
  if [ -n "$daily" ]; then
    ok "Daglig backup, beholdes i $(( daily / 86400 )) dager."
  else
    fail 'Ingen daglig backup.'
  fi
  if [ -n "$weekly" ]; then
    ok "Ukentlig backup ($(json_field "$summary" 'weekly.day')), beholdes i $(( weekly / 604800 )) uker."
  else
    fail 'Ingen ukentlig backup.'
  fi
  local latest
  latest="$(latest_backup_json)"
  if [[ "$latest" == ERR:* ]]; then
    warn "Kunne ikke liste backupene: $(first_error "${latest#ERR:}")"
  elif [ -z "$latest" ]; then
    if [ -n "$daily" ]; then warn 'Ingen ferdig backup ennå. Den første lages innen et døgn etter at planen er laget.'; fi
  else
    local when age
    when="$(json_field "$latest" 'latest.snapshotTime')"
    age="$(hours_since "$when")"
    if [ -n "$age" ] && [ "$age" -gt 48 ] && [ -n "$daily" ]; then
      fail "Siste backup er $age timer gammel ($when). Daglig backup ser ikke ut til å kjøre."
    else
      ok "$(json_field "$latest" 'count') backuper klare. Siste: $when."
    fi
  fi
  line ''
}

section_archive() {
  local raw
  line '## Arkiv (månedlig eksport)'
  raw="$(gcloud storage ls "$ARCHIVE_BUCKET/" --project="$PROJECT" 2>&1)" || {
    warn "Arkivbøtta $ARCHIVE_BUCKET finnes ikke eller kan ikke leses ennå: $(first_error "$raw")"
    line ''
    return
  }
  local last
  last="$(printf '%s\n' "$raw" | grep -E '/[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sort | tail -1)"
  if [ -n "$last" ]; then
    ok "Siste eksport: \`${last%/}\` ($(printf '%s\n' "$raw" | grep -cE '/[0-9]{4}-[0-9]{2}-[0-9]{2}/$') i arkivet)."
  else
    warn 'Arkivbøtta finnes, men har ingen eksport ennå.'
  fi
  line ''
}

do_setup() {
  line '## Oppsett'
  local db out
  db="$(describe_db)"
  if [ -z "$(json_field "$db" 'name')" ]; then
    fail "Kunne ikke lese databasen: $(first_error "$db")"
    line ''
    return
  fi
  if [ "$(json_field "$db" 'pointInTimeRecoveryEnablement')" != 'POINT_IN_TIME_RECOVERY_ENABLED' ]; then
    if out="$(gcloud firestore databases update --database="$DB" --project="$PROJECT" --enable-pitr --quiet 2>&1)"; then
      ok 'Slo på gjenoppretting til tidspunkt (PITR).'
    else
      fail "Kunne ikke slå på PITR: $(first_error "$out")"
    fi
  fi
  if [ "$(json_field "$db" 'deleteProtectionState')" != 'DELETE_PROTECTION_ENABLED' ]; then
    if out="$(gcloud firestore databases update --database="$DB" --project="$PROJECT" --delete-protection --quiet 2>&1)"; then
      ok 'Slo på slettebeskyttelse.'
    else
      fail "Kunne ikke slå på slettebeskyttelse: $(first_error "$out")"
    fi
  fi
  local raw summary
  raw="$(schedules_json)"
  if ! summary="$(schedule_summary "$raw")"; then
    fail "Kunne ikke lese backupplanene: $(first_error "$raw")"
    line ''
    return
  fi
  ensure_schedule daily "$(json_field "$summary" 'daily.name')" "$(json_field "$summary" 'daily.retention')" "$DAILY_RETENTION"
  ensure_schedule weekly "$(json_field "$summary" 'weekly.name')" "$(json_field "$summary" 'weekly.retention')" "$WEEKLY_RETENTION"
  line ''
}

# ensure_schedule <daily|weekly> <eksisterende navn> <eksisterende sekunder> <ønsket>
ensure_schedule() {
  local kind="$1" name="$2" have="$3" want="$4" out want_s label
  want_s="$(to_seconds "$want")"
  label=$([ "$kind" = daily ] && echo 'Daglig' || echo 'Ukentlig')
  if [ -z "$name" ]; then
    local extra=()
    [ "$kind" = weekly ] && extra=(--day-of-week="$WEEKLY_DAY")
    if out="$(gcloud firestore backups schedules create --database="$DB" --project="$PROJECT" \
      --recurrence="$kind" --retention="$want" "${extra[@]}" --quiet 2>&1)"; then
      ok "$label backup laget (beholdes $want)."
    else
      fail "Kunne ikke lage $kind backup: $(first_error "$out")"
    fi
  elif [ "$have" != "$want_s" ]; then
    if out="$(gcloud firestore backups schedules update --database="$DB" --project="$PROJECT" \
      --backup-schedule="${name##*/}" --retention="$want" --quiet 2>&1)"; then
      ok "$label backup: lagringstid endret til $want."
    else
      fail "Kunne ikke endre lagringstiden for $kind backup: $(first_error "$out")"
    fi
  fi
}

ensure_archive_bucket() {
  local loc="$1" out
  if gcloud storage buckets describe "$ARCHIVE_BUCKET" --project="$PROJECT" >/dev/null 2>&1; then
    return 0
  fi
  if ! out="$(gcloud storage buckets create "$ARCHIVE_BUCKET" --project="$PROJECT" \
    --location="$(bucket_location "$loc")" --default-storage-class=NEARLINE \
    --uniform-bucket-level-access --public-access-prevention \
    --retention-period="$ARCHIVE_HOLD" 2>&1)"; then
    fail "Kunne ikke lage arkivbøtta $ARCHIVE_BUCKET: $(first_error "$out")"
    return 1
  fi
  local rules
  rules="$(mktemp)"
  printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%s}}]}' "$ARCHIVE_DELETE_AFTER_DAYS" > "$rules"
  if ! out="$(gcloud storage buckets update "$ARCHIVE_BUCKET" --project="$PROJECT" --lifecycle-file="$rules" 2>&1)"; then
    warn "Arkivbøtta er laget, men automatisk sletting etter $ARCHIVE_DELETE_AFTER_DAYS dager ble ikke satt: $(first_error "$out")"
  fi
  rm -f "$rules"
  ok "Laget arkivbøtta $ARCHIVE_BUCKET ($(bucket_location "$loc"), kan ikke slettes de første $ARCHIVE_HOLD)."
}

do_archive() {
  line '## Månedlig eksport'
  local db loc stamp out
  db="$(describe_db)"
  loc="$(json_field "$db" 'locationId')"
  if [ -z "$loc" ]; then
    fail "Kunne ikke lese databasen: $(first_error "$db")"
    line ''
    return
  fi
  ensure_archive_bucket "$loc" || { line ''; return; }
  stamp="$(date -u +%Y-%m-%d)"
  if out="$(gcloud firestore export "$ARCHIVE_BUCKET/$stamp" --database="$DB" --project="$PROJECT" --async --format='value(name)' 2>&1)"; then
    ok "Eksport startet til \`$ARCHIVE_BUCKET/$stamp\` (operasjon \`${out##*/}\`). Den går ferdig i bakgrunnen."
  else
    fail "Eksporten startet ikke: $(first_error "$out")"
  fi
  line ''
}

do_restore_test() {
  line '## Gjenopprettingstest'
  local latest backup out prod restored
  # Testdatabasen slettes etterpå. Den skal aldri kunne være produksjonsdatabasen.
  if [ -z "$TEST_DB" ] || [ "$TEST_DB" = "$DB" ] || [ "$TEST_DB" = 'default' ]; then
    fail "Ugyldig navn på testdatabasen: '$TEST_DB'."
    line ''
    return
  fi
  latest="$(latest_backup_json)"
  backup="$(json_field "${latest#ERR:}" 'latest.name')"
  if [ -z "$backup" ]; then
    fail 'Fant ingen ferdig backup å teste med.'
    line ''
    return
  fi
  # En test som stoppet halvveis forrige gang, ryddes først.
  gcloud firestore databases delete --database="$TEST_DB" --project="$PROJECT" --quiet >/dev/null 2>&1 || true
  if ! out="$(gcloud firestore databases restore --source-backup="$backup" --destination-database="$TEST_DB" \
    --project="$PROJECT" --quiet 2>&1)"; then
    fail "Gjenopprettingen startet ikke: $(first_error "$out")"
    line ''
    return
  fi
  line "- Gjenoppretter backup fra $(json_field "${latest#ERR:}" 'latest.snapshotTime') til databasen \`$TEST_DB\` …"
  # Databasen kan leses når gjenopprettingen er ferdig. Vent i opptil 40 minutter.
  local tries=0
  restored=''
  while [ $tries -lt 80 ]; do
    if restored="$(count_time_entries "$TEST_DB")"; then break; fi
    restored=''
    tries=$((tries + 1))
    sleep 30
  done
  prod="$(count_time_entries "$DB" || true)"
  if [ -z "$restored" ]; then
    fail 'Testdatabasen ble ikke lesbar innen 40 minutter.'
  elif [ -z "$prod" ]; then
    warn "Gjenopprettet: $restored timeføringer. Kunne ikke telle i produksjon til sammenligning."
  elif [ "$restored" -eq 0 ] && [ "$prod" -gt 0 ]; then
    fail "Gjenopprettet database har 0 timeføringer, produksjon har $prod."
  else
    ok "Gjenopprettet database har $restored timeføringer (produksjon nå: $prod). Gjenoppretting virker."
  fi
  if out="$(gcloud firestore databases delete --database="$TEST_DB" --project="$PROJECT" --quiet 2>&1)"; then
    ok "Testdatabasen \`$TEST_DB\` er slettet igjen."
  else
    fail "Testdatabasen \`$TEST_DB\` ble ikke slettet (koster lagring til den slettes): $(first_error "$out")"
  fi
  line ''
}

line "# Sikkerhetskopi av Firestore ($PROJECT)"
line ''
line "Kjørt $(date -u '+%Y-%m-%d %H:%M UTC'), handling: \`$MODE\`."
line ''

case "$MODE" in
  oppsett) do_setup ;;
  arkiv) do_archive ;;
  test) do_restore_test ;;
  status) ;;
  *) line "Ukjent handling: $MODE (status, oppsett, arkiv, test)"; exit 2 ;;
esac

section_database
section_schedules
section_archive

if [ "$FAILED" -ne 0 ]; then
  line '**Noe mangler eller feilet.** Se ❌ over. «Permission denied» betyr at deploy-kontoen mangler en rolle; se `docs/drift/sikkerhetskopi.md`.'
  exit 1
fi
line '**Alt i orden.**'
