# ISO-pakke: import av et helt ledelsessystem

Format for å flytte et eksisterende ledelsessystem inn i ProTop ISO, for eksempel fra SharePoint, Word eller Excel. Innholdet legges inn som data. Det blir ikke kodet inn. Importen bruker de samme domenefunksjonene som skjermene. Derfor får alt nummerering, historikk, godkjenningsflyt og revisjonsspor, som om brukeren hadde lagt det inn selv.

- **Kode:** `src/iso/importPackage.js` (`parsePackage`, `planImport`, `buildImport`) og `src/iso/processLayout.js` (autolayout av prosesskart)
- **Tester:** `src/iso/importPackage.test.mjs`
- **Skjerm:** ISO → Innstillinger → «Importer ledelsessystem»

## Slik fungerer importen

1. **Velg fil** (`.json`) eller lim inn innholdet. Pakken kontrolleres (`parsePackage`).
2. **Forhåndsvisning.** Hver post vises som *ny*, *finnes* (importert før) eller *feil* (med grunn). Merknader vises også, for eksempel brutte referanser.
3. **Valg.** Velg hvilke deler som skal med. Velg også om dokumenter og prosesser skal **sendes til godkjenning** (standard) eller **publiseres direkte**. Direkte publisering krever at importøren er godkjenner.
4. **Import.** Alt lagres i fast rekkefølge:
   - oppsett
   - krav
   - dokumenter
   - prosesser
   - registre
   - vurderinger
   - publisering
   - skjema
   - nyheter

   Godkjenneren får én samleoppgave i Oppgaver.

**Idempotens.** Hver entitet får `importKey = "<pakke-id>:<del>:<key>"`. En ny import av samme pakke hopper over det som finnes. Rettinger gjøres i ProTop, ikke ved å importere på nytt.

**Sikkerhet:**
- Ingenting settes til «internt verifisert» ved import.
- Publisering skjer bare når importøren har godkjennerrollen.
- Skjermede saker importeres ikke.

## Toppnivå

```json
{
  "format": "protop.iso.package",
  "formatVersion": 1,
  "id": "consult1-hmsk-2026",
  "title": "Consult1 HMSK fra SharePoint",
  "description": "…",
  "source": { "system": "SharePoint HMSK (sites/Test)", "location": "https://…", "readAt": "2026-10-26" },
  "review": ["Punkter til oppfølging før/etter import …"],
  "system": { … },
  "documents": [ … ],
  "processes": [ … ],
  "records": { "kontekst": [ … ], "risiko": [ … ] },
  "requirements": [ … ],
  "assessments": [ … ],
  "forms": [ … ],
  "news": [ … ]
}
```

**`key`** er påkrevd i alle lister og må være unik innen delen. Bruk kildens kode der den finnes, for eksempel `F-01-009` eller `R01`.

## `system`: oppsett

Bare **tomme** felt fylles. Det som allerede er lagt inn i ProTop, beholdes. Er ledelsessystemet ikke satt opp ennå, fullføres oppsettet med standarder og omfang fra pakken.

| Felt | Innhold |
|---|---|
| `name`, `scopeText`, `units`, `locations`, `activities`, `exclusions` | Omfang (4.3). `exclusions` er begrunnede unntak, for eksempel ISO 9001 8.3 |
| `standards` | `["ISO9001", "ISO14001"]`. Legges til de som er valgt |
| `ownerName` | Systemansvarlig, hvis oppsettet fullføres |
| `docStructure` | Virksomhetens dokumentstruktur: `[{ "code": "A", "title": "HMSK-system", "folders": [{ "code": "A-01", "title": "Politikk" }] }]` |
| `profile` | `{ "vision", "values": [], "businessGoals", "about" }`. Vises på Oversikt (5.1, 7.3) |

## `documents`: styrte dokumenter

