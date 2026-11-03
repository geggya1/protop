# Sikkerhetskopi og gjenoppretting

**Gjelder:** Firestore i `protop-c189c` (alle bedrifter, timer, fakturaer, HR, prosjekter).
**Status:** Skript og workflow er på plass. Om innstillingene er slått på i produksjon, står i
siste kjøring av workflowen **«Sikkerhetskopi (Firestore)»** (oppsummeringen øverst i kjøringen).

## Kort fortalt

Vi har fire lag. Hvert lag dekker noe de andre ikke gjør.

| Lag | Hva | Hvor langt tilbake | Brukes når |
|---|---|---|---|
| 1. Slettede timer i appen | Hver sletting av en timeføring lagrer en kopi i `families/{id}/timeEntryDeletions`. Leder gjenoppretter fra **Arbeid → Godkjenninger → Slettede timer**. | Ubegrenset (loggen slettes ikke) | Én eller noen få timer er slettet ved en feil. Ingen andre data røres. |
| 2. Gjenoppretting til tidspunkt (PITR) | Firestore husker alle versjoner av alle dokumenter i 7 dager, på minuttet. | 7 dager | En feil i koden eller en import har ødelagt data for én bedrift eller flere. Vi henter det som trengs, bare for dem det gjelder. |
| 3. Planlagte backuper | Daglig backup (beholdes 14 dager) og ukentlig backup søndag (beholdes 14 uker). | 14 uker | Feilen oppdages etter mer enn 7 dager, eller hele databasen må tilbake. |
| 4. Månedlig arkiv | Full eksport den 1. i måneden til `gs://protop-c189c-firestore-arkiv`. Kan ikke slettes de første 365 dagene, slettes automatisk etter 400 dager. | Ca. 13 måneder | Behov for data eldre enn 14 uker. |

I tillegg: **slettebeskyttelse** på databasen, så den ikke kan slettes ved et uhell (heller ikke fra konsollen
uten at beskyttelsen slås av først).

Alt ligger i Google Cloud i samme område som databasen (EU). Data krypteres av Google ved lagring.

## Workflowen «Sikkerhetskopi (Firestore)»

`.github/workflows/firestore-backup.yml` kjører `scripts/firestore-backup.sh` med deploy-kontoen.

| Når | Handling | Hva den gjør |
|---|---|---|
| Hver mandag | `status` | Leser innstillingene og siste backup. **Rød** hvis PITR, slettebeskyttelse eller en backupplan mangler, eller hvis siste backup er eldre enn 48 timer. |
| Den 1. i måneden | `arkiv` | Lager arkivbøtta første gang, og starter full eksport. |
| Den 15. i måneden | `test` | Gjenopprettingstest: siste backup gjenopprettes til en ny testdatabase (`gjenoppretting-test-ÅÅÅÅMMDDTTMM`), antall timeføringer telles og sammenlignes med produksjon, og testdatabasen slettes (også gamle testdatabaser fra kjøringer som stoppet). **Rød** hvis den gjenopprettede databasen er tom eller ikke blir lesbar. |
| Manuelt | `oppsett` | Slår på PITR og slettebeskyttelse og lager backupplanene. Rører ikke det som allerede er riktig. Kjøres én gang, og igjen hvis `status` er rød. |

En rød kjøring gir e-post fra GitHub til eieren av repoet.

## Tilganger deploy-kontoen trenger

`github-hosting-deploy@protop-c189c.iam.gserviceaccount.com` må ha:

| Rolle | Til |
|---|---|
| `roles/datastore.owner` | Slå på PITR og slettebeskyttelse, lage backupplaner, eksportere, gjenopprette og slette testdatabasen. |
| `roles/storage.admin` | Lage arkivbøtta og skrive eksporten dit. |

Feiler en handling med «Permission denied», mangler en av rollene. Eieren (rollen Owner i prosjektet)
gir dem i Cloud Shell:

```bash
SA=github-hosting-deploy@protop-c189c.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding protop-c189c --member="serviceAccount:$SA" --role=roles/datastore.owner
gcloud projects add-iam-policy-binding protop-c189c --member="serviceAccount:$SA" --role=roles/storage.admin
```

Vil eieren heller ikke gi deploy-kontoen disse rollene, kan oppsettet kjøres én gang fra Cloud Shell
med eierens egen innlogging: `bash scripts/firestore-backup.sh oppsett` (og `arkiv`). Da trenger
deploy-kontoen bare lesetilgang for den ukentlige kontrollen (`roles/datastore.backupSchedulesViewer`,
`roles/datastore.backupsViewer` og `roles/datastore.viewer`).

