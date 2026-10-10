# Research-logg: Arbeid → Faktura → Regnskap (ProTop)

Dato: 2026-10-09  
Kilder: Moment (app.moment.team / skjermbilder), Visma Net PM, PowerOffice Go, Fiken, Tripletex, Unit4, EHF/Peppol BIS Billing 3.0 (anskaffelser.dev / DFØ), KID MOD10/11.

## 1. Leverandørkart (kjente funksjoner)

### Moment
- Måneds-/ukesgrid timeføring med celle-klikk
- Avtalte timer, timebalanse, favoritt-prosjekt
- Aktivitet, ekstern/intern beskrivelse, hurtigvalg timer
- Prosjektdeltakere / roller
- Timerapport, aktiviteter med estimat/fakturerbart
- Prismodeller (timepris, fastpris, …)
- Fakturaoversikt (import/visning)

### Visma Net Project Management
- Timeføring (dag/uke), overtid, flexisaldo, godkjenning
- Utlegg / reiseregning
- Fakturagrunnlag fra prosjekttransaksjoner
- Fakturaregler (time & material, fastpris)
- EHF via Autoinvoice
- Ressursallokering, rapporter, KPI

### PowerOffice Go
- Timeliste med timeart, aktivitet, avdeling
- Overtid / tillegg via timearter
- **Fakturaforslag** (timer + stykk + fastpris + kostnader)
- Faktura + kreditnota + EHF-sending
- KID via bank/OCR-avtale
- Bokføring mot salgskontoer / produkter

### Fiken / Tripletex (referanse)
- Time → fakturagrunnlag → fakturalinjer
- Rapporter per prosjekt/aktivitet/ansatt
- Full integrasjon mot regnskap / MVA / bilag

## 2. Lovpålagt / nødvendig (Norge)

| Krav | Status i ProTop før denne runden | Mål |
|------|----------------------------------|-----|
| Bokføringspliktig bilag | Delvis (import) | Generere bilag ved faktura |
| MVA-satser (0/12/15/25) + kategorier | Kun beløpsfelt + 25 % heuristikk | Momskode-tabell + linje-MVA |
| EHF / Peppol BIS Billing 3.0 | Mangler | Generere gyldig UBL XML (nedlasting); AP-sending senere |
| KID (MOD10/MOD11) | Kun lagret streng | Generer + valider |
| Orgnr 9 siffer (ICD 0192) | Delvis på kunde | Valider på faktura/EHF |
| Fakturanummer-serie | Import-nummer | Egne serier + neste nummer |
| Betalingsinformasjon (kontonr/IBAN) | Mangler | Selskapsoppsett + PaymentMeans |
| Arbeidsmiljøloven (arbeidstid) | Delvis | Overtidstype + rapporter |

## 3. Hva ProTop har nå

- Arbeid: grid/dagvisning, celle-modal, fravær, deltakere, godkjenning i Timerapport
- Prosjekt: faner, prismodell, team, aktiviteter
- Økonomi · Timer: import/list
- Økonomi · Faktura: Excel-import, liste, detalj, PDF-vedlegg, KID/MVA-visning
- Mini-kontoplan i `src/project/catalog.js` (uten UI for bilag)

## 4. Gap (prioritert)

### P0 — broen som må på plass
1. Fakturagrunnlag fra godkjente fakturerbare timer
2. Faktura med **linjer** (ikke bare aggregat)
3. Opprett faktura / kreditnota i UI
4. Momskoder + korrekt MVA-beregning
5. KID MOD10 generering/validering
6. EHF XML (Peppol BIS 3.0) eksport/forhåndsvisning
7. Bilag / kontoføring ved faktura
8. Overtid / timeart på timeføring
9. Timerapporter (ansatt, prosjekt, periode, eksport)

### P1 — profesjonalisering
10. Fakturanummerserie + forfallsdager
11. Leveringsmetode (EHF / e-post / manuell) med statusflyt
12. Lås perioder / masse-godkjenning
13. Utlegg → faktura
14. Påminnelse / purre
15. Bankkonto på selskap

### P2 — senere
16. Peppol Access Point-integrasjon (ekte sending)
17. SAF-T eksport
18. Lønns-/A-melding eksport
19. Tripletex/Fiken/Visma sync

## 5. Arkitekturvalg

- Behold prosjektstate for `timeEntries` (Firestore `families/{id}/projects/state`)
- Utvid `invoices` med `lines[]`, `vatCode`, `kid`, `ehfXml`, `voucherId`
- Nye moduler under `src/economy/` og `src/arbeid/`
- UI: Økonomi · Fakturagrunnlag + Arbeid · Rapport + overtid i modal

## 6. Testsyklus-plan (10 runder)

Hver runde: research-sjekk → kode → unit-tester → manuell/bot-test → fiks.
Sluttmål: timeføring → godkjenning → fakturagrunnlag → faktura → KID/MVA/bilag → EHF XML → merge/deploy → live-test.

## 7. Implementert i denne runden (2026-10-09)

| Modul | Fil |
|-------|-----|
| Momskoder | `src/economy/vat.js` |
| KID MOD10/11 | `src/economy/kid.js` |
| Kontoplan bilag | `src/economy/accountsChart.js` |
| Fakturagrunnlag | `src/economy/billingFromHours.js` |
| EHF XML | `src/economy/ehf.js` |
| Bilag | `src/economy/vouchers.js` |
| Overtid/timeart | `src/arbeid/overtime.js` |
| Timerapporter | `src/arbeid/reports.js` |
| UI Fakturagrunnlag | `screens/economy/EconomyBilling.jsx` + meny |
| Pipeline-test | `src/economy/billingPipeline.test.mjs` |

