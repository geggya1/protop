# HR-modul — plan og inspirasjon

## Hva andre gjør bra

| Aktør | Styrke vi tar med |
|-------|-------------------|
| BambooHR | Dashboard med «what's happening» (bursdag, jubileum), ATS med tydelige statuser, Total Rewards / lønnshistorikk for HR, selvbetjening for egen data |
| Personio | Hele livsløpet i ett system: rekruttering → ansettelse → utvikling → kompensasjon; rollebasert tilgang |
| Factorial | Enkel SMB-UX, oppgaver/dokumenter samlet, produktivitet koblet til tid |
| Lattice / performance | Medarbeidersamtaler og oppfølging som egne spor, ikke blandet inn i registeret |

## Arkitektur i ProTop

- **HR-fanen** er for leder/HR (ressurs `hr`). Vanlige ansatte ser ikke menyen.
- **Ansatte-registeret** forblir stamdata (person, CV, tilgang). HR legger livsløpsdata oppå.
- **Min side** (egen ansattprofil) viser kun det som er merket synlig for den ansatte (oppgaver, synlige memo, egne samtaler, egen lønnsoversikt).
- Timer / fakturerbarhet hentes fra eksisterende `timeEntries` (billableHours vs hours).

## Undersider

1. Oversikt — kommende bursdager/jubileum, åpne saker, rekrutteringsfunnel
2. Personell — HR-liste med ansatt dato, jubileum, fødselsdato, kontraktstatus
3. Produktivitet — skala utfakturerbart vs ikke-fakturerbart
4. Lønn — nåværende, historikk-graf, planlagte justeringer
5. Oppfølging — saker, memo, oppgaver
6. Rekruttering — stillingsannonser, søknader, evaluering, svar

## Datamodell

`families/{companyId}/hr/state` — ett dokument (samme mønster som anbud), med arrays for contracts, reviews, cases, memos, tasks, salaries, jobs, applications.