| Felt | Innhold |
|---|---|
| `key`, `code` | Dokument-ID, for eksempel `F-01-009`. Er `code` tom, brukes neste ledige kode i mappen |
| `folder` | Mappe i dokumentstrukturen, for eksempel `F-01` |
| `title` | Tittel |
| `docType` | `policy`, `prosedyre`, `instruks`, `plan`, `handbok`, `veileder`, `analyse`, `register`, `sjekkliste`, `skjema`, `rapport`, `nyhet`, `ekstern`, `kravbevis` eller `mal` |
| `content` | **Markdown**, se under |
| `ownerName`, `approverName` | Eier og godkjenner (navn eller rolle) |
| `accessClass` | `intern` (standard), `begrenset` eller `skjermet` |
| `readAckRequired` | `true` for policy, håndbok og instrukser alle skal lese |
| `reviewIntervalMonths` | Gjennomgangsintervall (standard 12) |
| `tags` | Stikkord |
| `requirementAreas` | Kravområder dokumentet dokumenterer, for eksempel `["policy", "leadership"]`. Se kravområder under |
| `processKeys` | Prosesser dokumentet hører til (nøkler i `processes`) |
| `attachments` | `[{ "label", "url", "kind": "original" \| "lenke" \| "fil" }]`, for eksempel originalfilen i SharePoint |
| `legacyRevisions` | Revisjonshistorikk fra tidligere system: `[{ "rev", "date", "reason", "by" }]` |
| `source` | `{ "system", "path", "url", "originalCode", "originalCreated", "originalVersion", "note" }` |
| `changeReason` | Tekst i første revisjon (standard: «Importert fra …») |

**Markdown som vises:**
- `#`–`####` overskrifter
- avsnitt
- `-` og `1.` lister (to nivåer, innrykk med to mellomrom)
- `- [ ]` avkrysning
- tabeller (`| a | b |` med skillelinje `|---|---|`)
- `>` merknad
- `---` skillelinje
- `**fet**`, `*kursiv*`, `` `kode` `` og `[lenke](https://…)`

## `processes`: prosesser med prosesskart

| Felt | Innhold |
|---|---|
| `key`, `code`, `order` | Kode (for eksempel `B-01-002`) og rekkefølge i verdikjeden |
| `title`, `category` | `ledelse`, `kjerne` eller `stotte` |
| `ownerName` | Prosesseier (påkrevd for å sende til godkjenning) |
| `purpose`, `inputs`, `outputs`, `kpi` | Prosessbeskrivelse |
| `requirementAreas` | Kravområder |
| `documentKeys` | Styrende dokumenter (nøkler i `documents`) |
| `diagram` | Se under |

**Diagram.** Koordinater er valgfrie, fordi autolayouten plasserer boksene etter rekkefølge og svømmebane.

```json
{
  "lanes": [{ "id": "dl", "label": "Daglig leder", "roleKey": "top_management" }],
  "nodes": [
    { "id": "s", "type": "start", "label": "Henvendelse", "lane": "dl" },
    { "id": "a", "type": "activity", "label": "Vurder henvendelse", "lane": "dl", "description": "…",
      "documentKey": "F-01-002", "system": "ProTop Anbud", "module": "tab:anbud/vurdering", "dueDays": 3 },
    { "id": "d", "type": "decision", "label": "Kan vi ta oppdraget?", "lane": "dl" },
    { "id": "e", "type": "end", "label": "Til kontrakt", "lane": "dl", "processKey": "B-01-004" }
  ],
  "edges": [
    { "from": "s", "to": "a" },
    { "from": "a", "to": "d" },
    { "from": "d", "to": "e", "condition": "yes", "label": "Ja" },
    { "from": "d", "to": "x", "condition": "no", "label": "Nei" }
  ]
}
```

**Bokstyper:**
- `start` og `end`
- `activity`, `task`, `decision`, `approval`, `control`
- `checklist`, `notify`, `timer`, `manual_event`
- `parallel_split` og `parallel_join`
- `subprocess` (med `processKey`)

Unngå `form` og `document` som bokstyper, fordi de krever publiserte skjema og dokumenter for å kunne publiseres. Bruk heller `documentKey`/`formKey` på en aktivitet.

**Klikk på en boks** åpner det første av disse som finnes:
1. `documentKey` → dokument
2. `processKey` → prosess
3. `formKey` → skjema
4. `module` → ProTop-side
5. `url` → lenke

**`module`** er enten en ISO-side (`avvik`, `risiko`, `leverandorer`, `ledelse` …) eller en annen ProTop-modul. Annen modul skrives `tab:<fane>/<underside>`, for eksempel:
- `tab:anbud/vurdering` og `tab:anbud/tilbud`
- `tab:kunder`, `tab:kontrakt` og `tab:projects`
- `tab:arbeid/timeliste`
- `tab:ansatte` og `tab:hr`
- `tab:okonomi/oversikt`
- `tab:utstyr`

