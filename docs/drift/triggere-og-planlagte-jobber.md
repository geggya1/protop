# Firestore-triggere og planlagte jobber (DS-16)

**Status:** Oversikt og forslag. Utrullingen er en **eierbeslutning**. Ingenting her er endret i CI.
Sist gjennomgått mot koden: oktober 2026.

## Kort fortalt

- Push til `main` deployer callables automatisk (`.github/workflows/deploy-hosting.yml` → jobben
  `functions` → `scripts/deploy-slim-functions.sh`).
- Triggere og planlagte jobber er **ikke** en sikker del av den utrullingen. Seks av dem forsøkes
  deployet én og én (`deploy_entry` nederst i skriptet), men skriptet sier selv at
  *«Scheduler- og Firestore-triggere feiler på deploy-kontoen»*. En feil gir bare en advarsel
  (`::warning::Failed to deploy …`), og jobben blir likevel grønn.
- Tre triggere og én planlagt jobb forsøkes aldri av CI. De finnes bare i `functions/index.js`
  eller i egne inngangsfiler som må deployes for hånd.
- Vi vet derfor ikke sikkert hva som kjører i produksjon. Det må sjekkes (se «Steg 1» under).
- Ny funksjonalitet er bevisst laget uten nye triggere: callables, eller logikk som kjører når
  noen åpner en side. Tabellen under viser hvor koden likevel er avhengig av en trigger.

## Oversikt

«CI forsøker» betyr at `deploy-slim-functions.sh` prøver å deploye funksjonen. «Nei» betyr at den
bare kan komme ut ved en manuell deploy.

### Firestore-triggere

| Funksjon | Utløses av | Fil (inngang) | CI forsøker | Hva den gjør |
|---|---|---|---|---|
| `onNotificationPush` | Nytt dokument i `users/{uid}/notifications/{id}` | `functions/notifyPush.js` (`notifyPushIndex.js`) | Ja, alene | Sender push (web og app) og e-post for hvert varsel, etter brukerens varselinnstillinger (`pushDelivery.js`, `notifyEmail.js`). |
| `onChatMessageCreated` | Ny melding i `families/{id}/chats/{chatId}/messages/{id}` | `functions/chatNotify.js` (`pushIndex.js`) | Ja, sammen med neste | Skriver innboks, ulest-teller og varsel til mottakerne («backup»). |
| `onFriendChatMessageCreated` | Ny melding i `friendChats/{chatId}/messages/{id}` | `functions/chatNotify.js` (`pushIndex.js`) | Ja | Det samme for vennechat. |
| `onCompanyAccessChanged` | Endring i `families/{companyId}` | `functions/companyAccessSync.js` (`companyAccessTriggerIndex.js`) | **Nei** | Regner ut tilgangsspeilet `accessAcl/{uid}` på nytt når tilgangsmatrisen, eierskap eller medlemskap endres. |
| `onEmployeeAccessChanged` | Endring i `families/{companyId}/employees/{id}` | `functions/companyAccessSync.js` (`companyAccessTriggerIndex.js`) | **Nei** | Det samme når en ansatt endres (nivå, status, kobling). |
| `sendParentInviteEmail` | Nytt dokument i `families/{id}/parents/{id}` | `functions/index.js` | **Nei** | E-post for plassholder-invitasjoner i familieappen. ProTop-invitasjoner går via callables (`sendInviteV2`, `claimEmployeeInvite`). |

### Planlagte jobber (Cloud Scheduler)

| Funksjon | Når | Fil (inngang) | CI forsøker | Hva den gjør |
|---|---|---|---|---|
| `vacationPlanDaily` | Hver dag 07:10 (Oslo) | `functions/vacationPlanDailyIndex.js` | Ja, alene | Påminnelse, purring og lås av ferieplanen (`runVacationPlanSweep`). Sender e-post og varsel. |
| `aiCleanupScheduled` | Hver 6. time | `functions/aiCallables.js` (`aiCleanupIndex.js`) | Ja, alene | Lar AI-utkast utløpe etter 48 timer, sletter arkiverte utkast etter 30 dager, midlertidige AI-bilder etter 48 timer og `aiUsage` etter 90 dager. Setter også CORS på Storage. |
| `indeksSsbDaily` | Hver dag 07:00 (Oslo) | `functions/indeksreguleringAi.js` (`indeksSsbDailyIndex.js`) | Ja, alene | Henter SSB-indeksene som avtalene bruker, og skriver `system/indeksSsb`. |
| `anbudDigestDaily` | Hver dag 06:15 (Oslo) | `functions/anbudDigest.js` (`anbudDigestIndex.js`) | Ja, alene | Morgenvarsel på e-post om nye anbud. |
| `hospScheduledSync` | Hvert 15. minutt | `functions/hospitality.js` (bare `index.js`) | **Nei** | Synk av kanaler for utleiemodulen. Ikke en del av ProTop for byggebedrifter. |

