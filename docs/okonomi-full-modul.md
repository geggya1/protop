# Full økonomimodul: timer, utlegg, kjørebok, varesalg og faktura

Dato: 2026-10-10  
Kilder: PowerOffice Go, Visma.net Expense / eAccounting, Tripletex, Fiken, Moment/Milient, bokføringsforskriften, merverdiavgiftshåndboken, Skatte-ABC B-5, forskrift om satser 2026 (Lovdata).

Forrige runde (`docs/arbeid-faktura-research.md`) dekket **timer → faktura → KID/MVA/bilag/EHF**. Det er nødvendig, men **ikke** en fullverdig økonomimodul. Dette dokumentet kartlegger hele behovet.

---

## 1. Hva en norsk prosjektbedrift faktisk trenger

En bedrift som lever av prosjekter (rådgivning, bygg, håndverk) fakturerer typisk **fire inntektskilder** på samme kunde/prosjekt:

| Kilde | Eksempel | I konkurrentene |
|-------|----------|-----------------|
| Timer | Befaring 7,5 t × timepris | PowerOffice timeart, Moment grid, Visma PM |
| Utlegg | Materiale, parkering, representasjon | Tripletex Reiser & utlegg, Visma Expense, Moment/Milient |
| Kjørebok | Km-godtgjørelse + bom | Fiken kjørebok, Tripletex kjøring, Visma Expense kjøring |
| Varesalg | Materiale/stykk/tjenesteprodukt | Fiken Produkter, PowerOffice produkt + stykk, eAccounting Salg |

PowerOffice **Fakturaforslag** samler nettopp timer + fastpris + viderefakturerte kostnader. Fiken skiller «Jeg har solgt noe» (produktlinjer) fra kjørebok-viderefakturering. Tripletex sender godkjente utlegg/reiser til **lønn og/eller fakturagrunnlag**.

ProTop hadde (før denne runden) bare **timer** i fakturagrunnlaget. Utlegg/kjørebok/produkter fantes kun som **Excel-aggregatfelt** på importerte fakturaer.

---

## 2. Leverandørkart (dekkende)

### 2.1 Timeføring

| Funksjon | PowerOffice | Visma PM | Moment | Tripletex | Fiken |
|----------|-------------|----------|--------|-----------|-------|
| Dag/uke/måned | Ja | Ja | Grid + dag | Ja | Enkel |
| Kunde / prosjekt / aktivitet | Ja | Ja | Ja | Ja | Ja |
| Timeart / overtid | Ja | Ja | Delvis | Ja | — |
| Intern/ekstern kommentar | Ja | Ja | Ja | Ja | — |
| Fakturerbar vs medgått | Ja + påslag/avrunding | Ja | Ja | Ja | — |
| Godkjenning / lås | Ja | Ja | Ja | Ja | — |
| Fravær / ferie | Ja | Ja | Ja | Ja | — |
| Stoppeklokke | Ja | — | — | App | — |
| Flex / avtalt tid | Ja | Ja | Ja | Ja | — |
| Timerapport + vedlegg på faktura | Ja | Ja | Ja | Ja | — |

### 2.2 Utlegg / reiseregning

| Funksjon | Tripletex | Visma Expense | Moment/Milient | PowerOffice |
|----------|-----------|---------------|----------------|-------------|
| Kvittering (foto) | Ja | Ja | Ja | Via bilag |
| Kategori / konto | Ja | Utleggstype | Maler | Prosjektbilag |
| Godkjenning leder | Ja | Ja | Ja + retur | Ja |
| Valuta | Ja | Ja | Ja | Ja |
| Representasjon (ekstra felt) | Ja | Ja | — | — |
| Diett | Automatisk | Ja | — | — |
| Viderefakturering + påslag | Ja | ERP | Ja | Kostnad + påslag |
| Til lønn / utbetaling | Ja | Ja | Via Tripletex | — |
| Kredittkortimport | — | Ja | — | — |
| Firmakort vs privat utlegg | Ja | Ja | Ja | Ja |

### 2.3 Kjørebok

| Funksjon | Fiken | Tripletex | Visma Expense | GPS (ABAX/Autogear) |
|----------|-------|-----------|---------------|---------------------|
| Fra/til + formål | Ja | Ja + 1881 | Ja | Automatisk |
| Km + sats | Ja (skattefri) | Ja | Ja | Ja |
| Bom / parkering | Ja | Ja | Ja | Ja |
| Passasjer / tilhenger | — | Ja | Ja | — |
| Privat vs yrke | Ja | Firmabil-flagg | Ja | Formålsfelt |
| Kilometerstand måned | Anbefalt | — | — | Total vs yrke |
| Viderefakturering | Ja | Via integrasjon | ERP | Prosjekt |
| Rapport PDF/Excel | Ja | Ja | Ja | Ja |
| Elektronisk (GPS, ikke-slettbar) | Nei (manuell) | Nei | Import | Ja |

