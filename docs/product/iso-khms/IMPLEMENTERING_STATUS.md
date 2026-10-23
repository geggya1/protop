# ISO / K-HMS – implementeringsstatus

**Dato:** 22.10.2026 · **Gren:** `iso-khms` · **PR:** #462 (ikke merget – krever uttrykkelig godkjenning før produksjon)

Modulen ligger under **ISO** i hamburgermenyen med 20 undersider. Den endrer ikke eksisterende moduler eller rammeverket: skallet viser modulbåndet (ModuleHero) og menyen, ISO viser bare innholdet. Den gamle ISO-siden (`screens/project/IsoScreen.jsx`) er ikke lenger i bruk.

---

## 1. Hva er ferdig

### Rød tråd mot resten av ProTop (lese, aldri kopiere eller skrive tilbake)

| Modul | Hva ISO henter | Hva ISO gjør med det |
|---|---|---|
| Selskapsprofil | navn, org.nr., NACE, adresse, underenheter | Fyller ut omfang, navn og lokasjon ved oppsett |
| Ansatte | navn, stilling, innlogging | Alle personvalg, rolleforslag ut fra stilling, kompetansematrise |
| Tilgangsmatrisen | ressursen `iso` | Lese / Begrenset redigering / Admin – speilet til serveren (se §3) |
| Prosjekt | prosjekter, avvik/RUH, avfall, utstyr, utlegg | Kvalitetsstatus per prosjekt, automatisk kvalitetsplan for nye prosjekter, «Ta inn» gamle avvik/RUH, avfallsgraf, utstyr (7.1), leverandørforslag |
| Kjørebok | turer, km, elbil | Kjøring per måned, elbilandel, «Bruk som miljødata», forslag til miljøaspekt |
| Fravær | sykefravær (aggregert, uten navn) | HMS-indikator per måned (bare for Begrenset redigering og opp) |
| Kontrakt / Kunder | kontrakter, oppdragsgivere | Kontraktsgjennomgang (8.2) per kontrakt, interessentforslag |
| HR – lov & ISO | sjekkliste per ansatt | Bevissthet/opplæring (7.3), mangler vises og rettes i HR |
| Skjemabygger | skjemaer | ISO lager ikke egne skjema. Skjema installeres/endres i Skjemabygger; ISO godkjenner en versjon (sjekksum) og varsler når skjemaet er endret etterpå |
| Oppgaver | `parentTodos` | Tiltak, triage, godkjenninger, prosesstrinn, påminnelser og eskalering blir vanlige oppgaver (fast nøkkel = aldri duplikater). «Ferdig i Oppgaver» vises i saken |

### Automatikk (alt som kan genereres eller foreslås, gjøres automatisk)

- **Oppsett:** skjemaet er forhåndsutfylt fra selskapsprofil og ansattregister; roller foreslås fra stillingstittel. Startpakken lager prosesser (publisert), godkjente skjema i Skjemabygger, norske lovkrav, policy- og avviksrutineutkast, revisjonsprogram og ledelsens gjennomgang.
- **Nye saker:** ansvarlig settes ut fra rollene (HMS-/miljøsaker → HMS-leder), relevante krav kobles, og triage-oppgave lages.
- **Nye prosjekter:** kvalitetsplan opprettes som utkast (krav fra kontrakten, roller, kontrollplan med faseporter) med oppgave til prosjektleder. Kan slås av i Innstillinger → Automatikk.
- **Forslag med ett trykk:** interessenter, leverandører, miljøaspekter, farer, kvalitetsplan, gamle prosjektavvik.
- **Påminnelser og eskalering:** forfalte dokumentgjennomganger, kravvurderinger, leverandørevalueringer, risiko-/aspekt-/farerevurderinger, utløpt kompetanse, øvelser og vedtak blir oppgaver. Forfalte tiltak, triage, saker og prosesstrinn eskaleres: nivå 1 til kvalitets-/HMS-leder, nivå 2 (mer enn 7 dager) til øverste ledelse.
- **Dokumenter** kobles automatisk til kravene dokumenttypen dekker.

### Sider (20)

Oversikt · Prosesser · Dokumenter · Skjemaer · Krav · Lov- og kontraktskrav · Kontekst · Mål og KPI · Avvik og forbedring · Risiko · Miljø · Arbeidsmiljø og HMS · Prosjektkvalitet · Kompetanse og ressurser · Leverandører · Beredskap · Internrevisjon · Ledelsens gjennomgang · Sertifisering · Innstillinger.

