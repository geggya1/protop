# 03 – Full katalog for grafer, indikatorer, matriser og visuell rapportering

**Regel:** Alle tall under er FIKTIVE eksempler, ikke sertifiseringsresultat. Hver visualisering har egen kilde, filter, datoperiode, oppdateringstid, tilgjengelighet og detaljerbar datatabell. Verken dashboard eller ISO-krav kan markeres etterlevd utelukkende av en graf.

## Felles datakontrakt for visualiseringer

```ts
type VizContext = {
  tenantId: string; legalEntityIds: string[]; siteIds?: string[];
  projectIds?: string[]; standards?: Array<'9001'|'14001'|'45001'>;
  range: {from: string; to: string; timezone: string};
  granularity: 'week'|'month'|'quarter'|'year';
  filterVersion: string;
};
type VizValue = {
  key: string; label: string; value: number | null; unit: string;
  denominator?: number; numerator?: number; method?: string;
  timestamp: string; sourceEntityIds: string[]; dataQuality?: 'verified'|'estimated'|'incomplete';
};
```

Indikator vises aldri som 100 % hvis nevner er null; returner `ingen datagrunnlag`. Rekalkuler ved endret filter eller policy. Oppgi eksplisitt beregningsmetode, eier av data, sist oppdatert og eventuelle forbehold. Bruk ikke samlet «ISO-score». Ikke sammenlign organisasjonsenheter med forskjellig datadekning uten advarsel.

## G01–G20 – Visualiseringskomponenter

| ID | Visning | Hensikt og kilde | Interaksjon |
|---|---|---|---|
| G01 | **KPI-kort** med status og endring | Åpne avvik, forfalt tiltak, revisjoner, manglende kompetanse (`findings`, `actions`, `audits`, `competence`) | Klikk åpner forhåndsfiltrert register; info viser definisjon |
| G02 | **Tidsseriegraf (linje)** | Nye/lukkede avvik per måned; X=tid, Y=antall | Hover serien, velg dato/serie → sakslisten |
| G03 | **To-akse trend ved ulik enhet** | F.eks. avviksvolum + avslutningstid; fortrinnsvis to separate grafer fremfor forvirrende dobbel akse | Marker periode og åpne årsaksanalyse |
| G04 | **Stablet stolpediagram** | Åpne saker etter alvorlighet eller virksomhet og kategori | Klikk segment → filter |
| G05 | **Horisontale stolper** | Topp 10 avviksårsaker / prosesser med flest funn | Klikk rad → aktuelle funn |
| G06 | **Pareto-diagram** | Avviksårsaker sortert synkende med akkumulert prosent | Klikk årsak → funn og tiltak |
| G07 | **Donut-ring** | Fordeling av internt vurderte kravstatuser (ikke ISO-godkjenningsgrad) | Klikk segment → kravmatrise |
| G08 | **Gruppert stolpe** | Nye vs. lukkede avvik per måned | Klikk periode → saksliste |
| G09 | **5×5 risikomatrise** | Risikoer etter sannsynlighet × konsekvens, med referanse til metodeversjon | Klikk celle → registreringer; velg iboende/rest |
| G10 | **Miljøaspektmatrise** | Vesentlighetsvurderinger etter godkjente kriterier (konfigurerbare) | Klikk aspekt → vurdering og tiltak |
| G11 | **KPI-gauge / måloppnåelse** | Målt verdi vs. målsatt terskel, med enhet og datakvalitet | Klikk → tidsserie, måldefinisjon, tiltak |
| G12 | **Kompetanse-heatmap** | Roller/ansatte × rollekrav: gyldig, mangler, utløper | Klikk celle → kompetansebevis og oppgave |
| G13 | **Revisjonskalender** | Planlagte, gjennomførte, forsinkede revisjoner/øvelser | Dato-klikk → revisjon/øvelse |
| G14 | **Gantt/framdrift** | Plan vs. faktisk for internrevisjon og forbedringstiltak | Klikk stolpe → oppgave og avhengigheter |
| G15 | **Funnel / fasefordeling** | Avvik etter arbeidsflytfase (registrer→vurder→tiltak→effekt) | Klikk trinn → oppgaver som står fast |
| G16 | **Sankey/prosessgjennomløp** | Antall saker gjennom ulike godkjenningsgrener (valgfri analysefunksjon) | Klikk kant → saker |
| G17 | **Swimlane-flytskjema** | Ansvar og rekkefølge i prosesstrinn | Klikk boks → handling, dokument, sak |
| G18 | **Prosesslandskap** | Overordnet kart: ledelse/kjerne/støtte, avhengigheter | Klikk prosess → detaljer og aktive instanser |
| G19 | **Hierarkisk organisasjonskart** | Selskap, avdeling, prosessansvar, HMS-roller | Klikk rolle → eier/kompetanse |
| G20 | **Historikk-/hendelsestidslinje** | Avvik, dokumentrevisjoner, godkjenninger, hendelseslogg | Klikk hendelse → bevis og detaljer |