## Gjenoppretting: slik gjør vi det

Ta alltid stilling først: **gjelder det én bedrift, eller hele tjenesten?** Rull aldri tilbake hele
databasen for å rette data for én bedrift. Da forsvinner alt de andre bedriftene har gjort siden.

### A. Noen timer er slettet ved en feil

Leder (eller administrator) åpner **Arbeid → Godkjenninger**, blar ned til **Slettede timer**, søker
på den ansatte og trykker **Gjenopprett**. Timen legges inn igjen som ny føring med status
«registrert», og må godkjennes på nytt. Endringshistorikken på timen viser at den er gjenopprettet,
når den ble slettet og av hvem. Timer slettet før denne funksjonen kom, har bare dato, timer, prosjekt
og ansatt i loggen. Beskrivelse og klokkeslett kommer da ikke tilbake (bruk B for disse innen 7 dager).

### B. Data for én bedrift er ødelagt (innen 7 dager)

1. Finn tidspunktet før feilen (minuttet). Bruk UTC.
2. Klon databasen slik den var da, til en egen database:
   ```bash
   gcloud firestore databases clone --project=protop-c189c \
     --source-database='projects/protop-c189c/databases/(default)' \
     --snapshot-time='2026-11-02T10:15:00Z' \
     --destination-database=gjenoppretting-2026-11-02
   ```
3. Les det som trengs fra klonen (bare `families/{bedriftsId}/…`, for eksempel `timeEntries`), sammenlign
   med produksjon, og skriv tilbake bare det som mangler eller er feil. Skriv tilbake med et skript med
   Admin SDK (`databaseId: 'gjenoppretting-2026-11-02'` for lesing, `(default)` for skriving), og
   kjør det først uten å skrive (vis hva som ville blitt endret).
4. Slett klonen når du er ferdig. Den arver slettebeskyttelsen fra produksjon, så slå den av først,
   **bare på klonen**:
   ```bash
   gcloud firestore databases update --database=gjenoppretting-2026-11-02 --no-delete-protection --project=protop-c189c
   gcloud firestore databases delete --database=gjenoppretting-2026-11-02 --project=protop-c189c
   ```

### C. Feilen er eldre enn 7 dager

Som B, men gjenopprett fra en backup i stedet for å klone:

```bash
gcloud firestore backups list --project=protop-c189c
gcloud firestore databases restore --project=protop-c189c \
  --source-backup=projects/protop-c189c/locations/LOKASJON/backups/BACKUP_ID \
  --destination-database=gjenoppretting-2026-11-02
```

Eldre enn 14 uker: importer fra arkivet til en egen database
(`gcloud firestore import gs://protop-c189c-firestore-arkiv/ÅÅÅÅ-MM-DD --database=gjenoppretting-…`).

### D. Hele databasen er tapt eller ødelagt

Gjenopprett siste backup eller klon til en ny database som over, kontroller den, og bytt så produksjon.
Firestore kan ikke gjenopprette rett over `(default)`. Den gamle databasen må slettes (slå av
slettebeskyttelsen først) før den nye kan få navnet, eller appen må peke til det nye navnet. Dette er
en eierbeslutning, og kundene skal varsles (se ROS R16).

## Kostnad

PITR og backuper krever betalingsplanen Blaze (prosjektet er allerede på Blaze, siden Cloud Functions
krever det). PITR koster lagring på størrelse med databasen. Hver backup koster lagring på størrelse
med databasen, og vi har rundt 28 om gangen (14 daglige og 14 ukentlige). Arkivet ligger i Nearline.
Med dagens datamengde er dette noen få kroner i måneden. Sett et budsjettvarsel i Google Cloud (ROS R13).

## Det som ikke er dekket ennå

- **Filer i Storage** (CV-er, kvitteringer, HR-dokumenter, bilder) har ingen egen backup. Neste steg:
  slå på objektversjonering og myk sletting (soft delete) på bøtta `protop-c189c.firebasestorage.app`.
- **Arkivlåsen er ikke permanent.** Eieren kan fjerne den. En permanent lås (`gcloud storage buckets update
  --lock-retention-period`) kan ikke angres og hindrer også sletting etter GDPR i hele låseperioden. Det
  er en eierbeslutning.
- **Kopi utenfor Google.** Alle lagene ligger i samme Google-prosjekt. Mister vi tilgangen til hele
  prosjektet, mister vi også kopiene. En kopi i et eget prosjekt (eller hos en annen leverandør) med
  egne innlogginger er neste nivå.