P2 fortsatt åpent: Peppol Access Point (ekte sending), SAF-T, lønnseksport.

## 8. Syklus 3–6

### Syklus 3 — P0-verifisering (2026-10-09)

Gjennomgang av P0 mot kode på `cursor/arbeid-faktura-komplett-6c84`:

| # | P0 | Status | Gap |
|---|-----|--------|-----|
| 1 | Fakturagrunnlag fra godkjente timer | OK | `buildBillingProposals` + UI Økonomi · Fakturagrunnlag |
| 2 | Faktura med linjer | Delvis | Linjer bygges i `createInvoiceFromProposal`; **AsyncStorage-cache (`toSummary`) stripper `lines`** → offline/detalj kan miste linjer |
| 3 | Opprett faktura / kreditnota i UI | Delvis | Faktura-knapp OK; **ingen `createCreditNoteFromInvoice` / UI** (kun speilet bilag `creditVoucherFromInvoice`) |
| 4 | Momskoder + MVA | OK | `vat.js` HIGH/MID/LOW/ZERO/EXEMPT + tester |
| 5 | KID MOD10/11 | OK | Generering + validering i pipeline-test |
| 6 | EHF XML eksport | OK | Generering + nedlasting; AP-sending = P2 |
| 7 | Bilag ved faktura | Delvis | Bilag bygges og `voucherId` settes på faktura; **egen voucher-persistens mangler**; cache kan strippe `voucherId` |
| 8 | Overtid / timeart | OK | `TIME_TYPES` i TimeEntryModal + sats i fakturalinjer |
| 9 | Timerapporter | Delvis | `src/arbeid/reports.js` + CSV; **ingen egen rapport-UI** under Arbeid (kun Prosjekt → Timerapport) |

Neste i syklus 5–6: kreditnota-hjelper, lagring av `lines`/`kid`/`vatCode`/`ehfXml`/`voucherId`.

### Syklus 4 — Tester

- `node src/economy/billingPipeline.test.mjs` → **ok**
- `node src/project/engine.test.mjs` → **ok**
- Ingen feil å fikse i denne runden.

### Syklus 5 — Kreditnota (ferdig)

- `createCreditNoteFromInvoice` i `billingFromHours.js` — speiler linjebeløp (uten øreavvik), ny KID, `creditNoteForId`
- Pipeline-test dekker kreditnota + avvisning av dobbel kreditering
- Valgfri knapp «Opprett kreditnota» i `EconomyBilling` (siste faktura) med speilet bilag

### Syklus 6 — Persistens (ferdig)

- Funnet: `toSummary` i `invoiceStorage.js` strippet `lines`, `vatCode`, `ehfXml`, `voucherId` fra AsyncStorage
- Fiks: `toInvoiceCacheRow` i `invoices.js` (brukt av `writeLocal`) beholder disse + `timeEntryIds` / bank / delivery
- Test: `node src/economy/invoiceStorage.test.mjs`

### Åpent etter syklus 3–6

- Egen voucher-collection / persistens (kun `voucherId` på faktura)
- Dedikert timerapport-UI under Arbeid
- Peppol Access Point (P2), EHF CreditNote-dokumenttype (nå Invoice-XML også for kredit)

## 9. Syklus 7–10

### Syklus 7 — Timerapport-UI (ferdig)

- Kompakt rapportpanel i `screens/arbeid/ArbeidScreen.jsx` (måned + valgt medarbeider)
- Bruker `filterTimeEntries` / `reportSummary` / `entriesToCsv` fra `src/arbeid/reports.js`
- Knapp «Eksporter CSV»: web-nedlasting (BOM); ellers clipboard/copy-note

### Syklus 8 — Bilag-snapshot på faktura (ferdig)

- Felt `invoice.voucherLines[]` via `normalizeInvoice` + `toInvoiceCacheRow`
- Hjelpere `snapshotVoucherLines` / `attachVoucherSnapshot` i `vouchers.js`
- `EconomyBilling` lagrer bilagslinjer sammen med `voucherId` ved faktura/kreditnota
- Minimal: ingen egen voucher-collection

### Syklus 9 — Tester

| Suite | Resultat |
|-------|----------|
| `node src/economy/billingPipeline.test.mjs` | ok |
| `node src/project/engine.test.mjs` | ok |
| `node src/navigation/shellModules.test.mjs` | ok |
| `node src/arbeid/hours.test.mjs` | ok |
| `node src/economy/invoiceStorage.test.mjs` | ok (voucherLines round-trip) |

### Syklus 10 — Status P0 / åpent

| # | P0 | Status |
|---|-----|--------|
| 1–6, 8–9 | Fakturagrunnlag, linjer, kreditnota, MVA, KID, EHF, overtid, timerapport | OK |
| 7 | Bilag ved faktura | OK (snapshot `voucherLines` + `voucherId`) |

**Tester (syklus 10):** `billingPipeline.test.mjs` + `arbeid/*.test.mjs` grønne.  
**UI:** `/faktura-demo` viser fakturaliste, KID, EHF-nedlasting (Peppol BIS 3.0). Full Arbeid→Fakturagrunnlag krever innlogget lederøkt.

**P1 igjen:** fakturanummerserie + forfallsdager, leveringsstatusflyt (EHF/e-post), lås perioder / masse-godkjenning, purre, bankkonto på selskap.

**P2 igjen:** Peppol Access Point, SAF-T, lønn/A-melding, Tripletex/Fiken/Visma sync, EHF CreditNote-dokumenttype.

Utlegg, kjørebok og varesalg er kartlagt og implementert i `docs/okonomi-full-modul.md` (2026-10-10).
