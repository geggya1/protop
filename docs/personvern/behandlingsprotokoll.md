# Behandlingsprotokoll for ProTop (GDPR artikkel 30)

> **Utkast – må gjennomgås av behandlingsansvarlig/jurist.**
> Laget fra det koden i repoet faktisk gjør (oktober 2026): `firestore.rules`, `storage.rules`,
> `functions/` og `src/`. Avtaler med underleverandører, faktisk lagringsregion, sikkerhetskopier og
> rutiner utenfor koden er ikke kontrollert. Slike punkter er merket **[bekreft]**.
> Protokollen skal ikke inneholde hemmeligheter (nøkler, passord, tokens).

Relaterte dokumenter: [DPIA](dpia.md) · [ROS-analyse](ros-analyse.md) ·
[Triggere og planlagte jobber](../drift/triggere-og-planlagte-jobber.md).
Teksten brukerne ser, står i `src/i18n/legal.js` (personvernerklæring, vilkår og databehandleravtale).

## 1. Virksomheten

| Felt | Verdi |
|---|---|
| Behandlingsansvarlig (for egen behandling) og databehandler (for kundene) | ProTop. **[bekreft]** Juridisk navn, org.nr. og adresse er ikke fylt inn (`LEGAL_ENTITY` i `src/i18n/legal.js`). |
| Kontakt | support@protop.no |
| Personvernombud | Ikke utnevnt i koden. **[bekreft]** Om et ombud er påkrevd (art. 37) eller ønsket. |
| Tjenesten | ProTop: web (protop.no), nettbrett og mobilapp. Firebase-prosjektet `protop-c189c`. |
| Kunder | Bedrifter i bygg og anlegg. Hver bedrift er et dokument `families/{id}` med `type` `company` eller `organization`. |

ProTop har to roller:

- **Behandlingsansvarlig** for brukerkontoen og det som trengs for å drive tjenesten (del A).
- **Databehandler** for det bedriftene registrerer om ansatte, søkere, kunder og andre (del B).
  Bedriften er behandlingsansvarlig. Bedriften godtar databehandleravtalen når den opprettes eller
  under Selskapsinnstillinger → Personvern (`company.dpaAcceptance`, `components/company/CompanyPrivacySettings.jsx`).

Kodebasen inneholder også familie-, skole-, barnehage-, utleie- og treningsfunksjoner (barneprofiler,
klasserom, posisjonsdeling, Strava, Nuki/Airbnb/Booking). De er ikke beskrevet her. Det må avklares
om de er i drift (se L-35). Er de i drift, trenger de egne protokollinnslag og en egen vurdering,
særlig for barn (art. 8).

## 2. Del A – ProTop som behandlingsansvarlig (art. 30 nr. 1)

