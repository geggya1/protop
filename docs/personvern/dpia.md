# Vurdering av personvernkonsekvenser (DPIA) for ProTop

> **Utkast – må gjennomgås av behandlingsansvarlig/jurist.**
> Laget fra det koden i repoet faktisk gjør (oktober 2026). Punkter som må kontrolleres utenfor
> koden, er merket **[bekreft]**. Datatilsynet bør konsulteres (art. 36) hvis høy restrisiko står
> igjen etter tiltakene.

Relaterte dokumenter: [Behandlingsprotokoll](behandlingsprotokoll.md) · [ROS-analyse](ros-analyse.md).

## 1. Hvorfor en DPIA

GDPR art. 35 krever en vurdering når en behandling sannsynligvis gir høy risiko. ProTop treffer
flere av kriteriene i Datatilsynets liste og i EDPBs retningslinjer:

- **Systematisk overvåking av ansatte**: brukslogg med innlogging, aktivitet omtrent hvert
  fjerde minutt, sidevisninger og IP-adresse (`functions/usageLog.js`), timer med klokkeslett,
  produktivitet og inntjening per ansatt (`src/hr/productivity.js`, `src/economy/earnings.js`).
- **Særlige kategorier**: sykefravær (art. 9), personskader i ISO, mulig helse i HR-oppfølging.
- **Sårbare registrerte**: arbeidstakere står i et avhengighetsforhold til arbeidsgiveren.
- **Ny teknologi**: AI (Google Gemini) på HR-dokumenter, timelister og kvitteringer.
- **Stor skala**: mange bedrifter, og samme løsning for alle.

Rollene: For bedriftsdata er **bedriften behandlingsansvarlig** og må selv gjøre (eller godkjenne)
en DPIA. ProTop er databehandler og skal hjelpe (art. 28 nr. 3 bokstav f). Dette dokumentet er
ProTops vurdering av hvordan tjenesten er bygget (innebygd personvern, art. 25), og kan brukes som
grunnlag for kundenes egne vurderinger. Bedriftens egne valg (hvem som får hvilken tilgang, om
brukslogg og AI er på, lagringstider) må vurderes av bedriften.

## 2. Beskrivelse av behandlingen

Detaljene står i [behandlingsprotokollen](behandlingsprotokoll.md), del B. Her er de delene som gir
høyest risiko.

| Område | Hva som behandles | Hvem ser det (standard) | Hvor i koden |
|---|---|---|---|
| **HR** | Arbeidsavtaler, lønn og lønnshistorikk, medarbeidersamtaler, personalsaker, notater, søknader og CV, HMS-kort, personalhåndbok | Eier, administratorer og de med HR-tilgang i tilgangsmatrisen. Den ansatte ser sitt eget utsnitt (`hrSelf`). | `hr/**`, `hrSelf/{id}`, `screens/hr/`, `src/hr/` |
| **Sykefravær** | Egenmelding, sykemelding, sykt barn, legebesøk, med dato, timer og kommentar | Den ansatte selv. Alle: eier, administrator, HR, ledere med Begrenset redigering på «Andres timer», Admin på Fraværsoversikt/-rapport. | `absences/{id}`, `src/arbeid/absenceScope.js`, `firestore.rules` |
| **Fødselsnummer, pårørende** | Fødselsnummer (valgfritt), pårørende, intern kommentar | Eier, administrator, HR med Begrenset redigering på Personell, den ansatte selv | `employeesPrivate/{id}` |
| **ISO-skaderegistrering** | Avvik, RUH, personskade med skadeklasse, varsling (aml. kap. 2 A), bilder, tiltak | Saksbehandlere med ISO-tilgang. Skjermede saker bare de med særskilt fullmakt. Melderen ser egne saker. Anonym melding er mulig. | `isoFindings`, `isoFindingsRestricted`, `src/iso/findings.js`, `screens/iso/QuickReport.jsx` |
| **AI** | Importfiler, CV, arbeidsavtaler, kvitteringer, timelister (timelistekontroll), anbud og avtaler, talenotater, hjelpeassistent | Sendes til Google Gemini. Svaret lagres som utkast. | `functions/ai*.js`, `importInterpret.js`, `timesheetReviewAi.js` |
| **Posisjon** | Kjørebok: start- og sluttadresse, koordinater (ett punkt når brukeren trykker «Her»), rute, km. Vær: omtrentlig posisjon. Ingen kontinuerlig sporing i bedriftsdelen. | Den ansatte, økonomi og ledere med tilgang til kjøring | `screens/economy/MileageWizard.jsx`, `src/mileage/`, `src/utils/location.js` |
| **Timer og arbeidstid** | Dato, timer, klokkeslett inn og ut, prosjekt, aktivitet, beskrivelse, endringshistorikk | Den ansatte, godkjennere, ledere med «Andres timer», økonomi | `timeEntries`, `src/arbeid/`, `src/economy/` |
| **Brukslogg** | Innlogging, aktivitet hvert ca. 4. minutt, sidevisninger, tid, IP, nettleser, endringer i timer, invitasjoner | Eier, administratorer og de med tilgang til ansatte | `employees/{id}/usage`, `functions/usageLog.js` |
| **Innsynslogg** | Hvem som åpnet HR, lønn, fravær eller fødselsnummer for en annen | Eier, administratorer, Admin på HR, og den ansatte for egne opplysninger | `accessLog`, `functions/accessLog.js` |

