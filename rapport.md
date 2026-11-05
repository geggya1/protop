# E2E: konsernintegrasjon

5 av 22 steg OK. 0 feil i nettleseren.

| Steg | OK | Detalj |
|---|---|---|
| Mor: Underenheter viser Tilknyttede selskaper | ✔ | bilder/01-mor-underenheter.png |
| Mor: ber Datter om tilknytning som datterselskap | ✘ | Fant ikke #ic-hours-discount |
| Datter: ser forespørselen og godtar | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Svar trengs').first() to be visible  |
| Mor: avtalen vises som aktiv | ✘ | locator.waitFor: Timeout 30000ms exceeded. Call log:   - waiting for getByText('Foreslå nye priser').first() to be visible  |
| Mor: tildeler Per fra Datter på prosjektet | ✘ | Fant ikke #project-team-add-partner |
| Server: prosjektkopi, kunde og innleid medarbeider | ✘ | Tidsavbrudd: kopi hos datter |
| Datter: ser kopien med samme nummer og Mor som kunde | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Skole Fjordgata').first() to be visible  |
| Timer: ført hos Datter vises hos Mor (venter på godkjenning) | ✘ | Tidsavbrudd: speilet time hos mor |
| Timer: godkjent hos Datter er godkjent hos Mor | ✘ | Tidsavbrudd: godkjent speil |
| Faktura: Datter fakturerer Mor, nummeret vises på timen hos Mor | ✘ | Tidsavbrudd: fakturautkast på speilet |
| Utlegg og salg: speiles til Mor når Datter har godkjent | ✘ | Tidsavbrudd: speilet utlegg |
| Mor: Timerapport viser at timen belastes på faktura 20001 | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('faktura 20001').first() to be visible  |
| Mor: Utlegg på prosjektet viser utlegget fra Datter | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Hotell Bergen').first() to be visible  |
| Mor: Til fakturering viser timene fra Datter mot sluttkunden | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Skole Fjordgata').first() to be visible  |
| Datter: Til fakturering viser kopien med Mor som kunde | ✔ | bilder/03-datter-til-fakturering.png |
| Datter: utstyr med utleiepris | ✔ | bilder/05-datter-utstyr-utleie.png |
| Mor og Datter: prosjektlisten merker felles prosjekter | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Leveranse til Mor Bygg AS').first() to be visible  |
| Mor: knytter til en samarbeidspartner (ikke konsern), partneren godtar | ✔ | partner aktiv, ikke i konsernet |
| Mor: fordeler nummerserier i konsernet (ikke til partneren) | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Nummerserier i konsernet').first() to be visible  |
| Mor: nytt prosjekt får neste nummer i serien | ✘ | prosjektnummer 10000 ble ikke foreslått |
| Datter: ser nummerserien fra morselskapet | ✘ | locator.waitFor: Timeout 60000ms exceeded. Call log:   - waiting for getByText('Nummerserie i konsernet').first() to be visible  |
| Mobil: Underenheter og Team hos Mor | ✔ |  |

## Feil i nettleseren

Ingen.
