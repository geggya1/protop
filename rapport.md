# E2E: konsernintegrasjon

16 av 18 steg OK. 0 feil i nettleseren.

| Steg | OK | Detalj |
|---|---|---|
| Mor: Underenheter viser Tilknyttede selskaper | ✔ | bilder/01-mor-underenheter.png |
| Mor: ber Datter om tilknytning som datterselskap | ✔ | bilder/03-mor-sendt.png |
| Datter: ser forespørselen og godtar | ✔ | active; bilder/05-datter-aktiv.png |
| Mor: avtalen vises som aktiv | ✔ | bilder/06-mor-aktiv.png |
| Mor: tildeler Per fra Datter på prosjektet | ✔ | bilder/09-mor-team-etter.png |
| Server: prosjektkopi, kunde og innleid medarbeider | ✔ | kopi prjic_icl-e2e-datter-e2e-mor-mvzompa6_prj_e2e_mor1, pris {"hourlyRate":1200}, rabatt 10 |
| Datter: ser kopien med samme nummer og Mor som kunde | ✔ | bilder/11-datter-kopi-team.png |
| Timer: ført hos Datter vises hos Mor (venter på godkjenning) | ✔ | speilet: registrert |
| Timer: godkjent hos Datter er godkjent hos Mor | ✔ |  |
| Faktura: Datter fakturerer Mor, nummeret vises på timen hos Mor | ✔ | faktura 20001 på speilet |
| Utlegg og salg: speiles til Mor når Datter har godkjent | ✔ | utlegg og salg speilet |
| Mor: Timerapport viser at timen belastes på faktura 20001 | ✔ | bilder/12-mor-timerapport.png |
| Mor: Utlegg på prosjektet viser utlegget fra Datter | ✘ | locator.waitFor: Timeout 30000ms exceeded. Call log:   - waiting for getByText('Ført i Datter Elektro AS').first() to be visible  |
| Mor: Til fakturering viser timene fra Datter mot sluttkunden | ✘ | locator.waitFor: Timeout 30000ms exceeded. Call log:   - waiting for getByText('Fra Datter Elektro AS').first() to be visible  |
| Datter: Til fakturering viser kopien med Mor som kunde | ✔ | bilder/14-datter-til-fakturering.png |
| Datter: utstyr med utleiepris | ✔ | bilder/16-datter-utstyr-utleie.png |
| Mor og Datter: prosjektlisten merker felles prosjekter | ✔ | bilder/18-mor-prosjektliste.png |
| Mobil: Underenheter og Team hos Mor | ✔ |  |

## Feil i nettleseren

Ingen.
