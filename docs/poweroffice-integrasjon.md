# PowerOffice Go — integrasjon for fakturautkast

Sist oppdatert: 27.10.2026 (innstillinger flyttet, miljø fra nøkkelen)

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
> Kan du sende skjemaet for produksjonstilgang? Integrasjonen bruker salgsordrer med vedlegg, utgående
> fakturaer, fakturasending (CreateAndSendInvoice), bilagsdokumentasjon (VoucherDocumentation), og kunder og
> produkter.
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
