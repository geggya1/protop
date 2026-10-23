# ProTop ISO / K-HMS – VISUELL UTVIKLINGSPAKKE V2

**Dato:** 22.10.2026 · **Bruk:** Legg HELE mappen i ProTop-repositoriet under f.eks. `docs/product/iso-khms/`, og la Cursor lese denne filen først.

## 1. Hva finnes i pakken?

| Fil | Innhold | For Cursor |
|---|---|---|
| `01_KRAV_FUNKSJONELL_TEKNISK.md` | Full kravspesifikasjon for ISO 9001, ISO 14001, ISO 45001 og norsk regelverk | Produkt- og domenekontrakt |
| `02_SKJERMBILDER_OG_DESIGNSYSTEM.md` | Sidespesifikasjoner, klikkhandlinger, layout, responsiv adferd og design-system | UI-implementasjon |
| `03_GRAFER_KPI_OG_VISUALISERING.md` | Visualiseringskatalog med datakilder, formler, farger, filtre, drill-down og tomtilstander | Diagramkomponenter |
| `04_SKJEMAER_OG_FELTMODELL.md` | Komplett feltkatalog, skjemamaler, betinget logikk, validering, lagring, godkjenning | Skjemabygger og domene-UI |
| `05_FLYTSKJEMA_OG_WORKFLOW.md` | Prosessdiagrammer i Mermaid, noder, prosesseierskap, regelmotor, hendelser og livsløp | Visuell prosessbygger og workflow |
| `06_DATAMODELL_OG_KONTRAKTER.md` | Domenemodell, felt, tilstandsmaskiner, API-/hendelseskontrakter, tilgang | Backend og dataintegritet |
| `07_IMPLEMENTERING_TEST_OG_AKSEPTANSE.md` | Implementeringsfaser og konkrete E2E-kriterier for alle viktige arbeidsflyter | PR og testing |
| `08_KRAVTIL_UI_SPORBARHET.md` | Hvilke sider/skjemaer/diagrammer dokumenterer hvilke krav | ISO-evidens og QA |
| `ProTop_ISO_INTERAKTIV_PROTOTYPE.html` | **Åpnes lokalt i nettleser** – responsiv, interaktiv prototype med 21 navigerbare sider, katalog med 20 illustrerte grafer og 30 navngitte skjemamaler, pluss prosessbygger | UX-referanse (ikke produksjonskode; utvalgte grafer og skjemaer er operative som demo) |
| `eksempeldata.json` | Realistiske, **fiktive** testdata (skal ikke legges i produksjon) | Fixtures/demomodus |

## 2. Cursor – bindende startinstruks

> Gjennomgå først eksisterende ProTop-kode, design tokens og domeneentiteter for selskap, avdelinger, ansatte, HR, prosjekt, kunder, tilbud, avtaler, dokumenter, oppgaver og godkjenninger. Les alle `.md`-filer i denne mappen. Åpne `ProTop_ISO_INTERAKTIV_PROTOTYPE.html` for å forstå komponenter, flyt og layout. Prototypen er kun en UI-/UX-referanse og skal ikke kopieres som ferdig backend.
>
> Lag først en GAP-analyse som viser gjenbruk, endringer, nye tabeller/API-er, datamigreringer, rolle-/objekttilganger og testplan. Implementer ett samlet K-HMS-ledelsessystem med konfigurerbare ISO-standardversjoner og ett felles bevisregister, ikke tre separate systemer. Opprett fungerende sider, skjemaer, tabeller, prosessbygger, grafkomponenter og arbeidsflytlogikk slik spesifikasjonen beskriver. Alle primære knapper skal ha faktiske handlinger, tilgangskontroll, feilhåndtering og audit trail. Mobil gir lesing/utførelse, desktop full designmodus.
>
> Begynn med vertikal end-to-end flyt: registrer avvik → vurder → årsaksanalyse → tiltak → effektkontroll → lukking → evidens i kravmatrise og revisjon. Lever deretter prosessdesigner → valider/godkjenn/publiser → opprett instans → utfør aktiv oppgave → eksporthistorikk. Lag deretter miljøaspekt, arbeidsmiljørisiko, kompetanse, dokumentkontroll, internrevisjon og ledelsens gjennomgang. Implementer trinnvis, med migrasjoner og automatiserte tester.
>
> `eksempeldata.json` og prototypens tall er FIKTIVE og skal kun brukes i fixture/storybook/demo. Må aldri vises som om de var virkelige kundedata. Ingen prosenttall skal kalles «ISO-sertifiseringsscore»; lag bare internt evaluerte statusindikatorer med transparent metode. Ingen automatisk attestering av ISO- eller lovetterlevelse. Ikke kopier ISO-standardenes opphavsrettslig beskyttede normative ordlyd fra nettet. Normativ mapping må kvalitetssikres mot lisensierte standarder.

