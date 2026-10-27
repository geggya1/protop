# Fakturering i ProTop — prosesskart, lovkrav og målbilde

Sist oppdatert: 27.10.2026

Grunnlag:
- 15 skjermbilder fra et annet prosjektsystem, sendt i tre meldinger 27.10.2026. De er brukt som inspirasjon, ikke som mal for design.
- Koden på `main` (2f2ec42).
- Lovkilder og standarder for god bokføringsskikk (GBS), listet nederst.

Lovdata og Skatteetaten kunne ikke nås fra arbeidsmiljøet. Paragrafene er derfor sjekket mot
sekundærkilder: Regnskapsstiftelsen, Skatteetatens uttalelser i søk, Revisorforeningen og Virke.
Ordlyden bør kontrolleres av revisor før punkt 2 brukes som fasit.

---

## 0. Kort fortalt

1. **Innstillingene finnes, men brukes nesten ikke.** Selskapet og hvert prosjekt har over 60 fakturainnstillinger: gruppering, påslag, rabatt, administrasjonskostnader, kontoer, tekster, referanser og timespesifikasjon. Bare kredittiden brukes når utkastet lages.
2. **Utkastet får fakturanummer med en gang.** Slettes utkastet, blir det hull i nummerserien. Nummer skal tildeles når fakturaen utstedes, og det må skje i én transaksjon, så to brukere ikke får samme nummer.
3. **«Send faktura» sender ingenting.** Knappen merker bare fakturaen som sendt. Det finnes ingen PDF, e-post eller EHF-utsending fra ProTop. Med PowerOffice sendes fakturaen derfra.
4. **En utstedt faktura kan endres og slettes.** Både appen og Firestore-reglene tillater det. En utstedt faktura skal være låst, og rettes bare med kreditnota.
5. **Bilaget bokføres allerede når utkastet lages.** Det skal først skje ved utstedelse, eller i PowerOffice.
6. **Timer uten timepris faktureres med 1000 kr uten varsel.** Dette er en reservepris i `projectHourlyRate`. Skjermbildet viser riktig oppførsel: varselet «Timepriser er ikke spesifisert».
7. **«Låst» betyr to ting.** Ordet brukes både om timeliste levert til kontroll og om timer som er fakturert. Grunnlaget trenger egne statuser: *på utkast*, *fakturert* og *ikke fakturert (avskrevet)*.
8. **Kunden mangler opplysninger fakturaen trenger:** egen faktura-e-post, EHF-mottak, kontaktpersoner, kredittid og språk.
9. **Det finnes to driftsmåter, og ProTop må skille dem.** Enten utsteder ProTop fakturaen selv, eller så lager ProTop bare utkast og PowerOffice utsteder.
10. **E-faktura blir sannsynligvis påbudt mellom bedrifter.** Mange av kundene er kommuner, og de krever EHF allerede. Plikten for bedrifter er foreslått fra 1.1.2027, flyttet fra 2028. Ordningen må bygges for Peppol nå.

---

## 1. Hva skjermbildene viser (inventar)

Alt som er sett, slik at ingenting faller ut.

**Fakturaer, liste (bilde 1)**
- Kolonner: fakturanr, PDF, forhåndsvisning, fakturadato, forfall, kundenr, kunde, prosjektnr, prosjekt, sendt (hake), valuta, eks. mva, mva, ink. mva, utestående og tap.
- Handlingen «Opprett betaling» på hver rad.
- Filtre:
  - Vis kun totalsummer.
  - Alle / mine / der jeg er prosjektleder.
  - Periode, også «T.o.m. forrige måned» og «T.o.m. i dag».
  - Søk på fakturanummer («4,5,10..13,17..»).
  - Fakturanummer fra–til, gruppering, sortering og kolonner.
  - Fakturastatus, betalingsstatus, fakturatype, forsendelsesstatus, eksportstatus og forsendelsesmodus.
  - Inkluder manuelt opprettet historikk, fakturatagg og aktivitetstagg.
  - Prosjektnavn, prosjekttagg, avdeling, kunder, kundetagg, kundens land, valuta og visningsvaluta.
  - Forsendelsesmåte og prosjekter hvor min rolle er …
- «Lagre aktivt filter som rapport».

**Til fakturering, oversikt (bilde 2)**
- Én linje per prosjekt: nr, navn, kunde, prismodell og beløp.
- Avkryssing, «Velg alle», «Godkjenn utvalg», «Lag fakturautkast av utvalg», «Direkte i nettleseren» og «Last ned».
- «Totalt å faktureres».
- Varsel på linjen: «Timepriser er ikke spesifisert».
- Lagrede filtre: «#1 Fakturering (forrige mnd)» og «#2 Fakturering (denne mnd)».
- Filtre:
  - Vis: alle / mine / prosjektleder.
  - Periode: «T.o.m. forrige måned» eller «T.o.m. i dag», med til-dato.
  - Gruppering, sortering, kunder, prosjektnavn, status, prosjekttagg, kundetagg og produktgruppe.
  - Medlem i team, rolle i team og godkjenningsstatus.
  - Inkluder utsatte, mangelfull prising og aktivitetstagger.
  - Valuta, prosjekter med prismodell, timepriser i Excel-nedlasting og Excel-kolonner.

**Til fakturering, åpnet prosjekt (bilde 3 og 6)**
- «Prismodeller som skal faktureres» per prismodell, med hittil fakturert og klar til å faktureres.
- «Påløpt til fakturering (hittil ufakturert)»:
  - **Timer**, en linje per medarbeider og aktivitet: lås-dato (rød når den er før periodeslutt), periode, timer, «Godkjent 0 av 7», timepris, totalt, påslag og honorar.
  - **Utlegg:** navn, aktivitet, dato, godkjent, antall, enhetspris, totalt, påslag, rabatt og totalt.
  - Avkryssing på hver linje.
  - Lenkene «Vis i Timerapporten» og «Vis i Prosjektutlegg».
- Etter at utkastet er laget, blir raden stående nedtonet med «✓ Fakturert NOK …» og knappen «Gå til fakturautkast».

**Prosjektets timerapport og prosjektutlegg (bilde 4 og 5)**
- Det lenkene i bilde 3 åpner: prosjektets timer og utlegg, med fakturerbar-markering.

**Fakturautkast, lesevisning (bilde 7, 8 og 11)**
- Kunde med adresse og «Fakturamottak/Postboks», org.nr, kontaktperson, deres referanse, kontraktsreferanse og ordrereferanse.
- Fakturadato, avdeling, prosjekt, aktivitet, prosjekttagger, betalingsfrist og kontonr.
- Linjer i seksjonene Timer, Utlegg og Adm. kostnader: periode, tekst, antall, enhetspris, påslag, totalt eks. mva og mva %.
- Summering: eks. mva, mva, ink. mva, øreavrunding, totalt å betale, har betalt og igjen å betale.
- Bunntekst: fakturaspråk, bank, avsenderens adresse, e-post, telefon og org.nr.
- Sidepanel:
  - Status med avkryssingene purring sendt, inkasso pågår og rentefaktura laget.
  - Banneret «Dette er et fakturautkast».
  - Knappene Slett utkast, Oppdater utkast, Godkjenn utkast og Ferdigstill og send.
  - Notater med «Nytt notat», og endringslogg med «Legg til hendelse».
  - PDF-forhåndsvisning med logo og «FAKTURAUTKAST».
  - Last ned: faktura-utkast.pdf, Timespesifikasjoner og Faktura med timespesifikasjoner.
  - Vedlegg, der kvitteringen fra utlegget følger med, og «Last opp fakturavedlegg».
