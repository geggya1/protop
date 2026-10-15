# HR research-matrise — verdensbasis → ProTop

Kartlagt oktober 2026. Kilder: BambooHR, Personio, Factorial, HiBob, Rippling, Workday, Greenhouse, Lever, Workable, Huma (NO), Arbeidstilsynet/AML, ISO 9001/14001/45001, Agrello/CLM, scorecard-praksis.

## Matrise: funn → krav → ProTop-implementering

| # | Kilde / praksis | Hva som fungerer bra | Lov/ISO-kobling | ProTop skal ha |
|---|-----------------|----------------------|-----------------|----------------|
| 1 | BambooHR, Personio, Huma | Go-to HR-dashboard: bursdag, jubileum, kontraktutløp, åpne saker | AML § 4-2 oppfølging | Dashboard med **nedtelling** til jubileum/bursdag, utløpende avtaler, compliance-gap, rekrutteringskø |
| 2 | Arbeidstilsynet / AML § 14-5/14-6 | Skriftlig arbeidsavtale med minimumsfelter | **Lovpålagt** | Avtalefelter: partene, arbeidssted, tittel/rolle, start, midlertidig grunnlag, prøvetid, ferie, oppsigelse, lønn, arbeidstid, pauser, tariff, stillings-% |
| 3 | Agrello, Ironclad, Factorial docs | Kontrakt fra mal + AI/OCR → strukturerte felt | AML 14-6 + dokumentasjon | Last opp PDF → OCR/AI → nøkkeldata på person + avtale; skjemabygger-mal «Arbeidsavtale» |
| 4 | Greenhouse, Lever, Workable | Kanban-pipeline, dokumenter på søknad, scorecard, Hired/Rejected | GDPR lagring av søknader | **3 kolonner** (mottatt / til behandling / ferdig) med drag-drop; utfall **vunnet/avslått**; CV/dokumenter følger |
| 5 | BambooHR ATS, Personio Recruiting | Jobbannonse → søknad → hire → employee | — | Annonser + søknader; Ansett oppretter i Ansatte |
| 6 | HiBob, Lattice, Personio | Medarbeidersamtale på mal, historikk, mål | AML § 4-2/4-3 (systematisk oppfølging) | Skjemabygger-mal «Medarbeidersamtale»; lagring; PDF; **sammenlign** med forrige; avvik → sak |
| 7 | Factorial, Huma, BambooHR | Oppgaver/gjøremål tildelt ansatt | — | Oppgaver med frist, synlig på Min side |
| 8 | Huma, Personio Documents | Personalmappe: memo + filer per person | GDPR formålsbegrensning | Memo med filvedlegg på ansatt; HR-only vs synlig |
| 9 | Personio Compensation, BambooHR Total Rewards | Lønnshistorikk, plan neste år, % endring, begrunnelse | AML 14-6 (i); innsyn | Faktisk + planlagt; graf + **prosent**; memo på hver bevegelse |
| 10 | Rippling / HiBob analytics | Utilization / kapasitet | — | Billable vs non-billable (allerede) |
| 11 | NHO / Internkontrollforskrivten | Dokumentert HMS: mål, ansvar, risiko, avvik, gjennomgang | **Lovpålagt HMS** | Compliance-sjekkliste per ansatt (opplæring, verneombud-info, avvikskjennskap) |
| 12 | ISO 9001 | Kompetanse, opplæring, bevissthet (kap. 7.2–7.3) | ISO 9001 | Checklist: rollekompetanse, opplæringsbevis, dokumentert kvalifikasjon |
| 13 | ISO 14001 | Miljøkompetanse / ansvar | ISO 14001 | Checklist: miljørolle, opplæring |
| 14 | ISO 45001 | Arbeidsmiljø, risikoforståelse, verneutstyr, verneombud | ISO 45001 + AML | Checklist: HMS-opplæring, verneutstyr, risikovurdering kjent |
| 15 | GDPR / Huma | Tilgangskontroll, innsyn, slettefrister | GDPR | HR-modul rollebeskyttet; employeeVisible; logger oppdateringstid |
| 16 | Greenhouse scorecards | Strukturert vurdering før beslutning | — | Evaluering/score på søknad; beslutning vunnet/avslått |
| 17 | BambooHR onboarding | Kontrakt → oppgaver ved ansettelse | — | Ved ansett: oppgave-sjekkliste (kontrakt, utstyr, intro) |
| 18 | Personio workflows | Påminnelse før jubileum/kontraktslutt | — | Dashboard-nedtelling + åpne saker automatisk forslag |

## Eksplisitt utenfor scope nå
- Full lønnskjøring / skatt / A-melding (Gusto-nivå)
- E-signatur eIDAS (kan kobles senere)
- Benefits-enrollment

## Prioritet for rebuild
1. Research-matrise (dette dokumentet)  
2. Datamodell: avtalefelter AML, kanban-kolonner, filer, compliance, lønns-%  
3. Dashboard med nedtelling  
4. ATS 3-kolonne drag + dokumenter + vunnet/avslått  
5. Avtaler + OCR/AI + skjemamal  
6. Samtaler + skjemamal + PDF + sammenligning  
7. Memo/filer, lønnsgraf %, compliance ISO/AML  
