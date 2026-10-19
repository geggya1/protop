# ProTop — agentregler

## Push og Hosting

- Push og merge til `main` går **live** på https://protop.no. `.github/workflows/deploy-hosting.yml` bygger web og kjører `firebase deploy --only hosting --project protop-c189c`.
- Ikke bruk lokal Hosting-emulator, `preview:web` eller branchen `offentlig`. Det sporopplegget er fjernet.
- Ikke hold web-oppdateringer tilbake for lokal Metro. Det som merges til `main`, skal ut.

## Testing

- Lag aldri video, skjermopptak eller walkthrough-film. Det gjelder også når en ferdig endring ellers skal vises. Video bare når brukeren ber om det eksplisitt i meldingen.