### Funksjonelle forbedringer i denne runden (C)

| Krav | Status |
|---|---|
| C1 Kvalitetsplan ved nytt prosjekt | **Ferdig.** Automatisk utkast + oppgave for prosjekter opprettet etter aktivering; forslag med ett trykk for eldre prosjekter. Idempotent (fast id `kvp_<prosjekt>`). |
| C2 Versjonssammenligning i prosessbyggeren | **Ferdig.** «Sammenlign versjoner»: nye, endrede (hvilke felt), fjernede bokser, koblinger, baner og grupper; nye/endrede merkes i diagrammet. |
| C3 Flervalg, gruppering, bedre redigering | **Ferdig.** Shift/Ctrl-klikk eller «Flervalg»-knapp (berøring), flytt flere samtidig, juster (venstre/topp/midt), fordel jevnt, dupliser med interne koblinger, slett, felles rolle, navngitte grupper (tegnes også i SVG/PDF), snarveier Delete, Ctrl+Z/Y, Ctrl+D, Ctrl+G, Ctrl+A, piltaster. |
| C4 Varsling og eskalering | **Ferdig** (via Oppgaver, se over). Ingen e-post/push utover det Oppgaver allerede gjør. |
| C5 Alle 30 skjemamaler | **Testet** fra mal → Skjemabygger (egen normalisering) → godkjent versjon → tom innsending avvist → utfylt innsending låst → rapportering (kontraktsgjennomgang per kontrakt). 13 maler håndteres i ISO-registrene (ikke som skjema) og er kontrollert at de har riktig side. |
| C6 Grafer med reelle data og drilldown | **Kontrollert.** Alle grafer bygger på lagrede registreringer; tomme data gir «ingen datagrunnlag», ikke 0 % eller 100 %. KPI-kort, trend, kravstatus, risikomatrise og avviksfaser åpner underliggende poster. Kjørebok-, fravær- og avfallsgrafer åpner kildemodulen. |
| C7 Oppstart av ISO-roller | **Ferdig.** Innstillinger → «Roller og tilgang» viser om hver rolleinnehaver har nivået rollen krever i tilgangsmatrisen, med lenke til tilgangsstyring. Ingen rolle gir tilgang til skjermede saker. |
| C8 Arbeidsflyt ISO ↔ Oppgaver/Ansatte/Prosjekter | **Testet ende til ende** (se §2). |

---

## 2. Hva er testet

| Test | Omfang | Resultat |
|---|---|---|
| Domenetester `node --test src/iso/*.test.mjs` | 26 tester: avviksflyt, lukkeregler, meldeplikt, skjerming (eier/admin uten tildeling ser ikke), fail-closed tilgang, tilgangsspeil (inaktiv ansatt, tidligere medlem, utløp), prosessvalidator, versjonslås, parallell, eksport, flervalg/grupper/sammenligning, dokumentrevisjon, alle 30 skjemamaler, drift/retting av skjema, registre, revisjonsfunn → avvik, analyse uten falske 100 %, integrasjoner, eskalering, kvalitetsplan | 26/26 |
| **Firestore-regler mot emulator** (`tests/rules/`, i CI) | 41 tester direkte mot databasen: 7 brukertyper (lese, melder, saksbehandler, ISO-admin uten HMS-tilgang, autorisert HMS-behandler, annet selskap, ugyldig tilgang: uten speil, utløpt speil, ikke innlogget) + eier, tilbaketrekking, brukerbytte, selskapsdokumentet og regresjon for eksisterende moduler | **41/41** (CI-kjøring 39845891784) |
| Bygg og `verify:web` | Hele appen bygges for web på hver PR | grønn |
| Ende til ende i nettleser (lokal rigg, Chromium) | Avvik: meld → automatisk ansvarlig → triage → beslutning → årsak → tiltak (oppgave) → lukking avvist → utført → kontroll → effekt → lukket → bevis i kravmatrisen. Prosess: mal → validering → godkjenning → publisering → kjøring med skjema → fullført; ny versjon med flervalg, gruppering, justering, Ctrl+D/Ctrl+Z og sammenligning. Ansatt med lesetilgang ser ikke skjermede saker eller innstillinger, men ser egen skjermet sak. | bestått, ingen konsollfeil |
| Visuell gjennomgang | Alle 20 sider på mobil (390 px), nettbrett (834 px) og desktop (1440 px) | rettet: rollerutenett på smal skjerm, knapper som ble for brede, filterchips på mobil, dobbel pil, rekkefølge på oversikten, nøkkeltall i samme stil som oversikten |

