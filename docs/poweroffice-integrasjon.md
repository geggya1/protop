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
- [ ] Registrer innbetaling i Go. Synk gir status «Betalt».
- [ ] Slå sammen to utkast for samme kunde i Go. Synk finner det nye utkastet («slått sammen»).
- [ ] Slett et overført utkast i Go. Synk viser «Finnes ikke lenger i PowerOffice». «Overfør på nytt» virker.

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
> Kan du sende skjemaet for produksjonstilgang? Integrasjonen bruker salgsordrer, utgående fakturaer,
> kunder og produkter (lesing). Vi trenger ikke CreateAndSendInvoice. Fakturaene sendes fra PowerOffice Go.
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