Det finnes ingen Storage-triggere, Auth-triggere eller Pub/Sub-funksjoner utover Scheduler.

## Hva koden i dag er avhengig av

| Funksjon | Hvem er avhengig | Uten funksjonen | Reserve i koden |
|---|---|---|---|
| `onNotificationPush` | Alle varsler som skal fram som push eller e-post: tildelt ISO-oppgave (`screens/iso/isoEffects.js`), innpass og godkjenning (`companyJoin.js`, `companyMembership.js`), avtalebehandling (`agreementTreatment.js`), vennefunksjoner. | Varselet står i varselsenteret i appen, men ingen får push eller e-post. | Ferieplanen sender e-post selv og merker varselet `skipEmail`. Chat viser lokal melding når appen er åpen (`src/hooks/useChatSelfNotify.js`). Ellers ingen. |
| `onChatMessageCreated`, `onFriendChatMessageCreated` | Ulest-teller og varsel for mottakere som ikke har appen åpen. | Telleren og innboksen oppdateres når mottakeren åpner appen. | `useChatSelfNotify` og `useFriendChatSelfNotify` skriver egen innboks. |
| `onCompanyAccessChanged`, `onEmployeeAccessChanged` | Firestore-reglene for HR, fravær, personnummer, faktura, ISO og ansatte leser speilet `accessAcl/{uid}`. | En endring i tilgang slår inn ved neste synk: når noen åpner bedriftsskallet (`useCompanyAccess` → `scheduleAccessSync` → callable `syncCompanyAccess`), ISO eller endrer et nivå. Speilet utløper etter 12 timer (`ACL_TTL_HOURS`), og da avviser reglene (fail closed). **Tilbaketrukket tilgang kan altså gjelde i opptil 12 timer** for en som allerede har et gyldig speil. Fjernet medlemskap slår inn straks. | Callable `syncCompanyAccess` (deployes av CI). |
| `vacationPlanDaily` | Purring, påminnelse og lås av ferieplanen. | Skjer først når noen åpner Fravær eller Ferieplan-innstillingene. | Callable `sweepVacationPlan` kalles når siden åpnes (`screens/arbeid/AbsenceScreens.jsx`). |
| `aiCleanupScheduled` | Lagringstiden for AI-utkast, midlertidige bilder og AI-tellere (se personvernerklæringen og `docs/personvern/`). | **Personopplysninger i AI-utkast og bilder blir liggende lenger enn oppgitt.** | Ingen. |
| `indeksSsbDaily` | Varsel om ny indeks i Indeksregulering (`src/indeksregulering/remoteSsb.js`). | Ingen ny registrering i `system/indeksSsb`. | Appen kan hente SSB direkte når brukeren regner. |
| `anbudDigestDaily` | Morgenvarsel om anbud. | Ingen e-post om morgenen. | Søk og varsler i appen virker. |
| `sendParentInviteEmail` | Familieappen. | Ingen e-post for plassholdere. | Klienten sender når `clientSendsInvite` er satt. |
| `hospScheduledSync` | Utleiemodulen. | Ingen automatisk synk. | Manuell synk (`hospSyncAllChannels`). |

Nyere rettinger (runde 1–4) har ikke lagt til nye triggere eller jobber. Sletting av brukslogg
skjer ved innlogging og lesing (`functions/usageLog.js`), profilsynk og samtykkelogg er callables,
og ISO-automatikken kjører i skallet (`screens/iso/IsoAutomation.jsx`). Sletting av en avsluttet bedrift etter
90 dager (GRUNN-03) er en callable (`purgeClosedCompanies`) og et skript, ikke en planlagt jobb. Se
[sletting av bedrift](sletting-av-bedrift.md), som også har et forslag til en jobb som kan deployes for hånd.

## Forslag til trygg utrulling

Forutsetning: eieren (eller en med rollen Owner i `protop-c189c`) gjør stegene. Ingen av stegene
endrer CI-deployen.

### Steg 1: Finn ut hva som kjører (bare lesing)

1. Kjør workflowen **«Produksjonsstatus»** (manuell, endrer ingenting). Den lister funksjonene i
   `europe-west1` og sammenligner med navnene i `deploy-slim-functions.sh`.