- Blaing: Forrige, Neste, Neste utkast og Siste. Fanene Fakturaoversikt og Betalinger og tap.

**Rediger utkast (bilde 9)**
- **Mottaker:** kunde (velger), org.nr, mva-nummer, adresse, tilleggslinje over og under mottakers navn, deres referanse, vår referanse og kundekontakt.
- **Fakturainformasjon:** fakturanummer («utkast»), fakturadato, avdeling, prosjekt, eksternt prosjektnummer, aktivitet, antall fakturaer på prosjekt, betalingsfrist, kontonr, KID og forsendelsesstatus.
- **Fakturatekst.**
- **Linjer:**
  - start, slutt, tekst, antall, enhetspris, påslag %, rabatt % og totalt
  - mva med konto, for eksempel «25 % (3000) Honorar avgiftspliktig» og «25 % (3001) Viderefakturerte utlegg»
  - kopier, slett, dra for å flytte og «Legg til fakturalinje»
  - adm.-kostnad som en låst linje
- Summer.

**Slett utkast (bilde 11)**
- «Hvilken status skal fakturalinjene få?»
  - *Tilbake til Til fakturering*.
  - *Før som tap:* linjene settes til fakturert uten å kobles til en faktura.

**Ferdigstill faktura (bilde 12)**
- «Send faktura» (av/på), og fanene «Send som e-faktura» og «Send som e-post».
- Melding om at kunden kan motta e-faktura.
- «I tillegg, send på e-post til» med flere mottakere.
- Svar-til, emne og brødtekst med flettefeltet `@invoiceNumber`.
- «Inkluder PDF-versjon» og «Inkluder vedlegg».

**Ferdigstilt faktura (bilde 13 og 14)**
- Meldingen «Fakturaen ble ferdigstilt», tittelen «Faktura #16722», «Antall fakturaer på prosjekt: 6» og KID.
- Knappene «Opprett kreditfaktura» og «Send faktura».
- Endringsloggen: opprettet utkast → ferdigstilte → sendt via aksesspunkt.
- PDF:
  - **Topp:** «FAKTURA 16722».
  - **Faktadel:** kundenr, kundens org.nr, fakturadato, prosjekt, «Fakturaantall: 6 på dette prosjektet», betalingsfrist, bankkonto, KID og å betale.
  - **Linjer** med antall, enhet, enhetspris, påslag %, sum eks. mva og mva %.
  - **Mva-oppstilling:** sats, grunnlag og mva.
  - **Bunntekst:** «Foretaksregisteret NO … MVA» og «Side 1 av 1».
- Vedleggene er kvitteringene.

**Krediter faktura (bilde 15)**
- «Det finnes 2 utlegg som ble fakturert i denne fakturaen. Vil du tilbakeføre status til godkjent for fakturering?»
  - Ja.
  - Nei, la stå som fakturert.

---

## 2. Lovkrav og god regnskapsskikk — og hva de betyr for ProTop