### 2.4 Varesalg / produkter

| Funksjon | Fiken | PowerOffice | eAccounting | Tripletex |
|----------|-------|-------------|-------------|-----------|
| Produktkatalog | Vare/tjeneste/annet | Produkt + salgskonto | Produkter | Produkter |
| Varenr / enhet / pris eks/ink | Ja | Ja | Ja | Ja |
| MVA per produkt | Ja | Ja | Ja | Ja |
| Kostpris | Ja | Ja | — | Ja |
| Lager / beholdning | Valgfritt | Integrasjon POS | — | Delvis |
| Fakturalinje fra produkt | Ja | Ja | Ja | Ja |
| Fritekstlinje + konto | Ja | Ja | Ja | Ja |
| Tilbud → ordre → faktura | — | Ja | Tillegg | Ja |
| Kontantsalg / kassa | — | POS-integrasjon | — | — |
| Repeterende faktura | — | Ja | — | Ja |

### 2.5 Faktura og etterbehandling

| Funksjon | Status i ProTop 2026-10-09 | Mål |
|----------|----------------------------|-----|
| Utkast / sendt / betalt / kreditert | Delvis (import + opprett) | Full statusflyt |
| Linjer fra timer | OK | Behold |
| Linjer fra utlegg / km / varer | Manglet | P0 denne runden |
| KID MOD10/11 | OK | Behold |
| MVA-koder 0/12/15/25 | OK | Per linje også for varer |
| EHF XML nedlasting | OK | Behold |
| EHF-sending (AP / ELMA) | Mangler | P2 |
| Fakturanummerserie | max+1 fra 10000 | P1 konfigurerbar |
| PDF-generering | Kun opplasting | P1 |
| Registrer innbetaling | Kun importfelt | P1 |
| Purre / gebyr | Felt kun | P1 |
| Kreditnota | Fra fakturagrunnlag | Også fra fakturadetalj |
| Bilag (1500/salg/MVA) | Snapshot | Egen journal P1 |
| SAF-T | Mangler | P2 |
| Lønn / A-melding | Mangler | P2 |

---

## 3. Lovpålagt og nødvendig (Norge)

### 3.1 Salgsdokument (bokføringsforskriften kap. 5-1)

Faktura/EHF skal minst ha: selger (navn + org.nr + MVA), kjøper, nummer, dato, ytelse, mengde, vederlag, forfall, MVA i NOK. Kontantsalg krever kassasystem med mindre unntak (lav omsetning).

### 3.2 Utlegg (bokføringsforskriften § 5-5-1 / MVA-håndboken 15-10.2)

- Kjøp til **videresalg eller innsatsfaktor** over **kr 1 000 inkl. MVA**: kvittering skal angi **arbeidsgiver som kjøper**.
- Andre utlegg: datert, signert oppstilling med formål/bruk.
- Utleggsdokumentasjon innenfor MVA-terminen.
- Inngående MVA krever gyldig salgsdokument (selger org.nr + «MVA», spesifisert avgift).
- Anskaffelse ≥ kr 10 000 inkl. MVA: betaling via bank for MVA-fradrag (mval. § 8-8).

### 3.3 Kjørebok (Skatte-ABC B-5-4)

- Ingen plikt, men **avgjørende dokumentasjon** for yrkeskjøring.
- Fortløpende: start, besøkte steder (firma/byggeplass), slutt, km ifølge teller.
- Kilometerstand minst **månedlig**.
- Ført kjørebok = oppbevaringspliktig regnskapsmateriale (bokføringsloven § 13).
- **Elektronisk kjørebok** (GPS): faktisk distanse, dato/klokkeslett, **ikke slett/endre** disse; formål privat/yrke. Kreves for individuell verdsettelse av firmabil.

### 3.4 Satser 2026 (forskrift 2025-11-07-2216)

| Regel | Sats |
|-------|------|
| Skattefri km-godtgjørelse privat bil (også el) | **kr 3,50 / km** |
| Firmabil privat fordel, individuell (elektronisk kjørebok) | **kr 3,40 / km** |
| Over 6 000 km/år med egen bil | Faktiske utgifter / regnskap, ikke bare sats |

### 3.5 MVA på kjøring og utlegg

- Km-godtgjørelse er **ikke MVA-pliktig** (godtgjørelse, ikke omsetning). Ved **viderefakturering** til kunde brukes vanligvis MVA på tjenesten (høy sats) eller avtalt behandling.
- Bilkostnader har som hovedregel **ikke MVA-fradrag** (unntak grønne skilt / yrkesbil).
- Representasjon: begrenset fradrag (skatt + MVA) — kategori må merkes.