**Regler for publisering:**
- Én start og minst én slutt. Alle bokser kan nås fra start og fører til slutt.
- En boks som ikke er beslutning, har høyst én utgang. Bruk `decision` (Ja/Nei-grener, `condition: "yes"/"no"`) eller `parallel_split`.
- Løkker må gå via en beslutning.
- Bokser som utføres av mennesker, har ansvarlig rolle. Den hentes fra banen hvis den ikke er satt.

Toveis dialog og informasjonsflyt (stiplete piler i Visio) beskrives i `description`. De tegnes ikke som piler.

## `records`: registre

`records` er et objekt med registernavn som nøkkel. Hver rad har `key` pluss feltene i registeret. Felt av typen `ref`/`refmulti` oppgis med **nøkler**, som løses til ProTop-id-er:
- `ref: process` bruker nøkler i `processes`
- `ref: requirement` bruker nøkler i `requirements`
- `ref: <register>` bruker nøkler i det registeret

Felles valgfrie felt:
- `needsReview: true` og `reviewNote`. Posten vises som «Må gjennomgås», for eksempel når kilden mangler ansvarlig.
- `origin: { system, ref, url }` er hvor posten kom fra. `source` som objekt godtas også og lagres som `origin`. Registre som har et eget felt `source` (kompetansekrav) beholder feltet som tekst.
- `state`: en av registerets statuser
- For `mal`: `measurements: [{ period, value, quality, source }]`
- For `beredskap`: `exercises: [{ date, participants, evaluation, improvement }]`

Feltlisten per register står til slutt i dokumentet, og er generert fra `src/iso/registers.js`.

## `requirements`: lov-, kontrakts- og interne krav

`{ "key", "kind": "lov" | "kontrakt" | "intern" | "anbefalt", "title", "clause", "summary", "source", "authority", "areaKeys": [], "lastCheckedAt" }`

Lovkrav må ha `source` (lov/forskrift og paragraf eller Lovdata-lenke).

## `assessments`: kravvurderinger, for eksempel GAP-analyse

- **ISO-krav:** `{ "key", "standard": "ISO9001", "area": "context", "status", "rationale", "ownerName" }`
- **Egne krav:** `{ "key", "requirementKey": "lov-aml", "status", "rationale" }`

**Status** er én av `ikke_vurdert`, `mangler`, `under_arbeid`, `dokumentert`, `avvik`, `ma_revurderes` eller `ikke_relevant`. `ikke_relevant` krever godkjenner og begrunnelse, og bare ISO 9001 kap. 8 kan settes slik. `internt_verifisert` er ikke lov ved import.

Et krav som allerede er vurdert i ProTop, overskrives ikke, med mindre raden har `"overwrite": true`.

## `forms`: skjema og sjekklister

Legges i Skjemabygger og godkjennes som styrte skjema i ISO, med mindre raden har `"approve": false`. Maks 120 felt per skjema.

`{ "key", "title", "intro", "category": "skjema", "fields": [ { "id", "kind", "label", "required", "help", "options": ["Ja", "Nei", "Ikke relevant"] } ] }`

**Felttyper (`kind`):**
- `title` (seksjon) og `note` (fast tekst)
- `text`, `long`, `number`, `date` og `time`
- `choice`, `checks` og `dropdown`
- `scale`, `check`, `image` og `file`

## `news`: nyheter og kunngjøringer

`{ "key", "title", "body", "content" (Markdown, valgfri), "readAckRequired", "publishedAt", "category" }`

Hver nyhet blir et styrt dokument av typen «Nyhet / kunngjøring» i ISO, med godkjenning og eventuelt lesebekreftelse. Ved import kan nyhetene også publiseres på Nyheter i Selskap.

## Kravområder (`requirementAreas` / `areaKeys`)

