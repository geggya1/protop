# ProTop — agentregler

## Bygg alltid på dagens main

- Før du endrer noe: `git fetch origin` og `git log --oneline HEAD..origin/main`. Står det commits der, oppdaterer du mot `main` først (eller lager en ny branch fra `origin/main`). Bygg aldri videre på en branch som er bak.
- Bygg aldri på en lokal samle-branch (`lokal/alt-samlet` og liknende). Nytt arbeid starter fra `origin/main`.
- Endringer legges inn i den strukturen og det designet som finnes på `main` (menyer, sider, komponenter). Ikke lag egne skjermer, faner eller menypunkter for noe som hører hjemme på en side som finnes.
- `scripts/check-base.js` sier fra når Metro starter, og stopper en commit når `main` har endringer eldre enn et døgn som mangler her. Ikke slå av sjekken (`PROTOP_ALLOW_STALE=1`, `PROTOP_NO_BASE_CHECK=1`, `--no-verify`) uten at brukeren ber om det.
- Hovedmappen `C:\Users\Bruker\protop` deles med andre økter, og Metro på 8081 viser den. Ikke bytt branch, stash eller rydd der uten å sjekke `git status` og hvilken branch som står. Bruk en egen worktree fra `origin/main` når mappen er i bruk.

## Push og Hosting

- Push og merge til `main` går **live** på https://protop.no. `.github/workflows/deploy-hosting.yml` bygger web og kjører `firebase deploy --only hosting --project protop-c189c`.
- Ikke bruk lokal Hosting-emulator, `preview:web` eller branchen `offentlig`. Det sporopplegget er fjernet.
- Ikke hold web-oppdateringer tilbake for lokal Metro. Det som merges til `main`, skal ut.

## Testing

- Lag aldri video, skjermopptak eller walkthrough-film. Det gjelder også når en ferdig endring ellers skal vises. Video bare når brukeren ber om det eksplisitt i meldingen.

## Design

- Én tittel per side. Når skallet viser sidetittelen (tittelraden med brødsmule, eller modulbåndet), skal siden ikke gjenta den som egen overskrift. Det gjelder særlig på mobil. Sidens forklaring og knapper kan stå, men ikke en ny tittel med samme tekst.
