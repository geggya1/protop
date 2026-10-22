# ISO / K-HMS – implementeringsstatus

**Dato:** 22.10.2026 · **Gren:** `iso-khms` · Erstatter den gamle ISO-siden (`screens/project/IsoScreen.jsx`, ikke lenger i bruk).

## 1. GAP-analyse – hva ble gjenbrukt

| ProTop-del | Bruk i ISO-modulen |
|---|---|
| Selskap (`families/{companyId}`) og Firestore-regler | All ISO-data ligger under selskapet. Selskapsisolasjon via eksisterende medlemsregler (A12). |
| Tilgangsmatrisen (`src/access/companyAccess.js`) | Ressursen `iso` (Lese / Begrenset redigering / Admin) + ny `isoRestricted` for skjermede HMS-saker. Ingen egen brukerliste. |
| Ansattregisteret (`watchEmployees`) | Alle personvalg (ansvarlig, eier, revisor, kompetansematrise). |
| Prosjekter (`loadProjectState`) | Avvik, risiko, kvalitetsplaner og prosessinstanser knyttes til eksisterende prosjekt-ID. |
| Oppgaver (`families/{id}/parentTodos`) | Tiltak, triage, vedtak, godkjenninger og prosesstrinn blir vanlige ProTop-oppgaver. Deterministisk dokument-id gir ingen duplikater ved retry (A15/T27). |
| Designsystem (`useColors`, `DateField`, Ionicons) | Alle skjermer bruker eksisterende tokens, lys/mørk. |
| Skall/navigasjon (`shellModules.js`, `AppShell`) | ISO har egen undermeny (20 sider) i skuff/rail og fanerad i modulen. |
| Gammel ISO-side (prosjekt-revisjoner) | Eldre revisjonsregistreringer vises uendret under Internrevisjon. |

Leverandører har ingen egen master i ProTop; leverandørregisteret i ISO har org.nr. for kobling mot kunderegisteret senere.

## 2. Datamodell (Firestore)

```
families/{companyId}/isoSystem/main               omfang, standarder, roller, risikometode (versjonert)
families/{companyId}/isoFindings/{id}             avvik, hendelser, tiltak, effektkontroll
families/{companyId}/isoFindingsRestricted/{id}   skjermede HMS-/personsaker (egen samling)
families/{companyId}/isoProcesses/{id}            prosess + versjoner (diagram, status, godkjenning)
families/{companyId}/isoInstances/{id}            kjørende saker låst til prosessversjon
families/{companyId}/isoDocuments/{id}            styrte dokumenter + revisjoner + lesebekreftelser
families/{companyId}/isoForms/{id}                skjemadefinisjoner (versjonert)
families/{companyId}/isoSubmissions/{id}          låste registreringer med skjemaversjon og sjekksum
families/{companyId}/isoRequirements/{id}         egne krav (lov, kontrakt, intern, anbefalt)
families/{companyId}/isoAssessments/{id}          vurdering per krav
families/{companyId}/isoEvidence/{id}             bevis (lagres én gang)
families/{companyId}/isoEvidenceLinks/{id}        bevis ↔ krav (mange-til-mange, vurderes hver for seg)
families/{companyId}/isoRecords/{id}              registre: risiko, miljø, farer, kompetanse, leverandør, mål, revisjon, ledelse, beredskap …
families/{companyId}/isoAudit/{eventId}           revisjonsspor (aktør, tid, handling, sjekksum før/etter)
```

Hver lagring er en transaksjon med revisjonslås (`rev`): er posten endret av en annen, avvises lagringen i stedet for å overskrive. ISO-kravbiblioteket (kap. 4–10 for 9001:2026, 14001:2026, 45001:2018+A1:2024) genereres fra `src/iso/catalog.js` med egne sammendrag – ingen beskyttet standardtekst – og er merket «ikke faglig validert».

Ingen migrering av eksisterende data er nødvendig. Tilbakeføring: fjern menyvalget og importen av `screens/iso/IsoScreen.jsx`; ISO-samlingene kan ligge urørt.

## 3. Implementert (fra frontend til lagring)