Ikke testet: med ekte Firebase-prosjekt (bare emulator), og Cloud Function `syncCompanyAccess` er enhetstestet via den rene beregningen, ikke deployet.

---

## 3. Sikkerhetskontroller (A1–A10)

**Funn før endringen (alvorlig):** Den rekursive regelen `match /families/{familyId}/{document=**}` ga *alle medlemmer* full lese-, skrive- og slettetilgang til *alle* selskapsdata. Fordi Firestore-regler er «eller», overstyrte den alle mer spesifikke regler. Skjerming av HMS-saker, revisjonsspor og tilgangsmatrisen var bare håndhevet i appen.

| Punkt | Tiltak | Bevis |
|---|---|---|
| A1/A2 Skjermede saker på serveren, alle ISO-samlinger | Den generelle regelen gjelder ikke lenger samlinger som starter med `iso` eller `accessAcl`. Hver ISO-samling har egne regler for get, list, create, update, delete. Ukjente `iso*`-samlinger er stengt. | regeltester «ukjente iso-samlinger», alle rolletester |
| A3 Tilgangsmatrisen håndheves på serveren | Matrisen speiles til `families/{id}/accessAcl/{uid}` av Cloud Function `syncCompanyAccess` med **samme kode som appen** (`resolveActorAccess`). Bare funksjonen (Admin SDK) og eieren kan skrive speilet. Reglene leser nivået derfra. | «ingen kan skrive tilgangsspeilet» |
| A4 Melder og autoriserte behandlere | Melder og involverte (ansvarlig, tiltakseiere – `involvedUids`) ser egen sak og kan oppdatere tiltak, ikke status, innhold eller lukking. Personer på listen ser og behandler alle. | «melder», «autorisert behandler» |
| A5 Ingen automatisk tilgang til skjermede opplysninger | Bare personer uttrykkelig ført opp i `isoRestricted/main`. Verken eier, ISO-admin, HMS-leder eller systemansvarlig får det automatisk. Bare eier – eller en på listen som også er ISO-admin – kan endre listen. | «ISO-administrator uten særskilt HMS-tilgang», «eier» |
| A6 Revisjonsspor | `isoAudit` og `isoAuditRestricted`: bare opprett, med egen uid som aktør. Endring og sletting avvises for alle, også eier. Skjermede saker logges i egen samling. | «revisjonsspor kan ikke endres» |
| A7 Lekkasje via andre veier | Bevis fra skjermede saker får ingen detaljer i etiketten. Oppgaver og eskaleringer fra skjermede saker får nøytral tittel og tekst. Lokal kopi (cache) inneholder aldri skjermede saker og er per bruker og selskap. Bevispakke utelater skjermede bevis. | domenetest «skjermet sak: bevis får ingen detaljer», eskaleringstest |
| A8 `isoCapabilities()` og manglende data | Fail-closed: mangler tilgangsdata, gis ingen tilgang. Serverens nivå (speilet) begrenser klienten. Mangler eller er speilet utløpt (12 t), avviser reglene alt. | domenetest «manglende tilgangsdata», regeltester «uten speil», «utløpt speil» |
| A9 Flytting åpen ↔ skjermet | Én transaksjon: ny kopi skrives og gammel slettes samtidig, ellers ingenting. Reglene tillater sletting av åpen sak bare når den skjermede kopien finnes etter batchen (`existsAfter`), og omvendt. | «flytting åpen → skjermet skjer atomisk; sletting alene avvises» |
| A10 Øvrige selskapsdata | Selskapsdokumentet: vanlige medlemmer kan ikke lenger endre eier, administratorliste eller tilgangsmatrisen, eller slette selskapet. Se åpne funn under. | «selskapsdokumentet» |

**Andre serverkontroller:** lukking krever ISO-admin, triage, beslutning, begrunnelse, egen uid som lukker, verifisert effekt når det kreves og bekreftet meldeplikt. Kansellering krever admin. Publiserte prosess-/dokumentversjoner kan ikke endres (bare admin kan publisere). Styrte skjema bare admin. Innsendte registreringer er låst; retting bare av admin, med rettelse og uendret kjerne. Låste registre (godkjent revisjon/gjennomgang) bare admin. Ingen sletting av ISO-data.

### Åpne funn som må godkjennes eller tas i egen runde (ikke rettet for å ikke endre andre moduler)