| Nøkkel | Område | ISO 9001 | ISO 14001 | ISO 45001 |
|---|---|---|---|---|
| context | Organisasjonens kontekst | 4.1 | 4.1 | 4.1 |
| parties | Interessenter og forventninger | 4.2 | 4.2 | 4.2 |
| scope | Omfang av ledelsessystemet | 4.3 | 4.3 | 4.3 |
| processes | Prosesser og ledelsessystem | 4.4 | 4.4 | 4.4 |
| leadership | Lederskap og forpliktelse | 5.1 | 5.1 | 5.1 |
| customer | Kundeorientering | 5.1.2 | – | – |
| policy | Policy | 5.2 | 5.2 | 5.2 |
| roles | Roller, ansvar og myndighet | 5.3 | 5.3 | 5.3 |
| participation | Konsultasjon og medvirkning | – | – | 5.4 |
| risk | Risiko og muligheter | 6.1 | 6.1.1 | 6.1 |
| aspects | Miljøaspekter | – | 6.1.2 | – |
| obligations | Samsvarsforpliktelser | – | 6.1.3 | 6.1.3 |
| hazards | Fareidentifikasjon og arbeidsmiljørisiko | – | – | 6.1.2 |
| objectives | Mål og planer | 6.2 | 6.2 | 6.2 |
| change | Planlegging av endringer | 6.3 | – | 8.1.3 |
| resources | Ressurser og organisasjonskunnskap | 7.1 | 7.1 | 7.1 |
| competence | Kompetanse | 7.2 | 7.2 | 7.2 |
| awareness | Bevissthet | 7.3 | 7.3 | 7.3 |
| communication | Kommunikasjon | 7.4 | 7.4 | 7.4 |
| documented | Dokumentert informasjon | 7.5 | 7.5 | 7.5 |
| operation | Operativ planlegging og styring | 8.1 | 8.1 | 8.1 |
| requirements | Krav til produkter og tjenester | 8.2 | – | – |
| design | Prosjektering og utvikling | 8.3 | – | – |
| suppliers | Eksterne leverandører | 8.4 | 8.1 | 8.1.4 |
| delivery | Produksjon og levering | 8.5 | 8.1 | 8.1 |
| release | Frigivelse og avvikende leveranser | 8.6–8.7 | – | – |
| emergency | Beredskap | – | 8.2 | 8.2 |
| monitoring | Overvåking, måling og analyse | 9.1 | 9.1 | 9.1 |
| satisfaction | Kundetilfredshet | 9.1.2 | – | – |
| evaluation | Evaluering av samsvar | – | 9.1.2 | 9.1.2 |
| internalAudit | Internrevisjon | 9.2 | 9.2 | 9.2 |
| review | Ledelsens gjennomgang | 9.3 | 9.3 | 9.3 |
| nonconformity | Avvik og korrigerende tiltak | 10.2 | 10.2 | 10.2 |
| improvement | Kontinuerlig forbedring | 10.1 | 10.1 | 10.3 |

Risikokategorier (`risiko.category`): `strategisk`, `kvalitet`, `miljo`, `arbeidsmiljo`, `prosjekt`, `beredskap`, `leverandor`.

ISO-roller (`roleKey`): `system_owner`, `quality_manager`, `hse_manager`, `process_owner`, `project_manager`, `manager`, `top_management`, `internal_auditor`, `safety_rep`, `employee`.

## Registre og felt

### kontekst – Kontekst (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Forhold | text | ja |  |
| scope | Internt / eksternt | select | ja | Internt / Eksternt |
| factorType | Type | select |  | Forhold / Utfordring / Mulighet / Styrke / Svakhet / Trussel |
| area | Område | text |  |  |
| description | Beskrivelse og påvirkning | long | ja |  |
| climate | Klimarelevant | select |  | Ja / Nei / Ikke vurdert |
| ownerName | Eier | person |  |  |
| nextReview | Neste vurdering | date |  |  |

### interessent – Interessenter (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Interessent | text | ja |  |
| category | Kategori | select |  | Kunde / Ansatte / Myndighet / Leverandør / Eier / Nabo/samfunn / Annet |
| scope | Intern / ekstern | select |  | Intern / Ekstern |
| parties | Konkrete parter | long |  |  |
| description | Behov og forventninger | long | ja |  |
| influence | Påvirkning på ledelsessystemet | select |  | Høy / Middels / Lav |
| followUp | Hvordan følges forventningene opp | long |  |  |
| binding | Bindende forpliktelse | select |  | Ja / Nei |
| ownerName | Eier | person |  |  |
| nextReview | Neste vurdering | date |  |  |

