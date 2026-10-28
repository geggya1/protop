# Lagringstider i ProTop (forslag, GRUNN-04)

> **Utkast – eierens beslutning, og må gjennomgås av jurist.** Lovhenvisningene er satt opp etter
> beste kunnskap og er ikke kontrollert mot Lovdata i denne runden (Lovdata var ikke tilgjengelig
> fra utviklingsmiljøet). Alle frister merket **[bekreft]** må kontrolleres før de slås på.

Verdiene står i koden i `src/privacy/retentionPolicy.js` (`RETENTION_POLICY`). Bare det som er
merket *implementert* slettes i dag. Resten er forslag med `enabled: false`: ingenting slettes før
eieren har bestemt fristen, satt `enabled: true`, og en slettejobb leser `retentionCutoffIso(id)`.
`src/privacy/retentionPolicy.test.mjs` sjekker at tabellen her og koden har de samme kategoriene.

ProTop er **databehandler** for det bedriftene registrerer (del B i [behandlingsprotokollen](behandlingsprotokoll.md)).
Fristene under er derfor et forslag til standard som bedriften (behandlingsansvarlig) kan godta eller endre.
HR har allerede egne frister bedriften velger (`src/hr/retention.js`, Selskapsinnstillinger → Personvern).

## Lovgrunnlag i korte trekk

- **Bokføringsloven § 13 første ledd:** regnskapsmateriale (bilag, fakturaer, spesifikasjoner og dokumentasjon av
  bokførte opplysninger) oppbevares i fem år etter regnskapsårets slutt. Timer og fravær som er grunnlag for lønn eller
  faktura, kjørebok for skattefri godtgjørelse og kvitteringer for utlegg er slik dokumentasjon. **[bekreft]**
- **Arbeidsmiljøloven § 10-7:** arbeidsgiver skal ha en oversikt over hvor mye den enkelte har arbeidet, tilgjengelig
  for Arbeidstilsynet og de tillitsvalgte. Bestemmelsen har, så vidt vi vet, **ingen fast oppbevaringstid** (oppdraget
  nevnte «2 år?»; det fant vi ikke grunnlag for). Krav på lønn foreldes etter tre år (foreldelsesloven § 2), og når timene
  er lønns- eller fakturagrunnlag, gjelder fem år etter bokføringsloven. **[bekreft]**
- **Internkontrollforskriften § 5:** det systematiske HMS-arbeidet skal dokumenteres, uten fast frist. ISO 9001, 14001 og
  45001 (punkt 7.5.3) lar virksomheten selv fastsette hvor lenge dokumentert informasjon beholdes, men det må finnes
  bevis for avvik og tiltak (10.2), revisjoner (9.2) og ledelsens gjennomgang (9.3) over en sertifiseringsperiode (tre år).
- **Arbeidsmiljøloven § 5-1:** personskader skal registreres. Krav etter yrkesskade kan komme sent (foreldelsesloven § 9:
  tre år fra man fikk kunnskap, lengst 20 år). **[bekreft]** Eksponeringsregistre for kjemikalier og asbest har egne,
  svært lange frister (40–60 år) etter forskrift om utførelse av arbeid. ProTop fører ikke slike registre i dag.
- **GDPR art. 5 nr. 1 c og e:** det som ikke har et lovkrav, skal ikke lagres lenger enn formålet krever.

## Tabell