| Område | Status |
|---|---|
| Oversikt (U01) | KPI-kort med metode og drilldown, nye/lukkede avvik per måned, «lukket innen frist» med n/N, kravstatus-ring, 5×5 risikomatrise (iboende/rest), avvik etter fase, mine oppgaver, kommende aktiviteter. Alt fra reelle data. |
| Avvik og forbedring (U12, P02, SF16–18) | Hele flyten registrert → triage → vurdert → årsak → tiltak (oppgave) → kontroll → effekt → lukking. Lukking avvises med konkret mangelliste (A07/T10). «Ikke verifisert» gjenåpner (T11). Meldeplikt, strakstiltak, skjermet sak, gjenåpning, kansellering, historikk og revisjonsspor. Lukket sak blir bevis i kravmatrisen. |
| Prosessbygger (U04, M03) | Lerret med dra-og-slipp, snap-to-grid, zoom/pan, 17 nodetyper, koblinger med vilkår (Ja/Nei/Godkjent/Avvist/Ellers), ansvarsbaner, farger, klikk- og utføringshandling, angre/gjør om, dupliser, validering med feil per node, send til godkjenning, godkjenn/avvis, publisering, ny versjon, arkivering. Eksport SVG/PNG/PDF/JSON og import av JSON. 14 maler (P01–P13, SJA). |
| Kjøring av prosess | Start fra publisert versjon (knyttes til prosjekt), aktivt trinn markert, beslutninger og godkjenninger med valg, parallell split/join, skjema i trinn, hendelseslogg, avbryt. Saker beholder versjonen de startet på (A05). Mobil har fokusvisning nå/neste. |
| Dokumentstyring (U06, P09) | Revisjoner utkast → gjennomgang → publisert → erstattet; publisert er låst (A06/T03); vedlegg, kravkoblinger, lesebekreftelse, gjennomgangsfrist, arkiv. Ny revisjon flagger koblede krav for ny vurdering. |
| Skjemabygger (M05) | 25 felttyper, betinget visning/krav, beregnet felt, tabellrader, versjoner, publisering, forhåndsvisning, låste registreringer med sjekksum og idempotent innsending. SF01–SF30 som maler. SF16 oppretter avvikssak. |
| Kravmatrise og lovkrav (U07/U08) | Filter, tabell/mobil, eksport (CSV), kravtyper skilt (A19), bevis per krav med godkjenning, «Internt verifisert» krever godkjent bevis + begrunnelse, ikke-relevans bare der tillatt, forfalt vurdering vises som «Må revurderes» (A10/T14). Norsk regelverkslag og samsvarsvurderinger (SF26). |
| Øvrige registre | Kontekst, interessenter, risiko og muligheter, miljøaspekter og miljødata, farer og medvirkning, beredskap med nødvisning og øvelser, kompetansekrav/-bevis med heatmap, leverandører, mål med målinger, prosjektkvalitet, internrevisjon med funn → avvik (A08), ledelsens gjennomgang med låst grunnlag og vedtak → oppgaver (A16/T17), sertifikater og bevispakke (PDF). |
| Innstillinger | Standarder, omfang, roller (→ oppgavemottakere), risikoterskler med metodeversjon. Endret omfang flagger krav for ny vurdering (T02). Ingen eksempeldata (T30). |
| Tilgang | Rolle (Lese/Begrenset/Admin) og objekt (meldt av / tildelt). Skjermede saker filtreres før liste, søk, grafer og eksport, og ligger i egen samling som bare hentes med tilgang (A11 i klient). |

## 4. Tester

- `src/iso/iso.test.mjs` (19 tester, lagt inn i `verify:web`): avviksflyt, gjenåpning, lukkeregler, meldeplikt, skjerming, bevis til flere krav, ikke-relevans, prosessvalidator, alle maler gyldige, publisering/versjonslås, parallell, eksport, dokumentrevisjon, skjemaregler/idempotens, risiko iboende/rest, samsvar aldri «verifisert», kompetanse utløpt, revisjonsfunn → avvik, analyse uten falske 100 %.
- Ende-til-ende i nettleser (Chromium, lokal testrigg med minnelagring): avviksflyt fra «Meld avvik» til lukket sak med bevis i matrisen, og prosess fra mal → validering → godkjenning → publisering → kjøring med skjema → fullført. Alle 20 sider rendret på 1440 px og 390 px uten feil.
- `verify-pr.yml`: bygger web og kjører `verify:web` på pull requests uten å publisere.

## 5. Mangler og begrensninger (ærlig)

1. **Serverhåndhevet skjerming.** Firestore-reglene gir alle medlemmer av selskapet tilgang til selskapets dokumenter, også `isoFindingsRestricted`. Skjermingen er i dag håndhevet i appen. For full A11/T23 må reglene få en rolle-/tilgangssjekk for denne samlingen og `isoAudit` gjøres «bare opprett». Krever regelendring og deploy av regler (gjøres ikke av hosting-workflowen).
2. **Ekstern revisor** får bevispakke (PDF), ikke tidsstyrt innlogging.
3. **Prosessbygger:** ikke flervalg/gruppering, versjonssammenligning eller BPMN. Skjemabyggeren sorterer med opp/ned, ikke dra.
4. **Varsling ved fristbrudd** skjer via frister i ProTop-oppgaver; ingen egen eskaleringsjobb.
5. **Prosjektintegrasjon:** kvalitetsplan, risiko og kontroller kobles til prosjekt fra ISO-siden, men opprettes ikke automatisk når et prosjekt opprettes.
6. **Konsern med flere sertifiseringsomfang** beskrives i omfangsteksten; ett ledelsessystem per selskap.
7. **Offline-utkast** støttes ikke utover lokal visningskopi.
8. **Normativ kravdekning** må kvalitetssikres av ISO-fagperson mot lisensierte standarder før den omtales som validert.
