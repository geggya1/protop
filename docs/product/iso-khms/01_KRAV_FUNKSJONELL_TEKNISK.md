# ProTop ISO / K-HMS – komplett funksjonell og teknisk utviklingsspesifikasjon

**Versjon:** 1.0 • **Dato:** 22.10.2026 • **Målgruppe:** Produktansvarlig, utvikler/Cursor, systemarkitekt, kvalitetssjef og ISO-revisor.

## 0. Oppdrag og mål

Bygg en produksjonsklar, flerleietakerbasert (multi-tenant), integrert modul for kvalitetsledelse (ISO 9001), miljøledelse (ISO 14001) og arbeidsmiljøledelse (ISO 45001). Modulen skal støtte opprettelse, praktisering, kontroll, evaluering og forbedring av reelle ledelsessystemer og produsere etterprøvbar dokumentasjon for ekstern revisjon. Modulen sertifiserer ikke bedriften; dette avgjøres ved uavhengig tredjepartsrevisjon.

**Viktig:** Implementer *systemet*, ikke statiske kort med tekst. Det må kunne bygges, brukes og revideres av kundene, med egne prosesser og relevante forenklinger for virksomhetsstørrelse/risiko.

**Standardgrunnlag (oktober 2026):** ISO 9001:2026, ISO 14001:2026, ISO 45001:2018 inkl. Amd 1:2024. Gjøres versjonsstyrt. Innhold under er en selvstendig kravkartlegging, ikke en erstatning for kjøpte/lisensierte standardtekster. For full klausul-til-klausul kvalitetssikring: kontroll mot autorisert utgave av standardene og revisjonsfaglig gjennomgang.

## 1. Ufravikelige produktprinsipper

1. **Én integrert løsning, tre standardprofiler.** Aktiver ISO 9001, 14001, 45001 separat eller samlet, med én dokument-/tiltaksmotor og deduplisert evidens.
2. **Skille mellom krav og eksempler.** Obligatorisk standardkrav, norsk lovkrav, avtalt kundekrav, bedriftsinternt krav, anbefalt praksis og bransjemal må merkes eksplisitt.
3. **Konfigurerbart anvendelsesområde.** Kunde velger juridiske enheter, adresser, aktiviteter, tjenester, prosjektkategorier og relevante standarder. Begrunn eventuell ikke-anvendbar ISO 9001-operativ bestemmelse; ISO 14001/45001-krav kan ikke vilkårlig «klikkes bort».
4. **Evidens fremfor avkrysning.** En status som «verifisert oppfylt» krever bevis, gyldighet, eier, vurdering og dato. Et filvedlegg alene betyr ikke at kravet er oppfylt.
5. **Prosesseierskap.** Hver prosess har navn, formål, eier, input/output, kontrollkriterier, KPI, tilknyttede krav og dokumenter.
6. **Versjon og revisjonsspor.** Ingen publiserte styrende dokumenter/prosesser eller signerte registreringer endres i det stille. Historikk og kontekst beholdes.
7. **Mobil først for ansatte; desktop først for prosessdesign.** Mobil skal ha lesbare flytkart, oppgavehandlinger, rapportering og skjema. Desktop tilbyr full dra-og-slipp-redigering.
8. **Følg norsk regelverk.** Lovkravregister må vedlikeholdes, og ansvarlige må vurdere aktualitet og etterlevelse. Ikke lov at systemet automatisk gir juridisk garanti.
9. **Respekter personvern og fortrolighet.** Helseopplysninger, varsling/personalsaker og arbeidsmiljøhendelser kan kreve spesielt strengt skille fra alminnelige avvik.
10. **Gjenbruk av ProTop.** Ansatte, kunder, prosjekter, avtaler, oppgaver, godkjenninger, kalender, dokumenter, e-post og rapporter skal ikke dupliseres.

## 2. ISO-kravkart i modulen (kapittel 4–10)

Hver linje er et *kravområde*, og videre detaljering lagres per eksakte standardklausul og versjon. Lag egne kilder, normative krav, beskrivelser med selvstendig ordlyd og lisensstyrt tilgang til eventuell standardtekst.