### risiko – Risiko og muligheter (statuser: aktiv, akseptert, lukket)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| kind | Type | select | ja | Risiko / Mulighet |
| title | Risiko / mulighet | text | ja |  |
| category | Kategori | select | ja | strategisk / kvalitet / miljo / arbeidsmiljo / prosjekt / beredskap / leverandor |
| processId | Prosess | ref → process |  |  |
| activity | Aktivitet / område | text |  |  |
| description | Årsaker og konsekvenser | long |  |  |
| controls | Eksisterende barrierer | long |  |  |
| inherentL | Sannsynlighet (iboende) | scale |  |  |
| inherentC | Konsekvens (iboende) | scale |  |  |
| plan | Tiltak / handlingsplan | long |  |  |
| residualL | Sannsynlighet (rest) | scale |  |  |
| residualC | Konsekvens (rest) | scale |  |  |
| benefit | Forventet gevinst (mulighet) | long |  |  |
| projectId | Prosjekt | project |  |  |
| ownerName | Eier | person | ja |  |
| nextReview | Revurdering | date |  |  |

### miljoaspekt – Miljøaspekter (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| activity | Aktivitet | text | ja |  |
| lifecycle | Livsløpstrinn | select |  | Innkjøp / Prosjektering / Transport / Drift / Avfall / Avhending |
| title | Miljøaspekt | text | ja |  |
| impact | Miljøpåvirkning | long | ja |  |
| situation | Situasjon | select |  | Normal / Unormal / Nødsituasjon |
| control | Kontroll eller innflytelse | select |  | Direkte kontroll / Innflytelse |
| extent | Omfang (1–5) | scale |  |  |
| severity | Alvorlighet (1–5) | scale |  |  |
| significant | Vesentlig | select | ja | Ja / Nei |
| rationale | Begrunnelse etter kriterier | long | ja |  |
| controls | Operativ kontroll / tiltak | long |  |  |
| ownerName | Eier | person |  |  |
| nextReview | Revurdering | date |  |  |

### miljodata – Miljødata (statuser: aktiv)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Målepunkt | text | ja |  |
| period | Periode (ÅÅÅÅ-MM) | text | ja |  |
| value | Verdi | number | ja |  |
| unit | Enhet | select | ja | kWh / kg / tonn / km / liter / kg CO₂e |
| quality | Datakvalitet | select | ja | Målt / Estimert / Ukjent |
| method | Metode / kilde | text |  |  |
| factor | Faktor og versjon (ved CO₂e) | text |  |  |

### fare – Farer og arbeidsmiljørisiko (statuser: aktiv, lukket)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| activity | Arbeidsaktivitet | text | ja |  |
| title | Fare | text | ja |  |
| hazardCategory | Farekategori | select |  | Fysisk / Psykososial / Organisatorisk / Ergonomisk / Kjemisk / Biologisk / Sikkerhet |
| exposed | Utsatte roller | text |  |  |
| inherentL | Sannsynlighet | scale |  |  |
| inherentC | Konsekvens | scale |  |  |
| hierarchy | Tiltakshierarki | multi |  | Fjerne faren / Erstatte / Tekniske tiltak / Administrative tiltak / Verneutstyr |
| controls | Tiltak | long |  |  |
| residualL | Sannsynlighet (rest) | scale |  |  |
| residualC | Konsekvens (rest) | scale |  |  |
| participation | Medvirkning (hvem deltok) | text | ja |  |
| ownerName | Ansvarlig | person | ja |  |
| nextReview | Revurdering | date |  |  |

### medvirkning – Medvirkning (statuser: mottatt, behandlet, tilbakemeldt)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Tema | text | ja |  |
| description | Innspill | long | ja |  |
| channel | Kanal | select |  | AMU / Verneombud / Avdelingsmøte / Digitalt innspill / Annet |
| representative | Representant | text |  |  |
| decision | Vurdering og beslutning | long |  |  |
| feedback | Tilbakemeldt | select |  | Ja / Nei |

### beredskap – Beredskap (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Scenario | text | ja |  |
| domain | Område | select |  | HMS / Miljø / Drift / IT |
| alarm | Varsling og kontaktkjede | long | ja |  |
| roles | Roller og ansvar | long |  |  |
| equipment | Utstyr | long |  |  |
| instructions | Beredskapskort / instruks | long | ja |  |
| ownerName | Ansvarlig | person |  |  |
| nextExercise | Neste øvelse | date |  |  |