2. Merk at listen over forventede funksjoner ikke tar med `onCompanyAccessChanged`,
   `onEmployeeAccessChanged`, `sendParentInviteEmail` og `hospScheduledSync`. Sjekk dem for hånd:
   `gcloud functions list --project protop-c189c --regions europe-west1`.
3. Sjekk i Cloud Scheduler at jobbene finnes og har kjørt (`gcloud scheduler jobs list --location europe-west1`).
4. Noter hvilke som mangler. Det avgjør resten.

### Steg 2: Én manuell utrulling av det som mangler

Gjøres fra samme commit som ligger på `main`, med en konto som kan opprette triggere. Én gruppe
om gangen, i denne rekkefølgen, og se i loggene før neste:

1. `onNotificationPush` (størst nytte, lav risiko: sender bare det brukeren har slått på).
2. `onCompanyAccessChanged`, `onEmployeeAccessChanged` (samme beregning som callable-en, så
   resultatet er det samme, bare raskere). Fremgangsmåten står i `docs/product/iso-khms/UTRULLING.md`.
3. `aiCleanupScheduled` (oppfyller lagringstiden for AI-data).
4. `vacationPlanDaily`. **Sjekk først** hvilke selskaper som har en publisert ferieplan med frister:
   første kjøring kan sende purringer til mange ansatte på én gang.
5. `onChatMessageCreated`, `onFriendChatMessageCreated`, `indeksSsbDaily`, `anbudDigestDaily`.
   `anbudDigestDaily` sender e-post til alle selskaper med anbudsvarsel.
6. `sendParentInviteEmail` og `hospScheduledSync` bare hvis familie- og utleiemodulen fortsatt
   skal være i drift (se L-35).

Mal (som i `UTRULLING.md`):

```bash
node scripts/stage-function-src.mjs stage
# sett "main" i functions/package.json midlertidig til inngangsfilen, f.eks. notifyPushIndex.js
npx firebase deploy --only functions:onNotificationPush --config firebase.functions.json --project protop-c189c
node scripts/stage-function-src.mjs restore
```

`firebase.functions.json` lages slik `deploy-slim-functions.sh` gjør det (`firebase.json` med
`"functions": {"source": "functions"}`).

### Steg 3: La CI holde dem oppdatert

Når en Owner har deployet en trigger én gang, er tjenestekontoene for Eventarc og Pub/Sub satt opp.
For at CI-forsøkene (`deploy_entry`) skal lykkes etterpå, trenger deploy-kontoen
`github-hosting-deploy@protop-c189c.iam.gserviceaccount.com` trolig:

- Eventarc: `roles/eventarc.admin` (eller `roles/eventarc.developer`).
- Cloud Scheduler: `roles/cloudscheduler.admin`.
- Pub/Sub: `roles/pubsub.editor` (Scheduler og Firestore-triggere i 2. generasjon bruker Pub/Sub/Eventarc).
- `roles/iam.serviceAccountUser` på kjørekontoen (standard compute-konto), så funksjonen kan kjøre som den.

Rollene må kontrolleres mot feilmeldingen i loggen til jobben `functions` (advarselen
`Failed to deploy …`). Gi bare det som trengs.

Deretter, som egen beslutning:

- Legg `companyAccessTriggerIndex.js` inn som `deploy_entry` i `deploy-slim-functions.sh` og i
  `DEPLOY_ENTRIES` i `scripts/functions-deploy-needed.mjs`.
- Ta med alle triggere og jobber i forventet liste i `scripts/production-status.sh`.
- Vurder om en mislykket trigger-deploy skal stoppe jobben i stedet for å gi en advarsel.

### Tilbakerulling

| Del | Hvordan | Konsekvens |
|---|---|---|
| En trigger eller jobb | `npx firebase functions:delete <navn> --region europe-west1 --project protop-c189c` | Tilbake til dagens tilstand. Reservene i tabellen over gjelder. |
| Roller på deploy-kontoen | Fjern rollene i IAM | CI-forsøkene feiler igjen med advarsel, som i dag. |

Ingen data må migreres. Alle triggerne og jobbene tåler å kjøre flere ganger (de skriver samme
resultat eller bruker faste dokument-id-er).

## Åpne spørsmål til eieren

1. Hvilke av funksjonene finnes i produksjon i dag (steg 1)?
2. Skal deploy-kontoen få rettighetene i steg 3, eller skal triggere alltid deployes for hånd?
3. Skal familie- og utleiemodulens funksjoner (`sendParentInviteEmail`, `hospScheduledSync`) i drift
   i det hele tatt?
4. Er 12 timer akseptabelt som lengste tid før tilbaketrukket tilgang slår inn, hvis triggerne for
   tilgangsspeilet ikke rulles ut?