| # | Krav | Kilde | Slik må ProTop gjøre det | I dag |
|---|---|---|---|---|
| L1 | Salgsdokumentet skal minst ha: nummer og dokumentasjonsdato, partene, ytelsens art og omfang, tidspunkt og sted for levering, vederlag og betalingsforfall, og mva med beløp i NOK og sats. | Bokføringsforskriften § 5-1-1 | PDF og EHF har alle feltene. Ferdigstilling stoppes når kundens navn, adresse eller org.nr, leveringsperioden, linjer, mva eller forfall mangler. | PDF finnes ikke. Ingen kontroll før sending. |
| L2 | Selgers org.nr, med «MVA» når selskapet er mva-registrert. | § 5-1-1 | Hentes fra selskapsprofilen og vises i bunnteksten. | Finnes i EHF, ikke på PDF. |
| L3 | Foretak registrert i Foretaksregisteret skal skrive «Foretaksregisteret» på forretningsdokumenter. | Foretaksregisterloven § 10-2 | Bunntekst: «Foretaksregisteret NO 916 538 804 MVA». | Mangler. |
| L4 | Språk: norsk, svensk, dansk eller engelsk. | § 5-1-1a | Innstillingen `invoiceLanguage` styrer faste tekster på PDF og i e-post. | Lagres, brukes ikke. |
| L5 | Nummer tildeles maskinelt i en kontrollerbar sekvens. Én serie per bokføringspliktig. Ingen dobbelt nummer. | § 5-1-3. Skatteetatens prinsipputtalelser om nummerering. | Nummer settes ved utstedelse, ikke på utkast. Tildelingen skjer i en Firestore-transaksjon mot en teller per selskap og serie. Nummer gjenbrukes aldri. Fakturaer importert fra det gamle systemet teller med, så serien fortsetter (16722 → 16723). | Utkast får nummer. Telleren er «høyeste + 1» i nettleseren, så to brukere kan få samme nummer. |
| L6 | Fristen for å utstede: snarest mulig og senest én måned etter levering. Løpende tjenester: senest én måned etter utløpet av mva-terminen. Månedlig fakturering: innen 15 virkedager i måneden etter. Anbud og bygg: avtalt betalingsplan kan legges til grunn. | § 5-2-1 og § 5-2-2 | Til fakturering viser alder på eldste ufakturerte post. Rødt varsel når fristen nærmer seg eller er passert. | Mangler. |
| L7 | Forskuddsfakturering er som hovedregel ikke tillatt før levering. | § 5-2-6, GBS 13 | Linjer med periode frem i tid krever et eget valg for a konto eller betalingsplan. | Mangler. |
| L8 | Dokumentasjon skal være riktig og fullstendig, og kan ikke endres etter utstedelse. | Bokføringsloven § 10, GBS 1 | Etter utstedelse er fakturaen låst i appen og i Firestore-reglene. Retting skjer bare med kreditnota, eventuelt fulgt av ny faktura. Utkast kan endres fritt. | Utstedt faktura kan endres og slettes. Reglene tillater alt for alle medlemmer. |
| L9 | Kreditnota: viser til opprinnelig faktura med nummer og dato, har samme minimumsinnhold, utstedes av selger og sendes kjøper. Original, kreditnota og eventuell ny faktura skal alle oppbevares. | GBS 1 (januar 2026) | Krediteringen har dialog med årsak (påkrevd), valg mellom hel og delvis kreditering, og henvisning på PDF og EHF (CreditNote med BillingReference). Kreditnotaen går gjennom samme ferdigstilling og utsending. Valgfritt: «Lag ny faktura» etterpå. | Kreditnota finnes bare for «siste faktura» i denne økten. EHF-XML lages som Invoice. Ingen dialog. |
| L10 | Oppbevaring: primærdokumentasjon i 5 år etter regnskapsårets slutt. Den sendte versjonen skal kunne leses som den ble sendt. | Bokføringsloven § 13 | Ved utstedelse lagres PDF og EHF-XML uendret i Storage og kobles til fakturaen. De kan ikke slettes. Sletting av kunde eller prosjekt fjerner ikke fakturaer. | Ingen arkivering. |
| L11 | Sporbarhet fra dokument til regnskap, og fra regnskap tilbake til dokument. | Bokføringsloven §§ 4 og 10 | Endringslogg på hver faktura. Hver linje viser hvilke timer, utlegg, turer og salg den kommer fra, og hver post viser hvilken faktura den er på. | Linjene mister id-er for utlegg og salg ved lagring (`normalizeInvoiceLines`). Endringslogg mangler. |
| L12 | Utgående mva tidfestes etter dokumentasjonens dato. | Merverdiavgiftsloven § 15-9 første ledd | Fakturadatoen settes til utstedelsesdagen. Den kan ikke tilbakedateres forbi en avsluttet mva-termin. God praksis: datoen stiger med nummeret. | Datoen settes når utkastet lages, og blir ikke oppdatert ved sending. |
| L13 | Utlegg i kundens navn holdes utenfor mva-grunnlaget. Kjøp i eget navn som viderefaktureres, særlig med påslag, er en del av omsetningen og har mva. | Merverdiavgiftsloven § 4-1 annet ledd, mva-håndboken | To linjetyper. «Viderefakturert utlegg» får konto 3001 og mva etter sats, og påslaget vises for seg. «Utlegg på vegne av kunden» har ikke påslag, ikke mva og føres på mellomregning. | Alle utlegg får konto 3000. Påslaget legges inn i enhetsprisen. |
| L14 | Betalingsfrist mellom næringsdrivende: avtalt frist over 60 dager binder som hovedregel ikke. Overfor det offentlige er grensen 30 dager. | Forsinkelsesrenteloven § 2 a (kontrolleres) | Kredittid hentes fra kunde, prosjekt eller selskap. Varsel når den er over grensen. | Kredittid finnes på selskap og prosjekt, ikke på kunden. |
| L15 | Purring og inkassovarsel tidligst 14 dager etter forfall, med ny frist på 14 dager. Gebyrene har tak i inkassoforskriften. 2026-satsene ifølge Virke: purring 38 kr, inkassovarsel 38 kr og betalingsoppfordring 113 kr. Forsinkelsesrente løper fra forfall. | Inkassoloven §§ 9–10, inkassoforskriften, forsinkelsesrenteloven | Purreregler i innstillingene: dager og gebyr, der satsen begrenses til lovlig maks. Flaggene purring sendt, inkasso pågår og rentefaktura laget. Utsett påminnelse (feltet `reminderPostponedTo` finnes). Renter og gebyr er uten mva. | Bare importfelt. |
| L16 | Tap på fordring: når tapet er konstatert, kan utgående mva tilbakeføres. | Merverdiavgiftsloven § 4-7 | «Før som tap» på en *utstedt* faktura krever dato og årsak, og føres på 7830. Det er noe annet enn å *ikke fakturere* arbeid fra et utkast. | Tap-feltet finnes bare fra import. |
| L17 | Offentlige oppdragsgivere krever EHF (Peppol BIS Billing 3.0). | Forskrift om elektronisk faktura i offentlige anskaffelser | Kunder som kan motta EHF får EHF som standard. Mottakeren slås opp i Peppol-katalogen på org.nr. | EHF-XML kan lastes ned. Ingen aksesspunkt. |
| L18 | Plikt til å sende e-faktura mellom bedrifter er foreslått fra 1.1.2027 (var 2028). Krav om digitalt bokføringssystem som kan ta imot e-faktura er foreslått fra 2030. Status i Stortinget er ikke bekreftet. | Finansdepartementets forslag 2026, ifølge Sovos og TrueCommerce | EHF via aksesspunkt er standardkanalen. E-post er reserve. | — |
| L19 | Opptjeningsprinsippet: arbeid som er utført, men ikke fakturert, skal periodiseres ved periodeslutt (konto 1530). | Regnskapsloven § 4-1, god regnskapsskikk | Rapporten «Påløpt ufakturert per dato» per prosjekt og kunde, med eksport til regnskapet. | Mangler. |
| L20 | Ytelsens art og omfang kan dokumenteres med en spesifikasjon som følger fakturaen. | Skatteetatens prinsipputtalelse om angivelse av art | Timespesifikasjonen lages og arkiveres sammen med fakturaen når `attachTimeSpec` er på. | Lagres, brukes ikke. |
| L21 | Omvendt avgiftsplikt og leveranser til utlandet: fast tekst om at mva ikke er beregnet. | GBS 1 og bokføringsforskriften | Mva-kode for «utenfor avgiftsområdet» eller «snudd avregning», med automatisk fast tekst på PDF og EHF. | Mva-kodene finnes. Tekst mangler. |
| L22 | Personopplysninger i timespesifikasjonen. | Personopplysningsloven | Innstillingene for timespesifikasjonen (navn, rolle, beskrivelse) styrer hva kunden ser. | Lagres, brukes ikke. |

**Utkast og nummer.** Et utkast er ikke et salgsdokument før det utstedes. Det kan derfor endres og slettes fritt, så lenge det ikke har fått nummer. Dette er grunnen til at nummeret skal komme ved ferdigstilling.

---

## 3. Innstillingene vi har — og om de brukes

Kilder: `src/economy/companyInvoiceDefaults.js` (selskapet), `src/project/invoiceSettings.js` (prosjektet arver fra selskapet) og `src/economy/companyChart.js` (kontoer).

