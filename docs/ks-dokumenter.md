# KS-dokumentene i ProTop

Oversikt over hvor hvert dokument fra KS-systemet (C1-A … C1-H) ligger i ProTop. Word og Excel brukes ikke lenger: malene fylles ut og blir PDF i ProTop, og det som har en egen modul, registreres der.

Kilden er `src/forms/ksLibrary.js`. Listen under er laget fra den.

## Generelt

| KS-nr. | Dokument | I ProTop |
|---|---|---|
| C1-E-05-001 | Brev | Skjemabygger › KS-maler |
| C1-E-05-002 | Møtereferat | Skjemabygger › KS-maler |
| C1-E-03-001 | Sjekkliste | Skjemabygger › KS-maler |
| C1-H-03-001 | Oppdragsavtale NS 8403 | Avtaler |

## HMS

| KS-nr. | Dokument | I ProTop |
|---|---|---|
| C1-B-03-001 | Sjekkliste for årlig gjennomgang av HMS-systemet | Skjemabygger › KS-maler |
| C1-B-03-002 | Sjekkliste elektriske installasjoner | Skjemabygger › KS-maler |
| C1-B-03-003 | Sjekkliste for gjennomføring av SJA (Sikker Jobb Analyse) | Skjemabygger › KS-maler |
| C1-B-03-004 | Sjekkliste vernerunde (intern) | Skjemabygger › KS-maler |
| C1-B-03-006 | Handlingsplan | Skjemabygger › KS-maler |
| C1-B-03-007 | Skjema over påbudt verneutstyr | Skjemabygger › KS-maler |
| C1-B-01-005 | HMS-egenerklæring | Skjemabygger › KS-maler |
| C1-B-01-006 | Avtale om at det ikke etableres verneombudsordning | Skjemabygger › KS-maler |
| C1-B-02-004 | Branninstruks | Skjemabygger › KS-maler |
| C1-B-02-003 | Instruks for bruk av arbeidsutstyr | Skjemabygger › KS-maler |
| C1-B-03-005 | Avviksrapport / RUH | ISO / K-HMS › Avvik og forbedring |
| C1-B-02-005 | Kartlegging og risikovurdering HMS og ytre miljø | ISO / K-HMS › Risiko |
| C1-B-02-001 | Verneombud | ISO / K-HMS › HMS |

## Miljø

| KS-nr. | Dokument | I ProTop |
|---|---|---|
| C1-B-03-008 | Sjekkliste – innkjøp | Skjemabygger › KS-maler |
| C1-D01-002 | Avfallsinstruks | Skjemabygger › KS-maler |
| C1-B-01-008 | Tiltak til forbedringsforslag – Miljøfyrtårn | Skjemabygger › KS-maler |
| C1-D-01-003 | Kartlegging av leverandørers miljøstatus | Skjemabygger › KS-maler |
| C1-F-03-004 | Oppgaver og ansvar for miljøfyrtårnansvarlig | Skjemabygger › KS-maler |
| C1-B-02-006 | Reisepolitikk | ISO / K-HMS › Dokumenter |

## Personal

| KS-nr. | Dokument | I ProTop |
|---|---|---|
| C1-C-01-002 | Pårørendeskjema | Ansatte › Min side › Pårørende. Den ansatte fyller inn selv. Mangler det, får hen en oppgave med varsel og påminnelse (src/hr/kinReminder.js), og HR › Oversikt viser hvem som mangler. |
| C1-C-01-003 | Taushetserklæring | Skjemabygger › KS-maler, og HR › Skjemaer |
| C1-F-02-003 | Sjekkliste nyansatt (introduksjonsprogram) | Skjemabygger › KS-maler, og HR › Skjemaer |
| C1-F-02-004 | Oppfølgingsplan nyansatt | Skjemabygger › KS-maler, og HR › Skjemaer |
| C1-F-03-001 | Medarbeidersamtale | Skjemabygger › KS-maler, og HR › Skjemaer |
| C1-C-01-001 | Personalhåndbok | HR › Personalhåndbok |
| C1-KS | Retningslinjer for likestilling, mangfold og inkludering | HR › Personalhåndbok |
| C1-C-01-004 | Egenmelding ved sykdom | Fravær |
| C1-B-01-003 | Bedriftens medarbeidere | Ansatte |
| C1-B-01-004 | Bedriftens pårørende | Ansatte |
| C1-B-01-002 | Organisasjonskart med erfaring | HR › Personell |
| C1-F-02-005 | Kompetansematrise | ISO / K-HMS › Kompetanse |

