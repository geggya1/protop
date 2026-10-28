# Risiko- og sårbarhetsanalyse (ROS) for ProTop

> **Utkast – må gjennomgås av behandlingsansvarlig/jurist.**
> Analysen gjelder informasjonssikkerheten i tjenesten (konfidensialitet, integritet og
> tilgjengelighet), slik koden i repoet er i oktober 2026. Driftsforhold utenfor koden
> (tilganger i Google Cloud, sikkerhetskopier, rutiner) er merket **[bekreft]**.
> GDPR art. 32 krever tiltak som står i forhold til risikoen. Personvernrisikoen for de
> registrerte står i [DPIA-en](dpia.md).

## 1. Omfang og metode

- **Omfang:** ProTop for bedrifter: web (protop.no), mobilapp, Firebase-prosjektet `protop-c189c`
  (Auth, Firestore, Storage, Cloud Functions i `europe-west1`, Hosting), integrasjonene i
  [behandlingsprotokollen](behandlingsprotokoll.md) (punkt 4), og
  utrullingen fra GitHub. Familie-, skole- og utleiefunksjonene er ikke vurdert.
- **Metode:** Uønskede hendelser er funnet fra koden og revisjonene (sikkerhet, datasynk, lovkrav).
  Sannsynlighet (S) og konsekvens (K) settes til 1 (lav), 2 (middels) eller 3 (høy).
  Risiko = S × K: 1–2 lav, 3–4 middels, 6–9 høy.
- **Verdier:** opplysninger om ansatte (HR, lønn, sykefravær, fødselsnummer), regnskapsmateriale
  (fakturaer), ISO-saker (personskader, varsling), kundedata, og at tjenesten er tilgjengelig i
  arbeidstiden.

## 2. Hvordan tjenesten er sikret i dag (kort)

| Område | Tiltak | Hvor |
|---|---|---|
| Innlogging | Firebase Auth: Google, Microsoft, Apple, e-post og passord. Ingen tofaktor. | `firebase.js`, `screens/` |
| Tilgang i databasen | Regler per samling. Følsomme samlinger krever rettigheter i speilet `accessAcl/{uid}`, som beregnes på serveren og utløper etter 12 timer (fail closed). | `firestore.rules`, `functions/companyAccessSync.js`, `src/iso/aclSync.js` |
| Regeltester | Emulatortester for reglene i CI ved pull request og før manuell utrulling av regler. | `tests/rules/`, `.github/workflows/verify-pr.yml`, `deploy-firestore-rules.yml` |
| Filer | Opplasting og nedlasting via serverfunksjoner med egen tilgangskontroll. `storage.rules` speiler den. | `functions/storageAccess.js`, `uploadStorage.js`, `storage.rules` |
| Låsing av regnskap | Utstedte fakturaer, nummerserie, fakturerte timer og utlegg er låst i reglene. | `firestore.rules` |
| Spor | ISO-revisjonsspor, fakturahendelser, endringshistorikk og slettelogg for timer, innsynslogg, brukslogg. | `isoAudit*`, `invoices.events`, `timeEntries.history`, `timeEntryDeletions`, `accessLog`, `usage` |
| Misbruk | Grenser for antall kall per bruker og handling. | `functions/security.js` |
| Nettleser | HTTPS med HSTS, Content-Security-Policy og X-Frame-Options på Hosting. | `firebase.json`, `scripts/hosting-csp.test.mjs` |
| Lokale data | Lokale kopier fjernes ved utlogging. Lønn og fødselsnummer ligger ikke i lokal kopi. | `src/utils/localCache.js` |
| Samtidig lagring | Endringer legges på skyens ferske kopi i transaksjon, slettemarkeringer, kø uten nett, feilmelding ved mislykket lagring. | `src/project/storage.js`, `stateDiff.js` |
| Hemmeligheter | Secret Manager for e-postnøkkel m.fl. Gemini-nøkkelen settes som miljøvariabel ved utrulling. | `functions/runtimeSecret.js`, `mailApiKey.js`, `scripts/deploy-slim-functions.sh` |
| Utrulling | Push til `main` går live (Hosting og callables). Regler rulles ut manuelt etter tester. | `.github/workflows/` |

## 3. Uønskede hendelser