| # | Behandling | Formål | Rettslig grunnlag | Registrerte | Opplysninger | Hvor i koden | Lagringstid |
|---|---|---|---|---|---|---|---|
| A1 | Brukerkonto og innlogging | Gi tilgang til tjenesten | Avtale (art. 6 nr. 1 b) | Alle brukere | Navn, e-post, telefon, brukernavn, profilbilde, språk, fødselsdato (valgfritt), innloggingsmetode (Google, Microsoft, Apple eller e-post og passord). Passord bare som hash hos Firebase Auth. | Firebase Auth, `users/{uid}`, `usernames/{navn}` | Til kontoen slettes (`functions/deleteAccount.js`). |
| A2 | Medlemskap i bedrifter | Knytte brukeren til riktig bedrift og tilgang | Avtale (b) | Brukere i bedrifter | uid, navn, e-post, bilde, rolle, aktiv/inaktiv | `families/{id}/parents/{uid}`, `memberInvites`, `joinRequests`, `joinCodes`, `orgnrIndex` | Så lenge medlemskapet finnes. Fjernes ved utmelding eller avsluttet ansettelse (`functions/companyMembership.js`). |
| A3 | Samtykker og vilkår | Dokumentere at vilkår, personvernerklæring og databehandleravtale er godtatt | Rettslig plikt / berettiget interesse (c/f) | Brukere, bedriftens eier/administrator | Dokument, versjon, språk, plattform, servertid | `consentLog/{id}` (bare server, `functions/consentLog.js`), kopi i `users/{uid}.consentHistory` | Slettes med kontoen. **[bekreft]** Om loggen bør beholdes lenger som dokumentasjon. |
| A4 | Support og hjelpeassistent | Svare på spørsmål og forbedre hjelpen | Avtale / berettiget interesse (b/f) | Brukere som spør | Spørsmål og svar, uid (supportsaker), språk, enhet | `functions/aiSupport.js`: `users/{uid}/supportTickets`, `supportInbox`, `helpKnowledgeCandidates` | Supportsaker: ingen sletting i koden. `helpKnowledgeCandidates` (GRUNN-01): lagres uten uid, med e-post, telefon og fødselsnummer maskert (`functions/helpKnowledge.js`). Rader eldre enn ett år slettes, og eldre rader med uid anonymiseres, når assistenten brukes neste gang. Navn i fritekst maskeres ikke. |
| A5 | Varsler fra tjenesten | Push og e-post om hendelser brukeren følger | Avtale (b) | Brukere | Varseltekst, tidspunkt, push-abonnement (web og app), varselinnstillinger | `users/{uid}/notifications`, `users/{uid}/pushSubscriptions`, `functions/pushDelivery.js`, `notifyEmail.js` | Ingen sletting av gamle varsler i koden. |
| A6 | Koblinger til Outlook/Microsoft 365 og Google Kalender | Vise e-post og hendelser i ProTop | Avtale (b), brukeren kobler selv | Brukeren | Tilgangsnøkler, e-post og hendelser som hentes | `users/{uid}/calendarConnections`, `functions/msOauth.js`, `outlookMail.js`, `calendarIntegration.js` | Til brukeren kobler fra eller sletter kontoen (Google-tokens trekkes tilbake ved sletting). |
| A7 | Sikkerhet, misbruk og feilretting | Hindre misbruk, rette feil | Berettiget interesse (f) | Brukere | Tellere per bruker/handling (`rateLimits`), feillogger i Cloud Logging (uid, selskaps-id, feilmeldinger) | `functions/security.js` (`assertRateLimit`), `logger.*` i funksjonene | `rateLimits`: ingen sletting i koden. Cloud Logging: standard oppbevaring hos Google. **[bekreft]** |
| A8 | Markedsføring | Nyhetsbrev | Samtykke (a) | Brukere som har sagt ja | E-post, samtykke | `src/utils/consents.js` (av som standard) | Til samtykket trekkes. **[bekreft]** Om nyhetsbrev faktisk sendes. |
| A9 | Eksport av egne data | Innsyn og dataportabilitet (art. 15 og 20) | Rettslig plikt (c) | Brukeren | Det brukeren selv har tilgang til | `src/privacy/myDataExport*.js` | Lagres ikke (lastes ned av brukeren). |

## 3. Del B – ProTop som databehandler for bedriftene (art. 30 nr. 2)

**Behandlingsansvarlige:** hver kundebedrift. Listen over bedrifter og hvem som har godtatt
databehandleravtalen (`company.dpaAcceptance`: versjon, tidspunkt, uid og navn) finnes i databasen,
ikke i repoet. **[bekreft]** Rutine for å hente ut listen ved tilsyn.

Bedriften bestemmer formål og tilgang. Tilgangen styres per modul i tilgangsmatrisen og håndheves i
`firestore.rules` gjennom speilet `families/{id}/accessAcl/{uid}` (se ROS-analysen).