### 3.6 Varesalg

- Produktlinjer på faktura med korrekt MVA-kode (25/15/12/0).
- Lagerverdi og varekost (konto 4xxx) ved videresalg — P1.
- Kontantsalg: kassasystem dersom over unntaksgrense.

---

## 4. Kravspek (målbilde ProTop)

### A. Timer (finnes, utvide)

1. Grid/dag, timeart, godkjenning, lås ved faktura — **OK**
2. Periode-lås og masse-godkjenning — P1
3. Flex/saldo utover 7,5 t — P1
4. Stoppeklokke — P2
5. Timespesifikasjon som fakturavedlegg — P1

### B. Utlegg (nytt P0)

1. Registrer utlegg: dato, beløp eks/ink, MVA, kategori, formål, ansatt
2. Kunde/prosjekt/ordre (valgfritt)
3. Betalt av: privat / firmakort
4. Kvittering (fil/URI) + varsel hvis beløp > 1 000 uten vedlegg
5. Status: utkast → sendt → godkjent / avvist → utbetalt / fakturert
6. Viderefakturerbar + påslag %
7. Representasjon-flagg
8. Inn i fakturagrunnlag når godkjent og billable
9. Rapport / CSV

### C. Kjørebok (nytt P0)

1. Tur: dato, fra, via/til, formål, km, kilometerstand start/slutt
2. Type: yrkes / privat / hjem–arbeid
3. Bil: privat / firmabil, el/fossil
4. Bom, parkering, passasjerer
5. Sats 3,50 (2026) + trekkfritt/trekkpliktig
6. Månedlig avlesning av teller
7. Viderefakturering til kunde/prosjekt
8. CSV/rapport som oppfyller Skatte-ABC-feltene
9. GPS-import / låst elektronisk logg — P2

### D. Varesalg (nytt P0)

1. Produktkatalog: navn, varenr, type (vare videresalg / egen / tjeneste / annet)
2. Enhet, standardpris, kostpris, MVA, inntektskonto
3. Valgfri lagerbeholdning
4. Salgslinjer mot kunde/prosjekt (stykk)
5. Inn i fakturagrunnlag / direkte fakturalinje
6. Lagerbevegelse og varetelling — P1
7. Tilbud → ordre — P1
8. Kassa/POS — P2

### E. Fakturagrunnlag (utvide P0)

Ett sted, som PowerOffice: **timer + utlegg + kjøring + varer**, gruppert per kunde/prosjekt. Én faktura kan ha blandede linjer, KID, MVA per linje, bilag, EHF.

### F. Etter faktura (P1/P2)

Nummerserie, PDF, innbetaling, purre, Peppol AP, journal/SAF-T, lønn.

---

## 5. Kryssjekk mot kode (2026-10-10, før implementasjon)

| Krav | Kode | Gap |
|------|------|-----|
| Timer grid/overtid/rapport | `ArbeidScreen`, `overtime.js`, `reports.js` | OK / P1 lås |
| Timer → faktura | `billingFromHours.js`, `EconomyBilling` | OK |
| KID/MVA/EHF/bilag | `kid.js`, `vat.js`, `ehf.js`, `vouchers.js` | OK |
| Utlegg-dokumenter | — | **Mangler** (kun invoice `expenses*` aggregat) |
| Kjørebok | Timeart `travel` = reisetid, ikke km | **Mangler** |
| Produktkatalog | Grocery `productLookup` | **Mangler** |
| Varesalg-linjer | Invoice `products` aggregat | **Mangler** |
| Meny | Økonomi: oversikt/kunder/avtaler/faktura/grunnlag/timer/indeks | Ingen Utlegg/Kjørebok/Produkter |
| Lønn/diett/GPS/SAF-T | — | P2 |

---

## 6. Arkitekturvalg denne runden

- Nye lister i prosjektstate (`families/{id}/projects/state`): `expenses`, `mileageTrips`, `products`, `sales`.
- Domene: `src/economy/expenses.js`, `mileage.js`, `products.js`.
- Fakturabro: `src/economy/billingFromOperations.js` (slår sammen timer + de tre).
- UI: Økonomi · Utlegg / Kjørebok / Produkter + utvidet Fakturagrunnlag.
- Ingen Peppol AP, kassa eller GPS i P0.

---

## 7. Prioritering

**P0 (denne runden):** utlegg + kjørebok + produkter/salg + felles fakturagrunnlag + tester + meny.

**P1:** kvitteringsopplasting til Storage, periodelås, PDF-faktura, innbetaling, nummerserie, lager, kreditnota fra fakturadetalj, timespesifikasjon-vedlegg.

**P2:** Peppol sending, elektronisk GPS-kjørebok, kassa, SAF-T, lønn/A-melding, Tripletex/Visma-sync.