| # | Uønsket hendelse | Årsak / sårbarhet | S | K | Risiko | Tiltak i dag | Forslag |
|---|---|---|---|---|---|---|---|
| R1 | Uvedkommende logger inn som eier, administrator eller HR | Phishing eller gjenbrukt passord. Ingen tofaktor. | 2 | 3 | **6 høy** | Innlogging hos store identitetsleverandører er mulig. | Krev tofaktor for eier, administrator og HR (Firebase Auth MFA). Varsle ved innlogging fra ny enhet. |
| R2 | En feil i databasereglene åpner følsomme data for alle medlemmer | Reglene er store og komplekse (nær grensen på 1000 uttrykk). En generell regel dekker samlinger som ikke er unntatt. | 2 | 3 | **6 høy** | Følsomme samlinger er unntatt fra den generelle regelen (`isProtected`). Regeltester i CI. | Gjør den generelle regelen til «nekt» og list tillatte samlinger. Strukturtest som feiler når en ny samling ikke har egen regel. |
| R3 | Tilbaketrukket tilgang virker videre | Triggerne som oppdaterer tilgangsspeilet, er ikke en sikker del av utrullingen (DS-16). | 2 | 2 | **4 middels** | Speilet oppdateres når skallet åpnes, og utløper etter 12 timer. | Rull ut triggerne (se `docs/drift/triggere-og-planlagte-jobber.md`). |
| R4 | HR-data (lønn) leses av en som bare skal ha én del av HR | HR ligger i ett dokument. | 2 | 2 | **4 middels** | Krever HR-tilgang. Lønn ikke i lokal kopi. | Del HR i egne samlinger per område (DS-10). |
| R5 | En fil (CV, HR-dokument, kvittering) deles videre | Nedlastingslenker med token som ikke utløper. | 2 | 3 | **6 høy** | Tilgangskontroll ved opplasting og nedlasting via funksjon. | Signerte lenker med kort levetid (L-18). |
| R6 | Data går tapt eller overskrives | Store fellesdokumenter (`projects/state`, `anbud/state`) og eldre klienter som skriver hele lister. | 2 | 3 | **6 høy** | Transaksjoner, diff mot utgangspunkt, slettemarkeringer, kø og feilmelding. | Dele opp fellesdokumentene (datasynk fase 2). Bekreft sikkerhetskopi (R7). |
| R7 | Data kan ikke gjenopprettes etter feil eller sletting | Ukjent om Firestore har sikkerhetskopi eller gjenoppretting til tidspunkt. **[bekreft]** | 2 | 3 | **6 høy** | – | Slå på daglig sikkerhetskopi og gjenoppretting til tidspunkt (PITR). Test gjenoppretting. Fastsett hvor lenge kopiene lagres. |
| R8 | Et dokument blir for stort (1 MiB) og kan ikke lagres | Fellesdokumentene vokser, logoen ligger som base64 i `families/{id}`. | 2 | 2 | **4 middels** | Varsel over 700 kB, tydelig feil, endringen ligger i kø. | Dele opp dokumentene. Logo til Storage (DS-17). |
| R9 | En feil går rett i produksjon | Push til `main` deployer Hosting og funksjoner uten testmiljø. | 2 | 2 | **4 middels** | `verify:web` før bygg, regeltester ved pull request. | Testprosjekt for regler og funksjoner. Rask tilbakerulling (Hosting-historikk) dokumentert. |
| R10 | Planlagte slettejobber kjører ikke | Scheduler og triggere feiler på deploy-kontoen (DS-16). | 3 | 2 | **6 høy** | Noe sletting kjører i appen (brukslogg ved innlogging, HR når HR åpnes). | Rull ut jobbene og kontroller at de kjører. Overvåk siste kjøring. |
| R11 | Personopplysninger sendes til AI utenfor EØS eller brukes til trening | Gemini Developer API. | 2 | 2 | **4 middels** | Bedriften kan slå av AI. Fødselsnummer maskeres ved import. | Vertex AI i EU eller bekreftet betalt nivå. AI-bryter sjekket på serveren også for anbud-AI og avtaletolking. |
| R12 | En nøkkel eller hemmelighet lekker | Gemini-nøkkelen skrives til `functions/.env` under utrulling. Tokens for Outlook og Google ligger i databasen. | 1 | 3 | **3 middels** | Secret Manager for e-post. Tokens kan bare leses av serveren og brukeren selv (`users/{uid}/…`). | Gemini-nøkkel i Secret Manager. Begrens nøkkelen til API-et og prosjektet. Roter nøkler fast. |
| R13 | Misbruk av funksjoner gir kostnader eller stans | Callables er åpne for innloggede. App Check er av som standard (`EXPO_PUBLIC_ENABLE_APPCHECK`). | 2 | 2 | **4 middels** | Grenser per bruker og handling. | Slå på App Check. Budsjettvarsel i Google Cloud. |
| R14 | Underleverandør er nede (Google, e-post, PowerOffice) | Avhengighet av eksterne tjenester. | 2 | 2 | **4 middels** | Lokal kopi og kø gjør at mye virker uten nett. Feil vises ved sending. | Statusside og rutine for å varsle kundene. |
| R15 | Ansatte i ProTop leser kundedata uten grunn | Konsoll-tilgang til produksjonsprosjektet gir tilgang til alt. **[bekreft]** hvem som har tilgang. | 1 | 3 | **3 middels** | – | Liste over hvem som har tilgang i Google Cloud, minste rettighet, logging av administratortilgang (Cloud Audit Logs for data), taushetserklæring. |
| R16 | Et brudd oppdages for sent eller meldes ikke | Ingen avviksrutine i repoet. | 2 | 3 | **6 høy** | Logger i Cloud Logging. | Rutine for brudd på personopplysningssikkerheten: varsle kunden uten ugrunnet opphold (databehandleravtalen) og Datatilsynet innen 72 timer når ProTop er behandlingsansvarlig (art. 33). Varsling i Cloud Monitoring. |
| R17 | Bedriftens data blir liggende etter at avtalen er avsluttet | GRUNN-03: eier/admin avslutter, eksport først, sletting etter 90 dager med `purgeClosedCompanies` eller skriptet (`docs/drift/sletting-av-bedrift.md`). | 1 | 2 | **2 lav** | – | Fast rutine for å kjøre slettingen (ingen planlagt jobb i CI). Avklar avtaleteksten om regnskapsmateriale. |
| R18 | Skadelig kode via tredjepartsressurser | Leaflet fra unpkg, skrift fra Google Fonts, avhengigheter i npm. | 1 | 3 | **3 middels** | CSP på Hosting. Låste versjoner i `package-lock.json`. | Selvhost skrift og kartbibliotek. Subresource Integrity. Automatisk sårbarhetsvarsel for avhengigheter. |
| R19 | Feil kunde får faktura eller e-post | Feil e-postadresse i kunderegisteret, eller kunde valgt feil i utkastet. | 2 | 2 | **4 middels** | Kunden vises fra registeret i utkastet. Kontroller før ferdigstilling. | – |