| # | Behandling (modul) | Registrerte | Opplysninger | Særlige kategorier og fødselsnummer | Hvor i koden | Lagringstid og sletting i dag |
|---|---|---|---|---|---|---|
| B1 | Ansattregister og CV | Ansatte, innleide, eksterne | Navn, kontakt, adresse, stilling, avdeling, ansettelsesform, stillingsprosent, datoer, tilgangsnivå, CV (utdanning, sertifikater, kurs, erfaring, prosjekter), bilde, filer | Fødselsnummer, pårørende og intern kommentar ligger i egen skjermet samling | `employees/{id}`, `employeesPrivate/{id}`, Storage `families/{id}/employeeFiles/…` | Til bedriften sletter posten (papirkurv, så permanent sletting via `setEmploymentStatus` med `purge`). Den skjermede delen slettes ikke av `purge` på serveren. |
| B2 | HR | Ansatte, tidligere ansatte, søkere | Arbeidsavtaler, lønn og lønnshistorikk, medarbeidersamtaler, personalsaker, notater, oppgaver, søknader og vedlegg, sjekkliste for lovpålagt, HMS-kort, ferieplan, personalhåndbok | Kan inneholde helseopplysninger (oppfølging ved sykdom, tilrettelegging) og fagforeningsmedlemskap (tariff) i fritekst | `hr/**`, `hrSelf/{ansatt-id}`, Storage `families/{id}/hr/…` | Bedriften velger frister (`company.privacy.retention`, `src/hr/retention.js`). Standard: avslåtte søknader 6 måneder, personalmappe 3 år etter sluttdato, lønn 5 år etter sluttdato. Kjører bare når noen med Admin på HR åpner HR. |
| B3 | Fravær og ferie | Ansatte | Dato, timer, type (ferie, permisjon, egenmelding, sykemelding, sykt barn), status, kommentar | **Helse (art. 9)**: at fraværet gjelder sykdom | `absences/{id}`, `hr/vacationPlan`, `functions/vacationPlan.js` | Ingen automatisk sletting (`retention.js` sier at timer og fravær er lønnsgrunnlag). |
| B4 | Timer og arbeidstid | Ansatte, innleide | Dato, timer, klokkeslett inn/ut, prosjekt, aktivitet, beskrivelse, godkjenning, endringshistorikk, slettelogg | – | `timeEntries/{id}` (med `history`), `timeEntryDeletions`, `projects/state` (lås og saldo) | Ingen automatisk sletting. |
| B5 | Kjørebok og utlegg | Ansatte | Turer med start- og sluttadresse, koordinater, rute og kilometer, kjøretøy og reg.nr., utlegg og kvitteringer | Posisjon (ett punkt når brukeren trykker «Her») | `projects/state` (`mileageTrips`, `expenses`), `projectExpenses`, Storage (kvitteringer), `src/mileage/`, `screens/economy/MileageWizard.jsx` | Ingen automatisk sletting. Fakturerte poster er bokføringsmateriale. |
| B6 | Prosjekt og produksjon | Ansatte, innleide, kontaktpersoner hos kunder og underentreprenører | Prosjektdeltakere, mannskapsliste (navn og firma), møter, sjekklister, utstyr og reservasjoner | – | `projects/state`, `equipment`, `catalog` | Ingen automatisk sletting. Slettede rader merkes i 180 dager (`deletedRows`). |
| B7 | Kunder, avtaler og anbud | Kontaktpersoner, privatkunder | Navn, adresse, e-post, telefon, org.nr., avtaler og dokumenter, notater | Fødselsnummer for privatkunder når en avtale krever det | `anbud/state`, `anbud/customers`, `src/anbud/` | Ingen automatisk sletting. |
| B8 | Faktura og regnskap | Kunder og kontaktpersoner, ansatte (navn på timelinjer og timespesifikasjon) | Fakturaer, linjer, betalinger, KID, kreditnotaer, salg, overføring til PowerOffice og EHF | – | `invoices`, `invoiceSeries`, `productSales`, `src/economy/`, `functions/powerOffice*.js`, `invoiceDelivery.js` | Regnskapsmateriale i 5 år (bokføringsloven § 13). Utstedte fakturaer kan ikke slettes (reglene). Ingen sletting etter 5 år i koden. |
| B9 | ISO / K-HMS | Ansatte, innleide, melder av avvik, skadde, revisorer | Avvik, RUH, personskader med skadeklasse, varsling, tiltak, revisjoner, kompetansebevis, risiko, dokumentstyring og lesebekreftelser, revisjonsspor, bilder | **Helse**: personskade og skadeklasse. Skjermede saker (varsling etter aml. kap. 2 A, personskade) i egne samlinger | `iso*`, `isoFindingsRestricted`, `isoRestricted`, `isoAudit*`, `docControl`, `docAcks`, `src/iso/` | Ingen automatisk sletting. |
| B10 | Samhandling | Ansatte, gjester i chat | Chat og meldinger, nyhetsvegg, kalender, notater, oppgaver, dokumenter | Kan forekomme i fritekst | `chats/**`, `companyWallPosts`, `events`, `notes`, `parentTodos`, `documentFolders` | Ingen automatisk sletting. Ved sletting av konto fjernes navn og bilde på egne meldinger. |
| B11 | Brukslogg | Brukere i bedriften | Innlogging, aktivitet omtrent hvert 4. minutt, sidevisninger, tidspunkt, IP-adresse, nettleser, endringer i timer, sendte invitasjoner | Overvåking av ansatte | `employees/{id}/usage`, `functions/usageLog.js` | 90 dager. Slettes ved innlogging og lesing. Bedriften kan slå av (`company.privacy.usageLog`). |
| B12 | Innsynslogg | Ansatte som får sin HR, lønn, fravær eller fødselsnummer åpnet | Hvem, hva og når (ingen verdier) | – | `accessLog`, `functions/accessLog.js` | Ingen lagringstid satt. |
| B13 | AI på bedriftens vegne | Det som står i teksten eller bildet | Importfiler, CV, arbeidsavtaler, kvitteringer, timelister, anbud og avtaler, talenotater | Kan inneholde helse og fødselsnummer (11-sifrede tall maskeres ved import av kolonner) | `functions/ai*.js`, `importInterpret.js`, `timesheetReviewAi.js`, `anbud*Ai.js`, `aiDrafts`, `aiUsage` | Utkast utløper etter 48 timer, slettes etter 30 dager, midlertidige bilder etter 48 timer, `aiUsage` etter 90 dager (`functions/aiCleanup.js`). Krever at den planlagte jobben kjører (DS-16). Bedriften kan slå av AI (`company.privacy.ai`). |
| B14 | Tilgangsstyring | Brukere i bedriften | Beregnet tilgang per område, nivå, ansatt-id, utløpstid | – | `accessAcl/{uid}`, `functions/companyAccessSync.js` | Utløper etter 12 timer og skrives på nytt. |

