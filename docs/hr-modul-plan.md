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
7. **Lov & ISO** — AML, internkontroll, ISO 9001/14001/45001, GDPR per ansatt
8. **Rekruttering** — annonser, 3-kolonne kanban (mottatt → behandling → ferdig), vunnet/avslått

## Datamodell

`families/{companyId}/hr/state` — contracts, reviews, cases, memos, tasks, salaries, jobs, applications, compliance, files.

## Utenfor scope nå

Full lønnskjøring/skatt, e-signatur, benefits-enrollment.