## 3. Leveransens modenhet

- **Spesifikasjonsnivå:** 20 skjermvisninger, 20 visualiseringstyper, 30 skjemamaler og 15 prosessdiagrammer er dokumentert i Markdown-filene.
- **Visuell prototype:** 21 navigerbare skjermvisninger (inkludert samlet graf-/skjemakatalog), klikkbare KPI-/grafeksempler, risikomatrise, utvalgte skjemadialoger og demonstrasjon av nodebasert prosessdesigner. Alle grafene er illustrert i katalogen, men ikke alle 20 grafer eller alle 30 skjemamaler har separat fullstendig interaktiv demo; detaljene er angitt i katalogfilene.
- **Teknisk nivå:** Selvstendig HTML uten ekstern avhengighet. Skjema-utkast lever kun i lokal nettleserøkt. Ingen backend, autentisering, reell godkjenning, datalagring eller faktisk ISO-verifisering.
- **Bilder:** `ProTop_ISO_FORHÅNDSVISNING_*.png` viser visuelle eksempler fra den testede prototypen.

## 4. Kvalitetskrav til resultatet

- **Brukbarhet:** Ekte jobb å få gjort, maksimal gjenbruk av data, korte flyter, få obligatoriske felt med begrunnet relevans.
- **Visuelt:** Samme designprofil som resten av ProTop, ryddig informasjonsarkitektur, klart hierarki, ikon+tekst, funksjonelle grafer, ingen dekorative målere uten formål.
- **Kontroll:** Hver status og verdi kan åpnes og spores til objekt/data/utvalg og filtre. Styrte prosedyrer kan ikke stilletiende overskrives.
- **Sikkerhet:** Isolasjon mellom juridiske enheter, behovsstyrt tilgang, skjerma person/HMS, revisorens read-only-rom.
- **Prosess:** Hver flytboks er klikkbar for rettighetsgodkjent handling, dokument eller skjema; tegnings- og kjøringsmodeller er separate.
- **Mobile:** Alle arbeidslister, prosesshandlinger og skjemaer er brukbare på 375 px; alle bunnmenyer og trygge områder håndteres.
- **Kravoppfølging:** Hver ISO-klausul, lovplikt eller kundekrav kobles til ansvar, implementering, bevis, vurdering og funn.

## 5. Avgrensning

ProTop skal legge til rette for et ledelsessystem som kan sertifiseres. Et program kan **ikke utstede ISO-sertifikat** eller garantere at brukervirksomheten blir godkjent av sertifiseringsorganet. ISO-utgaver i dette dokumentet er 9001:2026, 14001:2026, 45001:2018 med Amendment 1:2024; eksakt normativ klausuloversikt krever lisensiert standardtekst og kvalitetssikring fra ISO-fagperson. Der krav varierer mellom selskap, prosjekt og risiko, skal appen støtte relevansvurdering, ikke hardkode «alltid påkrevd».
