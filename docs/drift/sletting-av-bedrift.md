# Avslutning og sletting av en bedrift (GRUNN-03)

**Status:** Callables og skript er laget. Ingen planlagt jobb er satt opp: slettingen kjøres av
driften (manuelt eller av en jobb eieren setter opp, se under). Sist gjennomgått: oktober 2026.

Databehandleravtalen (punkt 12) og vilkårene (punkt 11) lover at bedriftens data slettes innen
90 dager etter at avtalen opphører, og at bedriften kan hente ut dataene først.

## Flyten

| Steg | Hvem | Hvordan | Hva skjer |
|---|---|---|---|
| 1. Eksport | Eier eller administrator | Selskapsinnstillinger → Avslutt bedriften → «Last ned bedriftens data» (web) | Callable `exportCompanyData` leser alle dokumenter under `families/{id}` (også underkolleksjoner og HR, fravær og `employeesPrivate`, uten tilgangsspeilet `accessAcl`) og listen over filer under `families/{id}/` i Storage. Appen henter filene med `downloadStorageFile` og lagrer én ZIP: `LESMEG.txt`, `data/bedrift.json` og `filer/…` (fakturaarkiv, kvitteringer, HR-filer). Tilgangsnøkler og hemmelige felt fjernes (`toPlain` i `src/privacy/myDataExport.js`). Filer over 15 MB står i `LESMEG.txt` og må lastes ned enkeltvis. Eksporten logges i `companyClosures/{id}` (`lastExportAt`, hendelse `export`). |
| 2. Avslutning | Eier eller administrator | «Avslutt bedriftens abonnement og slett data» | Callable `closeCompany` krever bedriftens navn som bekreftelse. Har bedriften utstedte fakturaer, kreves også bekreftelse på at regnskapsmaterialet er tatt vare på (bokføringsloven § 13). Serveren skriver `companyClosures/{id}` (status `closed`, `closedAt`, `deleteAfter` = +90 dager, hvem, grunn, om eksport var tatt) og merker bedriften med `closure`, `closedAt`, `deleteAfter` og `subscriptionStatus: 'cancelled'`. Eier og de andre administratorene får varsel. Bedriften virker som før til fristen. |
| 3. Angre | Eier eller administrator | «Angre avslutningen» (før fristen) | Callable `reopenCompany` fjerner merkingen, setter abonnementet tilbake og logger `reopened`. |
| 4. Sletting | Driften | Callable `purgeClosedCompanies` eller `scripts/purge-closed-companies.mjs` | Se under. |

`closure`, `closedAt` og `deleteAfter` på bedriften kan ikke endres av noen klient (`closureUnchanged()` i
`firestore.rules`). `companyClosures` har ingen klientregler. Slettingen krever at `companyClosures/{id}` har
status `closed`, at fristen er ute, og at bedriften (hvis den finnes) har samme frist. Ellers hoppes den over
(`purgeDecision` i `src/privacy/companyClosure.js`).

## Hva slettingen fjerner

`purgeCompany` i `functions/companyClosureStore.js`, i denne rekkefølgen:

1. Filer under `families/{id}/` i begge bucketene som finnes (`protop-c189c.firebasestorage.app`, `protop-c189c.appspot.com`).
2. `families/{id}` med alle underkolleksjoner (`recursiveDelete`).
3. Koblinger på toppnivå: `powerOfficeClients/{id}`, `orgnrIndex` og `joinCodes` med `familyId`, `agreementShares` med
   `companyId`, `ehfDeliveries/{id}_…` og `aiUsage/family_{id}_…`.
4. For hver bruker som var med (medlemslistene, `parents`-underlaget og profiler med bedriften i `familyIds` eller
   `activeFamilyId`): bedriften fjernes fra `users/{uid}` og `parents/{uid}`, og varsler med `familyId` slettes.
5. `companyClosures/{id}` får status `deleted`, `deletedAt`, hvem som slettet og antall filer og brukere.
   Bedriftsnavn, navnet til den som avsluttet og grunnen fjernes. Id, orgnr og fristene blir stående som bevis.