## 3. Nødvendighet og forholdsmessighet

| Spørsmål | Vurdering |
|---|---|
| Formål | Arbeidsgivers plikter og drift: arbeidsavtaler (aml. § 14-6), oversikt over arbeidstid (aml. § 10-7), fravær og sykefraværsoppfølging (aml. § 4-6, folketrygdloven kap. 8), HMS og skaderegister (aml. § 5-1, internkontrollforskriften), lønn, fakturering og regnskap (bokføringsloven). Formålene er saklige. |
| Rettslig grunnlag (bedriften) | Arbeidsavtalen og rettslige plikter (art. 6 nr. 1 b og c), berettiget interesse (f) for brukslogg og produktivitet. Sykefravær: art. 9 nr. 2 b (arbeidsrett). **[bekreft]** grunnlaget for brukslogg og produktivitetstall, og at de er kontrolltiltak etter aml. kap. 9 som må drøftes med tillitsvalgte og informeres om (§ 9-2). |
| Dataminimering | Fødselsnummer er valgfritt og ligger skjermet. 11-sifrede tall maskeres før import sendes til AI. Advarsel mot diagnose i fritekst ved sykefravær. **Mangler:** sivilstand og nasjonalitet i CV-profilen (`src/employees/schema.js`) bør vurderes. Bruksloggen tar aktivitet hvert fjerde minutt, som er mer enn sikkerhet og support trenger. |
| Lagringstid | Satt for brukslogg (90 dager), AI (48 timer / 30 dager), HR (bedriftens valg) og regnskap (5 år). **Mangler** for fravær, timer, kjørebok, ISO, chat, kunder og innsynslogg. Bedriftens data etter opphør slettes ikke automatisk. |
| Informasjon til de registrerte | Personvernerklæringen og databehandleravtalen er skrevet om for B2B (`src/i18n/legal.js`). Teksten om brukslogg står ved bryteren og på Ansatt → Brukerlogg. Arbeidsgiveren må selv informere de ansatte. |
| Rettigheter | Innsyn og eksport av egne data (`src/privacy/myDataExport*.js`), sletting av konto, innsynslogg for egne opplysninger. Opplysninger bedriften har registrert, går via bedriften. |
| Valg for bedriften | Brukslogg og AI kan slås av. Lagringstid for HR kan justeres. Tilgang styres per modul. |
| Automatiserte avgjørelser (art. 22) | Ingen. AI lager forslag og utkast som et menneske godtar. Timelistekontrollen gir merknader til godkjenneren. |

## 4. Risikovurdering

Sannsynlighet (S) og konsekvens (K) for den registrerte: lav, middels eller høy. «Rest» er
vurderingen etter tiltakene som allerede er i koden.