## 4. Mottakere og underleverandører

Tabellen bygger på kall i koden. **[bekreft]** For hver: at det finnes en databehandleravtale,
hvilken region data faktisk behandles i, og grunnlaget for overføring.

| Leverandør | Brukes til | Opplysninger | Region (fra koden) | Utenfor EØS | Hvor i koden |
|---|---|---|---|---|---|
| Google Firebase / Google Cloud | Innlogging, database, filer, serverfunksjoner, hosting, hemmeligheter, logger, planlagte jobber | Alt i del A og B | Funksjoner i `europe-west1` (`functions/setRegion.js`). Firestore- og Storage-region står ikke i repoet. **[bekreft]** Firebase Auth er en global tjeneste. | Mulig (Auth, support, CDN) | `firebase.js`, `functions/` |
| Google Gemini API | AI-funksjoner (B13, A4) | Tekst, bilder og dokumenter brukeren sender | `generativelanguage.googleapis.com` (Gemini Developer API, ikke Vertex AI i EU) | **Ja, trolig** | `functions/aiShared.js`, `geminiEnv.js` |
| Google Routes API | Kjørerute og avstand | Start- og sluttkoordinater | Google | Ja, trolig | `src/mileage/drivingRoute.js` |
| Brevo (eventuelt Resend eller SendGrid) | E-post og SMS fra tjenesten (invitasjoner, faktura på e-post, varsler) | Navn, e-post, telefon, innhold, vedlegg (faktura-PDF) | Avhenger av nøkkelen (`functions/mail.js`, `sms.js`) | Resend og SendGrid: ja | `functions/mail.js`, `sms.js` |
| Microsoft (Graph) | Outlook-kobling | Tokens, e-post, kalender | Microsoft | Mulig | `functions/msOauth.js`, `outlookMail*.js` |
| Google Kalender | Kalenderkobling | Tokens, hendelser | Google | Mulig | `functions/calendarIntegration.js` |
| PowerOffice Go | Regnskap: kunder, fakturautkast, status | Kunde, linjer, beløp | Norge | Nei, trolig | `functions/powerOffice*.js` |
| Peppol-aksesspunkt | EHF-faktura | Fakturaen | Ikke koblet (`functions/peppolProvider.js`) | – | `functions/invoiceDelivery.js` |
| Peppol-katalogen | Finne EHF-mottaker | Org.nr. | EU | Nei | `functions/invoiceDelivery.js` |
| Expo (exp.host) | Push til mobilapp | Push-token, varseltekst | USA | **Ja** | `functions/pushDelivery.js` |
| Nettleserens push-tjeneste (Google, Mozilla, Apple) | Web-push | Kryptert varsel | Varierer | Mulig | `functions/pushDelivery.js` (VAPID) |
| Brønnøysundregistrene | Oppslag på org.nr. | Org.nr., navn (også enkeltpersonforetak) | Norge | Nei | `functions/doffinSearch.js`, `src/` |
| Statens vegvesen | Kjøretøyoppslag | Reg.nr. | Norge | Nei | `functions/vegvesenLookup.js` |
| Doffin, TED, Mercell, Tendsign, EU-Supply, Artifik, Hyyr | Anbud | Søkeord, kunngjøringer (kontaktpersoner i kunngjøringer) | EU/Norge | Nei | `functions/doffin*.js`, `tenderProxy.js`, `src/anbud/` |
| SSB | Indeksregulering | Ingen personopplysninger | Norge | Nei | `functions/indeksreguleringAi.js` |
| OpenStreetMap/Nominatim, Photon (komoot), Geonorge/Kartverket | Adressesøk, kart og adresse fra posisjon (kjørebok «Her», vær) | Søketekst eller koordinater, IP | EU/Norge, Storbritannia (Nominatim) | Nei (Storbritannia har tilstrekkelighetsvedtak) | `src/utils/location.js`, `src/utils/reverseGeocode.js`, `src/anbud/geocodePlace.js` |
| ~~BigDataCloud~~ | Fjernet (GRUNN-02). Adresse fra posisjon går nå til Kartverket, så Photon og Nominatim | – | – | – | `src/utils/reverseGeocode.js` |
| OSRM (router.project-osrm.org) | Reserve for kjørerute | Koordinater | Offentlig demotjener | Ukjent | `src/mileage/drivingRoute.js` |
| MET Norway, Open-Meteo | Vær på forsiden | Omtrentlig posisjon | Norge, Sveits | Nei (Sveits har tilstrekkelighetsvedtak) | `src/utils/weather.js` |
| Google Fonts, unpkg | Skrift og kartbibliotek | IP-adresse | USA | **Ja** | `app.web.css`, `src/mileage/routeMapHtml.js`, `src/anbud/tenderMapHtml.js` |
| Nettleserens talegjenkjenning | Diktering (blant annet «Meld RUH») | Lyd | Avhenger av nettleser (Chrome: Google) | Mulig | `screens/iso/QuickReport.jsx`, `src/hooks/useVoiceDictation.js` |

