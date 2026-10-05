# ProTop — agentregler

## Push og Hosting

- Vanlig push, PR og arbeid går **kun lokalt**. Bruk `npm run web` (Metro, `http://localhost:8081`) eller `npm run preview:web` (Hosting-emulator, `http://127.0.0.1:5000`). Ikke deploy til protop.no.
- Push til `main` deployer **ikke**.
- Når brukeren sier **offentlig**: send **absolutt alle** oppdateringer som ikke er live ennå. Ikke hold noe tilbake, ikke spør om et utvalg. Commit ferdig arbeid, ta med alt som ligger i snapshotet, og kjør `npm run offentlig` (`git push origin HEAD:refs/heads/offentlig`). Det er den eneste veien til https://protop.no.
- Ikke kjør `firebase deploy` / `npm run publish:web` som erstatning for «offentlig» med mindre brukeren ber om akkurat det.
