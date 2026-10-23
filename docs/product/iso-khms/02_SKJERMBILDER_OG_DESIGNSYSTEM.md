# 02 – Skjermbilder, navigasjon, layout og visuelle komponenter

**Hovedmål:** Brukeren skal kunne styre ISO-ledelsessystemet ved å utføre arbeid. Ikke lag et oppslagsverk med statiske prosedyrer som primærfunksjon.

## Designprinsipper og tokens

- Bevar ProTops eksisterende designprofil – mørke flater, moderne kort, presis typografi, nøytrale skiller og begrenset bruk av farge. Prototypens mørke visning er demonstrasjon, **eksisterende globale tokens har forrang**.
- Desktop: venstremeny 248–272 px, toppnavigasjon med selskap, enhet, søk, varsler, bruker; innhold maks 1440–1600 px; kortgrid på 12 kolonner; høyre kontekstpanel 340–420 px.
- Mobil: én kolonne, flytende/innfelt modulhandling og eksisterende trygg bunnnavigasjon. Prosesscanvas vises som fokusert «gjeldende trinn» + fullskjerm panorering. Ingen horisontal overflow på forms.
- Klare statusnavn, ikke kun farger: `Ikke vurdert`, `Mangler`, `Under arbeid`, `Bevis tilgjengelig`, `Internt verifisert`, `Avvik`, `Må revurderes`. Ikon + tekst + tooltip.
- Farger (kun illustrasjon): aksentblå #2F9EF6, bakgrunn #090D14, overflater #111925 / #172131, tekst #ECF2F8, sekundær #91A0B3, grønn #31C48D, gul #FFBE55, rød #FF6875. Risikonivå merkes også med tekst/tall.
- Typografi: store moduloverskrifter maks 28px desktop/23px mobil; seksjonsoverskrift 17–19px; datatabeller 13–14px; minimum interaktive mål 44×44 mobil.
- På alle sider: brødsmulesti, moduloverskrift, kort forklaring, standard-/selskap-/enhets-/prosjektfilter ved behov, primær CTA, sist oppdatert, rettighetskontroll, tom-/feil-/lastetilstand.
- Separat visning for `Kilde`, `Beregning`, `Oppdatert`, `Vurdert av`, `Bevis` når bruker holder over eller klikker en indikator.

## Sider og brukerhandlinger (full katalog)

### U01: Ledelsessystemets startside
- Øverst: valgt virksomhet / sertifiseringsomfang / aktive standarder og versjoner.
- KPI-kort: åpne avvik, forfalte tiltak, kommende revisjoner, dokumenter til godkjenning, kompetansegap, lovkrav til vurdering.
- 2 grafer: avvik/trend med periode og område; status per standard/kravområde. 1 risikomatrise og 1 aktivitetsliste.
- CTA: `Registrer avvik`, `Start risikovurdering`, `Åpne revisjonsplan`, `Opprett prosess`.
- Grafklikk: åpne filtrert saksliste, aldri statisk visuelt kort.

### U02: Ledelsessystem/sertifiseringsomfang
- Scope-veiviser: juridiske enheter, aktiviteter, tjenester, lokasjoner, leveranser, standarder, eventuelle relevans-/ikke-anvendbarhetsbegrunnelser der tillatt.
- Vis omfang som hierarkisk tre; hver node med eier og vurderingsstatus.
- Advarsel ved endring: påvirkede krav, prosesser, dokumenter og sertifiseringsopplysninger må revurderes.

### U03: Prosesslandskap – klikkbart selskapskart
- Toppnivå: ledelsesprosesser → kjerneprosesser → støtteprosesser. For rådgiver: salg/anbud → kontrakt → oppstart → prosjektering/oppfølging → kontroll → levering → evaluering.
- Hver prosessboks viser eier, status og «åpne», og kan både gå til prosessdetalj og til aktiv instans.
- Filtre på enhet, standard, fag, status; drill-down ned til delprosesser.

### U04: Prosessbygger/designer (desktop)
- Layout: **nodepalett** venstre, **uendelig canvas** midten, **egenskapspanel** høyre, **versjon/verktøylinje** øverst.
- Palett: Start, slutt, aktivitet, beslutning, skjema, kontrollpunkt, dokument, godkjenning, oppgave, vent/timer, systemhandling, underprosess, parallell split/join.
- Vis nodevalget i inspector: tittel, beskrivelse, rolle, trigger, input, output, frist, skjemamodell, lenke, vilkår, kravkobling, nødvendige rettigheter.
- Canvas: dra/slipp, koblingshåndtak, pan/zoom, grid/snap, alignment, undo/redo, flytting, klone, gruppe, kommenter, version compare.
- Klikk på node i lesevisning åpner tilgjengelig handling; i designer åpner det egenskaper (ikke start automatikk).
- Publisering: valider graf (start/slutt, reachability, grenregler, referanser, eier/roller, versjon), send til godkjenning, publiser.
- Aktiv prosessinstans: tydelig markert gjeldende node, eier, frister, ferdige trinn, hendelser og avvik.