| Tema | ISO 9001:2026 | ISO 14001:2026 | ISO 45001:2018 | Systemfunksjon/bevis |
|---|---|---|---|---|
| Organisasjonskontekst, interne/eksterne forhold | 4.1 | 4.1 | 4.1 | Kontekstregister, endringer, beslutninger og klimarelevans |
| Interessenter/forventninger | 4.2 | 4.2 | 4.2 | Interessentregister og krav-/forpliktelseskobling |
| Omfang | 4.3 | 4.3 | 4.3 | Omfangserklæringer, enheter, aktiviteter, lokasjoner, begrunnelser |
| Prosesser/ledelsessystem | 4.4 | 4.4 | 4.4 | Prosesskart, eier, input/output, samspill og kontrollpunkter |
| Ledelsesforankring | 5.1 | 5.1 | 5.1 | Beslutninger, ressurser, kommunikasjon, mål og ansvar |
| Kundeorientering | 5.1.2 | relevant under omfang | relevant under omfang | Kundekrav, tilfredshet og leveranseprestasjon |
| Policy | 5.2 | 5.2 | 5.2 | Kvalitets-/miljø-/arbeidsmiljøpolicy, publisering og bekreftelse |
| Roller og myndighet | 5.3 | 5.3 | 5.3 | RACI, fullmakter, delegering, prosjektroller |
| Konsultasjon og medvirkning | indirekte etter behov | indirekte etter behov | 5.4 | Ansattmedvirkning, verneombud, møter og dokumenterte innspill |
| Risiko/muligheter | 6.1 | 6.1.1, 6.1.4–6.1.5 | 6.1 | Risiko- og mulighetsregistre, tiltak, revurdering |
| Miljøaspekter/-påvirkning | etter relevant virkning | 6.1.2 | eventuelt HMS | Miljøaspektregister, vesentlighetskriterier, livsløpsperspektiv |
| Samsvarsforpliktelser | relevante lov-/kundekrav | 6.1.3 | 6.1.3 | Lov-/kontraktskravregister med anvendelse og vurderinger |
| Fareidentifikasjon og arbeidsmiljørisiko | relevant | relevant | 6.1.2 | Fare-/eksponeringskartlegging, arbeidsmiljørisiko, tiltakshierarki |
| Mål/planer | 6.2 | 6.2 | 6.2 | Mål, indikator, baseline, ansvar, plan, ressurser og frist |
| Planlagte endringer | 6.3 | 6.3 | 8.1.3 | Endringsrisiko, berørte prosesser, godkjenning, opplæring |
| Ressurser/måleutstyr/organisasjonskunnskap | 7.1 | 7.1 | 7.1 | Ressursplan, utstyrsregister der relevant, erfaringsbank |
| Kompetanse | 7.2 | 7.2 | 7.2 | Krav pr. rolle, opplæring, evaluering, bevis, frister |
| Bevissthet | 7.3 | 7.3 | 7.3 | Bekreftelse på policy, fareforståelse, konsekvenser |
| Kommunikasjon | 7.4 | 7.4 | 7.4 | Kommunikasjonsplan, mottakere, utsendelser, respons |
| Dokumentert informasjon | 7.5 | 7.5 | 7.5 | Dokumentstyring og sporbare gjennomføringsregistreringer |
| Operativ planlegging/styring | 8.1 | 8.1 | 8.1 | Kvalitetsplaner, driftskontroller, sjekklister og kontrollpunkter |
| Kundekrav/kontraktsgjennomgang | 8.2 | etter relevans | etter relevans | Forespørsel, kravavklaring, tilbuds-/avtalekontroll |
| Prosjektering og utvikling | 8.3 | livsløp/innflytelse | arbeidsmiljørisiko prosjektering | Plan, input, verifikasjon, validering, fag-/sidemannskontroll, endringer |
| Eksterne leverandører | 8.4 | 8.1 | 8.1.4 | Leverandørkvalifisering, bestilling, evaluering, oppfølging |
| Produksjon/leveranse | 8.5 | 8.1 | 8.1 | Driftsinstrukser, tjenestekontroll, sporbar leveransestatus |
| Frigivelse og avvikende leveranser | 8.6–8.7 | etter relevans | etter relevans | Godkjenning, ikke-samsvar, sperre/frigivelse og kundevarsling |
| Miljøberedskap | relevant | 8.2 | 8.2 | Scenario, beredskapsplan, øvelser, test og evaluering |
| Måling og analyse | 9.1 | 9.1 | 9.1 | KPI, datakilde, frekvens, avvik mot mål og forbedring |
| Kundetilfredshet | 9.1.2 | etter relevans | etter relevans | Måling, klager, tilbakemeldinger, tiltak |
| Samsvarsvurdering | indirekte gjennom krav | 9.1.2 | 9.1.2 | Planlagt og dokumentert etterlevelsesvurdering |
| Internrevisjon | 9.2 | 9.2 | 9.2 | Risiko-/resultatbasert revisjonsprogram og rapporter |
| Ledelsens gjennomgang | 9.3 | 9.3 | 9.3 | Inputpakke, referat, beslutninger, ressurser og tiltak |
| Avvik/korrigerende tiltak | 10.2 | 10.2 | 10.2 | Hendelse, årsak, tiltak, verifikasjon, læring |
| Kontinuerlig forbedring | 10.1 | 10.1 | 10.3 | Forbedringsportefølje, effekt/resultat og historikk |

**OBS:** Kartet gir tema-/klausulkobling, ikke påstand om at alle radene har identisk normative krav i alle tre standarder. Korrekt kravtolkning skal valideres av fagansvarlig mot offisielle standardtekster. Versjoner av klausuler må aldri blandes.

## 3. Fullstendig funksjonskatalog og minimumskrav

### M01 Ledelsessystem og omfang
- Opprett bedriftens ledelsessystem, hvilke juridiske selskaper/avdelinger/lokasjoner og aktiviteter som inngår; håndter konsern med flere separate sertifiseringsomfang.
- Velg standarder og versjoner; vis overgang og forskjeller mellom versjoner med faglig godkjent mapping.
- Lag kontekstregister (tema, beskrivelse, type, påvirkning, kilder, ansvar, vurderingsdato, neste vurdering), interessentregister (behov, forventning, bindende krav, evaluering), og prosesslandskap (styring, kjerne, støtte).
- Lag begrunnede anvendelsesvurderinger; godkjenn av ansvarlig.

### M02 Policy, ledelse, ansvar, medvirkning
- Policyer med utkast/godkjenning/publisering, årlig eller behovsstyrt revurdering, og bekreftelse på mottak.
- Knyt ledelsesansvar til eksisterende ansatte og organisasjonsstruktur; egne RACI-matriser.
- Vis beslutninger, ressursallokering og gjennomføring.
- Egen kanal for arbeidstakermedvirkning: innspill, møter, verneombudsaktivitet, AMU der aktuelt, anonymisert aggregert analyse der forsvarlig. Mulighet til å rapportere uten sanksjonsfrykt og registrere faktisk medvirkning.
- Særlige varslinger/personalsaker legges i separat beskyttet kanal, ikke ordinært avviksregister.

