# HR-modul — plan og implementering (v2)

Se også `docs/hr/research-matrix.md` for verdensbasis-matrise (BambooHR, Personio, Greenhouse, ISO, AML).

## Arkitektur i ProTop

- **HR-fanen** er for leder/HR (ressurs `hr`). Vanlige ansatte ser ikke menyen.
- **Ansatte-registeret** forblir stamdata (person, CV, tilgang). HR legger livsløpsdata oppå.
- **Min side** viser kun det som er merket synlig for den ansatte.
- Timer / fakturerbarhet hentes fra `timeEntries` (billableHours vs hours).
- Skjemabygger-maler: «Arbeidsavtale» og «Medarbeidersamtale».

## Undersider (8)

1. **Oversikt** — go-to dashboard: nedtelling jubileum/bursdag, kontraktutløp, compliance-gap, ATS-kø
2. **Personell** — HR-liste med stamdata, snareveier til avtaler/lønn/oppfølging/ISO
3. **Avtaler** — personnivå, AML § 14-6-felter, OCR/AI-skanning, skjemamal
4. **Produktivitet** — utfakturerbart vs ikke-fakturerbart
5. **Lønn** — historikk, % utvikling, neste år, memo på bevegelser
6. **Oppfølging** — saker, samtaler (PDF + sammenlign), memo/filer, oppgaver
7. **Lovpålagt** — AML (avtale, oppfølging, verneutstyr) og GDPR per ansatt. Kompetanse, opplæring og HMS-introduksjon følges opp i ISO / K-HMS → Kompetanse
8. **Rekruttering** — annonser, 3-kolonne kanban (mottatt → behandling → ferdig), vunnet/avslått
9. **Årshjul** — faste HR-aktiviteter måned for måned med lovhenvisning (`src/hr/annualWheel.js`), frister ved sykefravær regnet fra Fravær (`src/hr/sickLeave.js`: oppfølgingsplan 4 uker, dialogmøte 1 7 uker, dialogmøte 2 26 uker) og anonym medarbeiderundersøkelse (`src/hr/survey.js`). Ressurs `hrFollowup`, siden fravær er helseopplysninger.

### Årshjul, sykefravær og undersøkelse

- Avkrysninger og av-slåtte aktiviteter: `hr.annual`. Markerte frister ved sykefravær: `hr.sickFollowUps`.
- Oppgaver (`parentTodos`) kan leses av alle i bedriften. Oppgavene for sykefravær har derfor nøytral tittel og id uten ansatt-id; navnet står bare i HR.
- Undersøkelsen: `hrSurveys` (alle leser, HR skriver), `hrSurveyAnswers` (svar uten bruker-id, bare HR leser) og `hrSurveyReceipts/{survey}_{uid}` (hindrer dobbeltsvar). Reglene krever svar og kvittering i samme skriving. Resultater vises først når undersøkelsen er avsluttet og minst fem har svart, og en avsluttet undersøkelse kan ikke åpnes igjen.

## Datamodell

`families/{companyId}/hr/state` — contracts, reviews, cases, memos, tasks, salaries, jobs, applications, compliance, files.

## Utenfor scope nå

Full lønnskjøring/skatt, e-signatur, benefits-enrollment.
