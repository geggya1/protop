# 07 – Implementeringsplan, Definition of Done og testpakke

## Sekvensering

**F0 Repo og GAP:** Les eksisterende ProTop-struktur og funn, behold design, auth, tenant, kunder, personer, prosjekter, dokumenter, oppgaver, godkjenninger, kalender; kartlegg gjenbruk/gap og valider ISO-versjoner/kilder.

**F1 ISO-fundament:** Sertifiseringsomfang, kravmotor og lovkravregister, dokumentrevisjoner, bevislinker, revisjonsspor, rettighetsmodell.

**F2 Designmotor:** Prosessbibliotek, diagrameditor, publiseringsvalidator, kjørbar instansmotor, skjemabygger, versjonsstyring, mobiloppgaver.

**F3 Operative moduler:** Avvik, tiltak, risikoregister, miljøaspekter, HMS/medvirkning, kompetanse, prosjekterings-/leveransekontroll, leverandører, beredskap.

**F4 Ledelses- og revisjonskontroll:** Dashbord, grafer, samsvarsvurderinger, internrevisjon, ledelsens gjennomgang, dokumentpakke/revisorsamarbeid.

**F5 Pilot og kvalitet:** Ekte testscenario i rådgivervirksomhet, ISO-faglig validering mot lisensierte utgaver, penetrasjonstest, personvern og tilgjengelighet, revisjonsgjennomgang.

## Testcaser – funksjonelt

| Test | Gitt / Når | Forventet |
|---|---|---|
| T01 Opprette scope | Admin velger selskap/enhet/tjenester/tre standarder | Kravtilknytninger opprettes uten duplikat |
| T02 Scope-endring | Lokasjon eller tjenester endres | Berørte relevansvurderinger flagges for ny vurdering |
| T03 Dokumentrevisjon | Publisert dokument endres | Ny revisjon, forrige bevares uendret og historiske lenker fortsatt riktige |
| T04 Prosessdesign | Prosesseier lager graf og kobler skjema | Lagret draft og inspeksjon med funksjonelle nodeegenskaper |
| T05 Grafvalidator | Beslutning mangler nei-gren | Publisering blokkert med konkret feil |
| T06 Publisering | Godkjenner publiserer V2 | V2 aktiv for nye instanser, V1 bevares for gamle |
| T07 Prosessklikk | Ansatt klikker skjema-node | Riktig versjonert skjema åpner med eksisterende kontekst |
| T08 Workflow-run | Oppgave fullføres | Neste node aktiveres én gang, varsel én gang |
| T09 Avvik start | Ansatt registrerer avvik | Saks-ID, tildeling, hendelseslogg, kravkobling, korrekt tilgang |
| T10 Avvik effekt | Det kreves effektvurdering, men felt mangler | Lukking avvises server-side |
| T11 Avvik gjenåpning | Effekt «ikke verifisert» | Ny vurdering/tiltak, full historikk beholdes |
| T12 Risiko | Bruker vurderer iboende og rest etter ulik tid | Begge målinger tydelig, skalaVersjon lagres |
| T13 Miljøaspekt | Aspekt blir vesentlig etter gyldige kriterier | Tiltak/kontroll opprettes, begrunnelse og versjon beholdes |
| T14 Lovkrav | Siste samsvarsvurdering utløpt | Status `Må revurderes` – aldri auto «oppfylt» |
| T15 Kompetanse | Kurs utløpt for rolle med krav | Gap og varsel vises, ingen feilaktig «gyldig» |
| T16 Revisjon | Avvik funnet i internrevisjon | Koblet avvik og tiltak, etterprøvbart bevis |
| T17 Ledelsens gjennomgang | Rapport undertegnes | Inndata snapshot og beslutninger med oppgaver låses |
| T18 Kravbevis | Ett dokument er relevant for to klausuler | Samme evidensobjekt, to separate vurderinger |
| T19 Grafdrilldown | Klikk dashboardsegment «Åpne» | Register har nøyaktig samme autoriserte filter og antall |
| T20 Grafperiode | Endre kvartal til måned | Tall/labels og eksport oppdateres uten stale cache |
| T21 Eksport | Revisor eksporterer godkjent bevispakke | Avgrensede dokumenter, revisjoner, logg, sladding |
| T22 Sikkerhetsgrenser | Ansatt i A spør etter B-tenant sak/API | Avslag uten metadatalekkasje |
| T23 Skjermet HMS | Vanlig ansatt søker/filtrerer/eksporterer | Kan ikke lese identifiserbart sensitivt innhold |
| T24 Auth | Admin uten fagfullmakt forsøker lukke HMS-sak | Avslag og kontrollert auditEvent |
| T25 Mobil | iPhone 375 px, safe-area/bunnnav | Alle skjemaer og handlinger tilgjengelige uten overlapp |
| T26 Offline | Medarbeider mister nett under utkast | Tydelig status, sikker gjenoppretting/konflikthåndtering dersom offline støttes |
| T27 Integrasjon | Retry på oppgavehendelse | Ingen duplikat oppgave/e-post |
| T28 Tilgjengelighet | Kun tastatur og skjermleser | Grafalternativ, fokusorden, feilmelding, nodevalg mulig |
| T29 GDPR | Retensjon utløpt | Dataminimert, lovlig sletting/sperring og relevant loggdokumentasjon |
| T30 Fiktive data | Produksjonstenant opprettes | Null eksempeldata, korrekte tomtilstander |

## Test på hver UI-side

- Lasting/skeleton, nettverksfeil/retry, tomt datagrunnlag, 0 treff, ingen tilgang, nyttig opprettelseshandling.
- Søk, filtrering, sortering og paginering (server-autoriserte), url-state og eksport.
- Primærknapp utfører riktig funksjon og håndterer dobbeltklikk/konkurrerende endringer.
- Hvert diagram og hver graf har tilgjengelig datatabell og drilldown.
- Skjema har komplett validering og replay i nøyaktig definisjonsversjon.
- Visualisert status svarer til faktisk backend-state.

## Definition of Done

1. UI bruker eksisterende ProTop-komponenter og design tokens.
2. Ingen produksjonsskjerm har hardkodet fiktiv KPI/sak/kravfremdrift.
3. Backend-filtre og tilgangsregler er testet både positivt og negativt.
4. Datastrukturen er migrert og tilbakeføringsplan er beskrevet.
5. Alle publiserte dokumenter/prosesser/skjemaer har versjon og historikk.
6. Hver primær handling har demonstrert E2E-utførelse, ikke kun UI-interaksjon.
7. ISO-normative tolkninger er markert `faglig validert` først etter kontroll mot lisensiert utgave.
8. Demo- og produksjonsmodi kan ikke forveksles.
9. Feiltilstander, sikkerhet, personvern og WCAG er testet.
10. PR har skjermbilder desktop/mobil, databaseendringer, API-kontrakter, automasjonstester og dokumentert brukerflyt.