## Grafregler og eksakte formler

### KPI – antall åpne avvik
`count(findings where type in scope AND status not in {CLOSED, CANCELLED})`
- Avgrens personvern ved skjermede HMS-funn: generisk aggregert tall bare ved godkjent terskel; ikke infer personsak via filter.

### KPI – forfalte tiltak
`count(actions where due_at < now AND status not in {DONE, CANCELLED})`. Dato i valgt tidssone, unngå å telle fremtidige frister, og inkluder rettighetsstyrt aggregasjon.

### «Lukket innen frist»
`count(eligible cases closed_at <= agreed_due_at) / count(eligible closed cases with agreed_due_at)` × 100; vis n/N, ekskluderte, metodeversjon og tidspunkt. Endring av frist logges med begrunnelse.

### ISO-statusring
- Alle kravpostene gis én av konfigurerte vurderingsstatuser per omfang, standardversjon og dato.
- Vis antall per status. Ikke beregn «sertifiseringsgrad» av prosent interne sjekker.
- Hvis det ønskes indikator, kall den «andel krav med intern vurdering» og oppgi `internt vurderte / relevante` med tydelig forbehold.

### Risikomatrise
- Antall risikoer per `likelihood(1–5)`, `consequence(1–5)` etter skala versjon, type og siste aktive vurdering.
- Risikoklasse må komme fra godkjent risikopolicy, f.eks. terskelmatrise. Ikke anta at produktet alene er korrekt risikomåling.
- `iboende` og `rest` er egne vurderinger. Må aldri glides sammen i aggregat.

### Miljødata
- Enhetskontroll: kWh, kg, tonn, km, liter, CO₂e etc. Målegrunnlag, metode og konverteringsfaktor/versjon er obligatorisk ved omregninger.
- «CO₂e» kalkuleres bare dersom virksomheten har valgt dokumentert beregningsmetode og gyldige faktorer med kilde og år.
- Tillat `ukjent`, `estimert`, `målt` og prøvemengde. Visualiser usikkerhet hvis relevant.

### Revisjonsprogram
- `planlagt`, `pågår`, `gjennomført`, `forsinket`, `avlyst` knyttes til juridisk enhet, prosess, omfang og revisjonsår.
- Internrevisjonsfrekvens er resultat av vedtatt risikobasert program, ikke automatisk «månedlig» eller «per prosjektfase».

## Interaksjonskontrakt for alle grafer

1. Hovedfilter styrer alle underliggende visualiseringer; lokal serie-toggle endrer bare grafens serie.
2. Grafpunkter bruker `queryState` for å navigere til register; samme totalsum må kunne avstemmes mot registeret.
3. Gjelder `sensitive=true`, må serveren returnere autorisert, aggregerbart utsnitt uten å lekke eksistens/metadata om skjermede saker.
4. CSV/Excel/PDF-eksport benytter samme filter, eventuelle sladdevalg og angir filter og eksportdato.
5. Ved nullserie eller små datamengder: vis korrekt tomtilstand, ikke pyntet kurve.
6. Vær bevisst tilgjengelighet: datatabell, tastaturnavigasjon, lesbare labels, farger+tekst, skjermlesertittel.
7. Aggregering følger `entityId`, `projectId`, `period`, `status`, `category`; dedupliser delte bevis som ellers kan gi dobbelt telling.

## Demoeksempler (kun testfixture)

- Avvik per måned, januar–juni: nye `[7,5,10,8,6,9]`, lukket `[4,7,8,6,7,8]`.
- Statuskrav (illustrasjon, n=100): internt verifisert 49, bevis foreligger 20, under arbeid 15, mangler 9, avvik 4, må revurderes 3.
- Miljøtransport (illustrasjon): km per kvartal `[2200,1970,1810,1620]`.
- Forsinkede tiltak: `4` (eksempel, ikke ekte kunde).

Se `ProTop_ISO_INTERAKTIV_PROTOTYPE.html` for klikkbare demonstrasjoner.