### kompetansekrav – Kompetansekrav (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Kompetanse | text | ja |  |
| role | Rolle / funksjon | text | ja |  |
| level | Nivå | select |  | Grunnleggende / Selvstendig / Ekspert |
| validityMonths | Gyldighet (måneder, 0 = varig) | number |  |  |
| source | Kilde (lov, kunde, intern) | text |  |  |

### kompetanse – Kompetansebevis (statuser: gyldig, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| personName | Ansatt | person | ja |  |
| requirementId | Kompetansekrav | ref → kompetansekrav | ja |  |
| title | Bevis / kurs | text | ja |  |
| validFrom | Gyldig fra | date |  |  |
| validTo | Gyldig til | date |  |  |
| evidenceUrl | Dokumentasjon (lenke) | text |  |  |
| effect | Effektvurdering | long |  |  |

### leverandor – Leverandører (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Leverandør | text | ja |  |
| orgnr | Org.nr. | text |  |  |
| category | Kategori | text |  |  |
| services | Varer / tjenester | long |  |  |
| supplierClass | Leverandørklasse | select |  | Kritisk / Ikke kritisk – inngår i leveransen / Ikke kritisk – inngår ikke i leveransen |
| criticality | Kritikalitet | select | ja | Lav / Middels / Høy |
| department | Avdeling som bruker leverandøren | text |  |  |
| contactPerson | Kontaktperson | text |  |  |
| email | E-post | text |  |  |
| phone | Telefon | text |  |  |
| address | Adresse | text |  |  |
| certificates | Sertifikater | long |  |  |
| diligence | Aktsomhetsvurdering (åpenhetsloven) | select |  | Utført / Ikke utført / Ikke relevant |
| agreementUrl | Gyldig avtale (lenke) | text |  |  |
| deviations | Registrerte avvik | select |  | Nei / Ja |
| approval | Status | select | ja | Ikke vurdert / Godkjent / Betinget godkjent / Ikke godkjent |
| score | Siste evaluering (1–5) | scale |  |  |
| ownerName | Ansvarlig | person |  |  |
| nextReview | Neste evaluering | date |  |  |

### mal – Mål og KPI (statuser: aktiv, nådd, ikke_nådd, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| domain | Område | select | ja | Kvalitet / Miljø / Arbeidsmiljø |
| title | Mål | text | ja |  |
| unit | Enhet | text | ja |  |
| direction | Retning | select | ja | Øke / Redusere |
| baseline | Utgangsverdi | number |  |  |
| target | Måltall | number | ja |  |
| method | Målemetode og datakilde | long | ja |  |
| frequency | Målefrekvens | select |  | Måned / Kvartal / Halvår / År |
| actions | Tiltak / handlingsplan | long |  |  |
| ownerName | Eier | person | ja |  |
| deadline | Frist | date |  |  |

### samsvar – Samsvarsvurderinger (statuser: aktiv)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| requirementId | Lov-/kontraktskrav | ref → requirement | ja |  |
| title | Vurdering | text | ja |  |
| method | Vurderingsmetode | long | ja |  |
| result | Resultat | select | ja | Etterleves / Delvis / Etterleves ikke / Krever juridisk vurdering |
| evidence | Bevis | long |  |  |
| nextReview | Neste vurdering | date | ja |  |

### revisjon – Internrevisjon (statuser: planlagt, pagar, rapport, godkjent, oppfolging, lukket, avlyst)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Revisjon | text | ja |  |
| scope | Omfang (prosesser/enheter) | long | ja |  |
| criteria | Kriterier | long | ja |  |
| standards | Standarder | multi |  | ISO 9001 / ISO 14001 / ISO 45001 / Lovkrav |
| auditorName | Revisor | person | ja |  |
| independence | Revisor reviderer ikke eget arbeid | check | ja |  |
| riskBasis | Risikobegrunnelse | long |  |  |
| plannedDate | Planlagt dato | date | ja |  |
| conclusion | Konklusjon | long |  |  |