### M03 Visuell prosessbygger (kritisk)
- Fullskjerm canvas med pan/zoom, snap-to-grid, dra-og-slipp, multi-select, gruppering, kopiering, koblinger og undo/redo.
- Node-typer: start, slutt, aktivitet, beslutning, parallell forgrening/samling, skjema, sjekkliste, dokument, godkjenning, oppgave, kontrollpunkt, varsel, timer/frist, underprosess, integrasjon, manuell hendelse.
- Swimlanes for roller/ansvar. Koble linjer med labels som «Ja», «Nei», «Godkjent», «Avvist».
- Hver boks har tittel, forklaring, ikon/farge, ansvarlig rolle, frist, vilkår, input, output, lenker, skjema/prosedyre og krav-/risikoreferanser.
- To uavhengige egenskaper: **klikkhandling** (navigerer til dokument/skjema/sak/registrering) og **utføringshandling** (oppretter/oppdaterer oppgave, etterspør godkjenning, evaluerer betingelse).
- Skill mellom **diagram** (visuell dokumentasjon) og **kjørbar prosess** (publisert, validert tilstandsmaskin). Ikke la tegnelinjer alene utløse automasjon.
- Underprosesser med egen versjon og status. Malbibliotek og kundespesifikke maler.
- Designmodus for prosesseier; les-/kjøremodus for ansatte. Sikret publisering og historikk.
- Prosessinstanser viser aktivt trinn, ventende ansvar, hendelseslogg og avsluttede steg. Aktive instanser skal beholde referanse til prosessversjonen de startet på; migrering er eksplisitt.
- Valider flyten før publisering: start/slutt, tilgjengelige utganger, uoppnåelige noder, beslutningsgrener, ugyldige sykluser, rolle- og skjema-referanser. Støtt løkker kontrollert, ikke utilsiktede evige løp.
- Import/eksport av eget versjonert JSON-format, bildeeksport SVG/PNG/PDF; BPMN 2.0 kun dersom reell formatkompatibilitet implementeres/testes.
- Ingen produksjonsautomatisering av vilkårlig brukerskript. Støtt et trygt deklarativt regelsett med allowlistede operasjoner.

### M04 Dokumentstyring
- Register for styrende dokumenter og registreringer: dokument-ID, navn, kategori, forfatter, eier, godkjenner, gyldig fra, revisjon, evaluering, godkjenningsdato, neste revisjonsdato, dokumentstatus, tilgangsnivå, tags, krav-/prosesskoblinger.
- Tilstand: utkast -> til gjennomgang -> godkjent -> publisert -> erstattet/arkivert. Avslag -> utkast.
- Publisert revisjon er skrivebeskyttet; endring oppretter ny revisjon. Avsluttede saker lenker til eksakt godkjent revisjon.
- Redigering som riktekst, vedlegg som PDF/Office, forhåndsvisning, søk, endringslogg, eksterne dokumenter, distribusjon og kvittering for lest der nødvendig.
- Dokumenttype «kravbevis» kan ha gyldighet, eier, sensitivitet og kontrollstatus.
- Arkivering/sletting etter konfigurerte, lovlig vurderte oppbevaringsregler og eventuell legal hold.

### M05 Skjemabygger/sjekklister
- Dra-og-slipp: tekst, tall, dato, klokkeslett, radio, sjekkrute, flervalg, oppslag, bruker, prosjekt, sted, vedlegg, bilder, signatur-/godkjenningsbekreftelse, tabell, beregnet felt.
- Betinget visning, validering, obligatoriske felt, dynamiske gjentakelser, rolleavhengige felt, skjemaversjoner, maler og PDF-sammendrag.
- Ulike registreringstyper: revisjonsobservasjon, leveransekontroll, SJA, vernerunde, hendelse, miljørunde, prosjekteringskontroll, mottakskontroll.
- Mobile handlinger og ev. offline-utkast med konflikthåndtering uten datatap.

### M06 Kravregister/samsvarsmatrise
- Bibliotek: `Standard -> Versjon -> Klausul -> Kravpost` og `Lov-/forskriftskilde -> Paragraf -> Tolket virksomhetsplikt`.
- Hver kravpost har eier, relevant enhet/prosess, anvendelse, påkrevde resultater, plan for etterlevelse, dokumentasjon, siste vurdering, neste vurdering, funn, risikogradering og status.
- Status: ikke vurdert, ikke aktuelt med godkjent begrunnelse (der tillatt), mangler, under arbeid, dokumentert, vurdert oppfylt, avvik, krever ny vurdering.
- Kan kobles til mange dokumenter, hendelser, prosessnoder og kontroller samtidig.
- Vis sporbart hvem som bekreftet oppfyllelse og på hvilket grunnlag. AI kan foreslå koblinger, men aldri attestere oppfyllelse.
- Lovkrav oppdateres med varsling om mulig endring, men ansvarlig må avgjøre rettslig relevans og faktisk etterlevelse. Ingen «automatisk juridisk compliance».

### M07 Mål, planer, KPI
- Registrer kvalitets-, miljø- og arbeidsmiljømål med begrunnelse, baseline, måleverdi, tidsperiode, målemetode, datakilde, ressurs, eier og frist.
- Koble mål til risiko, miljøaspekt, krav og tiltak. Status, fremdrift, historiske data og aggregering på enhet/prosjekt.
- Eks: reklamasjonstid, antall revisjonsfunn, kundetilfredshet, korrekt levert første gang, avfallsreduksjon, reiseutslipp, oppfølging av ergonomisk risiko og fullført kompetanse.
- KPI-valg er virksomhetsspesifikt; ikke hardkod antall ulykker som eneste HMS-indikator.

### M08 Risiko, muligheter og endring
- Separat klassifisering: strategisk/kvalitet/miljø/arbeidsmiljø/prosjekt/beredskap/leverandør. Registrer fare/årsaker/konsekvenser, eksisterende barrierer, innledende og restrisiko, handlingsplan.
- Risikomatriser konfigurerbare per virksomhet og vurderingsmetode, med dokumentert versjon og kriterier.
- Muligheter behandles som selvstendige potensialer, ikke bare som «positive risikohendelser».
- Årlige og hendelsesutløste revurderinger (prosjektendring, hendelse, lovendring, nytt utstyr/stoff, leverandørbytte).
- Endringsprosess med initiativ, påvirkningsanalyse, godkjenning, informasjon/opplæring, implementering, oppfølgingskontroll.