## 4. Prioritert tiltaksliste

| Prioritet | Tiltak | Hendelser | Hvem |
|---|---|---|---|
| 1 | Tofaktor for eier, administrator og HR | R1 | Utvikling |
| 2 | Sikkerhetskopi og PITR, test av gjenoppretting | R6, R7 | Drift/eier |
| 3 | Rutine for brudd og varsling | R16 | Eier |
| 4 | Planlagte jobber og triggere i drift | R3, R10 | Eier (beslutning), drift |
| 5 | Signerte lenker for filer | R5 | Utvikling |
| 6 | Den generelle regelen som «nekt», med strukturtest | R2 | Utvikling |
| 7 | Sletting av bedrift etter opphør | R17 | Utvikling, eier |
| 8 | HR delt opp, fellesdokumentene delt opp | R4, R6, R8 | Utvikling |
| 9 | AI i EU, App Check, Gemini-nøkkel i Secret Manager | R11, R12, R13 | Utvikling, eier |
| 10 | Tilgangsliste og logging for ProTops egne ansatte | R15 | Eier |

## 5. Åpne spørsmål til eieren

1. Hvem har tilgang til produksjonsprosjektet i Google Cloud og Firebase-konsollen, og med hvilke roller?
2. Finnes sikkerhetskopi eller PITR for Firestore og Storage? Hvor lenge lagres kopiene?
3. Finnes en rutine for brudd på personopplysningssikkerheten og varsling av kunder?
4. Er budsjettvarsel og overvåking (feilrate, kostnad) satt opp i Google Cloud?
5. Skal App Check slås på for web og app?
6. Når skal ROS-analysen oppdateres (for eksempel hvert år og ved større endringer), og hvem eier den?
