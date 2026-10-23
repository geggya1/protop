# ISO / K-HMS – utrulling og tilbakerulling

Firestore-reglene er felles for hele ProTop. Rull ut i denne rekkefølgen, først i et separat testprosjekt.

## 0. Forutsetninger

- PR #462 er godkjent for produksjon av eier.
- CI er grønn: `build` og `firestore-rules` (41 regeltester mot emulator) i `verify-pr.yml`.
- Lokalt: `npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop "node --test tests/rules/"` (krever Java 21 og `npm i --no-save @firebase/rules-unit-testing@4`).

`firebase.json` skal fortsatt bare inneholde hosting (deploy-workflowen nekter alt annet). Regler og indekser deployes med den separate konfigurasjonen `firebase.rules.json`.

## 1. Testmiljø (anbefalt)

```bash
# Eget Firebase-prosjekt, f.eks. protop-iso-test
npx firebase deploy --only firestore:rules,firestore:indexes --config firebase.rules.json --project <testprosjekt>
```

Representative brukere: eier, ansatt (Lese), saksbehandler (Begrenset redigering), ISO-admin, autorisert HMS-behandler, bruker i annet selskap. Kontroller i tillegg at Oppgaver, Prosjekt, HR, Ansatte, Kontrakt, Økonomi og Handlelister virker som før.

## 2. Cloud Function (før reglene)

`syncCompanyAccess` (callable) ligger i slim-deployen (`functions/companyAccessIndex.js`) og deployes automatisk når PR-en merges. Manuelt (`firebase.functions.json` = `firebase.json` + `"functions": {"source": "functions"}`, slik `scripts/deploy-slim-functions.sh` lager den):

```bash
node scripts/stage-function-src.mjs stage
# sett "main": "companyAccessIndex.js" i functions/package.json midlertidig
npx firebase deploy --only functions:syncCompanyAccess --config firebase.functions.json --project protop-c189c
node scripts/open-callable-invoker.mjs protop-c189c europe-west1 synccompanyaccess
node scripts/stage-function-src.mjs restore
```

Triggere for umiddelbar tilbaketrekking (CI-kontoen kan ikke opprette Firestore-triggere – manuelt med en konto som kan):

```bash
node scripts/stage-function-src.mjs stage
# "main": "companyAccessTriggerIndex.js"
npx firebase deploy --only functions:onCompanyAccessChanged,functions:onEmployeeAccessChanged --config firebase.functions.json --project protop-c189c
node scripts/stage-function-src.mjs restore
```

Uten triggerne slår endringer i tilgangsmatrisen inn ved neste synk (når noen åpner ISO) og senest etter 12 timer (speilet utløper). Fjernet medlemskap slår inn straks.

## 3. Firestore-regler og indekser

```bash
npx firebase deploy --only firestore:rules,firestore:indexes --config firebase.rules.json --project protop-c189c
```

Ingen nye sammensatte indekser trengs.

## 4. Web

Merge PR #462 til `main` → `deploy-hosting.yml` bygger og publiserer protop.no.

## 5. Etter utrulling

- Eier åpner ISO én gang (synker speilet for alle medlemmer, eller faller tilbake til eiers egen beregning).
- Eier fører opp personer under Innstillinger → «Tilgang til skjermede HMS-saker».
- Sjekk i Innstillinger → «Roller og tilgang» at rolleinnehaverne har riktig nivå i tilgangsmatrisen.

## Tilbakerulling

| Del | Hvordan | Konsekvens |
|---|---|---|
| Regler | `git checkout <forrige main-sha> -- firestore.rules` og deploy som i §3. Eller Firebase-konsollen → Firestore → Regler → Historikk → velg forrige versjon → Publiser. | Tilbake til at alle medlemmer kan lese og skrive alle selskapsdata (også ISO). |
| Web | Revert merge-commit på `main` (`git revert -m 1 <sha>`), push → ny hosting-deploy. Eller Firebase Hosting → Release history → Rollback. | ISO-menyen forsvinner. ISO-data blir liggende urørt. |
| Funksjon | `npx firebase functions:delete syncCompanyAccess onCompanyAccessChanged onEmployeeAccessChanged --region europe-west1 --project protop-c189c` | Uten funksjon og med nye regler får bare eier ISO-tilgang (fail-closed). |
| Data | Ingen migrering er gjort. `iso*`, `accessAcl` og `isoRestricted` kan ligge eller slettes. | Ingen påvirkning på andre moduler. |

Rekkefølge ved tilbakerulling: web → regler → funksjon.