### M09 Miljøaspekter og miljøprestasjon (14001)
- Aktivitetsregister for påvirkning gjennom livsløpet: innkjøp, design/prosjektering, transport, drift, avfall, avhending; virksomhetens direkte kontroll vs. innflytelse.
- Miljøaspekt, påvirkning, normal/unormal situasjon/beredskap, betydningskriterier, påvirkningsgrad, lov-/kontraktskrav, tiltak, eier og revisjon.
- Eksempler: materialvalg, prosjektert energibehov, transport, ressursforbruk, avfall, kjemikalier, forurensing, klimaforhold, naturmangfold.
- Signifikans skal begrunnes med godkjente kriterier, ikke beregnes som uklar sort boks. Klima-/biologisk mangfold-tema vurderes etter faktisk virksomhetskontekst.
- Miljødata med enhet, tidsperiode, datakilde og kvalitet; import fra reiseregning, kjørebok, prosjekt og faktura der data faktisk gir riktig måling.
- Logg evaluering av miljørettslige/andre samsvarsforpliktelser separat fra bare oversikt over lovkrav.

### M10 Arbeidsmiljø og HMS (45001)
- Risikokartlegging av fysisk, psykososialt, organisatorisk, ergonomisk, kjemisk, biologisk og sikkerhetsrelatert arbeidsmiljø etter relevans.
- Fareidentifisering med involvering av ansatte og representanter; registrer valg av barrierer og tiltakshierarki.
- Hendelser, nestenulykker og arbeidsrelaterte plager med behovsstyrt særskilt tilgang/avskjerming; registrering uten unødvendige helseopplysninger.
- Vernerunder, SJA, arbeidsinstrukser, kurs, verneombud/AMU, BHT, eksponeringsvurderinger og utstyrskontroll aktiveres når relevant. Ikke automatisk krav for alle prosjekter eller roller.
- Beredskap, varsling og dokumentasjon av øvelser.
- Kritiske hendelser: tydelig veiledning om lovpålagt varsling til riktige myndigheter; systemet må ikke anta at intern avviksrapportering oppfyller ekstern meldeplikt.

### M11 Prosjekt/leveranse/kvalitetsplan (særlig 9001)
- Gjenbruk eksisterende Prosjekt, Kunde, Tilbud, Kontrakt og oppgavehåndtering.
- Prosjektkvalitetsplan: omfang, krav, prosjekteringsplan, dokumentkontroll, ansvar, faseporter, fagkontroll/sidemannskontroll, beslutninger, leveranseliste, avvik, kontrollpunkter.
- Kundekrav/kontraktsgjennomgang før aksept; endringsvurdering og dokumenterte avklaringer.
- Design/prosjekteringskontroll: kravinput, tverrfaglig koordinering, verifikasjon, validering (der relevant), revisjoner og godkjenning før frigivelse.
- Spor leveranser mot eksakt tegnings-/dokumentrevisjon, godkjenner og dato.
- For roller som SHA-koordinator/byggherrerepresentant: egne maler for prosjektspesifikk SHA-plan, risikoforhold, koordinering og oppfølging. Rolleavgrensning eksplisitt; ikke framstill byggherreforskriften som ISO-krav for alle rådgivere.

### M12 Leverandører
- Register med kritikalitet, kompetanse, relevante sertifikater, forhåndskvalifisering, avtalt kvalitet/miljø/HMS, avvik og evaluering.
- Evaluer kontrollnivå etter leveranse/risiko; godkjent-status med utløp og revurdering.
- Integrer kunde-/produkt-/anskaffelsesmodul, ikke opprett separate leverandørmastere.

### M13 Kompetanse og opplæring
- Kompetansekrav per funksjon/rolle/prosess, personens dokumenterte kompetanse, mangler, opplæringsplan, repetisjoner/utløp, effektvurdering.
- Ved prosessendring: identifiser berørte roller og påkrev opplæring/lesebekreftelse.
- Kompetansematrise viser gap, ikke utelukkende opplastede kursbevis.

### M14 Avvik, hendelser, klager, korrigerende tiltak
- Typer: prosessavvik, produkt/leveranseavvik, miljøhendelse, HMS-hendelse, kundeklage, revisjonsfunn, risikofunn, forbedringsforslag, nestenulykke.
- Én kjernemotor med typeavhengige skjema, frister og tilgang. Hendelsesmelding kan skjermes mer enn vanlig kvalitetsavvik.
- Standardflyt: registrert -> triage -> vurdert -> umiddelbar korreksjon -> årsaksvurdering (når relevant) -> korrigerende tiltak -> kontroll av gjennomføring -> effektverifikasjon -> lukket; gjenåpning ved manglende effekt.
- Påkrev spesifikke begrunnelser for «ingen korrigerende tiltak nødvendig»; ikke tving omfattende rotårsaksanalyse for ethvert bagatellmessig forslag.
- Bruk 5 x hvorfor, fiskebein som valgfrie hjelpeteknikker. Knytt årsak, sannsynlig gjentakelse, tilsvarende saker, tiltak, ansvar, frist, kontrollbevis og effektvurdering.
- Funn kan ha enkelt og flere tiltak, tiltak kan peke til flere funn der det er faglig riktig.