## 5. Overføring utenfor EØS

Personvernerklæringen sier at overføring skjer etter EU–US Data Privacy Framework når leverandøren er
sertifisert, ellers etter EUs standardkontraktsklausuler (art. 46). **[bekreft]** for hver leverandør i
tabellen merket «Ja». Expo, OSRM, Google Routes, vær, kart og talegjenkjenning står i personvernerklæringen fra
28. oktober 2026 (GRUNN-02, merket for juristgjennomgang i `src/i18n/legal.js`). BigDataCloud er fjernet fra koden.
OSRM-demotjeneren har ingen avtale og ukjent driftssted. **[bekreft]** eller bytt til egen tjener.

## 6. Lagringstid og sletting slik koden gjør det

| Data | Regel | Hvor | Merknad |
|---|---|---|---|
| Brukerkonto | Slettes på forespørsel: profil, innlogging, filer under `users/{uid}/`, private chatter, koblinger, samtykkelogg, brukslogg på koblede ansattposter. Navn og bilde fjernes på egne meldinger i bedriftens chat. | `functions/deleteAccount.js`, `deleteAccountLogic.js` | Sperret for siste eier i en bedrift med utstedte fakturaer (regnskap). Bedriftens opplysninger om personen beholdes. |
| Brukslogg | 90 dager | `functions/usageLog.js`, `src/privacy/companyPrivacy.js` | Slettes ved innlogging og lesing, ikke av en planlagt jobb. |
| AI-utkast og midlertidige filer | 48 timer / 30 dager, `aiUsage` 90 dager | `functions/aiCleanup.js` | Bare hvis `aiCleanupScheduled` kjører i produksjon (DS-16). |
| HR | Bedriftens frister, standard 6 måneder / 3 år / 5 år | `src/hr/retention.js`, `screens/hr/HrScreen.jsx` | Kjører i appen når HR-admin åpner HR. Ingen kjøring hvis ingen åpner HR. |
| Faktura og bilag | Minst 5 år | `firestore.rules` (utstedt faktura kan ikke slettes) | Ingen sletting etter fristen. |
| Lokale kopier på enheten | Slettes ved utlogging eller annen bruker | `src/utils/localCache.js` | – |
| Slettemarkeringer i prosjektdokumentet | 180 dager | `src/project/engine.js` | – |
| Bedriftens data etter opphør | Eier/admin avslutter (`closeCompany`), sletting 90 dager etter, eksport først | `functions/companyClosure*.js`, `src/privacy/companyClosure.js`, `scripts/purge-closed-companies.mjs` | GRUNN-03. Slettingen kjøres av driften (ingen planlagt jobb i CI). **[bekreft]** rutinen: hvem kjører den, og hvor ofte. Se `docs/drift/sletting-av-bedrift.md`. |
| Fravær, timer, kjørebok, ISO, chat, kunder, innsynslogg, varsler, support | Ingen regel | – | Må fastsettes (se åpne spørsmål). |
| Sikkerhetskopier | Ukjent | – | **[bekreft]** om Firestore har sikkerhetskopi eller gjenoppretting til tidspunkt, og hvor lenge. |

