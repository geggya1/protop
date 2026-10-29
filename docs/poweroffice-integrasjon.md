# PowerOffice Go — integrasjon for fakturautkast

Sist oppdatert: 29.10.2026 (ønskeliste: bilag, lønn, resultatregnskap, tilganger)

## Avtalt med PowerOffice

Kilde: e-posttråden «Fra innsending på 16.10.2026» med PowerOffice API-support (Finn-Andre Gjerde).
Den gikk 16.–21.10.2026.

- ProTop er en egen integrasjon med egen applikasjonsnøkkel. Den er skilt fra Smartplan og Consult1.
  Utviklerselskapet er Invest AS.
- Fakturagrunnlaget (timer, utlegg og kjøring) lages i ProTop. Utkastet overføres til PowerOffice Go.
  Fakturaen kontrolleres og sendes derfra. ProTop sender ikke ferdige fakturaer og poster dem ikke som bilag.
- ProTop henter tilbake fakturanummer, KID, forsendelsesmåte og betalingsstatus.
- Demotilgang er gitt 19.10.2026. Klienten heter «Invest AS - API Test Client», og
  abonnementet heter «InvestAs-Demo». Nøklene står i e-posten
  «PowerOffice Go API V2 Access granted». De skal ikke inn i repoet.
- Neste steg hos PowerOffice: Når hele flyten er testet i demo, gir vi beskjed. Da sender de skjemaet
  for produksjonstilgang. Behandlingen tar normalt et par virkedager. Deretter aktiveres integrasjonen
  på klienten under Meny → Innstillinger → Utvidelser.

## Slik er det bygget

| Steg | API-kall | Kode |
|---|---|---|
| Token | `POST https://goapi.poweroffice.net/Demo/OAuth/Token` (Basic applikasjonsnøkkel:klientnøkkel, `Ocp-Apim-Subscription-Key`, `grant_type=client_credentials`) | `functions/powerOfficeApi.js` |
| Finn eller opprett kunde | `GET /Customers?customerNos=…`, `externalImportReference`, org.nr. og deretter `POST /Customers` | `functions/powerOfficeSync.js` |
| Overfør utkast | `POST /SalesOrders/Complete` med `ExternalImportReference = ProTop-<faktura-id>` og `…-L<n>` på hver linje | `functions/powerOfficeMap.js` |
| Sendt? | `GET /OutgoingInvoices?invoiceIds=…`. Id-en på salgsordren beholdes når den blir faktura. | `syncInvoices` |
| Betalt? | `GET /OutgoingInvoices?balanceLastChangedDateTimeOffsetGreaterThan=<markør>`. `Balance` 0 betyr betalt. | `syncInvoices` |
| Slått sammen i Go | Utkastet får ny id, og referansen på hodet forsvinner. Vi leter etter linjer med vår referanse. | `findMerged` |

- Grensen er 10 kall i sekundet. Klienten venter 110 ms mellom kall. Ved 429 eller 503 prøver den igjen
  (Retry-After eller økende ventetid).
- `IsCreatedByCurrentIntegration` brukes ikke. Når en bruker sender utkastet fra Go, regnes fakturaen
  som brukerens. Vi slår opp på id og referanse.
- Linjene får produkt etter MVA-sats. Produktet i Go styrer salgskonto og MVA. Admin velger
  produkt per sats under Økonomi → Innstillinger → Regnskapssystem.
- Miljøet velges ikke. Serveren prøver klientnøkkelen mot produksjon først og deretter mot
  PowerOffice sitt testmiljø (`findClientEnvironment`). En testklient merkes «Testklient» overalt.
- Fakturanummer og KID kommer fra PowerOffice. ProTop sitt nummer på utkastet tas vare på i
  `poweroffice.protopInvoiceNumber`. KID-en fra ProTop fjernes ved overføring.

### Lagring

- `powerOfficeClients/{familyId}`: klientnøkkel, miljø, produktvalg, kundekoblinger og synkmarkør.
  Ingen Firestore-regel gir tilgang, så bare Cloud Functions leser den.
- `families/{familyId}/invoices/{id}.poweroffice`: salgsordre-id, state (`draft`, `sent`, `paid`, `missing`),
  fakturanummer, KID, forsendelse, restbeløp og MatchId.

### I appen

Økonomi → Innstillinger → Regnskapssystem: koble til med klientnøkkel, velg produkt per MVA-sats,
«Synk nå», «Koble fra».