| Gruppe | Innstillinger | Brukes ved faktura i dag? | Skal brukes slik |
|---|---|---|---|
| Generelt | `creditDays`, `dueDateMode`, `invoiceLanguage`, `ourReferenceMode` | Bare `creditDays` | Forfall beregnes etter regelen. Språket styrer faste tekster. «Vår referanse» settes til prosjektleder eller bruker. |
| Tekster | `introText`, `footerText`, `standardLineTextHours` | Nei | Innledningen blir fakturateksten på utkastet. Standard linjetekst brukes på timelinjer. |
| Referanser | `theirReference`, `orderReference`, `contractReference`, `customerContactId`, `addressLineAbove/Below` (prosjekt), og `*ReferenceDefault` (selskap) | Nei | Følger med fra prosjektet til utkastet, og kan endres i Rediger. |
| Linjer | `groupHoursBy`, `groupExpensesBy`, `groupSalesBy`, `groupLinesBy`, `showPeriod`, `showUnit`, `showSubtotal`, `hoursVisibility`, `periodization` | Nei. Timer grupperes alltid per aktivitet. | Gruppering per medarbeider, aktivitet eller samlet, med periode per linje (start og slutt). |
| Sammendrag | `showBillingSummary`, `summaryPlacement`, `includeExpensesInSummary`, `includeSalesInSummary`, `showTimeSummaryPerActivity` | Nei | Sammendraget på PDF-en. |
| Timespesifikasjon | `attachTimeSpec`, `groupTimeEntriesBy`, `timeSpecShow*` (11 felt), `showHourlyEntries`, `showFixedEntries` | Nei | Egen PDF, og PDF-en «Faktura med timespesifikasjoner». |
| Vedlegg | `copyExpenseAttachments`, `requireInvoiceAttachment` | Nei | Kvitteringer følger med automatisk. Ferdigstilling stoppes når vedlegg er påkrevd og mangler. |
| Påslag og rabatt | `markupHourly`, `markupFixed`, `markupExpenseHourly`, `markupExpenseFixed`, `discountHours`, `discountProducts` | Nei. Påslag finnes bare på utlegget selv (`markupPercent`). | Påslag og rabatt per linje, synlige på linjen. |
| Adm.-kostnader | `adminAmount`, `adminMarkupPercent`, `adminOn*` | Nei | Egen låst linje under «Adm. kostnader». Skjermbildet viser 95 kr. |
| Kontoer | `accountFees`, `accountHours`, `accountExpenses`, `accountProducts`, `accountAdmin`, `accountAconto`, regnskapsavdeling og regnskapsprosjekt | Nei. Utlegg får alltid 3000. | Konto per linjetype: 3000, 3001 og 3100–3101 for utland. Avdeling og prosjekt følger med til regnskapet og PowerOffice. |
| EHF | `ehfMergePdf`, `ehfAlsoEmail`, `ehfAttachPdf` | Nei | Valgene i ferdigstillingsdialogen er forhåndsutfylt med disse. |
| Prismodell | `pricingModel` (ikke fakturerbar, timepris, fastpris, retainer, enhetspris) og `pricingSettings.hourlyRate` | Timepris brukes. Uten pris blir det **1000 kr uten varsel**. | Uten timepris: varsel som stopper. Fastpris og retainer går via fakturaplan (fase 5). |
| Indeks | Prisversjoner på avtalen (`priceVersions`) | Ja. Timepris på dato, og varsel om ny indeks. | Beholdes. |
| Bank og KID | Kontonummer i selskapsprofilen, KID mod10/mod11 (`kid.js`) | Ja | KID settes ved utstedelse, ikke på utkast. |
| PowerOffice | Klientnøkkel, miljø, produkt per mva-sats | Ja | Beholdes. Driftsmåten styres av om selskapet er koblet. |

**Innstillinger som mangler:**
- Nummerserie og startnummer per selskap, og egen serie for kreditnota (valgfritt).
- Om utkast må godkjennes: aldri, over et beløp eller alltid. Og hvem som godkjenner: prosjektleder eller rolle.
- E-postmal (emne og brødtekst med flettefelt), svar-til-adresse og standard kopimottaker.
- Purreregler: dager etter forfall, gebyr, inkassovarsel og rente.
- På kunden: faktura-e-post, EHF-mottak, kontaktpersoner, kredittid, språk og mva-nummer for utenlandske kunder.

---

## 4. Modulene som må henge sammen

