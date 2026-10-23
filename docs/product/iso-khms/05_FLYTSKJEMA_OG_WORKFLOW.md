# 05 – Flytskjema, prosessbygger og automatiske arbeidsflyter

**Hvert diagram er en produktmal, ikke en obligatorisk ISO-prosedyre.** Kundens prosesseier må kunne redigere, teste, godkjenne og publisere maler. Mermaid her dokumenterer ønsket prosesslogikk; produksjonseditor bruker en egen sikker grafmodell.

## P01 – Ledelsessystemets helhetlige PDCA-syklus
```mermaid
flowchart LR
  C[Kontekst, interessenter og krav] --> P[Policy, ansvar, mål og risiko]
  P --> D[Prosesser, kompetanse og operativ kontroll]
  D --> E[Overvåking, KPI, lovetterlevelse]
  E --> A[Internrevisjon og ledelsens gjennomgang]
  A --> F[Avvik, korrigerende tiltak og forbedring]
  F --> C
```

## P02 – Avviksbehandling (kjørbar)
```mermaid
flowchart TD
  A([Avvik registreres]) --> B[Triagering og klassifisering]
  B --> C{Akutt fare/konsekvens?}
  C -- Ja --> D[Strakstiltak og eventuell pliktig varsling]
  C -- Nei --> E[Vurder korreksjon og videre tiltak]
  D --> E
  E --> F{Korrigerende tiltak nødvendig?}
  F -- Ja --> G[Årsaks- og gjentakelsesvurdering]
  G --> H[Tiltak med ansvar, frist og bevis]
  H --> I[Kontrollér gjennomføring]
  I --> J{Effekten tilfredsstillende?}
  J -- Nei --> G
  J -- Ja --> K[Godkjenn lukking]
  F -- Nei, begrunnet --> L[Dokumentér begrunnelse og korreksjon]
  L --> K
  K --> M([Arkiver, oppdater krav/evidens, analyser])
```

**Bind:** A→SF16, B→rolle kvalitet/HMS, D→oppgave/beredskap, G→SF17, H→SF18, J→SF18-effekt, K→låst auditrecord og kravbevis. Behandle sensitiv HMS-informasjon med særtilgang. Ikke påstå at systemet melder automatisk til offentlige myndigheter uten konkret integrasjon.

## P03 – Prosessdesign og publisering
```mermaid
flowchart TD
  A[Prosesseier lager utkast] --> B[Tegn flyt og knytt skjema/krav]
  B --> C[Valider node- og linjegraf]
  C --> D{Validering OK?}
  D -- Nei --> B
  D -- Ja --> E[Send til godkjenner]
  E --> F{Godkjent?}
  F -- Nei --> B
  F -- Ja --> G[Publiser versjon]
  G --> H[Distribuer og vurder opplæringsbehov]
  H --> I[Ansatte starter prosessinstanser]
  I --> J[Mål ytelse, samle bevis]
  J --> K{Endringsbehov?}
  K -- Ja --> A
```

## P04 – Kundekrav → tilbud → kontrakt → prosjekt
```mermaid
flowchart LR
  A[Kundeforespørsel] --> B[Avklar krav og forutsetninger]
  B --> C{Kompetanse, kapasitet, lovkrav OK?}
  C -- Nei --> D[Avklar / avstå / revider tilbud]
  D --> B
  C -- Ja --> E[Tilbud og godkjenning]
  E --> F[Kontrakt og kontroll]
  F --> G[Opprett prosjekt og kvalitetsplan]
  G --> H[Leveranser og kontrollpunkter]
  H --> I[Frigivelse og erfaringer]
```

## P05 – Prosjektering og fagkontroll
```mermaid
flowchart TD
  A[Godkjente kravinput] --> B[Planlegg prosjektering]
  B --> C[Utarbeid leveranse/revisjon]
  C --> D[Fag- og samordningskontroll]
  D --> E{Kontroll godkjent?}
  E -- Nei --> F[Registrer merknader, korriger]
  F --> C
  E -- Ja --> G{Behov for validering?}
  G -- Ja --> H[Valider egnethet for tiltenkt bruk]
  H --> I[Godkjenn/frigi revisjon]
  G -- Nei, vurdert --> I
  I --> J([Distribuer sporbar gjeldende revisjon])
```

