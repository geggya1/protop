# Utrulling av firestore.rules og storage.rules (fra 86332db)

Denne noten gjelder regelendringene mellom `86332db` (versjonen som ligger ute i dag, også i
mobilappene) og integrasjonsgrenen. Den sier hva som må være ute før reglene deployes, og hva en
eldre app (86332db) ikke lenger får gjøre.

- Push og merge til `main` sender web (protop.no) og Cloud Functions (slim-deploy) ut med en gang.
- `firestore.rules` deployes manuelt (workflow «Deploy Firestore rules», `firebase.rules.json`).
- `storage.rules` har aldri vært deployet fra repoet. Den deployes manuelt (se kommentaren øverst i
  filen) etter at produksjonsreglene i konsollet er sammenlignet med den.
- Mobilappene kan ikke tvinges til å oppdatere. Det som står under «Kan ikke gjøres bakoverkompatibelt»,
  rammer eldre apper til de er oppdatert.

Regeltestene for eldre apper ligger i `tests/rules/regressions.rules.test.mjs` (de gjør det 86332db gjør)
og `tests/storage/storage.rules.test.mjs`.

## Rekkefølge

1. **Merge til `main`** (web og funksjoner går ut). Det som må være ute før reglene:
   - `recordUsage` fornyer tilgangsspeilet (accessAcl) for den som logger aktivitet. Eldre apper ber
     aldri om speilet selv (bare ISO gjorde det), men de kaller `recordUsage` ved innlogging og aktivitet.
     Uten dette avviser de nye reglene HR, fravær for alle, faktura og ansatte for ledere i eldre apper
     når speilet er eldre enn 12 timer.
   - Web-appen fornyer speilet hver halvtime og når appen blir aktiv igjen, og venter på det før HR leses.
   - Kalenderen merker bedrifter med private hendelser (`privateEvents: true`) og gir eldre hendelser
     `audience` før det.
   - HR-endringer som ikke nådde skyen, ligger i en egen kø og slettes ikke ved avvist lesing eller utlogging.
2. **Vent til web-appen har vært i bruk** (minst én arbeidsdag), så HR har skrevet `hrSelf` (Min side),
   eier/HR har åpnet Ansatte (skjermede felt flyttes til `employeesPrivate`) og speilene er fornyet.