### U05: Prosessdetalj og prosessbibliotek
- Prosessoversikt med søk, kategorier, status, revisjon, eier og revisjonsdato.
- Eksempelvis «Kundekrav og kontraktsgjennomgang»: prosesskart, input/output, tilknyttede dokumenter, KPI og risikoforhold.
- `Bruk prosess` oppretter instans knyttet til eksisterende Prosjekt, Kunde eller Ansatt.

### U06: Styrende dokumenter
- Tabell/kort: ID, tittel, dokumenttype, revisjon, status, eier, godkjent dato, neste vurdering, kravkoblinger.
- Dokumentdetalj: les, metadata, endringslogg, kommentarer, relaterte krav, prosesstrinn; `Lag ny revisjon`, `Send til godkjenning`, `Publiser`, `Arkiver` (rollebegrenset).
- Publiserte versjoner skrivebeskyttet; innsendt/skjema-registrering låser signerte felt.

### U07: ISO-kravmatrise
- Sticky tabell med standard, versjon, klausul, vurdert relevans, prosesseier, bevis, sist vurdert, status, neste kontroll.
- Eksport med evidensliste; hurtigpanel med detaljer; filtrer «ikke bevis», «forfalt», «krav berørt av revisjon».
- `Internt verifisert`: autorisert fagperson må se faktisk bevis og begrunne sin vurdering.

### U08: Kravregister – norske lover, kontrakt og interne krav
- Kilde, konkret anvendelse, eier, vurderingsmetode, vurderingsdato, oppfølgingsfrister, vedlegg, avvik.
- Ukjent/endres? Flagges `Krever juridisk/ansvarlig vurdering`, ikke grønt.

### U09: Risiko og muligheter
- 5×5 varmekart med **konfigurerbar** risikoskalaversjon, tapelliste, tiltak, iboende/rest-risiko, historikk.
- Riskwizard med kontekst, fare/hendelse, konsekvens, sannsynlighet, eksisterende tiltak, metode, ansvar, revurdering.
- Anvend risikohierarki i HMS; avviks- eller endringssak kan trigge revurdering.

### U10: Miljøaspekter/14001
- Miljøaspektregister, vesentlighetsmatrise, livsløpstrinn, normal/avvik/beredskap, påvirkningsområde, kontroll vs innflytelse.
- Visualiser miljødata over tid (transport, energiforbruk, materialer, avfall) **bare ved faktiske data og riktig enhet/metode**.
- Avvik eller vesentlig endring kan trigge ny miljøaspektvurdering.

### U11: Arbeidsmiljø/45001
- HMS-bildet: farekartlegging, organisatoriske og psykososiale forhold, ergonomi, vernerunder, medvirkning, beredskap, tiltak.
- Skjermede person- og helseopplysninger håndteres separat, inkludert rapporter, varsel og søk.
- Vis når SJA, spesialopplæring, BHT/AMU/verneombud er aktuelt ut fra risiko og rettslig kontekst – ikke som generelt ISO-påbud.

### U12: Avvik og forbedringer
- Register med statuskolonner, kategorier, alvorlighet, ansvar, frist, bevis; quick action `Nytt avvik`.
- Detaljside: tidslinje, klassifisering, strakstiltak, årsak, handlingsplan, gjennomføring, effektkontroll, lukking, hendelseslogg.
- Tilknyttet prosjekt, prosessinstans, dokument, ISO-krav, risikopost og revisjonsfunn.

### U13: Kompetanse og opplæring
- Heatmap personer/roller × kompetansekrav. Utløp/utfordring før fornyelse, dokumentasjon og effektvurdering.
- Røde celler krever handling og kan kobles til prosjektoppgaver/rollebegrensning, avhengig av kvalifikasjonskrav.

### U14: Internrevisjoner
- Revisjonskalender og program, revisoruavhengighet, omfang, sjekkliste, prøver, dokumentasjon, funn og rapport.
- Fra funn: `Opprett avvik` koblet til riktig krav/prosess; ferdig rapport kan distribueres, ingen stilletiende endring.

### U15: Ledelsens gjennomgang
- Plan/agenda, automatisk evidenspakke, KPI-er/trender, status på tidligere vedtak, beslutninger/ansvar og signert referat.
- Vedtak genererer oppgaver og kan trigge dokument-/prosessrevisjon.