| Kategori (`id`) | Forslag | Regnes fra | Grunnlag | Status |
|---|---|---|---|---|
| Innsynslogg (`accessLog`) | 2 år | innsynet | GDPR art. 5 nr. 2 og art. 32. Den ansatte skal kunne se hvem som har sett egne opplysninger, også i en tvist som kommer etter en tid. | **Implementert** (`functions/accessLog.js`): eldre rader slettes når loggen skrives eller leses. Vises i Innsynslogg og i personvernerklæringen. |
| Brukslogg (`usageLog`) | 90 dager | hendelsen | GDPR art. 5, arbeidsmiljøloven kap. 9 | **Implementert** (`functions/usageLog.js`, L-08) |
| Spørsmål til hjelpeassistenten (`helpKnowledge`) | 1 år | spørsmålet | GDPR art. 5 nr. 1 e | **Implementert** (`functions/helpKnowledge.js`, GRUNN-01) |
| Fakturaer, kreditnotaer og bilag (`invoices`) | 5 år | regnskapsårets slutt | Bokføringsloven § 13 | **Låst**: utstedte fakturaer kan ikke slettes (`firestore.rules`). Ingen sletting etter fem år i koden. |
| Timer (`timeEntries`) | 5 år | regnskapsårets slutt | Bokføringsloven § 13, aml. § 10-7, foreldelsesloven § 2 | Forslag |
| Fravær og ferie (`absences`) | 5 år | regnskapsårets slutt | Bokføringsloven § 13 (lønnsgrunnlag: sykepenger, feriepenger), ferieloven | Forslag |
| Kommentar på sykefravær (`absenceComments`) | 12 måneder | fraværet | GDPR art. 5 og 9, aml. § 4-6. Datoen og typen beholdes som lønnsgrunnlag, fritekst om helse trengs ikke etterpå. | Forslag |
| Kjørebok, utlegg og kvitteringer (`mileage`) | 5 år | regnskapsårets slutt | Bokføringsloven § 13, skattefri bilgodtgjørelse | Forslag |
| ISO: personskader og yrkesskader (`isoInjuries`) | 10 år | saken ble lukket | Aml. § 5-1, folketrygdloven kap. 13, yrkesskadeforsikringsloven, foreldelsesloven § 9 | Forslag **[bekreft]** |
| ISO: avvik, RUH og tiltak uten personskade (`isoCases`) | 5 år | saken ble lukket | Internkontrollforskriften § 5, ISO 7.5.3 og 10.2. Vurder å fjerne melderens navn etter 2 år. | Forslag |
| ISO: revisjoner, ledelsens gjennomgang, risiko (`isoAudits`) | 6 år | datoen | ISO 9.2 og 9.3 (to sertifiseringsperioder), internkontrollforskriften § 5 | Forslag |
| Kompetansebevis og opplæring (`isoCompetence`) | 3 år | sluttdato | Dokumentert opplæring (forskrift om utførelse av arbeid, forskrift om administrative ordninger), ISO 7.2. Samme som personalmappen. | Forslag |
| Varslingssaker (`whistleblowing`) | 3 år | saken ble avsluttet | Aml. § 2 A-3, foreldelsesloven § 9 | Forslag **[bekreft]** |
| Chat og meldinger (`chat`) | 24 måneder | meldingen | Ingen lovkrav. Det som er del av en sak, bør ligge i saken. | Forslag |
| Kunder og kontaktpersoner (`customers`) | 3 år | siste oppdrag eller kontakt | GDPR art. 5, foreldelsesloven § 2. Fakturaene beholdes etter bokføringsloven. | Forslag |
| Personnummer for privatkunder (`customerNationalId`) | 3 år | avtalen er oppfylt | GDPR art. 5, personopplysningsloven § 12 | Forslag |
| Anbud og tilbud som ikke ble vunnet (`tenders`) | 3 år | tildelingen | GDPR art. 5 | Forslag |
| Varsler i appen (`notifications`) | 12 måneder | varselet | Kopi av hendelser som finnes andre steder | Forslag |
| Supportsaker (`supportTickets`) | 3 år | saken ble lukket | GDPR art. 5, foreldelsesloven § 2 | Forslag |
| Tellere mot misbruk (`rateLimits`) | 30 dager | siste kall | Trengs bare i tellervinduet | Forslag |

Allerede i koden, utenfor tabellen: HR (bedriftens frister, standard 6 måneder / 3 år / 5 år, `src/hr/retention.js`),
AI-utkast og midlertidige filer (48 timer / 30 dager / 90 dager, `functions/aiCleanup.js`, krever at jobben kjører),
brukerkonto (til den slettes, `functions/deleteAccount.js`) og bedriften etter avslutning (90 dager,
[sletting av bedrift](../drift/sletting-av-bedrift.md)).

## Slik slås en frist på

1. Eieren bestemmer fristen (og om bedriftene skal kunne velge selv, slik som for HR).
2. Sett `enabled: true` (og eventuelt ny `keep`) for kategorien i `src/privacy/retentionPolicy.js`.
3. Lag slettingen der dataene brukes, etter samme mønster som innsynsloggen og bruksloggen: serveren sletter det som er
   eldre enn `retentionCutoffIso(id)` når dataene skrives eller leses, eller en callable/skript som driften kjører
   (planlagte jobber deployes ikke av CI, se [triggere og planlagte jobber](../drift/triggere-og-planlagte-jobber.md)).
   For frister fra regnskapsårets slutt: bruk `lastDeletableAccountingYear(år)`.
4. Oppdater personvernerklæringen (punkt 9 i `src/i18n/legal.js`) og behandlingsprotokollen, og fortell bedriftene
   (databehandleravtalen).

## Åpne spørsmål til eieren

1. Godtar dere fristene over som standard? Skal bedriftene kunne endre dem (som HR)?
2. Timer og fravær: fem år for alle rader, eller bare for rader som er lønns- eller fakturagrunnlag?
3. Sykefravær: skal fritekst slettes etter 12 måneder mens dato og type beholdes?
4. ISO: hvor lenge skal personskader beholdes? Skal melderens navn fjernes fra avvik etter en tid?
5. Chat: 24 måneder, eller bedriftens valg?
6. Innsynslogg: er to år riktig? (Implementert nå, kan endres i `ACCESS_LOG_RETENTION_DAYS`.)