### M15 Internrevisjon
- Risiko-/betydningsbasert revisjonsprogram for system/prosesser/avdelinger/standarder, med kompetent og objektiv revisor.
- Plan: formål, kriterier, omfang, dato, intervjuobjekter, stikprøver, sjekkpunkter og referansekrav.
- Gjennomføring på mobil/desktop; funn klassifiseres (samsvar, forbedringsmulighet, avvik), bevis og konklusjon registreres.
- Rapportering, distribusjon, oppfølging og lukking via tiltaksmodul.
- Ingen hardkodet krav «hver prosjektfase». Frekvens fastsettes gjennom dokumentert revisjonsprogram.

### M16 Ledelsens gjennomgang
- Automatisk foreslått saksliste/datapakke: tidligere beslutninger, endrede interne/eksterne forhold, måloppnåelse, kundetilbakemeldinger, prosessytelse, samsvarsvurderinger, miljøprestasjon, arbeidsmiljøprestasjon, hendelser, revisjonsfunn, ressurser, risiko/muligheter, forbedringsforslag.
- Ledelsen kan kommentere og dokumentere beslutninger om forbedringer, ressursbehov, endringer, ansvar og frister.
- Revisjonssikkert møtereferat, vedtak og oppfølging; kontroll at beslutninger er gjennomført.

### M17 Beredskap
- Scenarioanalyse, kontaktkjede, beredskapskort, rolle, utstyr, tiltak, øvelse, evaluering, forbedring og revisjon.
- Miljø- og HMS-scenarioer holdes koblet til relevante risikovurderinger.
- På mobil: enkel «beredskapsvisning» med kritisk informasjon, også ved nedsatt nettforbindelse dersom teknisk implementert.

### M18 Målinger, KPI og rapportering
- Dashboard per standard og virksomhet/enhet/prosjekt, med trend, filtrering og drilldown til bevis.
- Målinger: hendelser med oppfølging, tiltak forfalt, krav uten gyldig vurdering, kontrollgjennomføring, miljømål, leveransefeil, kundetilfredshet, opplæringsgap.
- Unngå oppdiktet «ISO-score». Bruk operasjonell modenhet og etterlevelsesstatus med åpen metode, ikke sertifiseringsløfter.

### M19 Sertifisering og ekstern revisjon
- Sertifiseringsplan: scope, standard/versjon, sertifiseringsorgan, avtalte faser, frister, intern gapvurdering.
- Bevisrom: kontrollert, tidsbegrenset lesetilgang med kun relevante bevis, eksport manifest/referanse, revisjonsdato og dokumentrevisjon.
- Oppfølging av tredjepartsfunn og pålegg med ansvar, frist, tiltak og verifikasjon.
- Sertifikatregister: utsteder, akkreditering, scope, sertifikatnummer, gyldighet, begrensninger, revisjonsdatoer. Ikke bruk ISO-logo som sertifiseringsmerke.

## 4. Anbefalt meny og UI/UX

**ISO (hovedside)**
- Oversikt
- Prosesskart
  - Prosessbibliotek
  - Prosessbygger
  - Mine aktive prosesser
- Styrende dokumenter
- Skjemaer og sjekklister
- Krav og etterlevelse
  - ISO-matrise
  - Lov-/kontraktskrav
  - Samsvarsvurderinger
- Mål og handlingsplaner
- Risiko og muligheter
- Miljø
  - Miljøaspekter
  - Målinger
  - Miljøtiltak
- Arbeidsmiljø og HMS
  - Farer og risiko
  - Medvirkning
  - Vernerunder / SJA
  - Beredskap
- Kvalitetskontroll / prosjekter
- Avvik og forbedring
- Kompetanse
- Leverandørkontroll
- Internrevisjon
- Ledelsens gjennomgang
- Sertifisering og revisjonsrom
- Innstillinger / maler / roller

**Mobil ISO-oversikt:** 3–5 kompakte KPI-kort øverst, «Mine oppgaver» og hurtighandling «Meld avvik», deretter visuelt prosesslandskap og filtrerbare moduler. Ingen lang ubrutt liste med statiske prosedyrer. Søkeverktøy på tvers.

**Desktop prosessbygger:** venstre nodepalett, midten uendelig canvas, høyre egenskapspanel, øverst versjon/publisering/test/eksport, nederst validerings- og hendelseslogg. Klikk på node åpner riktig handling i vanlig visningsmodus, egenskaper i redigeringsmodus.

**Tilgang:** selskap, konsern, avdeling, prosjekt og rolle. Søk og visning må respektere samme tilgang som API; skjuling i UI er utilstrekkelig.

## 5. Malbibliotek – minimum 25 kjørbare/visuelle maler

1. Overordnet prosesslandskap/PDCA.
2. Interessent- og kontekstanalyse.
3. Årlig mål- og handlingsplan.
4. Dokumentopprettelse og godkjenning.
5. Endring av prosedyre/prosess.
6. Kompetansekartlegging og opplæring.
7. Kontraktsgjennomgang ved nytt oppdrag.
8. Tilbud -> kontrakt -> oppstart -> gjennomføring -> avslutning.
9. Opprettelse av prosjektkvalitetsplan.
10. Prosjektering og tverrfaglig kvalitetskontroll.
11. Fag-/sidemannskontroll og leveransefrigivelse.
12. Prosjekt-/kontraktsendring med kontroll av risiko.
13. Leverandørkvalifisering og evaluering.
14. Risikoidentifikasjon og risikoreduserende tiltak.
15. Identifikasjon/vurdering av miljøaspekter.
16. Periodisk evaluering av etterlevelse av lovkrav.
17. SJA/farekartlegging når aktuelt.
18. Vernerunde og oppfølging.
19. Registrering og behandling av kvalitetsavvik.
20. HMS-hendelse og nestenulykke.
21. Miljøhendelse og tiltak.
22. Kundeklage og tilbakemelding.
23. Beredskapsøvelse og evaluering.
24. Internrevisjon med funn og tiltaksoppfølging.
25. Ledelsens gjennomgang og vedtak.
26. Periodisk prosessevaluering.
27. Oppfølging av sertifiseringsfunn.
28. Overlevering/avslutning av prosjekt og erfaringsoverføring.