## P06 – Risikovurdering og tiltak
```mermaid
flowchart TD
  A[Kontekst, endring, hendelse eller periodisk vurdering] --> B[Identifiser risiko/fare]
  B --> C[Velg godkjent metode og kriterier]
  C --> D[Vurder sannsynlighet/konsekvens og barrierer]
  D --> E{Innen akseptkriterier?}
  E -- Nei --> F[Prioriter tiltak og ansvar]
  F --> G[Gjennomfør tiltak og revurder rest-risiko]
  G --> E
  E -- Ja --> H[Godkjenn, planlegg ny vurdering]
  H --> I([Oppdater risikoregister og relevante krav])
```

## P07 – Miljøaspekt og samsvarsforpliktelser
```mermaid
flowchart TD
  A[Definer aktivitet/livsløpstrinn] --> B[Identifiser miljøaspekt og påvirkning]
  B --> C[Fastslå kontroll/innflytelse og situasjon]
  C --> D[Vurder betydning med godkjente kriterier]
  D --> E{Vesentlig aspekt?}
  E -- Ja --> F[Definer operativ kontroll, mål/tiltak]
  E -- Nei --> G[Dokumenter vurdering]
  F --> H[Vurder etterlevelse av relevante forpliktelser]
  G --> H
  H --> I{Avvik/mangel?}
  I -- Ja --> J[Opprett avvik og tiltak]
  I -- Nei --> K[Planlegg måling/revurdering]
  J --> K
```

## P08 – Kompetanse og autorisasjon
```mermaid
flowchart TD
  A[Definer rollekvalifikasjon] --> B[Koble personer og krav]
  B --> C{Dokumentert kompetanse gyldig?}
  C -- Nei --> D[Opplæring eller kvalifisering]
  D --> E[Vurder effekt og registrer bevis]
  E --> C
  C -- Ja --> F[Tildel rolle/arbeidsoppgave]
  F --> G[Overvåk endring, utløp, nye krav]
  G --> B
```

## P09 – Styrt dokumentrevisjon
```mermaid
flowchart TD
  A[Endringsbehov] --> B[Ny revisjon av dokument]
  B --> C[Fagkontroll]
  C --> D{Godkjent?}
  D -- Nei --> B
  D -- Ja --> E[Publiser, lås tidligere revisjon]
  E --> F[Varsle berørte / bekreft lesing ved behov]
  F --> G[Oppdater lenker for nye prosesser]
  G --> H([Bevar historiske referanser])
```

## P10 – Internrevisjon → tiltak
```mermaid
flowchart TD
  A[Fastsett revisjonsprogram] --> B[Planlegg revisor, omfang og kriterier]
  B --> C[Undersøk dokumenter, intervjuer og stikkprøver]
  C --> D[Dokumenter funn og bevis]
  D --> E{Avvik?}
  E -- Ja --> F[Opprett avvik og korrigerende tiltak]
  E -- Nei --> G[Sluttfør revisjonsrapport]
  F --> G
  G --> H[Kommuniser konklusjon]
  H --> I[Verifiser oppfølging]
  I --> J[Oppdater neste revisjonsprogram]
```

## P11 – Ledelsens gjennomgang
```mermaid
flowchart TD
  A[Hent siste mål, KPI, revisjoner, klager, HMS/miljø, kravstatus] --> B[Fordel saksgrunnlag]
  B --> C[Ledelsens møte og diskusjon]
  C --> D[Beslutninger om ressurser, forbedringer og endringer]
  D --> E[Godkjenn referat]
  E --> F[Opprett tiltak med eier og frist]
  F --> G[Kontroller gjennomføring ved neste gjennomgang]
```

## P12 – Beredskap/øvelse
```mermaid
flowchart TD
  A[Scenario og beredskapsplan] --> B[Informasjon, ansvar og nødvendig kompetanse]
  B --> C[Planlegg og gjennomfør øvelse / reell hendelse]
  C --> D[Evaluer effektivitet]
  D --> E{Behov for forbedring?}
  E -- Ja --> F[Avvik/tiltak og ny planrevisjon]
  E -- Nei --> G[Arkiver godkjent rapport]
  F --> G
```

## P13 – Leverandørstyring
```mermaid
flowchart TD
  A[Definer krav og kritikalitet] --> B[Forhåndsevaluer leverandør]
  B --> C{Godkjennes?}
  C -- Nei --> D[Avvis / avklar / korriger]
  C -- Ja --> E[Krav i bestilling/avtale]
  E --> F[Følg opp leveranse og avvik]
  F --> G[Reevaluer og lagre beslutning]
  D --> B
```