3. **Merk kalenderne** som har private hendelser, for alle bedrifter (også dem ingen har åpnet i den
   nye versjonen). Kjør først uten `--apply` og se over listen:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/seal-company-calendars.mjs
   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/seal-company-calendars.mjs --apply
   ```
4. **Deploy `firestore.rules`** (workflow «Deploy Firestore rules»; den kjører alle regeltestene først).
5. **Deploy `storage.rules`** manuelt, etter sammenligning med produksjonsreglene (grenser som
   produksjon har i dag, f.eks. for album, må tas med).
6. Følg med på `permission-denied` i loggene første døgn (særlig fra mobilappene).

Tilbakerulling: deploy forrige `firestore.rules` med samme workflow. Klientkoden i steg 1 virker med
både gamle og nye regler, så web trenger ikke rulles tilbake.

## Gjennomgang: hva en eldre app gjør, og hvordan reglene svarer

«Virker» betyr at regeltestene viser at det en 86332db-klient gjør, fortsatt godtas.

| Område | Hva eldre app gjør i vanlig bruk | Nå |
|---|---|---|
| Timer, utlegg, fravær, fakturautkast, notater, kalender: sletting | Sletter samme rad to ganger (Arbeid sletter, lagringen sletter igjen) | **Virker** (REV-01): sletting av noe som ikke finnes, godtas. Låst/fakturert rad slettes fortsatt ikke. |
| Barn: fjerne fra familien | Sletter medlemsdokumentet, setter `familyId: null` på `children/{id}` | **Virker** (REV-02). |
| Barn: medforelder legger til barn | Medlemsdokument, profiler, så `arrayUnion` i `members` | **Virker** (REV-03), bare for barnekontoer, ikke i bedrifter. |
| Barn: barnedokumentet i gruppen (`families/{id}/children/{x}`) | Foresatt eller eier lager det sammen med barnekontoen (samtidig med `users/{x}`); barnet og foresatte lagrer valg (tema, posisjon, apper) på det; eier deaktiverer eller fjerner | **Virker** (REV-24). Dokumentet gir barnet medlemskap, så bare en voksen i gruppen eller en administrator lager det, aldri i en bedrift, bare for en barnekonto (eller en ny konto uten profil ennå), og `uid` er dokumentets id. `active`, `deleted`, `leftAt` og `uid` endres bare av dem. Et barnedokument i en bedrift, eller et fjernet eller deaktivert, gir ikke lenger tilgang (heller ikke på serveren). |
| Kalender i bedrift | Lytter på hele `events` | **Virker** så lenge bedriften ikke har private hendelser. Se under. |
| Kalender: eldre hendelser uten `audience` | Vises for alle | **Virker** (REV-11): de får `audience` før bedriften merkes. |
| HR, fravær for alle, faktura (ferdigstille, betale), ansatte (nivå, sletting), ISO | Leser/skriver uten speil | **Virker** når speilet er ferskt. Det fornyes av `recordUsage` (eldre apper) og av web-appen. |
| Timer: redigere egen føring | `set` med `merge`, hele raden | **Virker**. Historikken røres ikke av eldre apper. |
| Notater | Lister med `memberIds`, lager i eget navn, «slett permanent» setter flagg | **Virker**. |
| Invitasjon av voksen | Plassholder i eget navn, `memberInvites` med `invitedBy` = seg selv, status `pending` | **Virker** (ny invitasjon til en plassholder en annen har laget: se REV-16, rettes av en annen agent). |
| Melde seg ut, føre seg selv opp | `arrayRemove`/`arrayUnion` av egen uid | **Virker**. |
| Varsler i andres innboks | `createdBy` = seg selv og `familyId` i en felles gruppe, venner, eller invitasjonen | **Virker** (testet i `notifications.rules.test.mjs`). |
| ISO: tiltakseier melder tiltak utført | Endrer tiltaket (state, completedAt, completedBy, completionNote, evidence) | **Virker** for de fem første tiltakene i en sak (eldre app sender ikke `doneActionIndex`). |
| Profilbilde, barneavatar, ikonkatalog (Storage) | Laster opp direkte, leser ikoner på mobil | **Virker** (REV-12). En administrator som bytter bildet til et annet medlem, må ha ny app (den sender `familyId` i metadata). |

### Kan ikke gjøres bakoverkompatibelt (hullet ville vært åpent igjen)

Disse avvises for eldre apper. Det var dette rettingene skulle stoppe.

| Hva eldre app gjør | Hvorfor det avvises | Følge for brukeren til appen er oppdatert |
|---|---|---|
| Lister hele `absences` (ansatt uten fraværstilgang) | Helseopplysninger for hele bedriften (L-02) | Fraværslisten i timelisten er tom (også eget fravær). Å registrere eget fravær virker. |
| Leser `hr/state` for «Min side» (vanlig ansatt) | Lønn, saker og memo for alle (L-01) | Min side viser ingenting. HR selv virker (med ferskt speil). |
| Skriver personnummer, pårørende eller intern kommentar på ansattposten | Posten leses av alle i bedriften (L-03) | Lagring av en ansatt med endret personnummer feiler. Andre felt kan lagres. |
| Lister hele `events` i en bedrift med private hendelser | Hendelser for «bare utvalgte» (SOS-08) | Bedriftskalenderen er tom i eldre apper i bedrifter som er merket. Å lage hendelser virker. |
| Ferdigstiller eller registrerer betaling uten Begrenset redigering på Faktura | Regnskap (SEC-14, L-10) | Knappen feiler. |
| Hopper i fakturanummer uten begrunnet rad i `jumps` | Bokføringsforskriften § 5-1-1 (L-31) | Gjelder bare import av nummer. |
| Endrer timer/beløp på en fakturert eller låst føring, eller nullstiller fakturakoblingen fra en gammel kopi | DS-11, L-10 | Lagringen av den raden feiler. I eldre apper kan feilen stoppe senere lagringer i økten til siden lastes på nytt (det er rettet i ny app, REV-01). |
| Deler et notat en annen har laget | FL-13 | Delingen feiler. |
| Lager et barnedokument i gruppen uten å være voksen der eller administrator, eller i en bedrift | Dokumentet ga den kontoen medlemskap i gruppen (REV-24) | Ingen vanlig flyt gjør dette. Et barn som lagrer tema før dokumentet finnes, får det bare lagret på enheten. |
| Starter vennechat med en som ikke er venn (også kollega) | SOS-04, FL-12 | Tråden lages ikke. |
| Endrer tilgangsmatrisen uten speil, eller orgnr/konto/moduler/personvernvalg uten tilgang | FL-02, SEC-13 | Lagringen feiler for andre enn eier og administratorer. |
| Overskriver en fil i fakturaarkivet (Storage) | Bokføringsloven § 13 | Et vedlegg med samme filnavn kan ikke lastes opp på nytt i eldre apper. |

### Private hendelser før bedriften er merket

En bedrift er merket (`privateEvents: true`) når ny app har sett eller laget en privat hendelse der,
eller når `scripts/seal-company-calendars.mjs` er kjørt. Før det kan hele kalenderen listes, slik som i
dag. Lager en eldre app den første private hendelsen i en bedrift som ikke er merket, kan kolleger med
eldre app se den i kalenderdataene til noen åpner kalenderen i ny app (som merker bedriften). Det er
slik det er i dag for alle bedrifter. Kjør skriptet i steg 3 på nytt om ønskelig etter noen uker.

### Tilgangsspeilet og eldre apper

Speilet (`families/{id}/accessAcl/{uid}`) varer i 12 timer. Det skrives av `syncCompanyAccess` (for alle i
bedriften når noen åpner bedriftsskallet i ny app, og hver halvtime mens det er åpent) og av
`recordUsage` (for den som logger aktivitet, også fra eldre apper). Den første lesingen rett etter
innlogging i en eldre app kan bli avvist før `recordUsage` har svart; da hjelper det å åpne siden på
nytt. Eier og administratorer (`adminUids`) trenger ikke speilet.

Merk: `syncCompanyAccess` holder også `adminUids` i takt med nivået Administrator (REV-06, rettes av en
annen agent). `recordUsage` skriver bare speilet til den som logger, og rører ikke `adminUids`.