Hver mal leveres med prosessdiagram, roller, sjekkliste, skjema, tekstbeskrivelse, kravkoblinger (verifisert), godkjenningssteg og et eksempel på forventet dokumentasjon. Kundens kopi skal kunne endres uavhengig av originalmal.

## 6. Foreslått datamodell (kan tilpasses eksisterende stack)

| Entitet / kolleksjon | Viktige felter |
|---|---|
| `management_systems` | id, tenant_id, legal_entity_id, scope, standards, owner_id, status |
| `standard_editions` | id, standard_number, edition, effective_from, transition_metadata |
| `requirements` | id, edition_id, clause, requirement_summary, applicability_logic, source_uri, review_status |
| `requirement_assessments` | id, scope_id, requirement_id, applicability, rationale, assessor, assessed_at, valid_until, status |
| `processes` | id, owner_id, scope_id, category, current_published_version_id |
| `process_versions` | id, process_id, version, diagram_json, execution_spec_json, status, approval_id |
| `process_instances` | id, process_version_id, context_ref, status, current_nodes, started_by, started_at |
| `process_events` | id, instance_id, node_id, event_type, actor, timestamp, payload_ref, correlation_id |
| `forms` / `form_versions` | id, schema_json, validation, visibility, approval, status |
| `form_submissions` | id, form_version_id, source_ref, submitted_by, submitted_at, payload, approval_ref |
| `documents` / `document_versions` | id, owner, status, revision, approved_by, approved_at, content_ref, checksum |
| `evidence_links` | id, requirement_id, evidence_type, evidence_id, evidence_version_id, review_state |
| `stakeholders` / `context_issues` | id, scope, type, expectation, impact, owner, last_reviewed |
| `obligations` / `compliance_evaluations` | id, authority, legal_basis, applicability, evaluator, evidence, verdict, next_review |
| `risks` / `risk_assessments` | id, category, method_version, probability, consequence, controls, residual_risk, reviewer |
| `environmental_aspects` | id, activity, aspect, impact, lifecycle_stage, significant, method, owner |
| `objectives` / `measurements` | id, type, baseline, target, unit, period, method, actual_value |
| `incidents` / `nonconformities` | id, classification, origin, severity, restricted_flag, linked_process, status |
| `actions` / `effectiveness_reviews` | id, owner, deadline, completion_evidence, verifier, effectiveness_result |
| `audits` / `audit_findings` | id, scope, criteria, auditor, independence_declaration, evidence, finding, report |
| `management_reviews` / `decisions` | id, scope, input_snapshot, meeting_date, decision, owner, due_date |
| `competence_requirements` / `competence_records` | id, role, person, proof, evaluated_at, validity, gap |
| `suppliers` / `supplier_evaluations` | id, tenant_supplier_ref, criteria, results, evaluation_due |
| `certifications` | id, accredited_body, certifier, standard, scope, issue_date, expiry_date, status |
| `audit_log` | id, tenant_id, actor, time, action, entity_type, entity_id, before_hash, after_hash, source |

**Teknisk:** Bruk konsekvent referansemodell til eksisterende selskaper, personer, prosjekter, oppgaver, kunder, leverandører og filer. Ikke innfør parallell bruker-/prosjektmaster. Alle relasjoner må ha leietaker-/tilgangskontroll. Fullfør skjemaer med atomisk lagring og utsted hendelser for workflow-motor med idempotente nøkler.

## 7. Workflow-regler og eksempel

**Eksempel avvik:**

`Meldt -> Triage -> Klassifisering -> Korreksjon -> Årsaksvurdering -> Tiltaksbeslutning -> Tiltak utført -> Effekt vurdert -> Lukket`

- På «Meldt»: lag unik sak, frist og varsel til ansvarlig etter tilhørighet.
- På «Triage»: registrer alvorlighet, mulig meldeplikt, berørte personer og nødvendige strakstiltak.
- På «Tiltaksbeslutning»: dersom korrigerende tiltak ikke kreves, krev begrunnet beslutning og godkjenning.
- På «Effekt vurdert»: lukking bare dersom alle påkrevde steg/vedlegg er gjennomført og kvalifisert person har godkjent effekten; ellers gjenåpnes saken eller nytt tiltak opprettes.
- Ved fristbrudd: påminnelse/escalering etter policy.
- Automatisering må kunne stoppes/overstyres av autorisert bruker med begrunnelse og logg; ingen hemmelige tilstandshopp.
- Hindr dobbel oppgavegenerering ved replays/nettverksforsinkelser.

**Kritiske designvalg:**
- Prosessdefinisjon er immutable etter publisering; klient render fra definisjon og instance-state.
- Regelmotor er deterministisk, auditbar og kjører i backend. Utløs ikke kritiske steg kun fra UI.
- Eventhistorikk append-only; kompenserende hendelser ved feil, ikke slett tidligere godkjenning.
- Prosessversjon på alle instanser og dokumentversjon på alle bevis.
- Forgrening og parallelle godkjenninger må kunne samles igjen. Må kunne registrere avvisning og retur til tidligere steg.

## 8. Tilgang, sikkerhet, personvern og bevisintegritet