## Styring og kvalitet

| KS-nr. | Dokument | I ProTop |
|---|---|---|
| C1-B-01-007 | Oversikt over relevante lover og forskrifter | ISO / K-HMS › Lovkrav og samsvar |
| C1-B-01-001 | Internkontrollhåndbok og rutiner for HMS | ISO / K-HMS › Dokumenter |
| C1-E-01-001 | Kvalitetshåndbok | ISO / K-HMS › Dokumenter |
| C1-D-01-001 | Politikk for samfunnsansvar og etiske retningslinjer | ISO / K-HMS › Dokumenter |
| C1-E-04-001 | Rapport fra ledelsens gjennomgang | ISO / K-HMS › Ledelsens gjennomgang |
| C1-A-01-001 | Dokumentliste internt og eksternt | ISO / K-HMS › Dokumenter |

## Felles regler

- Felt som skal fylles ut, er lyse gule, som i avtalemodulen. Felt med * må fylles ut før dokumentet kan merkes ferdig.
- Firmaopplysninger skrives som flettefelt (`{{firma}}`, `{{orgnr}}`, `{{adresse}}`, `{{telefon}}`, `{{epost}}`, `{{web}}`, `{{dato}}`, `{{bruker}}`) og fylles fra bedriftsprofilen. Når et dokument merkes ferdig, låses verdiene i dokumentet.
- PDF har KS-hodet (dokument-ID, eier, versjon, godkjent av, datoer), bedriftens logo og bunntekst med firmaopplysninger og sidetall. Hodet beregnes av dokumentstyringen og skrives aldri inn for hånd.
- Utfylte dokumenter lagres i `families/{id}/formDocs`. Personalskjema (scope `hr`) vises bare i HR.
- Personopplysninger fra de gamle dokumentene (navnelister, adresser, fødselsnummer, kompetansematrise med navn) er ikke lagt inn i koden. De hører hjemme i Ansatte, HR og ISO › Kompetanse.

## Dokumentstyring (revisjon etter ISO 7.5)

KS-malene i Skjemabygger og personalhåndboken i HR styres i `src/doccontrol`:

- Hvert styrt dokument har revisjoner: utkast → til godkjenning → gjeldende → erstattet (avvist går tilbake til utkast). Endres og lagres et dokument etter godkjenning, starter neste revisjon av seg selv.
- Godkjenning skjer faktisk: dokumentets godkjenner, godkjennerne i innstillingene eller administrator. Med «fire øyne» kan ikke den som sendte inn, godkjenne selv. Firestore-reglene hindrer andre i å publisere eller endre godkjente revisjoner.
- Versjon, «Godkjent av» og datoene i hodet settes først ved godkjenning. Revisjonsloggen og dokumentlisten (C1-A-01-001) bygges av revisjonene.
- Lesekrav per dokument: ingen, til informasjon, påkrevd lesing med bekreftelse, eller påkrevd utfylling og signering (for eksempel taushetserklæring). Ansatte leser og bekrefter under Ansatte › Min side.
- Merknader kan knyttes til markert tekst. De er bare synlige for den som skrev dem, dokumentets eier og godkjenner, godkjennere og utpekte lesere i innstillingene, og administrator. De behandles ved gjennomgang (tatt inn / ikke tatt inn).
- Innstillinger: godkjennere, lesere av merknader, om ansatte kan skrive merknader, om ansatte varsles om ny versjon, fire øyne og standard gjennomgangsintervall.
- Lagring: `families/{id}/docControl`, `docControlSettings/main`, `docComments` og `docAcks`.
- ISO-skjemaene (`iso_*`) godkjennes fortsatt i ISO › Skjemaer.
