# HR-modul — plan og implementering (v2)

Se også `docs/hr/research-matrix.md` for verdensbasis-matrise (BambooHR, Personio, Greenhouse, ISO, AML).

## Arkitektur i ProTop

- **HR-fanen** er for leder/HR (ressurs `hr`). Vanlige ansatte ser ikke menyen.
- **Ansatte-registeret** forblir stamdata (person, CV, tilgang). HR legger livsløpsdata oppå.
- **Min side** viser kun det som er merket synlig for den ansatte.
- Timer / fakturerbarhet hentes fra `timeEntries` (billableHours vs hours).
- Skjemabygger-maler: «Arbeidsavtale» og «Medarbeidersamtale».

## Undersider (12, i fem deler)

Modulmenyen viser delene i første rad og sidene i delen under, som ISO (`HR_GROUPS` og `HR_MENU` i `src/navigation/shellModules.js`).

- **Oversikt** — go-to dashboard: nedtelling jubileum/bursdag, kontraktutløp, compliance-gap, ATS-kø
- **Ansatte**
  - **Personell** — HR-liste med stamdata og personalmappen (avtale, lønn, oppfølging, lovpålagt per person)
  - **Avtaler** — AML § 14-6-felter, OCR/AI-skanning, skjemamal
  - **Lønn** — historikk, % utvikling, neste år, memo på bevegelser, lønnskartlegging fordelt på kjønn
  - **Lovpålagt** — arbeidsavtale, HMS-kort, verneutstyr og personvern per ansatt. Kompetanse, opplæring og HMS-introduksjon følges opp i ISO / K-HMS → Kompetanse
- **Oppfølging**
  - **Samtaler og saker** — medarbeidersamtaler (PDF + sammenlign), saker, memo/filer, oppgaver
  - **Sykefravær** — frister regnet fra Fravær (`src/hr/sickLeave.js`): oppfølgingsplan 4 uker, dialogmøte 1 7 uker, dialogmøte 2 26 uker
  - **Medarbeiderundersøkelse** — anonym kartlegging av arbeidsmiljøet (`src/hr/survey.js`)
- **Rekruttering** — annonser, kanban (mottatt → behandling → ferdig), vunnet/avslått
- **Rutiner**
  - **Årshjul** — faste HR-aktiviteter måned for måned med lovhenvisning (`src/hr/annualWheel.js`). Aktivitetene lenker til siden der de gjøres; vernerunde og årlig gjennomgang lenker til ISO når bedriften har ISO
  - **Personalhåndbok** — kapitler, versjoner og lesebekreftelse
  - **Skjemaer** — KS-maler for personal (taushetserklæring, nyansatt, oppfølgingsplan nyansatt, medarbeidersamtale)

Produktivitet ligger under Arbeid. Sykefravær, Medarbeiderundersøkelse og Samtaler og saker har ressursen `hrFollowup`.

### Medarbeidersamtale: én visning

- Samtalen føres i KS-skjemaet «Medarbeidersamtale» (C1-F-03-001), fra både Rutiner → Skjemaer og Oppfølging → Samtaler og saker. Begge bruker `HrFilledForm` (FormFill) og `useHrFormStart`, så skjemaet og visningen er like.
- Hvert utfylt samtaleskjema speiles i `hr.reviews` (`src/hr/reviewForms.js`, `formDocId`), så Oversikt, årshjulet og Min side ser samtalen. Når samtalen er ferdig, blir handlingsplanen én sak.
- Samtaler fra før (feltene under Oppfølging) vises som «eldre format» med PDF og sammenligning.

### Samlet årshjul

- HR → Rutiner → Årshjul kan vise ISO-årshjulet i samme hjul og tidslinje («Vis også ISO-årshjulet», for den som kan se ISO). ISO-aktivitetene føres i ISO og lenker dit.
- ISO → Årshjul viser månedens HR-aktiviteter med lenke til HR-årshjulet, for den som kan se HR.

### Årshjul, sykefravær og undersøkelse

- Avkrysninger og av-slåtte aktiviteter: `hr.annual`. Markerte frister ved sykefravær: `hr.sickFollowUps`.
- Oppgaver (`parentTodos`) kan leses av alle i bedriften. Oppgavene for sykefravær har derfor nøytral tittel og id uten ansatt-id; navnet står bare i HR.
- Undersøkelsen: `hrSurveys` (alle leser, HR skriver), `hrSurveyAnswers` (svar uten bruker-id, bare HR leser) og `hrSurveyReceipts/{survey}_{uid}` (hindrer dobbeltsvar). Reglene krever svar og kvittering i samme skriving. Resultater vises først når undersøkelsen er avsluttet og minst fem har svart, og en avsluttet undersøkelse kan ikke åpnes igjen.

## Datamodell

`families/{companyId}/hr/state` — contracts, reviews, cases, memos, tasks, salaries, jobs, applications, compliance, files.

## Utenfor scope nå

Full lønnskjøring/skatt, e-signatur, benefits-enrollment.