- Foreslåtte roller: superadmin (ProTop), selskapsadministrator, systemansvarlig/K-HMS, prosesseier, revisjonsansvarlig, internrevisor, leder, prosjektleder, ansatt, verneombud/ansattrepresentant, ekstern revisor (begrenset), gjest.
- Rollebasert + objektbasert tilgang: tiltak, avvik, dokument, prosjekt og juridisk enhet. Konsernvisning bare ved uttrykkelig autorisasjon; datadeling mellom selskaper er ikke gitt av eierskap alene.
- Egne restriksjoner for arbeidsrelatert helse, varslingssaker, personalinformasjon og identifiserbare hendelser. Vis kun nødvendige opplysninger.
- Personvernvurdering: formål, dataminimering, lovlig behandlingsgrunnlag, tilgangsbehov, sletting/oppbevaring, eksport, innsyn, databehandleravtale, logging og eventuelt DPIA.
- Krypter data i overføring og lagring, beskytte secrets, sikker filtilgang og malware-scanning.
- Revisjonslogger med uendret historikk og bevis-sjekksum; administrator må ikke kunne slette spor i normal UI.
- Formell e-signatur krever egen kvalifisert løsning ved rettslig behov; vanlig godkjenningslogg skal ikke markedsføres som kvalifisert e-signatur.
- Revisors tidsbegrensede tilgang og nedlastingslogg. GDPR-vennlig rapporteksport med redigering/sladding.

## 9. ISO-klarhetsvurdering (ikke automatisk sertifisering)

For hvert standardkrav og ledelsessystemomfang:

- `Ikke vurdert`: ingen faglig vurdering.
- `Mangler`: ikke etablert/ikke implementert.
- `Under implementering`: definert tiltak uten komplett bevis.
- `Dokumentasjon foreligger`: dokument/registreringer finnes; ennå ikke verifisert.
- `Internt vurdert oppfylt`: ansvarlig har kontrollert resultat mot krav.
- `Avvik`: konkret mangel/funn registrert.
- `Må revurderes`: krav, standard, lov, prosess eller dokument er endret.
- `Ikke relevant`: kun etter styrt og begrunnet anvendelsesvurdering der standarden tillater det.

«Klar for ekstern revisjon» kan kun vises som **intern beredskapsindikator**, med synlig mangelliste. Den må aldri omtales som garanti for akkreditert sertifikat.

## 10. Særlig norsk kravdekning

Bygg eget nasjonalt regelverkslag med redaktørkontrollerte maler. Minste fokus for norsk bygg/anlegg og rådgivning:

- Internkontrollforskriften § 5: tilgjengelige regler, ansattes kunnskap/medvirkning, skriftlige mål, organisering, risikovurderinger, rutiner for avvik og systematisk gjennomgang.
- Arbeidsmiljøloven og relevante arbeidsmiljøforskrifter: arbeidsmiljøfaktorer, opplæring, medvirkning, vern, melding om alvorlige skader, verneombud/AMU/BHT når aktuelt.
- Byggherreforskriften for de rollene og prosjektene den faktisk gjelder: SHA-plan, prosjekteringsrisiko, koordinering og rollefordeling.
- Relevant miljøregelverk og eventuelle kommunale krav, tillatelser, avfallsregelverk, forurensning, produkt-/kjemikalieregelverk etter aktivitet.
- Kundenes kontraktskrav og andre samsvarsforpliktelser.

Kravbiblioteket må ha kilde, sist kontrollert, juridisk eier, relevans, eventuell konklusjon og neste vurdering. Automatiske oppdateringer skal flagges som «krever vurdering», ikke «lovlig oppfylt».

## 11. Akseptansekriterier / E2E-tester (minstekrav)

**A01:** En ny virksomhet kan aktivere alle tre standarder, avgrense scope og opprette relevante roller uten testdata.

**A02:** Samme dokument-/avviksbevis kan brukes for flere klausuler uten duplikat, men hver kobling vurderes selvstendig.

**A03:** Prosesseier kan designe, validere, sende til godkjenning og publisere et flytskjema. Ansatte får bare siste publiserte versjon.

**A04:** Klikk på prosessnode åpner riktig dokument/skjema. Utføring kan opprette oppgave. Mobilvisning virker på liten skjerm uten at elementer faller utenfor eller bunnnavigasjonen dekker handlinger.

**A05:** Pågående sak beholder prosessversjon når mal senere endres.

**A06:** Skrivebeskyttet publisert dokument får ny revisjon ved endring. Historisk avvik viser gammel revisjon.

**A07:** Et avvik kan ikke lukkes hvis obligatorisk effektverifikasjon/tiltaksdokumentasjon mangler i aktuell flyt.

**A08:** Revisjonsfunn knyttes til krav/prosess, tildeles tiltak og kan vises som bevis til ledelsens gjennomgang.

**A09:** Miljøaspekt kan klassifiseres med dokumentert vesentlighetsmetode, tiltak, evaluering og beslutning.

**A10:** Lovkrav med utgått vurderingsdato får varsel, uten automatisk å bli erklært oppfylt.

**A11:** Ansatt uten tilgang kan ikke se skjermet HMS/personhendelse, heller ikke via søk, API, rapport eller eksporter.

**A12:** Selskap A kan ikke lese data fra selskap B uten autorisert deling, også i konsernstruktur.

**A13:** ISO-matrisen viser alle relevante klausuler og peker på kravstatus og tilknyttet bevis.

**A14:** Ekstern revisor kan få tidsstyrt lesetilgang til et eksplisitt revisjonsutvalg, ikke alle persondata.

**A15:** Oppgave- og varslingshendelser er idempotente; ingen doble oppgaver ved retry.

**A16:** Ledelsens gjennomgang kan generere dokumentert grunnlag med revisjonsfunn, målinger, avvik, lovetterlevelse og tiltaksstatus.

**A17:** Alle vesentlige endringer/godkjenninger har actor, timestamp og gammelt/nytt revisjonsspor.

**A18:** Kritisk beredskapsinformasjon kan aksesseres etter definert tilgjengelighetskrav og tilgang.

**A19:** UI skiller tydelig ISO-krav, norsk lovkrav, valgfri beste praksis og virksomhetens egne regler.