Feiler et steg, står bedriften fortsatt som `closed` med `lastPurgeErrors`, og neste kjøring prøver igjen.
Alle stegene tåler å kjøres på nytt.

Ikke med: Cloud Logging (standard oppbevaring hos Google), sikkerhetskopier (**[bekreft]** om de finnes), brukerkontoene
(personene beholder kontoen sin og eventuelle andre bedrifter), `consentLog` (brukerens samtykker, slettes med kontoen),
`supportInbox` og underenheter (egne bedrifter som avsluttes hver for seg).

## Kjøre slettingen

Begge veiene er tørrkjøring til det bekreftes.

**Skript (anbefalt):** med en konto som har Firestore- og Storage-tilgang til `protop-c189c`.

```bash
GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/purge-closed-companies.mjs            # viser hva som ville blitt slettet
GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/purge-closed-companies.mjs --confirm  # sletter
GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/purge-closed-companies.mjs --company <id> --confirm
```

**Callable:** `purgeClosedCompanies({ companyId?, confirm: true })` fra en innlogget konto med custom claim
`admin: true` (settes bare med Admin SDK, samme som `applyStorageCors`). Deployes av CI (MEMBERSHIP i
`scripts/deploy-slim-functions.sh`). Svaret lister hver bedrift med `purge`, `reason` og antall.

Forslag til rutine: kjør tørrkjøringen hver uke, og slett det som er forfalt. Fristen i avtalen er «innen 90 dager»;
appen setter fristen til nøyaktig 90 dager, så slettingen må kjøres samme uke for å holde løftet.

### Planlagt jobb (eierbeslutning)

CI deployer ikke planlagte jobber (se [triggere og planlagte jobber](triggere-og-planlagte-jobber.md)). Skal slettingen gå
av seg selv, kan en jobb deployes for hånd, for eksempel:

```js
// functions/companyPurgeScheduledIndex.js (finnes ikke ennå)
import './setRegion.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { runCompanyPurge } from './companyClosureStore.js';
export const companyPurgeDaily = onSchedule({ schedule: '30 3 * * *', timeZone: 'Europe/Oslo' }, async () => {
  // Bucketene som i existingBuckets() i companyClosure.js.
  await runCompanyPurge(getFirestore(), buckets, { dryRun: false, actorUid: 'scheduler' });
});
```

Den må da også inn i oversikten over triggere og jobber.

## Bokføringsloven og avtaleteksten

- Regnskapsmateriale (fakturaer, bilag) skal oppbevares i fem år etter regnskapsårets slutt (bokføringsloven § 13).
  Plikten ligger hos bedriften. Dialogen sier dette, eksporten har fakturaarkivet (PDF) og fakturadataene, og
  avslutningen krever bekreftelse når bedriften har utstedte fakturaer.
- **[jurist]** Databehandleravtalen punkt 12 og vilkårene punkt 11 sier «unntatt det loven krever at oppbevares, for
  eksempel regnskapsmateriale». Slettingen fjerner også regnskapsmaterialet, etter at bedriften har bekreftet at den har
  tatt vare på det. Teksten bør enten si at bedriften selv må ta vare på regnskapsmaterialet før sletting, eller ProTop
  må tilby et regnskapsarkiv i fem år (ikke laget).
- Siste eier med utstedte fakturaer kan fortsatt ikke slette kontoen sin (`planFamilyExit`). Etter at bedriften er
  slettet, kan kontoen slettes.

## Tester

- `functions/companyClosure.emulator.test.mjs`: avslutning (navn, regnskap, bare eier/admin), angring, eksport
  (alle dokumenter og filer, ingen hemmelige felt, ingenting fra andre bedrifter), sletting (bare bedriften med utløpt
  frist, filer, koblinger og brukerprofiler; den andre bedriften er urørt), og at en frist endret utenom serveren aldri
  gir sletting.
- `tests/rules/companyClosure.rules.test.mjs`: ingen klient kan sette eller fjerne fristen, `companyClosures` er stengt.
- `src/privacy/companyClosure.test.mjs`, `src/privacy/companyArchive.test.mjs`.