## P14 – Prosesslandskap (navigasjon, ikke automatikk)
```mermaid
flowchart TB
  subgraph Ledelse
  L1[Kontekst og strategi] --- L2[Policy og mål] --- L3[Ledelsens gjennomgang]
  end
  subgraph Kjerneprosesser
  K1[Kunde/anbud] --> K2[Kontrakt] --> K3[Prosjektoppstart] --> K4[Utførelse/prosjektering] --> K5[Kontroll/leveranse] --> K6[Evaluering]
  end
  subgraph Støtteprosesser
  S1[Kompetanse og HR] --- S2[Dokumentstyring] --- S3[Risiko og HMS] --- S4[Miljø] --- S5[Leverandører] --- S6[IT og tilgang]
  end
  Ledelse --> Kjerneprosesser
  Støtteprosesser --> Kjerneprosesser
```

## P15 – Aktiv prosess med swimlanes
```mermaid
flowchart LR
  subgraph Medarbeider
  A[Registrer avvik]
  end
  subgraph Kvalitetsleder
  B[Triagering] --> C{Tiltak påkrevd?}
  end
  subgraph Tiltaksansvarlig
  D[Tiltak og bevis]
  end
  subgraph Godkjenner
  E[Effektkontroll og lukking]
  end
  A --> B
  C -- Ja --> D --> E
  C -- Nei, begrunnet --> E
```

## Struktur for nodekonfigurasjon

```json
{
  "id": "node-review",
  "type": "humanTask",
  "label": "Vurder avvik",
  "visual": {"x": 420, "y": 160, "icon": "clipboard-check", "colorRole": "neutral"},
  "assignment": {"roleKey": "quality_manager", "fallbackRole": "system_owner"},
  "onClick": {"type": "openForm", "formKey": "SF16_AVVIK", "mode": "review"},
  "onEnter": {"type": "createTask", "dueInBusinessDays": 3},
  "onComplete": {"event": "iso.finding.triaged", "requiredFields": ["category", "priority", "assignee"]},
  "requirementLinks": [{"standard": "ISO9001", "edition": "2026", "clauseHint": "10.2"}],
  "version": "3.0"
}
```

## Kjørbar workflow – sentrale skiller

- **Node**: en UI- og prosessdefinisjon med typer og semantikk; klikkhendelse utfører bare eksplisitt tillatte handlinger.
- **Edge**: styrt overgang med betingelse `fieldEq`, `all`, `any`, `noError`, `approved`, ikke vilkårlig brukerkode.
- **ProcessDefinition**: versjonert designgraf, prosesseier, kontekst, relevant omfang, godkjenning, publishedAt.
- **ProcessInstance**: låst referanse til publisert `definitionId/version`, aktiv node, roller, oppgaver, tidshendelser, evidens, hendelseslogg.
- **UserTask**: en ordinær ProTop-oppgave med prosesskontekst, frist, autorisert behandlingsrolle og completionEvent.
- **FormSubmission**: lagrer `formId/version`, prosessversjon og gjeldende kravkoblinger.

### Publiseringsvalidator

1. Én eller flere dokumentert tillatte startnoder, alle tiltenkte sluttløp må nå gyldig slutt.
2. Ingen utilgjengelige noder, usikre automatiseringssløyfer eller beslutninger uten fullstendige grenregler/default.
3. Alle menneskelige oppgaver har rolle/assignee og definert tilstand ved fravær/ikke-tilgjengelig bruker.
4. Alle skjema- og dokumentreferanser peker til tilgjengelig godkjent versjon, eller er bevisst versjonslåst for historisk lesing.
5. Integrasjonshendelser må være idempotente, autoriserte og retry-/feiltolerante.
6. Ikke publiser dersom tilknyttede form-/kravreferanser er utgått eller ikke egnet for angitt omfang.
7. Oppdatert prosess påvirker ikke pågående instanser uten eksplisitt testet migrasjon og sporbar beslutning.

### Design- og bruksmodus

- **Designmodus:** nodeklikk åpner inspector, dra endrer koordinater og «Koble»-handling oppretter definert kant. Ingen produksjonsoppgaver opprettes.
- **Bruksmodus:** nodeklikk åpner sak/skjema/dokument; gjeldende oppgave er tydelig, mens fremtidige steg er låst eller lesbare basert på rolle.
- **Prosessoversikt:** navngitte utvalg av prosessdefinisjoner med eier, versjon, endret dato, kravdekning og antall aktive instanser.
- **Mobil:** fokusvisning («nå», «neste» og «tidligere»), pan/zoom som sekundær fullskjerm-funksjon.