| Modul | Gir til fakturering | Får tilbake fra fakturering | Gap |
|---|---|---|---|
| **Timer / arbeid** (`timeEntries`, `timesheetLocks`, godkjenning i `ApprovalsView`) | Godkjente, fakturerbare timer per prosjekt, aktivitet, medarbeider og timeart, med lås-dato per medarbeider (`throughDate`) | Timen er på et utkast eller fakturert på faktura X, med lenke. Fakturerte timer kan ikke endres. | Statusen «låst» betyr både levert og fakturert. Lås-datoen vises ikke på fakturasiden. |
| **Prosjektutlegg / utlegg** | Godkjente, viderefakturerbare utlegg med påslag og kvittering | Fakturert på X. Kvitteringen ligger som vedlegg på fakturaen. | Konto 3000 er hardkodet. Kvitteringen følger ikke med. Ingen typen «utlegg på vegne av kunden». |
| **Kjørebok** | Yrkesturer som skal viderefaktureres | Fakturert på X | Ok. Må vises i den åpne raden. |
| **Produktsalg / produkt** | Salg som ikke er fakturert, med varelager | Fakturert, og salget låses (#530) | Ok. Må vises i den åpne raden. |
| **Prosjekt** | Prismodell, timepris, prisversjoner, faktureringsvalg (arv), prosjektleder, team og roller, aktiviteter, avdeling og tagger | Hittil fakturert, antall fakturaer og siste faktura | Fanen «Til fakturering» viser andre tall enn Økonomi. Den teller registrerte timer og bruker ikke prisversjoner eller overtid. |
| **Kunder** | Navn, org.nr, adresse, kontaktperson og e-post | Reskontro: fakturert, utestående og forfalt | Mangler faktura-e-post, EHF, kredittid, språk og flere kontakter. |
| **Avtaler / indeksregulering** | Prisversjoner, og varsel om ny indeks før faktura | — | Ok (finnes). |
| **Fastpris / planlagte betalinger** | Betalingsplan med a konto og milepæler (GBS 13, § 5-2-2 for anbud) | Fakturert per milepæl | Mangler helt. |
| **PowerOffice Go** | Utkast med linjer, produkt per mva og kunde | Fakturanummer, KID, forsendelse, betalt og restbeløp | Ok. Driftsmåten må synes i hele flyten. |
| **Inntjening / fakturert-oppstilling** | — | Bruker fakturaer | Må regne med utstedte fakturaer, ikke utkast. |
| **Tilgangsstyring** (`economyBilling`, `economyInvoices`) | — | — | Trenger egne rettigheter: lage utkast, godkjenne utkast, ferdigstille og sende, kreditere, og registrere betaling eller tap. |
| **Varsler** | — | — | Mangler: prosjektleder får varsel når et utkast venter på godkjenning, og økonomi får varsel når det er godkjent eller forfalt. |

---

## 5. Prosessene steg for steg (målbilde)

Hver prosess beskrives med hvem som gjør den, når den kan gjøres, hva systemet gjør automatisk, og hva som stopper eller varsler.

### P1 Registrere og levere grunnlag
- **Hvem:** medarbeider.
- **Hva:** timer, utlegg med kvittering, kjøreturer og varesalg føres på prosjekt og aktivitet.
- **Levering:** medarbeideren låser timelisten t.o.m. en dato. Det er dette som skal vises som lås-dato i Til fakturering.
- **Kontroll:**
  - Ikke fakturerbar aktivitet eller prismodell gir ikke fakturagrunnlag.
  - Utlegg over 1000 kr uten kvittering gir varsel (`okonomi-full-modul.md` 3.2).

### P2 Godkjenne grunnlaget (attestering)
- **Hvem:** prosjektleder eller godkjenner etter tilgang.
- **Hvor:** i Godkjenning, og nå også direkte fra Til fakturering («Godkjenn utvalg»).
- **Automatisk:** godkjente poster blir «Godkjent for fakturering».
- **Varsel:** Til fakturering viser «Godkjent 0 av 7». Er noe i utvalget ikke godkjent, spør dialogen: «Godkjenn og lag utkast», eller «Bare godkjente».

### P3 Til fakturering (oversikten)
- **Oversikt:** én linje per prosjekt med kunde, prismodell, beløp og varsler. Totalt å faktureres øverst.
- **Periode:** «T.o.m. forrige måned» som standard, eller «T.o.m. i dag» eller en egen dato. Det følger fristene i L6.
- **Varsler per prosjekt**, i rekkefølge etter alvor:
  - **Stopper:** mangler timepris, mangler kunde, kunden mangler org.nr eller adresse.
  - **Advarsler:**
    - ikke godkjent
    - timeliste ikke levert til periodeslutt (rød lås-dato)
    - ny indeks
    - eldste post er eldre enn fristen
    - e-faktura påkrevd, men aksesspunkt mangler
- **Åpnet rad:**
  - Per prismodell: hittil fakturert og klar til å faktureres.
  - Timer per medarbeider og aktivitet.
  - Utlegg, kjøring og salg.
  - Avkryssing per linje, og lenker til timerapporten og prosjektutlegg.
- **Etter utkast:** raden blir stående nedtonet med «Utkast laget · NOK …» og «Gå til fakturautkast».
- **Samme blokk på prosjektet:** fanen «Til fakturering» på prosjektet viser denne blokken for ett prosjekt.

### P4 Lag fakturautkast
- **Hvem:** den som har rett til å lage utkast.
- **Hva systemet gjør:**
  1. Linjene bygges etter innstillingene (kapittel 3):
     - gruppering, periode, påslag og rabatt
     - adm.-kostnad, konto per linjetype og mva per linje
     - vedlegg fra utlegg og timespesifikasjon
  2. Hodet fylles ut:
     - kunde og adresse, referanser fra prosjektet, og vår referanse (prosjektleder)
     - forfall etter regelen, kontonummer og språk
     - fakturatekst (innledning)
  3. **Uten nummer og KID.** Status er Utkast.
  4. Postene blir «På utkast» og kan ikke tas med på et annet utkast.
  5. Endringsloggen får første hendelse: «X opprettet fakturautkast».
- **Flere prosjekter:** utvalget gir ett utkast per prosjekt. Valget «samle per kunde» kan komme senere.

### P5 Kontrollere og redigere utkastet
- **Lesevisning:** som på skjermbildet, med sjekkliste i sidepanelet: «Klar til å ferdigstilles» eller hva som mangler, med lenke til feltet.
- **Rediger:**
  - mottaker og fakturainformasjon
  - fakturatekst og linjer: endre, legg til, kopier, slett og flytt
  - linjer fra grunnlaget kan fjernes, og posten går da tilbake til Til fakturering
- **Oppdater utkast:**
  - henter poster som er godkjent etter at utkastet ble laget, i samme periode
  - fjerner poster som ikke lenger er gyldige
  - linjer lagt inn for hånd beholdes
  - viser hva som ble endret før det lagres
- **Notater og logg:** notater med navn og tid, og endringslogg for hver endring.
- **Forhåndsvisning:** PDF med «FAKTURAUTKAST», og timespesifikasjon.

### P6 Godkjenne utkastet (valgfritt, styrt av innstilling)
- **Hvem:** prosjektleder eller den rollen som er valgt.
- **Når:** innstillingen avgjør: aldri, over et beløp eller alltid.
- **Effekt:**
  - «Godkjent av X» i loggen.
  - Endres utkastet etterpå, faller godkjenningen bort.
  - Ferdigstill er låst til utkastet er godkjent når godkjenning kreves.

### P7 Slette utkast
- **Dialog med to valg:**
  1. **Tilbake til Til fakturering** (standard): postene blir «Godkjent for fakturering» igjen.
  2. **Ikke fakturer (avskriv):**
     - årsak er påkrevd
     - postene blir «Ikke fakturert» og vises ikke lenger i Til fakturering
     - hvem, når og årsak lagres på posten
     - dette er ikke tap på fordring (L16), fordi ingen inntekt er ført
- **Utstedte fakturaer:** kan ikke slettes, se P12.

### P8 Ferdigstille (utstede)
- **Hvem:** den som har rett til å ferdigstille.
- **Kontroller som stopper** (L1–L5):
  - kundens navn, adresse og org.nr (org.nr for bedrift)
  - minst én linje og sum ulik 0
  - mva på alle linjer
  - forfall, kontonummer, selgers org.nr og leveringsperiode
  - påkrevd vedlegg
  - godkjenning når den kreves
- **Advarsler:** ny indeks, frist passert (L6) og kredittid over grensen (L14).
- **Hva systemet gjør:**
  1. Fakturadato settes til i dag (kan endres, men ikke tilbake forbi en avsluttet mva-termin).
  2. Neste nummer tildeles i en transaksjon.
  3. KID og forfall beregnes.
  4. PDF og EHF-XML lages og arkiveres uendret (L10).
  5. Bilag lages, eller utkastet overføres til PowerOffice.
  6. Postene blir «Fakturert». Fakturaen blir skrivebeskyttet.
  7. Loggen får «X ferdigstilte faktura».
- **Med PowerOffice:** ferdigstilling betyr overføring. Nummer og KID kommer tilbake fra PowerOffice. ProTop tildeler aldri eget nummer.

### P9 Sende
- **Kanaler:**
  - **EHF via aksesspunkt.** Standard når kunden kan motta EHF. Påkrevd for det offentlige.
  - **E-post** med PDF og vedlegg, til kundens faktura-e-post.
  - **PowerOffice.**
  - **Manuelt:** skriv ut eller last ned, og marker som sendt.
- **Dialogen:** kanal velges automatisk ut fra kunden. Dialogen har også «I tillegg send på e-post til», emne og tekst fra malen med flettefelt, og avkryssing for PDF og vedlegg.
- **Etter sending:**
  - Loggen får «Sendt via … til …».
  - Status: sendt, eller sending feilet med årsak.
  - Fakturaen kan sendes på nytt.
- **Flere utkast:** «Ferdigstill og send valgte» i fakturalisten, med kontrollen over for hvert utkast.

### P10 Innbetaling
- **Registrering:** «Opprett betaling» i listen og på fakturaen, med dato, beløp og konto. Delbetaling er mulig.
- **Automatisk avstemming:** på KID via bankfil eller PowerOffice-synk.
- **Visning:** har betalt og igjen å betale, overbetaling og betalingshistorikk.

### P11 Purring og inkasso
- **Forslagsliste:** forfalte fakturaer etter reglene (L15).
- **Purring:**
  - brev eller e-post med gebyr innenfor taket
  - flagget «Purring sendt» og ny frist
  - «Utsett påminnelse til» (`reminderPostponedTo`)
- **Videre:**
  - Inkassovarsel, og deretter «Inkasso pågår» når saken er sendt til byrå.
  - Rentefaktura med forsinkelsesrente fra forfall. Den er et eget dokument uten mva.

### P12 Kreditere
- **Hvem:** den som har rett til å kreditere.
- **Dialog:**
  1. Hel eller delvis kreditering. Ved delvis velges linjer eller beløp.
  2. Årsak er påkrevd.
  3. Spørsmål som på skjermbildet: «Det finnes N timer og M utlegg på fakturaen. Skal de tilbake til Godkjent for fakturering?» Ja eller nei.
- **Hva systemet gjør:**
  - Kreditnota med henvisning (L9) som ferdigstilles og sendes som en faktura.
  - Originalen merkes «Kreditert» eller «Delvis kreditert».
  - Snarvei: «Lag ny faktura» fra de samme postene.

### P13 Tap på fordring
- **Når:** på en utstedt og ubetalt faktura.
- **Hva:** konstatert tap med dato og årsak. Mva tilbakeføres (L16), og tapet føres på 7830. Status blir Tap.

### P14 Periodeavslutning og rapporter
- **Påløpt ufakturert per dato:** per prosjekt, kunde og alder (L19).
- **Kundereskontro:** fakturert og ikke betalt, fordelt på alder.
- **Fakturalisten:** som rapport med lagrede filtre.

---

## 6. Statuser — ett språk i alle moduler

**Grunnlag** (timer, utlegg, kjøreturer og salg)

| Status | Betyr | Neste steg |
|---|---|---|
| Registrert | Ført, ikke levert | Levert |
| Levert | Timelisten er låst av medarbeideren for kontroll | Godkjent eller avvist |
| Godkjent for fakturering | Klar til faktura | På utkast |
| På utkast | Reservert av et utkast, med lenke | Fakturert, eller tilbake til godkjent |
| Fakturert | Ligger på en utstedt faktura, med lenke, og er låst | (Krediteres, og blir eventuelt godkjent igjen) |
| Ikke fakturert | Avskrevet fra utkast, med årsak | — |
| Ikke fakturerbar | Aktiviteten eller prismodellen faktureres ikke | — |

**Faktura**

| Status | Betyr |
|---|---|
| Utkast | Kan endres og slettes. Har ikke nummer. |
| Godkjent utkast | Godkjent av prosjektleder. Faller bort ved endring. |
| Ferdigstilt | Har nummer og er låst og arkivert. Ikke sendt ennå. |
| Sendt | Sendt via EHF, e-post, PowerOffice eller manuelt |
| Delbetalt / Betalt | Etter innbetaling |
| Forfalt | Forfall passert uten full betaling. Regnes ut, lagres ikke. |
| Kreditert / Delvis kreditert | Kreditnota er utstedt |
| Tap | Konstatert tap |
| Kreditnota | Dokumenttypen, med henvisning til original |

Flaggene «Purring sendt», «Inkasso pågår» og «Rentefaktura laget» kommer i tillegg til statusen.
Ordet **«Låst»** brukes bare om timelisten.

---

## 7. Brukeropplevelsen — prinsipper

1. **Én vei gjennom.** Til fakturering → Utkast → Faktura. Hver side har én tydelig hovedknapp for neste steg. Det er alltid en vei tilbake, og «Neste utkast».
2. **Vis problemet før knappen trykkes.** Bruk sjekkliste og varsler i stedet for feilmelding etter klikk. Hvert varsel lenker til stedet det rettes.
3. **Masseoperasjoner der arbeidet er gjentagende.** Godkjenn utvalg, lag utkast av utvalg, og ferdigstill og send valgte.
4. **Penger vises likt overalt.** Eks. og ink. mva, påslag og rabatt vises for seg, og hittil fakturert og klar til faktura står side om side.
5. **Ingen stille konsekvenser.** Når poster flyttes, avskrives eller krediteres, spør dialogen med klare valg (som bilde 11 og 15), og loggen viser hva som skjedde.
6. **Det som er utstedt, står fast.** Knappene for å endre forsvinner, og «Opprett kreditnota» står der i stedet.
7. **Rettigheter forklarer seg selv.** En knapp man ikke har tilgang til vises nedtonet med «Krever rettigheten Ferdigstille faktura», eller vises ikke.
8. **Mobil:** se, godkjenne og sende. Tung redigering av linjer gjøres på stor skjerm.
9. **Samme ord i alle moduler** (kapittel 6). Prosjektfanen og Økonomi viser de samme tallene, fordi de bruker samme funksjon.

---

## 8. Gap i koden før byggingen

Tabellen viser utgangspunktet. Kapittel 11 viser hva som er bygget.

| Område | Fil | Gap |
|---|---|---|
| Nummer | `billingFromOperations.js`, `billingFromHours.js` (`nextInvoiceNumber`) | Nummer på utkast, regnet ut i nettleseren uten transaksjon |
| Linjer | `linesFromEntries`, `expenseInvoiceLine` | Timer per aktivitet, ingen periode per linje, påslaget ligger i prisen, konto 3000 overalt |
| Lagring av linjer | `normalizeInvoiceLines` i `invoices.js` | Dropper `expenseIds`, `saleIds`, `tripIds`, periode, påslag og rabatt |
| Innstillinger | `companyInvoiceDefaults.js`, `invoiceSettings.js` | Lagres, men leses ikke av fakturamotoren |
| Timepris | `projectHourlyRate` | Reservepris 1000 uten varsel |
| Bilag og EHF | `EconomyBilling.createInvoice` | Bilag og EHF lages på utkastet |
| Sending | `markInvoiceAsSent` | Merker bare. Ingen PDF eller e-post. Ingen Cloud Function. (`sendIndeksLetter` viser at mønsteret finnes.) |
| Sletting | `canDeleteInvoice`, `confirmDeleteInvoice` | Ikke-sendte fakturaer kan slettes selv om de har nummer. Grunnlaget frigjøres uten å spørre. |
| Kreditnota | `EconomyBilling.createCreditNote` | Bare «siste faktura i økten». Ingen dialog eller tilbakeføring. XML lages som Invoice. |
| Firestore-regler | `firestore.rules` (`/{coll}/{doc}`) | Alle medlemmer kan endre og slette fakturaer |
| Til fakturering | `EconomyBilling.jsx`, `ProjectBillingReadyTab.jsx` | Kort per prosjekt, ingen avkryssing, periode, åpen rad eller masseoperasjon. Ulike regler i de to visningene. |
| Fakturasiden | `EconomyInvoices.jsx` (`InvoiceDetail`) | Ingen redigering, PDF-generering, timespesifikasjon, notatliste, endringslogg, purreflagg eller betaling |
| PDF | `src/indeksregulering/office.js` | PDF-skriver med logo finnes for varselbrevet og kan gjenbrukes |
| Kunde | `src/anbud/customers.js` | Ingen faktura-e-post, EHF-flagg, kredittid eller språk |

---

## 9. Beslutninger

### Avgjort 27.10.2026

- **ProTop utsteder fakturaer selv.** EHF er standardkanalen. E-post og de andre kanalene skal også kunne brukes. PowerOffice-modus støttes i tillegg.
- **Nummerserie.**
  - Startnummeret settes på en egen innstillingsside.
  - ProTop setter nummeret ved ferdigstilling: høyeste nummer i fakturalisten + 1, men aldri lavere enn startnummeret.
  - Hull fylles aldri, fordi det ville bryte den kontrollerbare sekvensen (L5).
- **Utkast** lages, og kan godkjennes av alle med tilgang til fakturering.
- **EHF-avtalen avklares før byggingen starter.** ProTop kobler seg til et eksisterende aksesspunkt via API og blir ikke eget aksesspunkt.

### Opprinnelig liste

1. **Driftsmåte.** Skal ProTop utstede fakturaer selv, med nummerserie, PDF, utsending og arkiv, når PowerOffice ikke er koblet? Eller er PowerOffice alltid regnskaps- og fakturasystemet? *Anbefaling:* støtt begge, valgt per selskap. Er PowerOffice koblet, tildeler ProTop aldri nummer.
2. **Nummerserie.** Hvis ProTop utsteder: fortsetter vi fra høyeste importerte nummer (16722 → 16723)? Det gir én sammenhengende serie per selskap, slik L5 krever.
3. **Godkjenning av utkast.** Skal det kreves, og av hvem? *Anbefaling:* innstillingen «aldri / over beløp / alltid», med prosjektleder som standard godkjenner.
4. **E-faktura uten PowerOffice.** EHF krever avtale med et aksesspunkt, og det er et kostnads- og avtalevalg. Inntil da går EHF via PowerOffice, og e-post brukes ellers.
5. **Navn på avskrivning.** *Anbefaling:* «Ikke fakturer (avskriv)» i stedet for «Før som tap», så det ikke forveksles med tap på fordring.
6. **Bokføring når ProTop utsteder.** Hvem bokfører? Eksport av bilag (SAF-T eller CSV) til regnskapet, eller bare PowerOffice-modus?

---

## 10. Byggeplan i faser

Hver fase kan gå live alene.

1. **Grunnmur (motor og regler).**
   - Utkast uten nummer, de nye statusene og linjemodellen (periode, påslag, rabatt, konto og kilde-id-er).
   - Innstillingene tas i bruk (kapittel 3).
   - Endringslogg og notater.
   - Nummer i transaksjon ved ferdigstilling, og låsing etter utstedelse i appen og i Firestore-reglene.
   - Enhetstester.
2. **Til fakturering.**
   - Listen med avkryssing, periode, varsler, åpen rad, «Godkjenn utvalg» og «Lag fakturautkast av utvalg».
   - Den samme blokken på prosjektet.
3. **Utkastet.**
   - Lesevisning og Rediger.
   - Oppdater utkast og Slett med to valg.
   - Godkjenning, sjekkliste, PDF-forhåndsvisning, timespesifikasjon og vedlegg fra utlegg.
4. **Ferdigstill og send.**
   - Kontrollene og nummer.
   - PDF og XML arkivert.
   - E-post via Cloud Function, PowerOffice og manuell sending.
   - Kreditnota med hel eller delvis kreditering og tilbakeføring av grunnlag.
5. **Etter sending.**
   - Innbetaling og purring/inkasso-flagg.
   - Rentefaktura og tap.
   - Fakturalisten: forhåndsvisning, «Opprett betaling» og nummer fra–til.
   - Rapportene «Påløpt ufakturert» og reskontro.
   - Fakturaplan for fastpris.
   - EHF via aksesspunkt når avtalen finnes.

---

## 11. Slik er det bygget

### To driftsmåter

| | PowerOffice koblet til | PowerOffice ikke koblet |
|---|---|---|
| Utkast | Lages, endres og godkjennes i ProTop | Samme |
| Nummer og KID | Settes av PowerOffice | Settes av ProTop ved ferdigstilling |
| Sending | PowerOffice sender etter kundens oppsett der | ProTop sender som EHF eller e-post, eller «Send selv» |
| Arkiv | I PowerOffice | PDF, EHF-XML og timespesifikasjon i Storage, lenket fra fakturaen |

Driftsmåten følger koblingen. Innstillingssiden viser hvilken som gjelder.

### Flyten i appen

1. **Til fakturering** (Økonomi og prosjektfanen) samler ufakturerte timer, utlegg, kjøring og salg per prosjekt.
   - Varsler stopper eller advarer: manglende timepris, kunde uten org.nr. og adresse, ikke godkjent, timeliste ikke levert, og fakturafristen.
   - Fastpris viser resten av avtalt beløp. Timer uten pris vises som «x t uten pris».
2. **Lag fakturautkast av utvalg**.
   - Spør først hvis noe ikke er godkjent: godkjenn samtidig, eller ta bare med det som er godkjent.
   - Postene reserveres på utkastet, og to brukere kan ikke reservere de samme postene.
3. **Utkastet** har lesevisning og «Rediger»: mottaker, fakturainformasjon, linjer per seksjon, tekster og vedlegg.
   - «Oppdater utkast» henter ferske poster.
   - «Slett utkast» spør om postene skal tilbake til Til fakturering, eller avskrives med årsak.
4. **Ferdigstill og send**:
   - kontrollene (kapittel 2)
   - nummer fra serien i én transaksjon
   - KID, bilag og arkiv-PDF
   - sending som EHF, e-post eller «Send selv»
5. **Etter utstedelse**:
   - Betaling registreres på fakturaen eller fra raden i listen.
   - Purring, inkasso og rentefaktura merkes.
   - Tap føres med årsak.
   - Feil rettes med kreditnota, hel eller per linje. Kreditnotaen kan sette postene tilbake til Til fakturering.
   - Kreditnotaen motregnes mot fakturaen, så utestående ikke telles to ganger.

### Låsing og kontroll

- **Firestore-reglene (`firestore.rules`, `match /invoices`).**
  - En faktura med `issuedAt` kan ikke slettes.
  - Nummer, datoer, KID, kunde, linjer, beløp og prosjekt kan ikke endres.
  - Arkivet kan fylles inn, men ikke byttes.
  - Status, betalinger, forsendelser, merker, notater og hendelser kan oppdateres.
- **Nummerserien (`invoiceSeries/main`).**
  - Telleren går bare oppover og kan ikke slettes.
  - En faktura kan bare få nummer i samme skriving som telleren flyttes fram til det nummeret. Dermed kan to fakturaer aldri få samme nummer.
- **Tester.** Testene ligger i `tests/rules/invoices.rules.test.mjs` og kjøres i PR-verifiseringen og før reglene deployes.
- **Deploy av reglene.** Reglene deployes ikke automatisk med Hosting. Workflowen «Deploy Firestore rules» må kjøres etter merge.

### Innstillinger

Økonomi → Innstillinger → Fakturastandarder:

- første fakturanummer, med neste nummer vist
- KID-format og kontrollsiffer
- om utkast må godkjennes
- kredittid, språk, forfall og vår referanse
- timer per medarbeider eller aktivitet
- periode på linjene, timespesifikasjon og kvitteringer
- standard forsendelse og EHF-valg
- e-postmaler for faktura og kreditnota, svar til og kopi
- purring: dager etter forfall og gebyr, maks 38 kr

På kunden: faktura-e-post, «Deres referanse», kredittid, forsendelse og språk. Kundens valg går foran selskapets standard.

### Timepris og kontoer må være satt

Avgjort 27.10.2026: ingenting faktureres før parameterne er satt.

- **Ingen reservepris.**
  - Mangler timeprisen, stoppes hele prosjektet i Til fakturering, også utleggene. Raden forklarer hva som mangler og lenker til Faktureringsvalg.
  - Ferdigstilling stopper timelinjer uten pris.
- **Alle kontogrupper settes under Økonomi → Innstillinger → Standard regnskapskontoer**, for kunder i Norge og i utlandet:

  | Kontogruppe | Standardkonto i Norge | Standardkonto i utlandet |
  |---|---|---|
  | Timer | 3000 | 3100 |
  | Honorar og fastpris | 3000 | 3100 |
  | Viderefakturerte utlegg | 3001 | 3101 |
  | Utlegg på vegne av kunden | 6301 | 6301 |
  | Kjøring | 3001 | 3101 |
  | Produkter og varesalg | 3001 | 3101 |
  | Adm. kostnader | 3000 | 3100 |
  | A-konto | 3000 | 3100 |
  | Avrunding | 7771 | 7771 |

  - Prosjektet kan overstyre enkeltkontoer under Faktureringsvalg.
  - Fakturamotoren har ingen reservekontoer.
  - Mangler en konto, eller finnes den ikke i kontoplanen, stoppes prosjektet. Utkast og ferdigstilling stopper linjer uten konto.
  - Mva-satsen på linjen følger kontoen i kontoplanen.
- **Utlegg (L13).** På utlegget velges «Viderefakturering» eller «Utlegg i kundens navn».
  - *Viderefakturering* (kjøp i eget navn):
    - Beløpet eks. mva føres på konto for viderefakturerte utlegg (3001).
    - Påslaget står i egen kolonne, ikke i enhetsprisen.
    - Linjen får mva etter sats.
  - *Utlegg i kundens navn*:
    - Bruttobeløpet fra kvitteringen føres uten påslag og uten mva, på konto for utlegg på vegne av kunden (6301, mva-kode 7).
    - Linjen står i egen seksjon og regnes ikke med i adm.-kostnad.
    - I EHF har den mva-kategori Z, som kan stå sammen med linjer med mva.

### Koble til EHF (aksesspunkt)

ProTop sender EHF gjennom et eksisterende Peppol-aksesspunkt.

1. Inngå avtale med en leverandør av aksesspunkt som har et API for sending.
2. Få selskapets org.nr. registrert som mottaker og avsender i ELMA.
3. Opprett to hemmeligheter i Secret Manager i `protop-c189c`, på samme måte som e-postnøkkelen:
   - `PEPPOL_API_KEY`: API-nøkkelen fra leverandøren
   - `PEPPOL_SEND_URL`: https-adressen EHF-fila postes til

   De leses når funksjonen kjører (`functions/runtimeSecret.js`), så funksjonene trenger ikke deployes på nytt.
4. Hvis leverandøren krever et eget format: lag en tilpasning i `functions/peppolProvider.js` og sett `PEPPOL_PROVIDER`. Standard er «generic», som poster XML-en med `Authorization: Bearer <nøkkel>` og leser id og status fra JSON-svaret.
5. Send en testfaktura til eget org.nr.

Funksjonene i `functions/invoiceIndex.js` (e-post, EHF og mottakeroppslag) deployes automatisk når de endres på `main`.

Mottakeroppslaget bruker den åpne Peppol-katalogen og virker allerede. Til aksesspunktet er koblet, svarer EHF-sendingen «ikke koblet», og dialogen tilbyr e-post.

### Ikke bygget ennå

- Purrebrev og rentefaktura som dokument. I dag finnes bare merker og frist.
- Rapportene «Påløpt ufakturert» og reskontro.
- Fakturaplan for fastpris. I dag legges et fast beløp inn per utkast.
- Eksport av bilag (SAF-T eller CSV) når ProTop utsteder uten PowerOffice.

---

## Kilder

- Regnskapsstiftelsen, GBS 1 «Kreditnota – innhold, utstedelse, bokføring og oppbevaring» (januar 2026): https://www.regnskapsstiftelsen.no/wp-content/uploads/2026/02/2026-01-GBS-1-Kreditnota-%E2%80%93-innhold-utstedelse-bokforing-og-oppbevaring-januar-2026.pdf
- Regnskapsstiftelsen, GBS 13 Forskuddsfakturering (august 2026): https://www.regnskapsstiftelsen.no/wp-content/uploads/2026/08/GBS-13-HU-Forskuddsfakturering-oppdatert-20.08.26.pdf
- Revisorforeningen, «Endringer i GBS 1 og 2 vedtatt»: https://www.revisorforeningen.no/fag/nyheter/endringer-i-gbs-1-og-2-vedtatt/
- Skatteetaten, prinsipputtalelse om angivelse av art i salgsdokumentet: https://www.skatteetaten.no/rettskilder/type/uttalelser/prinsipputtalelser/angivelse-av-art-i-salgsdokumentet-med-videre/
- Skatteetaten, prinsipputtalelser om nummerering av salgsdokument: https://www.skatteetaten.no/rettskilder/type/uttalelser/prinsipputtalelser/nummerering-av-salgsdokument/ og https://www.skatteetaten.no/rettskilder/type/uttalelser/prinsipputtalelser/nummerering-av-salgsdokument--bruk-av-felles-faktureringssystem/
- Skatteetaten, mva-håndboken § 15-9 (tidfesting): https://www.skatteetaten.no/rettskilder/type/handboker/merverdiavgiftshandboken/2020/M-15/M-15-9/M-15-9.3/
- Skatteetaten, mva-håndboken § 4-1 annet ledd (utlegg): https://www.skatteetaten.no/rettskilder/type/handboker/merverdiavgiftshandboken/2020/M-4/M-4-1/M-4-1.4/
- Stortinget, Innst. 4 L (2013–2014), oppbevaringstid 5 år: https://stortinget.no/no/Saker-og-publikasjoner/Publikasjoner/Innstillinger/Stortinget/2013-2014/inns-201314-004/29/
- Revisorforeningen, oversikt over oppbevaringstider (2020): https://www.revregn.no/asset/pdf/2020/05/2020-05_48.pdf
- Virke, nøkkelsatser for salærer og gebyrer i inkassobransjen 2026: https://www.virke.no/bransjeomrade/tjenester/finans/inkasso/nokkelsatser-for-salarer-og-gebyrer-i-inkassobransjen/
- Finanstilsynet, oversikt over utenrettslige inndrivingskostnader: https://finanstilsynet.no/forbrukerinformasjon/inkassovirksomhet/oversikt-over-utenrettslige-inndrivingskostnader
- Sovos, e-faktura i Norge (frist flyttet til 1.1.2027): https://sovos.com/vat/tax-rules/norway-e-invoicing/
- TrueCommerce, «E-invoicing i Norge: Nye B2B-krav fra 2027»: https://www.truecommerce.com/da/blog/e-fakturering-norge/

Tidligere kartlegginger i repoet: `docs/okonomi-full-modul.md`, `docs/arbeid-faktura-research.md` og `docs/poweroffice-integrasjon.md`.