## 7. Tekniske og organisatoriske tiltak (oversikt)

Mer i [ROS-analysen](ros-analyse.md).

- Innlogging med Firebase Auth (Google, Microsoft, Apple, e-post og passord). Ingen tofaktor i koden.
- Tilgangsstyring per modul i appen og i databasereglene (`firestore.rules`) gjennom speilet
  `accessAcl/{uid}`, som utløper etter 12 timer og da avviser (fail closed).
- Skjermede samlinger: `employeesPrivate` (fødselsnummer, pårørende, kommentar), `hr/**` og `hrSelf`,
  fravær (bare eget for vanlige ansatte), `isoFindingsRestricted`, `isoRestricted`, `accessLog`, `consentLog`.
- Filer: lesing og skriving gjennom serverfunksjoner med egen tilgangskontroll (`functions/storageAccess.js`)
  og `storage.rules`. Nedlastingslenker med token som ikke utløper finnes fortsatt (L-18).
- Utstedte fakturaer er låst i reglene. Timer og utlegg på faktura er låst.
- Revisjonsspor: ISO (`isoAudit`), faktura (`events`), timer (`history`, `timeEntryDeletions`), innsynslogg.
- Kryptert overføring (HTTPS) og kryptering av lagrede data hos Google (standard).
- Grenser for antall kall (`rateLimits`) på serverfunksjoner.
- Bedriften kan slå av brukslogg og AI.
- Advarsel mot helseopplysninger i fritekst ved sykefravær (`src/arbeid/absenceCatalog.js`).
- Lokale kopier fjernes ved utlogging.
- Regeltester mot Firestore-emulatoren i CI (`tests/rules/`).

## 8. Åpne spørsmål til eieren

1. Fyll inn juridisk navn, org.nr., adresse og eventuelt personvernombud (`LEGAL_ENTITY`).
2. Bekreft databehandleravtaler og overføringsgrunnlag for hver underleverandør i punkt 4.
   ~~Legg til BigDataCloud, Expo, OSRM og talegjenkjenning i personvernerklæringen, eller fjern dem fra koden.~~
   Gjort (GRUNN-02): BigDataCloud fjernet, de andre står i erklæringen. Juristen må kontrollere grunnlaget.
3. Bekreft region for Firestore og Storage, og hvor Firebase Auth lagrer data.
4. Gemini Developer API eller Vertex AI i EU? Brukes betalt nivå (ingen bruk av data til trening)?
5. Hvilken e-postleverandør brukes i produksjon (Brevo, Resend eller SendGrid)?
6. Lagringstid for fravær (sykefravær), timer, kjørebok, ISO-saker og personskader, chat, kundedata,
   innsynslogg, varsler og support. Hvem sletter, og hvordan?
7. Rutine for å slette en bedrifts data innen 90 dager etter opphør, slik databehandleravtalen lover.
   Funksjonen finnes (GRUNN-03, `docs/drift/sletting-av-bedrift.md`). Eieren må bestemme hvem som kjører
   slettingen og hvor ofte, og om avtaleteksten om regnskapsmateriale skal endres.
8. Sikkerhetskopier: finnes de, hvor lenge, og hvordan slettes data der?
9. ~~`helpKnowledgeCandidates`: fjern uid eller sett en lagringstid.~~ Gjort (GRUNN-01): uten uid, ett år.
10. Skal samtykkeloggen beholdes etter at kontoen er slettet?
11. Er familie-, skole-, barnehage-, utleie- og treningsfunksjonene i drift (L-35)?
12. Er de planlagte jobbene som sletter data (`aiCleanupScheduled`) faktisk i drift (DS-16)?