### U16: Beredskap
- Scenario, varsling, roller, kontaktkjede, instrukser og øvelser; «nødvisning» for mobil med relevante detaljer.
- Øvelser registreres, evalueres og kobles til korrigerende tiltak.

### U17: Mål og KPI-analyse
- Oversikt per mål med enhet, baseline, mål, nåverdi, historikk, eier, dataansvar og tiltak.
- Bruk grafer definert i fil 03; alle drilldowns må hente samme filtrerte datasett som kilden.

### U18: Leverandører og tjenestekvalitet
- Kritikalitet, kvalifisering, oppfølging, leveranser, evaluering, avvik, sertifikater og re-vurdering.
- Knyt relevante godkjenninger til eksisterende Leverandør-/Kunde-/Avtale-objekter, ikke opprett duplikater.

### U19: Sertifisering/revisjonsrom
- Registrerte standarder/sertifikat og utløpsdato, kommende ekstern revisjon, redaktørstyrte bevispakker.
- Ekstern revisor: tidsavgrenset read-only-tilgang, utvalg og sladding; logging av visning og eksport.

### U20: Skjema- og malbibliotek
- Velg mal, klon, rediger felt, forhåndsvis, versjoner, godkjenn og publiser.
- Preview på mobil/desktop. Vis avhengigheter til aktive prosessversjoner før publisering eller fjerning.

## Eksempellayout desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ProTop  > Bedrift > ISO / K-HMS                 Søk   Bedrift▼  Varsler  ◉    │
├────────────────┬─────────────────────────────────────────────────────────────┤
│ ISO/K-HMS      │ OVERSIKT                          [Standard▼][Periode▼]   │
│  Oversikt      │ [Avvik] [Forfalt] [Revisjon] [Lovkrav] [Kompetansegap]     │
│  Prosesskart   │ ┌──────────────────────────┬──────────────────────────────┐ │
│  Prosessbygger │ │ Avvik over tid [trend]   │ Intern vurderingsstatus     │ │
│  Kravmatrise   │ └──────────────────────────┴──────────────────────────────┘ │
│  Risiko        │ ┌──────────────────────────┬──────────────────────────────┐ │
│  Miljø         │ │ Risikomatrise            │ Oppgaver / varsler          │ │
│  HMS           │ └──────────────────────────┴──────────────────────────────┘ │
│  Avvik         │                                                             │
│  ...           │                                                             │
└────────────────┴─────────────────────────────────────────────────────────────┘
```

## Eksempellayout prosessbygger

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Tilbake] Avvikshåndtering   v3 Utkast  [Angre] [Valider] [Send til godk.] │
├────────────────┬─────────────────────────────────┬───────────────────────────┤
│ NODEPALETT     │ CANVAS                          │ EGENSKAPER – valgte node  │
│ ○ Start        │                                 │ Tittel: [Vurder avvik]    │
│ ▭ Aktivitet    │    [Registrer]                  │ Rolle:  [Kvalitetsleder]  │
│ ◇ Beslutning   │         │                       │ Handling: [Åpne skjema]   │
│ ▤ Skjema       │    [Vurder]──►◇──►[Tiltak]      │ Skjema:  [SF-AVV-01]     │
│ ✓ Godkjenning  │                  └►[Begrunn]     │ Bevis:   [Saksregister]   │
│ ◉ Oppgave      │                                 │ ISO:     [9001 10.2]     │
│ ⌛ Frist        │ [−] 100 % [+]                    │                           │
└────────────────┴─────────────────────────────────┴───────────────────────────┘
```

## Mikroatferd og innhold

- Primærhandlinger øverst til høyre, sekundære i kontekstmeny. Destruktive handlinger krever rettighets- og konsekvensbekreftelse.
- Klikk på tall/del av graf skal alltid føre til riktig filtrert register. Ikke «falske knapper».
- Saks-ID, versjon, ansvar og frist skal være lett å finne; auditlogg er én fane unna.
- Skjema: valider ved endring/innsending, vis hvorfor obligatorisk, lagre utkast eksplisitt/automatisk med statusindikator.
- Filtre skal gjelde grafer og underliggende lister konsistent; bevare URL/query ved navigering.
- Tomtilstand: forklar hva som mangler, hvordan opprette, og skill `Ingen data`, `Ingen treff`, `Ingen tilgang`, `Ikke vurdert`.
- Diagrammer med særskilt tastaturnavigasjon, tekstlig tabellalternativ, arialabels og kontrast iht. WCAG 2.2 AA som mål.