### ledelse – Ledelsens gjennomgang (statuser: planlagt, gjennomfort, godkjent)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Gjennomgang | text | ja |  |
| period | Periode | text | ja |  |
| meetingDate | Møtedato | date | ja |  |
| participants | Deltakere | long | ja |  |
| assessment | Vurdering av systemets egnethet, tilstrekkelighet og effektivitet | long |  |  |

### sertifikat – Sertifisering (statuser: planlagt, gyldig, utlopt)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Standard og utgave | text | ja |  |
| certBody | Sertifiseringsorgan | text | ja |  |
| accreditation | Akkreditering | text |  |  |
| certNumber | Sertifikatnummer | text |  |  |
| scopeText | Omfang | long |  |  |
| validFrom | Gyldig fra | date |  |  |
| validTo | Gyldig til | date |  |  |
| nextAudit | Neste eksterne revisjon | date |  |  |
| limitations | Begrensninger | long |  |  |

### kvalitetsplan – Prosjektkvalitet (statuser: utkast, godkjent, avsluttet)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| projectId | Prosjekt | project | ja |  |
| title | Kvalitetsplan | text | ja |  |
| requirements | Gjeldende krav | long |  |  |
| roles | Roller og ansvar | long |  |  |
| controlPlan | Kontrollplan og faseporter | long | ja |  |
| risks | Prosjektrisiko | long |  |  |
| ownerName | Prosjektleder | person | ja |  |

### rolle – Roller og stillinger (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Rolle / stilling | text | ja |  |
| category | Nivå | select |  | Styre og eiere / Ledelse / Administrasjon / Prosjekt / HMS og vern / Annet |
| reportsTo | Rapporterer til | text |  |  |
| department | Avdeling | text |  |  |
| location | Sted | text |  |  |
| purpose | Formål med rollen | long |  |  |
| responsibilities | Ansvar | long | ja |  |
| authority | Myndighet | long |  |  |
| mandates | Fullmakter | long |  |  |
| tasks | Arbeidsoppgaver | long |  |  |
| qualifications | Kvalifikasjoner og kompetansekrav | long |  |  |
| holders | Innehaves av | text |  |  |
| ownerName | Eier av beskrivelsen | person |  |  |
| nextReview | Neste gjennomgang | date |  |  |

### myndighet – Myndighetsmatrise (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Aktivitet / beslutning | text | ja |  |
| category | Kategori | text | ja |  |
| roles | Roller med myndighet | refmulti → rolle | ja |  |
| limit | Beløpsgrense / vilkår | text |  |  |
| note | Merknad | long |  |  |

### kommunikasjon – Kommunikasjonsplan (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Hva kommuniseres | text | ja |  |
| direction | Intern / ekstern | select | ja | Intern / Ekstern / Intern og ekstern |
| audience | Til hvem | text | ja |  |
| purpose | Hvorfor | long |  |  |
| when | Når / hvor ofte | text | ja |  |
| channel | Kanal | multi |  | Driftsmøte / Allmøte / Ledermøte / E-post / ProTop-nyhet / ProTop-oppgave / Telefon / Møte / Rapport / Nettside / Sosiale medier / Annet |
| responsible | Hvem kommuniserer (rolle) | text | ja |  |
| ownerName | Ansvarlig person | person |  |  |
| record | Hvor dokumenteres det | text |  |  |

### aarshjul – Årshjul (statuser: aktiv, arkivert)
| Felt | Etikett | Type | Påkrevd | Valg |
|---|---|---|---|---|
| title | Aktivitet | text | ja |  |
| months | Måned(er) | multi | ja | Januar / Februar / Mars / April / Mai / Juni / Juli / August / September / Oktober / November / Desember |
| frequency | Hyppighet | select |  | Årlig / Halvårlig / Kvartalsvis / Månedlig / Ved behov |
| category | Område | select |  | Ledelse / Kvalitet / Miljø / HMS / Personal / Marked / Økonomi / Annet |
| responsibleRole | Ansvarlig rolle | text |  |  |
| ownerName | Ansvarlig person | person |  |  |
| page | Utføres i ProTop | select |  | ledelse / revisjon / kontekst / risiko / miljo / hms / mal / lovkrav / leverandorer / kompetanse / beredskap / dokumenter / kommunikasjon / organisasjon / avvik |
| description | Beskrivelse | long |  |  |
| createTasks | Lag oppgave i ProTop når måneden starter | check |  |  |