| # | Risiko for den registrerte | S | K | Tiltak i dag | Rest | Forslag |
|---|---|---|---|---|---|---|
| D1 | Kolleger eller ledere ser lønn, personalsaker eller samtaler de ikke skal se | Middels | Høy | `hr/**` krever HR-tilgang i speilet. Den ansatte får bare sitt utsnitt (`hrSelf`). Lønn ligger ikke i lokal kopi. Innsynslogg. | **Middels** | HR er ett dokument: den som har Lese på ett HR-område (for eksempel HMS med «Lovpålagt»), kan lese hele dokumentet med lønn. Del HR i egne samlinger per område (DS-10). |
| D2 | Sykefravær blir kjent for andre enn de som trenger det | Middels | Høy | Fravær filtreres i reglene: vanlige ansatte ser bare eget. Advarsel mot diagnose i fritekst. | **Middels** | Fastsett lagringstid. Vurder å skille «sykdom» fra andre fraværstyper for roller som bare trenger å se at noen er borte. |
| D3 | Fødselsnummer kommer på avveie | Lav | Høy | Egen skjermet samling. Ikke i lokal kopi eller lister. Maskeres før AI-import. Innsynslogg. | **Lav** | – |
| D4 | Ansatte overvåkes mer enn formålet tilsier (brukslogg, klokkeslett, produktivitet, inntjening per ansatt) | Høy | Middels | Brukslogg kan slås av, slettes etter 90 dager, informasjonstekst. Synlig bare for administratorer og de med tilgang til ansatte. | **Middels** | Gjør bruksloggen grovere (for eksempel innlogging og endringer, ikke aktivitet hvert 4. minutt). La bedriften bekrefte at kontrolltiltaket er drøftet (aml. § 9-2). Vis den ansatte sin egen logg. |
| D5 | AI: personopplysninger behandles utenfor EØS, brukes til trening, eller gir feil som slår ut for den ansatte | Middels | Middels | Bedriften kan slå av AI. Opplysning ved hver AI-funksjon. Fødselsnummer maskeres ved import. Utkast slettes. Mennesket godkjenner. | **Middels** | Bytt til Vertex AI i EU eller bekreft betalt nivå uten trening. Bekreft at `aiCleanupScheduled` kjører (DS-16). Server-sjekk av AI-bryteren også for anbud-AI (`tenderProxy`) og avtaletolking. |
| D6 | ISO: personskade, helse eller identiteten til den som varsler blir kjent | Middels | Høy | Skjermede samlinger for personskade og varsling. Anonym melding. Melderens navn vises bare for saksbehandlere og melderen. | **Middels** | Melderens navn kan fortsatt leses via API-et av den som har ISO Lese (DRIFT-20). Flytt melderens navn til et eget dokument bare saksbehandlere leser. Fastsett lagringstid. |
| D7 | Posisjon og hjemmeadresse avslører bevegelser | Lav | Middels | Bare ett punkt når brukeren trykker «Her». Ingen sporing i bakgrunnen i bedriftsdelen. | **Lav–middels** | Koordinater sendes til BigDataCloud (Australia) for adresse. Bruk bare Kartverket/Nominatim, eller nevn leverandøren i personvernerklæringen. |
| D8 | Timelister brukes til noe annet enn lønn, fakturering og arbeidstid | Lav | Middels | Tilgang til andres timer krever eget område i matrisen. Endringshistorikk og slettelogg. | **Lav** | – |
| D9 | Opplysninger lagres lenger enn nødvendig | Høy | Middels | Se lagringstid over. | **Høy** | Lagringstid for fravær, timer, kjørebok, ISO, chat, kunder, innsynslogg, varsler og support. Funksjon for å slette en bedrift etter opphør. Planlagte slettejobber i drift (DS-16). |
| D10 | Tilgang som er trukket tilbake, virker en stund | Middels | Middels | Speilet utløper etter 12 timer. Fjernet medlemskap slår inn straks. | **Lav–middels** | Rull ut triggerne for tilgangsspeilet (DS-16). |
| D11 | En konto med HR- eller administratortilgang blir overtatt | Middels | Høy | Innlogging hos Google/Microsoft/Apple eller passord. Grenser for antall kall. | **Middels–høy** | Krev tofaktor for eier, administrator og HR. |
| D12 | Filer (CV, HR-dokumenter, kvitteringer) deles videre med lenker som ikke utløper | Lav | Høy | Opplasting og nedlasting via serverfunksjoner med tilgangskontroll. | **Middels** | Erstatt varige nedlastingslenker med signerte lenker med kort levetid (L-18). |
| D13 | Brukerspørsmål til hjelpeassistenten lagres med uid uten lagringstid | Middels | Lav | Gjort (GRUNN-01): uten uid, e-post, telefon og fødselsnummer maskert, slettes etter ett år, eldre rader anonymiseres ved neste bruk | **Lav** | Navn i fritekst fanges ikke opp. Vurder om radene trengs i det hele tatt (ingen leser dem i dag). |

## 5. Konklusjon (foreløpig)

Tjenesten har fått viktige tiltak (skjerming i databasereglene, eksport og sletting, lagringstid for
deler av dataene, valg for bedriften). Det som gjenstår for at restrisikoen skal bli akseptabel:

1. Lagringstid og sletting for alle kategorier, og sletting av bedrifter etter opphør (D9).
2. AI i EU eller bekreftet betalt nivå uten trening (D5).
3. Tofaktor for kontoer med HR- og administratortilgang (D11).
4. HR delt i egne samlinger, så lønn ikke følger med annen HR-tilgang (D1).
5. Grovere brukslogg og bekreftelse fra bedriften om drøfting med tillitsvalgte (D4).

Med disse punktene på plass vurderes restrisikoen som middels eller lavere, og forhåndsdrøfting med
Datatilsynet er trolig ikke nødvendig. **[bekreft]** av jurist.

## 6. Hva bedriften (kunden) selv må vurdere

- Hvem som får tilgang til HR, fravær, ansatte og ISO i tilgangsmatrisen.
- Om brukslogg og AI skal være på, og at de ansatte er informert.
- At kontrolltiltak (brukslogg, produktivitet) er drøftet med tillitsvalgte (aml. kap. 9).
- Lagringstid for HR, og rutiner for sletting når en ansatt slutter.
- At diagnoser ikke skrives i fritekst.

## 7. Åpne spørsmål til eieren

1. Skal ProTop lage en mal for kundenes egen DPIA basert på dette dokumentet?
2. Gemini Developer API eller Vertex AI i EU, og hvilket nivå (D5)?
3. Hvor grov skal bruksloggen være, og skal den ansatte se sin egen logg (D4)?
4. Lagringstider for kategoriene i D9, og hvem som eier slettingen.
5. Tidsplan for tofaktor (D11), deling av HR (D1) og signerte lenker (D12).
6. Er familie- og barnefunksjonene i drift? Da trengs en egen DPIA (barn, posisjonsdeling).
7. Hvem i ProTop eier DPIA-en og oppdaterer den ved nye funksjoner?