1. **HR, ansatte og øvrige moduler** er fortsatt lesbare og skrivbare for alle medlemmer av selskapet. HR-tilgangen i matrisen håndheves bare i appen. Anbefaling: bruk det nye tilgangsspeilet (`accessAcl.grants`) også for `hr/**` og `employees` i en egen, testet runde.
2. **Ansattkortet kan endres av alle medlemmer**, også tilgangsnivå og avvik på eget kort. Det betyr at en medlem i teorien kan øke egne rettigheter i matrisen, og dermed også sitt ISO-nivå etter neste synk. Særskilt tilgang til skjermede saker påvirkes **ikke** (egen liste). Anbefaling: beskytt `company.accessLevel(s)`, `accessOverrides`, `status` og `personUid` på samme måte som tilgangsmatrisen i selskapsdokumentet.
3. **Handlelister** har en egen medlemsregel som i praksis overstyres av den generelle regelen (alle medlemmer får tilgang). Uendret oppførsel; dokumentert i regeltest.
4. For selskaper som ikke bruker ISO (ingen speil) gjelder tidligere oppførsel for endring av tilgangsmatrisen, slik at ingenting endres for dem.

---

## 4. Avvik fra den opprinnelige kravspesifikasjonen

- **Skjemabygger:** spesifikasjonen beskriver en egen skjemabygger i ISO. Den er erstattet av ProTops eksisterende Skjemabygger (ingen duplikat); ISO gjør versjonsstyring, godkjenning og låste registreringer.
- **Egne ISO-tilganger:** spesifikasjonen har egne ISO-roller med tilgang. Tilgang styres i ProTops tilgangsmatrise; ISO-roller bestemmer bare oppgavemottakere. Særskilt tilgang til skjermede saker er egen liste i ISO.
- **Tilgangsnivå tilbakekalles innen 12 timer** uten triggerne, straks med triggerne (§5). Medlemskap fjernes straks.
- **Ekstern revisorinnlogging og offline** er utsatt (avtalt). Revisor får bevispakke (PDF).
- **BPMN-import/eksport** er ikke laget; ProTop-JSON, SVG, PNG og PDF finnes.
- **Normativ kravtekst** er egne sammendrag, merket «ikke faglig validert».

## 5. Må godkjennes før produksjon

1. Gjennomgang og godkjenning av de nye Firestore-reglene (gjelder alle moduler) og av åpne funn i §3.
2. Utrulling i rekkefølgen i `UTRULLING.md`: **funksjonen først, så reglene, så web**. Reglene uten funksjonen gir ISO-tilgang bare til eier.
3. Test i separat Firebase-prosjekt med representative brukere før `protop-c189c`.
4. Manuell deploy av triggerne `onCompanyAccessChanged` / `onEmployeeAccessChanged` (CI-kontoen kan ikke).
5. Faglig kvalitetssikring av kravbiblioteket før det omtales som validert.

## 6. Datamodell (Firestore)

```
families/{id}/accessAcl/{uid}               tilgangsmatrisen speilet (skrives av Cloud Function / eier)
families/{id}/isoRestricted/main            uttrykkelig særskilt tilgang til skjermede saker
families/{id}/isoSystem/main                omfang, standarder, roller, risikometode, automatikk
families/{id}/isoFindings/{id}              avvik, hendelser, tiltak (involvedUids for reglene)
families/{id}/isoFindingsRestricted/{id}    skjermede HMS-/personsaker
families/{id}/isoProcesses/{id}             prosess + versjoner (diagram med grupper)
families/{id}/isoInstances/{id}             kjørende saker låst til prosessversjon
families/{id}/isoDocuments/{id}             styrte dokumenter + revisjoner + lesebekreftelser
families/{id}/isoForms/{id}                 styrte versjoner av Skjemabygger-skjema (sjekksum)
families/{id}/isoSubmissions/{id}           låste registreringer
families/{id}/isoRequirements/{id}          egne krav
families/{id}/isoAssessments/{id}           vurdering per krav
families/{id}/isoEvidence/{id}              bevis (uforanderlig)
families/{id}/isoEvidenceLinks/{id}         bevis ↔ krav
families/{id}/isoRecords/{id}               registre (risiko, miljø, farer, kompetanse, leverandør, mål, revisjon, ledelse, beredskap, kvalitetsplan …)
families/{id}/isoAudit/{id}                 revisjonsspor (bare opprett)
families/{id}/isoAuditRestricted/{id}       revisjonsspor for skjermede saker (bare opprett)
```

Indekser: ingen nye sammensatte indekser trengs (spørringene bruker enkeltfelt og `array-contains`, som indekseres automatisk).