Økonomi → Faktura (bare admin):
- Er bedriften koblet til, viser listen én linje med PowerOffice-status og «Synk nå». Listen synker
  av seg selv når den åpnes, høyst hvert femte minutt. Uten tilkobling vises ingenting.
- På et utkast erstatter «Overfør til PowerOffice» knappen «Send faktura» når bedriften er koblet til.
  Etterpå viser fakturaen status fra Go.
- Finnes ikke utkastet lenger i Go, kan det overføres på nytt etter en bekreftelse. Det får da en ny referanse.

### Cloud Functions

Entry: `functions/powerOfficeIndex.js` (slim-deploy, `scripts/deploy-slim-functions.sh`).
Funksjonene er `powerOfficeStatus`, `powerOfficeConnect`, `powerOfficeDisconnect`, `powerOfficeProducts`,
`powerOfficeTransferInvoice` og `powerOfficeSyncInvoices`.

## Oppsett som gjenstår (manuelt)

1. **Nøkler i Secret Manager** (prosjekt `protop-c189c`). Verdiene står i e-posten «Access granted»:
   - `POWEROFFICE_DEMO_APPLICATION_KEY`: «Applicationkey»
   - `POWEROFFICE_DEMO_SUBSCRIPTION_KEY`: «Subscription key Primary»

   ```sh
   printf '%s' '<verdi>' | gcloud secrets create POWEROFFICE_DEMO_APPLICATION_KEY --data-file=- --project protop-c189c
   printf '%s' '<verdi>' | gcloud secrets create POWEROFFICE_DEMO_SUBSCRIPTION_KEY --data-file=- --project protop-c189c
   ```
   Kjørekontoen til funksjonene, `330510386923-compute@developer.gserviceaccount.com`, må ha rollen
   `Secret Manager Secret Accessor` på hver av hemmelighetene (fanen Permissions på hemmeligheten).
   `MAIL_API_KEY` har den fordi den deployes med `defineSecret`. PowerOffice-nøklene leses i kjøring
   og må få tilgangen manuelt. Uten den svarer appen at nøklene ikke er satt opp.
   Workflowen «Produksjonsstatus» viser om nøklene finnes.
2. **Deploy:** Merge til `main` deployer funksjonene (functions-gate) og web.
3. **Egen testbedrift:** Ikke koble demoklienten til Consult1. Koblingen gjelder én ProTop-bedrift,
   så testen gjøres i en egen bedrift (for eksempel Invest AS) med egne kunder, prosjekter og
   timer. Consult1 kobles først til produksjonsklienten når PowerOffice har godkjent.
   Koble til under Økonomi → Innstillinger → Regnskapssystem i testbedriften med «Client key» fra e-posten.