**A20:** Hele funksjonsområdet har reelle backend-operasjoner, fungerende søk, lasting/feilhåndtering og testdekning; ingen hardkodede demo-kort i produksjonsflate.

## 12. Anbefalt implementeringsrekkefølge

**Fase 0 – Analyse:** Inspiser eksisterende repo, arkitektur, datamodell, auth, tenant, prosjekt, ansatte, dokumenter, oppgaver, skjemabygger og UI-komponenter. Lag gaprapport og migrasjonsplan; avklar lisensiert kravtekst og nødvendige faglige tolkninger. Ikke begynn med nye parallelle masterdata.

**Fase 1 – Plattformkjernen:** scope/standardprofiler/kravmotor, dokumentversjonering, audithistorikk, tilgang, oppgaver, felles beviskoblinger.

**Fase 2 – Prosessverktøy:** prosessbibliotek, interaktiv prosessbygger, validering, publisering, kjørbar workflow, integrert skjemabygger, mobilvisning.

**Fase 3 – Operativ ISO:** risiko, miljøaspekter, arbeidsmiljø, avvik/tiltak, kompetanse, prosjektkvalitetsplan, leverandørvurdering, beredskap.

**Fase 4 – Styring/evaluering:** KPI, lovetterlevelse, internrevisjoner, ledelsens gjennomgang, revisjonsrom, gapmatrise.

**Fase 5 – Pilot/revisjonskvalitet:** pilot med rådgivervirksomhet, verifiser minimum én faktisk prosess innen hver standard, gjennomfør full internrevisjon og ledelsesgjennomgang, uavhengig fagvalidering, sikkerhetstest og håndtering av personvern.

Ikke marker en fase ferdig før akseptansekriterier og database-/rettighetstester er bestått. Bruk feature-flagg og migrasjonsstrategi.

## 13. Cursor – oppstartsinstruks (kan limes rett inn)

> Du skal videreutvikle eksisterende ProTop til et ekte, integrert K-HMS-ledelsessystem for ISO 9001:2026, ISO 14001:2026 og ISO 45001:2018 med 2024-endring. Følg den vedlagte spesifikasjonen som produktkontrakt. Start med å inspisere repository, nåværende ISO-side, eksisterende komponenter, selskap/konsern, ansatte, prosjekt, dokumenter, skjemabygger, oppgaver, autorisasjon og lagring. Lag en presis GAP-analyse og plan med prioriterte avhengigheter, tabeller/koleksjoner, API-endepunkter, skjermbilder og akseptansetester. Implementer deretter grunnplattformen og en virkelig fungerende vertikal ende-til-ende-flyt: «ISO-avvik registreres -> klassifiseres -> tiltak tildeles -> effekt vurderes -> lukking godkjennes -> evidens vises i ISO-matrise og revisjonsrapport», samt «prosessbygger -> godkjent prosessversjon -> ansatt klikker/utfører prosess». Bevar ProTops eksisterende designprofil, gjenbruk eksisterende domeneobjekter og opprett ingen hardkodet demonstrasjonsdata som ser ut som et ferdig system. Kritiske krav: dokument-/prosessversjonering, tenant-isolasjon, granular tilgangskontroll, auditlogg, sikker håndtering av sensitive HMS-data, juridisk/ISO kravskille, mobil og desktop, malbibliotek, kobling av ett bevis til flere krav og klare akseptansetester. Gjennomfør arbeidet i små, kontrollerbare implementasjonstrinn, og oppgi konkret hvilke filer, skjemaer, migrasjoner, API-er og tester som er opprettet og bestått. Innhent nødvendig kvalitetsgodkjenning mot lisensierte ISO-standarder før endelig påstand om normativ kravdekning.

## 14. Kilder og verifikasjon

Kildene nedenfor brukes til å fastslå gjeldende utgaver, overordnede kravtema og relevante norske regler. Selve standardene bør anskaffes fra ISO/Standard Norge for normativ kravspesifikasjon og oppdateringsarbeid.

- ISO 9001:2026: https://www.iso.org/standard/9001
- ISO 9001:2026 og overgang: https://committee.iso.org/sites/tc176sc2/home/news/content-left-area/news-and-updates/news-2.html
- ISO 14001:2026: https://www.iso.org/standard/14001
- ISO 14001:2026 oversikt: https://www.iso.org/obp/ui?_escaped_fragment_=iso%3Astd%3Aiso%3A14001%3Aed-4%3Av1%3Aen
- ISO 45001:2018/Amd 1:2024: https://www.iso.org/standard/88428.html
- Norsk Akkreditering, systemsertifisering: https://www.akkreditert.no/kundeside/sertifiseringsorgan/systemsertifisering/
- Norsk Akkreditering, overgang ISO 14001: https://prod.akkreditert.no/artikkelarkiv/ny-utgave-iso-14001/
- Internkontrollforskriften: https://www.arbeidstilsynet.no/regelverk/forskrifter/internkontrollforskriften
- Byggherreforskriften: https://www.arbeidstilsynet.no/regelverk/forskrifter/byggherreforskriften/
- Forskrift om organisering, ledelse og medvirkning: https://www.arbeidstilsynet.no/regelverk/forskrifter/forskrift-om-organisering-ledelse-og-medvirkning/
- Arbeidstilsynet, arbeidsulykker: https://www.arbeidstilsynet.no/kontakt-oss/melde-ulykke/
- ISO om sertifisering og sertifiseringsorgan: https://committee.iso.org/certification.html

**Ansvarsfraskrivelse:** En programvarefunksjon eller utfylt sjekkliste er ikke det samme som faktisk etterlevelse. Organisasjonen må ta ansvar for riktig omfang, lovlig drift, involvering, kompetanse, ledelsesbeslutninger, gjennomføring, målinger og forbedringer. Sertifikat tildeles kun etter uavhengig sertifiseringsrevisjon.