4. **Produkter:** Opprett eller finn produkter i demoklienten (https://godemo.poweroffice.net/) for
   minst 25 % MVA, og eventuelt for 0 % og «utenfor». Velg dem med «Hent produkter fra PowerOffice».

## Testliste i demo (før vi skriver til PowerOffice)

- [ ] Regnskapssystem viser «Koblet til Invest AS - API Test Client» med merket «Testklient», og ingen manglende tilganger.
- [ ] Et utkast fra fakturagrunnlaget overføres. Det ligger som fakturautkast i Go med riktig kunde,
      linjer, antall, pris og MVA.
- [ ] Ny kunde (finnes ikke i Go) blir opprettet med org.nr., e-post og adresse.
- [ ] En ny overføring av samme utkast lager ikke duplikat. «Allerede overført» vises.
- [ ] Send utkastet fra Go. «Synk nå» gir fakturanummer, KID, forsendelse og restbeløp i ProTop.
- [ ] «Test tilbakehenting» med en faktura sendt fra Go viser fakturanummer, KID, forsendelse og restbeløp.
- [ ] «Send fra PowerOffice nå» på et overført utkast: status «Sendes», og synk gir fakturanummer og KID.
- [ ] Med automatisk sending på: «Overfør og send» sender fakturaen uten at noen åpner Go.
- [ ] Utkastet i Go har fakturaspesifikasjonen (ProTop-design) og vedleggene, og de følger med fakturaen.
- [ ] Registrer innbetaling i Go. Synk gir status «Betalt».
- [ ] Slå sammen to utkast for samme kunde i Go. Synk finner det nye utkastet («slått sammen»).
- [ ] Slett et overført utkast i Go. Synk viser «Finnes ikke lenger i PowerOffice». «Overfør på nytt» virker.

### Status 28.10.2026

- Kunde uten e-post opprettes nå med EHF (org.nr.) eller papir som forsendelse. Go avviste først kunden
  fordi standard forsendelse er e-post. Testkunden «Hillevågsveien 59-63 AS» ble opprettet som 10024.
- `POST /SalesOrders/Complete` svarer 500 («IVoucherContentStateMaintainer») i demo. PowerOffice har
  bekreftet at feilen er deres, at den rammer flere kall som lager utkast, og at rettelsen kommer i neste
  publisering av API-et. Integrasjonen trenger ingen endring. Følg endringsloggen for Go API.
- Til da: send en faktura laget manuelt i Go og bruk «Test tilbakehenting» under Regnskapssystem.
  Den slår opp fakturanummeret (`GET /OutgoingInvoices?invoiceNos=`), leser fakturaen på id
  (`GET /OutgoingInvoices/{id}`) og viser fakturanummer, KID, forsendelse og restbeløp. Ingenting lagres.

### Status 29.10.2026

- Rettelsen er publisert i demo. Utkast overføres: Go-utkast nr. 2 kom inn med riktig kunde, linjer og MVA.
- Ny innstilling under Regnskapssystem: «Send fakturaen automatisk fra PowerOffice når den overføres» (av som
  standard). På: ProTop kaller `POST /SalesOrders/{id}/createAndSendInvoice` rett etter overføringen, med
  `DeliveryType: Auto` (EHF, eFaktura eller AvtaleGiro når kunden kan ta imot det, ellers PDF på e-post),
  e-post fra fakturaen, og valgt fakturadato (`VoucherDate`) og frist (`OverrideDueDate`).
- «Send fra PowerOffice nå» på et overført utkast gjør det samme for ett utkast. Status «Sendes» til synken
  finner fakturaen i `GET /OutgoingInvoices`. Feilet sendingen (`GET /SalesOrders/sentState`, `LastErrorMessage`),
  går den tilbake til utkast med feilmeldingen.
- Krever tilgangen til fakturasending (CreateAndSendInvoice). Den må krysses av i skjemaet for produksjonstilgang.
- Fakturaer fra testklienten (`poweroffice.env: 'demo'`) kan slettes fra fakturalisten uansett status, og
  nummer derfra teller ikke i ProTop sin nummerserie.

### Fakturaen kunden får (valgt 29.10.2026: løsning A)

PowerOffice lager og sender selve fakturaen (kontonummer, KID, forfall, EHF, purring og inkasso i Go).
ProTop sitt design følger med som vedlegg:

- **Fakturaspesifikasjon** (`buildInvoiceSpecPdf`): ProTop-fakturaen uten utkastmerking og uten
  betalingsinformasjon, med timespesifikasjon etter når fakturaen har timer (av med `attachTimeSpec: false`).
  Summen er uten øreavrunding, som i Go.
- **Fakturaens vedlegg og kvitteringer** (`sendableAttachments`).
- Lastes opp med `POST /SalesOrders/{id}/Attachments` (multipart, feltet `file`) før en eventuell sending,
  én gang per utkast (`poweroffice.attachmentsAddedAt`). Innstilling `attachDocs` (på som standard).
- Linjene: fakturatekst og seksjonsoverskrifter («Timer», «Kjøring» …) som tekstlinjer, og periode foran
  linjeteksten. Hodet: `PurchaseOrderReference` (bestilling), `ContractNo` (kontrakt) og
  `BrandingThemeCode` (fakturaoppsett i Go, valgt under Regnskapssystem).
- Logo, farger og bunntekst settes i Go under fakturaoppsett.

Tilganger som må med i skjemaet for produksjonstilgang: kunder, produkter, salgsordre (SalesOrders_Full),
vedlegg på salgsordre (SalesOrderAttachment_Full), utgående fakturaer, fakturasending (CreateAndSendInvoice)
og bilagsdokumentasjon (VoucherDocumentation, for å hente fakturaen kunden fikk).

### Test 29.10.2026: faktura 10000 fra testklienten

- Utkastet kom inn i Go med fakturaspesifikasjonen som vedlegg. Go slo den sammen med sin egen faktura til én
  PDF: faktura (KID, forfall), så spesifikasjonen og timespesifikasjonen. Synk ga fakturanummer, KID og «Sendt».
- «Send fra PowerOffice nå» ga «Missing privilege»: testklienten mangler CreateAndSendInvoice. Bedt om hos
  PowerOffice.
- Rettet etter testen: Go får kredittiden fra ProTop (`PaymentTerm`), så forfallet blir det samme. Lange
  prosjektnavn brytes i PDF-hodet.
- Endringsloggen får hver bevegelse i PowerOffice (`powerOfficeEvents`, lagt til med `arrayUnion`): overført,
  vedlegg, bedt sendt, sendefeil, sendt med nummer/KID/forfall, innbetaling, betalt, slettet og sammenslått i Go.
- «Last ned» på en faktura sendt fra PowerOffice: fakturaen fra Go (`powerOfficeInvoiceDocument`,
  `GET /VoucherDocumentation/Download`, ZIP pakkes ut på serveren), EHF fra Go når den gikk som EHF, og
  spesifikasjonen. ProTop sin egen faktura-PDF og EHF vises ikke der, fordi de mangler kontonummer og KID fra Go.
  Forhåndsvisningen viser spesifikasjonen. Beløpet er Go sitt, uten øreavrunding.
- Kontonummer på fakturaen kommer fra klientoppsettet i Go. Testklienten har ingen bankkonto.

## Ønskeliste: bilag, lønn og regnskapstall med PowerOffice (bestemt 29.10.2026)

Prinsipp: PowerOffice Go er regnskapet. Kostnader kommer inn og godkjennes i Go som i dag. ProTop
sender grunnlag dit (bilag med kvittering, lønnslinjer, timer) og leser tallene tilbake. Alt vi trenger,
skal krysses av i skjemaet for produksjonstilgang, så vi slipper flere runder. Spørsmålene står under
«Avklaringer med PowerOffice» og i svarutkastet.

### Det vi ønsker, i prioritert rekkefølge

1. **Bilag til regnskapsføreren.** Utlegg, firmakort, kvitteringer og andre bilag som registreres i ProTop,
   sendes til Go som bilag med bilde/PDF (journalføringsutkast), så regnskapsføreren kontrollerer og
   bokfører dem der. Ingenting bokføres direkte fra ProTop uten kontroll.
2. **Lønn.** Utlegg som betales med lønnen, bilgodtgjørelse (trekkfri og trekkpliktig) og eventuelt
   tillegg og overtid fra timene sendes som lønnslinjer til neste lønnskjøring. Status hentes tilbake
   («Sendt til lønn» → «Utbetalt»).
3. **Resultatregnskap i ProTop** (kun lesing). Saldobalanse og kontoposter fra Go gir en egen side med
   resultat per måned og hittil i år, sammenlignet med i fjor, gruppert som i regnskapet (inntekter,
   varekost, lønn, andre driftskostnader, finans). Klikk på en linje viser postene og bilaget. Kan
   filtreres på avdeling og prosjekt. Kostnadene godkjennes fortsatt i Go.
4. **Prosjektregnskap.** Kostnader per prosjekt fra Go (leverandørfakturaer og lønn ført på prosjekt)
   sammen med timer, utlegg og fakturering i ProTop: dekningsbidrag per prosjekt.
5. **Ansatte og arbeidsforhold.** Samme ansatte i ProTop og Go (ansattnummer, avdeling, stilling, start og
   slutt). Grunnlag for lønnslinjer og bilag mot ansattreskontroen.
6. **Prosjekter og avdelinger.** Samme nummer i ProTop og Go, så bilag og lønnslinjer havner riktig.
7. **Timer.** Godkjente timer fra ProTop til timeføringen i Go, der klienten bruker den.
8. **Kundereskontro.** Åpne poster, forfalt og purret per kunde i ProTop (i tillegg til faktura og betaling
   som allerede synkes).
9. **Lønnsslipper**, hvis PowerOffice har eller får et endepunkt for det. Da finner de ansatte lønn,
   utlegg og bilgodtgjørelse på ett sted i ProTop. Ellers lenker vi til der lønnsslippen ligger.
10. **Godkjenning av leverandørfakturaer i ProTop** (valgfritt). Prosjektleder kan attestere fakturaer på
    sitt prosjekt fra ProTop, mens godkjenningen ellers fortsetter i Go.

### Tilganger vi ber om i skjemaet for produksjonstilgang

- Faktura (i bruk): kunder, produkter, salgsordre med vedlegg, utgående fakturaer, fakturasending
  (CreateAndSendInvoice), bilagsdokumentasjon (VoucherDocumentation).
- Bilag: journalføringsbilag/bilagsimport med vedlegg, bilagsdokumentasjon, bilagsgodkjenning
  (VoucherApproval), leverandørbilag (lesing).
- Lønn: lønnslinjer (SalaryLines), lønnsarter (PayItems), lønnsinnstillinger (PayrollSettings).
- Kontakter og dimensjoner: ansatte og arbeidsforhold (Employees, Employments), prosjekter, avdelinger,
  lokasjoner og egne dimensjoner.
- Timeføring: aktiviteter, timetyper, timeføringer og TimeTransactions.
- Rapporter: saldobalanse (TrialBalance), kontoposter (AccountTransactions), kundereskontro, kontoplan og
  mva-koder (GeneralLedgerAccounts, VatCodes).

### Notert fra dokumentasjonen (søk 29.10.2026)

- Bilag kan sendes som journalføringsutkast med sider (PDF/bilde) og eventuelt sendes til godkjenning.
  Godkjenning fra et eksternt system skjer ved å hente `GET /VoucherApproval` med jevne mellomrom.
  Den gjelder leverandørbilag, bankbilag og manuelle bilag.
- Noen endepunkter for leverandørbilag kan være begrenset. Må avklares med PowerOffice.
- Bilagsimport (`POST /Imports/Upload`, `GET /Imports`) finnes, men PowerOffice anbefaler bilagsendepunktene.
- Vi fant ingen webhooks. Endringer hentes med jevne mellomrom (synk), som for fakturaer i dag.
- Saldobalanse er tilgjengelig også for klienter med bare lønnsmodul.

## Utlegg og kjøregodtgjørelse til PowerOffice (skal bygges)

Bestemt: utlegg og kjøregodtgjørelse skal overføres til PowerOffice Go, slik at regnskapsføreren
refunderer de ansatte derfra (med lønnskjøringen eller som utbetaling). Avklaringene under må med i
svaret til PowerOffice (utkastet lenger ned), og tilgangene må krysses av i skjemaet for
produksjonstilgang, så vi slipper en ny runde.

### Utlegg (betalt privat)

API v2 har bilagsendepunkter, og ansattsiden i dokumentasjonen viser til arbeidsflyten «Posting
expense vouchers to Go». Ansatte i Go har egne kontonumre for utbetaling av utlegg
(`expenseBankAccountId`, `travelExpenseBankAccountId`).

1. Den ansatte registrerer utlegget i ProTop med kvittering. Alle felt tolkes fra bildet: dato, beløp,
   valuta, mva-sats, avgiftskode, leverandør, org.nr., kvitteringsnummer, betalingsmåte, utgiftstype,
   beskrivelse og formål.
2. Godkjent utlegg overføres som ett bilag per utlegg:
   - debet: kostnadskonto fra utgiftstypen (for eksempel 7140), med avgiftskode og prosjekt/avdeling.
   - kredit: ansattreskontroen (ansattnummeret i Go). Da står beløpet som gjeld til den ansatte.
   - kvitteringen (skannet) legges ved som bilagsdokumentasjon.
   - `ExternalImportReference = ProTop-UTL-<id>`, så samme utlegg ikke overføres to ganger.
3. Regnskapsføreren betaler ut fra Go. ProTop henter status tilbake («Utbetalt»).
4. Firmakort: kredit kortets mellomregningskonto i stedet for den ansatte. Ingen refusjon.

Utbetaling til den ansatte (bygget i ProTop, `src/economy/expensePayout.js`):

- Hvert utlegg står på den ansatte (`employeeId`). Den ansatte og økonomi kan registrere utlegg fra
  den ansattes side (Ansatte → person → Utlegg), som viser hva personen har til utbetaling.
- Om utlegg betales ut med lønnen eller som egen utbetaling, er en standard under Økonomi →
  Innstillinger → Reise og kjøring, og kan settes per ansatt under HR → Lønn.
- Utlegg → «Til utbetaling» viser godkjente utlegg og kjøregodtgjørelse betalt privat, per ansatt.
  «Eksporter til lønn» gir lønnslinjene som CSV: «Refusjon utlegg» (trekkfri, ikke opplysningspliktig),
  «Bilgodtgjørelse, trekkfri» og «Bilgodtgjørelse, trekkpliktig». «Utbetalt» markerer dem med
  lønnsperioden (`payoutPeriod`), måten (`payoutMethod`) og tidspunktet (`reimbursedAt`).
- Utbetalingsstatus på hvert utlegg (`payoutStatus`): venter på godkjenning → til utbetaling →
  sendt til lønn (`payrollSentAt`, settes når linjene eksporteres) → utbetalt (`reimbursedAt`,
  `payoutPeriod`). Statusen vises i Utlegg-listen, på den ansattes Utlegg-fane og under HR → Lønn.
- Med PowerOffice skal de samme linjene gå rett til lønnskjøringen i Go som lønnslinjer
  (`POST /SalaryLines`), og status hentes derfra (se under).

### Andre deler av PowerOffice Go API v2 vi kan bruke

Funnet i dokumentasjonen (søk 29.10.2026). Feltnavn og statusverdier må sjekkes i Swagger før vi bygger.

| Område | Endepunkt | Hva ProTop kan bruke det til |
|---|---|---|
| Lønnslinjer | `GET/POST/PATCH/DELETE /SalaryLines` | Utlegg, bilgodtgjørelse (trekkfri/trekkpliktig) og eventuelt overtid rett til neste lønnskjøring. Linjene står «klar for lønn» i Go til de tas med i en lønnskjøring, og låses da. Bare linjer vi har laget, kan leses. `EmploymentId` kan settes. Gir status «Sendt til lønn» → «Utbetalt». |
| Lønnsarter | `GET /PayItems` | Velge riktig lønnsart for hver linje (refusjon utlegg, bilgodtgjørelse). Kun lesing. |
| Lønnsinnstillinger | `GET /PayrollSettings` | Lønnsperioder og utbetalingsdato, så «Til utbetaling» kan foreslå riktig periode. |
| Ansatte og arbeidsforhold | `GET/PATCH /Employees`, `GET /Employees/{id}/Employments` | Koble ansatte i ProTop og Go (ansattnummer), stilling, start og slutt. Lønn og faste lønnslinjer er ikke med i API-et. |
| Timeføring | aktiviteter, timetyper, timeføringer, `GET /TimeTransactions` | Godkjente timer fra ProTop til Go (timelønn, prosjektregnskap), eller timer fra Go inn i ProTop. |
| Dimensjoner | `Projects`, `Departments`, `Locations`, `CustomDimensions` | Samme prosjekt- og avdelingsnummer i ProTop og Go, så bilag og lønnslinjer havner riktig. |
| Rapporter | `AccountTransactions`, `TrialBalance`, kundereskontro | Regnskapstall fra Go i Økonomioversikten (resultat per prosjekt, åpne poster). |
| Bilag | bilag, bilagsdokumentasjon, godkjenning av leverandørbilag | Utlegg og firmakort som bilag med kvittering. Godkjenning av leverandørfakturaer i ProTop. |
| I bruk nå | `Customers`, `Products`, `SalesOrders`, `OutgoingInvoices` | Fakturautkast ut, faktura og betaling inn. |

Lønnsslipper: det ser ikke ut til å finnes et endepunkt for lønnsslipper eller utbetalt lønn per ansatt.
Uten det kan ProTop vise utlegg, bilgodtgjørelse og status på linjene vi har sendt, men ikke selve
lønnsslippen. Spørsmål 10 under.

Avgiftskodene i ProTop er standardkodene fra SAF-T (`src/economy/vatTreatment.js`): 1 (fradrag 25 %),
11 (15 %), 13 (12 %), 0 (ingen mva-behandling, for eksempel representasjon og servering) og 86
(tjenester kjøpt fra utlandet).

### Kjøregodtgjørelse

Satsen settes av bedriften under Økonomi → Innstillinger → Reise og kjøring: statens regulativ,
skattefri sats eller egen sats. Om den ansatte får kjøregodtgjørelse, settes på den ansatte under
HR → Lønn (etter bedriftens sats, dekket av lønn, eller egen sats). Registrer kjøretur viser ingen av
valgene (`src/mileage/compensation.js`).

Statens sats og den trekkfrie satsen hentes automatisk (`mileageRates`, `functions/mileageRates.js`):
særavtalen for reiser innenlands og Skatteetatens satsside leses av AI høyst én gang i døgnet, og en
sats tas bare i bruk når den er rimelig. Kjente satser (2025 og 2026: 5,00/5,30 og 3,50 kr/km) ligger i
`src/mileage/mileageRates.js` som reserve.

Hver tur lagrer trekkfri del (`taxFree`) og skattepliktig del (`taxableAllowance`, også `taxableAmount`
på utlegget). Kjøregodtgjørelse hører hjemme i lønnskjøringen (A-meldingen skiller trekkfri og
trekkpliktig bilgodtgjørelse), ikke som et vanlig bilag.

### Avklaringer med PowerOffice

1. Hvilket endepunkt anbefaler de for utlegg fra ansatte: bilag med ansattreskontro, eller import med
   `EmployeeNo` på linjene?
2. Kan bilaget komme inn som utkast som regnskapsføreren godkjenner før bokføring? Dokumentasjonen sier
   at journalføringsflyten foreløpig bare gjelder leverandørbilag.
3. Bilagsdokumentasjon: tar de imot JPG, eller må kvitteringen være PDF? Største filstørrelse?
4. Avgiftskoder: kan vi sende SAF-T-kodene (1, 11, 13, 0, 86) direkte, eller må vi slå opp klientens
   egne mva-koder først?
5. Kjøregodtgjørelse: kan vi sende den som lønnslinjer (variable lønnsposter) til lønnskjøringen i Go,
   med trekkfri og trekkpliktig bilgodtgjørelse hver for seg (kilometer og sats)? Hvilket endepunkt og
   hvilke lønnsarter?
6. Kobling av ansatte: ansattnummer i Go mot den ansatte i ProTop. Kan vi slå opp på e-post?
7. Prosjekt og avdeling på bilagslinjene: hvilke felt bruker vi?
8. Hvilke tilganger skal krysses av i skjemaet for produksjonstilgang for alt dette (bilag,
   bilagsdokumentasjon, ansatte, lønn, prosjekter og avdelinger)?
9. Utlegg som betales ut med lønnen: vi planlegger `POST /SalaryLines` på den ansatte. Hvilke lønnsarter
   (`PayItems`) bruker vi for refusjon av utlegg og for trekkfri og trekkpliktig bilgodtgjørelse?
   Hvordan ser vi på en lønnslinje at den er tatt med i en fullført lønnskjøring, og hvilken
   utbetalingsdato den fikk, så ProTop kan sette «Utbetalt»?
10. Lønnsslipper: finnes det (eller kommer det) et endepunkt for lønnsslipper eller utbetalt lønn per
    ansatt, så de ansatte kan se lønnen sin i ProTop? Hvis ikke: kan vi lenke til der den ansatte ser
    lønnsslippen i PowerOffice?
11. Tilganger for lønn og ansatte: SalaryLines, PayItems, PayrollSettings, Employees/Employments, og
    eventuelt timeføring, prosjekter, avdelinger og rapporter (AccountTransactions, TrialBalance).
    Krever lønn at klienten har lønnsmodulen i Go?
12. Bilag til regnskapsføreren: kan andre bilag enn leverandørbilag (kvitteringer, utlegg, firmakort)
    sendes som journalføringsutkast med bilde/PDF, så regnskapsføreren kontrollerer og bokfører dem i Go?
    Hvilket endepunkt anbefaler dere, og hvilke begrensninger gjelder for endepunktene for leverandørbilag?
13. Resultatregnskap og prosjektregnskap: er `TrialBalance` og `AccountTransactions` riktig grunnlag for
    resultat per måned, avdeling og prosjekt? Får vi bilagsnummer og lenke eller dokument per post?
14. Finnes det webhooks eller varsler for endringer (betalt faktura, kjørt lønn, nye bilag), eller skal vi
    hente endringer med jevne mellomrom?

## Utkast til svar til PowerOffice (sendes når testlisten er grønn)

> **Til:** go-api@poweroffice.no
> **Emne:** SV: Fra innsending på 16.10.2026
>
> Hei Finn-Andre,
>
> Takk for gode svar. Nå har vi testet hele flyten i demo mot «Invest AS - API Test Client»:
>
> - Fakturautkast opprettes med POST /SalesOrders/Complete. ExternalImportReference er satt på hodet
>   og på hver linje.
> - Kunder slås opp på kundenummer, referanse og org.nr. De opprettes med POST /Customers når de mangler.
> - Etter sending fra PowerOffice Go henter vi fakturanummer, KID, forsendelsesmåte og tidspunkt
>   med GET /OutgoingInvoices (invoiceIds).
> - Betalingsstatus synkes med balanceLastChangedDateTimeOffsetGreaterThan. Vi holder oss under
>   10 kall i sekundet.
> - Sammenslåtte utkast spores via ExternalImportReference på linjene.
>
> Vi vil bruke mer av API-et, og ønsker å få alle tilgangene med i skjemaet for produksjonstilgang:
>
> - Faktura (i bruk): kunder, produkter, salgsordrer med vedlegg, utgående fakturaer, fakturasending
>   (CreateAndSendInvoice) og bilagsdokumentasjon (VoucherDocumentation).
> - Bilag: journalføringsbilag med vedlegg, bilagsdokumentasjon, bilagsgodkjenning (VoucherApproval) og
>   leverandørbilag (lesing).
> - Lønn: lønnslinjer (SalaryLines), lønnsarter (PayItems) og lønnsinnstillinger (PayrollSettings).
> - Ansatte og arbeidsforhold, prosjekter, avdelinger, lokasjoner og egne dimensjoner.
> - Timeføring: aktiviteter, timetyper, timeføringer og TimeTransactions.
> - Rapporter: saldobalanse, kontoposter, kundereskontro, kontoplan og mva-koder.
>
> Det vi skal bygge:
>
> - Bilag til regnskapsføreren: utlegg, firmakort og kvitteringer fra ProTop sendes til Go med bilde
>   eller PDF, så regnskapsføreren kontrollerer og bokfører dem der.
> - Lønn: utlegg som betales med lønnen, og bilgodtgjørelse etter statens regulativ (5,30 kr/km, der
>   3,50 kr/km er trekkfritt), skattefri sats eller egen sats, sendes som lønnslinjer til neste
>   lønnskjøring. Status hentes tilbake.
> - Resultatregnskap og prosjektregnskap i ProTop, lest fra saldobalanse og kontoposter. Kostnadene
>   godkjennes fortsatt i Go.
> - Samme ansatte, prosjekter og avdelinger i ProTop og Go, og godkjente timer til timeføringen.
>
> Spørsmål:
>
> 1. Utlegg betalt privat: anbefaler dere bilag mot ansattreskontroen, import med EmployeeNo på linjene,
>    eller lønnslinjer når utlegget betales med lønnen?
> 2. Kan bilag fra ProTop (kvitteringer, utlegg, firmakort) komme inn som journalføringsutkast med
>    bilde/PDF, så regnskapsføreren kontrollerer og bokfører dem? Gjelder det bare leverandørbilag i dag,
>    og hvilke begrensninger har endepunktene for leverandørbilag?
> 3. Tar bilagsdokumentasjonen imot JPG, eller må vedlegget være PDF? Hva er største filstørrelse?
> 4. Kan vi sende SAF-T-avgiftskodene (1, 11, 13, 0, 86) direkte, eller må vi bruke klientens egne
>    mva-koder?
> 5. Lønnslinjer: hvilke lønnsarter (PayItems) bør vi bruke for refusjon av utlegg og for trekkfri og
>    trekkpliktig bilgodtgjørelse? Hvordan ser vi at en linje er tatt med i en fullført lønnskjøring, og
>    hvilken utbetalingsdato den fikk? Krever lønnslinjene at klienten har lønnsmodulen?
> 6. Finnes det, eller kommer det, et endepunkt for lønnsslipper eller utbetalt lønn per ansatt? Hvis ikke:
>    hvor ser den ansatte lønnsslippen, så vi kan lenke dit?
> 7. Kan vi slå opp ansatte på e-post for å finne ansattnummeret?
> 8. Hvilke felt bruker vi for prosjekt og avdeling på bilagslinjer og lønnslinjer?
> 9. Er TrialBalance og AccountTransactions riktig grunnlag for resultat per måned, avdeling og prosjekt?
>    Får vi bilagsnummer og dokument per post?
> 10. Finnes det webhooks eller varsler for endringer (betalt faktura, kjørt lønn, nye bilag), eller skal vi
>     hente endringer med jevne mellomrom?
>
> Med vennlig hilsen
> Geir Ove Andersen
> Invest AS

## Produksjon (etter godkjenning)

- Legg inn `POWEROFFICE_APPLICATION_KEY` og `POWEROFFICE_SUBSCRIPTION_KEY` i Secret Manager.
- Aktiver integrasjonen på klienten i Go (Meny → Innstillinger → Utvidelser) og hent klientnøkkelen.
- Gå til Økonomi → Innstillinger → Regnskapssystem i den operative bedriften (Consult1). Lim inn
  klientnøkkelen og velg produkter. Nøkkelen kjennes igjen som produksjon. Kundekoblinger og synkmarkør
  nullstilles når klienten byttes.
