# 04 – Komplett skjema- og feltbibliotek

**Viktig skille:** Et styrt skjema er en **versjonert definisjon**; en utfylt registrering er et **eget objekt** som bevarer skjemaversjonen, felter, vedlegg, eier, tidspunkt, godkjenning og auditlogg. Innhold kan ikke skrives om etter signering uten ny formell revisjon/rettingshendelse.

## Skjemabygger – feltkomponenter

| Type | UI og regler |
|---|---|
| `short_text`, `long_text`, `rich_text` | Tekst, lengdegrenser, validering, forhåndsdefinert hjelp |
| `integer`, `decimal`, `currency`, `percentage` | Enhet, min/max, norsk tallformat, eksplisitt avrunding |
| `date`, `datetime`, `time`, `date_range` | Tidssone, historikk, fristregler |
| `single_select`, `multi_select`, `radio`, `checkbox`, `toggle` | Kodeverk og låste verdier per skjemaversjon |
| `user_ref`, `role_ref`, `team_ref`, `legal_entity_ref`, `project_ref`, `customer_ref`, `supplier_ref` | Oppslag til eksisterende masterdata, alltid serversjekket |
| `process_ref`, `document_ref`, `requirement_ref`, `risk_ref`, `finding_ref`, `action_ref` | Kobling til autoriserte eksisterende objekter |
| `file`, `photo`, `video`, `drawing_markup` | Malware-kontroll, tilgang, begrensninger, metadata, klassifisering |
| `location` | Adresse/prosjektsted, ikke kreve personlokasjon unødvendig |
| `table_repeatable`, `group_repeatable` | Flere rader og underobjekter med id og datavalidering |
| `likelihood`, `consequence`, `risk_rating` | Konfigurasjons- og skala-versjon, effektvurdering |
| `yes_no_na`, `rating`, `nps`, `assessment` | Krev begrunnelse ved ikke aktuelt og ved viktige avvik |
| `signature_ack`, `approval` | Bekreftelse/godkjenningsprotokoll med actor/time/hash; ikke påstand om kvalifisert e-signatur |
| `calculated`, `section`, `heading`, `help_text`, `separator` | Deklarativ beregning; aldri eval av vilkårlig kode |

Alle felt: `fieldId`, stabil nøkkel, datatype, label, beskrivelse, requiredRule, displayRule, editableRole, validation, helpText, sourceBinding, classification, auditMode, version. Slettede felt beholdes i eldre skjema-/registreringsversjoner.

## Skjemabibliotek – SF01 til SF30

Feltene nedenfor er minimum for typiske maler og kan utvides. Angitt ISO-relasjon er indikativ, ikke autoritativ klausultolkning. Formulardesign skal ta høyde for obligatoriske, valgfrie og kontekstbetingede felt.

### SF01 – Etabler ledelsessystem/sertifiseringsomfang
`virksomhet`, `org_enhet`, `standarder+versjon`, `lokasjoner`, `tjenester`, `aktiviteter`, `omfangstekst`, `avgrensningsbegrunnelse`, `prosessansvarlig`, `godkjenningsdato`, `dokumentert_kilde`. Handling: send til ledelsesgodkjenning; oppdater kravregister/berørte dokumenter.

### SF02 – Kontekstkartlegging
`internt_eksternt`, `forhold`, `årsak`, `mulig_påvirkning`, `klima_relevant`, `eier`, `kilde`, `vurdering`, `revurderingsdato`. Handling: opprett risiko/mulighet eller oppdater interessenter.

### SF03 – Interessentregister
`interessent`, `kategori`, `behov`, `forventning`, `samsvarsforpliktelse_ja_nei`, `kravref`, `kommunikasjon`, `eier`, `neste_revisjon`.

### SF04 – Policygodkjenning
`policytype`, `tekst/vedlegg`, `omfang`, `eier`, `ledelsesgodkjenner`, `ikrafttredelse`, `distribusjonsmål`, `bekreftelser`, `revisjonsdato`.

### SF05 – RACI/ansvarsmatrise
`prosess`, `rolle`, `responsible`, `accountable`, `consulted`, `informed`, `fullmakt`, `godkjent_av`, `dato`.

### SF06 – Mål og handlingsplan
`standardområde`, `mål`, `måletype`, `måleenhet`, `baseline`, `måltall`, `datakilde`, `målefrekvens`, `eier`, `ressurs`, `milepæler`, `frist`, `tiltak`, `effektvurdering`.

### SF07 – Risikovurdering virksomhet/prosjekt
`risikokategori`, `område`, `aktivitet`, `fare/risikohendelse`, `årsaker`, `konsekvenser`, `eksisterende_barrierer`, `sannsynlighet`, `konsekvens`, `skalaVersjon`, `risikonivå`, `eier`, `tiltak`, `restRisiko`, `revurderingsdato`, `deltakere`. Risikoklasse beregnes; rest-risiko krever dokumentert ny vurdering.

### SF08 – Mulighetsvurdering
`mulighet`, `målrelasjon`, `potensiell_gevinst`, `sannsynlighet/forutsetninger`, `ressurser`, `valgt_handling`, `eier`, `effektmåling`.

### SF09 – Endringsvurdering
`initiert_av`, `endring`, `begrunnelse`, `berørte_prosesser`, `berørte_lovkrav`, `risikovurdering`, `kompetansetiltak`, `dokumenter_til_ny_revisjon`, `beslutning`, `godkjent_av`, `verifikasjon`.

### SF10 – Miljøaspekt og vesentlighetsvurdering
`aktivitet`, `livsløpstrinn`, `miljøaspekt`, `miljøpåvirkning`, `normal/unormal/nød`, `kontroll/innflytelse`, `vurderingskriterier+versjon`, `vesentlighetsvurdering`, `kilde`, `lovkrav`, `eksisterende_kontroller`, `tiltak`, `eier`, `godkjent`, `revurdering`.

### SF11 – Miljømåling
`målepunkt`, `periode`, `metode`, `enhet`, `verdi`, `målt/estimert`, `datakilde`, `faktorVersjon`, `kontrollert_av`, `korrigering`.

### SF12 – Arbeidsmiljøfare / SJA
`arbeidsaktivitet`, `sted/prosjekt`, `deltakere`, `fare`, `risiko_foer`, `tiltakshierarki`, `forebyggende_tiltak`, `ansvar`, `rest_risiko`, `gjennomgått_med`, `bekreftet`, `gyldighetsperiode`. **Aktiver SJA etter arbeidsoppgave, risiko og kontekst; ikke som generelt ISO-krav.**

### SF13 – Vernerunde
`sted`, `dato`, `leder`, `deltakere`, `kontrollpunkt[]`, `observasjon`, `alvorlighet`, `bilder`, `tiltak`, `eier`, `frist`, `rapport`.

### SF14 – Arbeidstakermedvirkning
`tema`, `innspill`, `representant`, `dato`, `møte/kanal`, `vurdering`, `beslutning`, `tiltak`, `tilbakemeldt`. Særlig sensitive personsaker skal ikke ligge i dette skjemaet.

### SF15 – Beredskapsplan og øvelse
`scenario`, `område`, `alarmering`, `roller`, `kontaktkjede`, `utstyr`, `sikkerhetstiltak`, `øvelsesdato`, `hendelsesforløp`, `evalueringsfunn`, `tiltak`, `ansvar`, `godkjenning`.

### SF16 – Avvik/RUH/hendelse
`kategori`, `tittel`, `beskrivelse`, `dato`, `oppdaget_av`, `selskap`, `prosjekt`, `sted`, `faktisk_konsekvens`, `mulig_konsekvens`, `midlertidige_tiltak`, `vedlegg`, `tilgangsklasse`, `vurderingsansvarlig`, `krav/prosessref`. Betinget visning for miljø, HMS og kvalitet; **helseopplysninger skjermes**. Ingen forhåndsutfylt «årsaken er ...».

### SF17 – Rotårsaksanalyse
`avvikref`, `metode`, `hva_skjedde`, `hvorfor_1...5` eller `årsakskategorier`, `systemårsak`, `andre_berørte_forhold`, `vurdert_av`, `dokumentasjon`.

### SF18 – Korrigerende tiltak og effektkontroll
`kilde`, `tiltaksbeskrivelse`, `type`, `ansvarlig`, `frist`, `påkrevd_bevis`, `utført_dato`, `utført_av`, `effektmetode`, `effektkontroll_dato`, `utfall`, `lukket_av`. For påkrevde effektkontroller må `utfall=verifisert` før lukking.

### SF19 – Kundekrav- og kontraktsgjennomgang
`kunde`, `forespørsel`, `avtale`, `leveranseomfang`, `krav`, `lovkrav`, `kapasitet`, `kompetanse`, `forbehold`, `uklarheter`, `avklaringer`, `aksept`, `godkjent_av`, `dato`.

### SF20 – Prosjektkvalitetsplan
`prosjekt`, `leveranse`, `gjeldende_krav`, `standarder`, `roller`, `prosesser`, `kontrollplan`, `kritiske_faser`, `dokumentflyt`, `risiko`, `kvalitetsmål`, `endringsrutine`, `godkjenning`.

### SF21 – Prosjekteringskontroll og leveransegodkjenning
`prosjekt`, `fag`, `leveranse`, `dokumentID`, `revisjon`, `input_krav`, `kontrolltype`, `kontrollpunkter[]`, `funn`, `korrigeringer`, `kontrollør`, `godkjenner`, `godkjent_dato`, `frigivelse`. Kontrollør og utarbeider kan være ulike etter valgt kvalitetsplan.

### SF22 – Leverandørkvalifisering og evaluering
`leverandør`, `kategori`, `kritikalitet`, `evalueringskriterier`, `referanser`, `sertifikater`, `kompetanse`, `avvik`, `godkjent_for`, `status`, `ansvarlig`, `neste_evaluering`.

### SF23 – Kompetansekrav og -bevis
`ansatt/rolle`, `kompetansekrav`, `dokumentasjon`, `nivå`, `gyldig_fra`, `gyldig_til`, `verifisert_av`, `opplæringsbehov`, `effektvurdering`.

### SF24 – Internrevisjonsprogram
`periode`, `enhet`, `standarder`, `prosesser`, `risikobegrunnelse`, `hyppighet`, `revisor`, `uavhengighet`, `omfang`, `status`, `ledelsesgodkjenning`.

### SF25 – Internrevisjon og sjekkliste
`revisjonref`, `dato`, `revisor`, `kriterier`, `prøver`, `intervjuer`, `kravpunkter[]`, `bevis[]`, `konklusjon`, `funn[]`, `rapport`, `oppfølging`.

### SF26 – Vurdering av lov-/samsvarsforpliktelse
`lovkravref`, `virksomhetsrelevans`, `tolket_plikt`, `etterlevelsesmetode`, `resultat`, `bevis`, `vurdert_av`, `vurdert_dato`, `neste_vurdering`, `avvik/tiltak`.

### SF27 – Ledelsens gjennomgang
`periode`, `deltakere`, `inngangsdata`, `tidligere_beslutninger`, `kpi/resultater`, `revisjoner`, `lovetterlevelse`, `klager`, `avvik`, `miljø/HMS`, `risiko`, `ressurser`, `forbedring`, `beslutninger[]`, `ansvar`, `frister`, `godkjent_referat`.

### SF28 – Kunde-/prosjekttilfredshet
`kunde`, `prosjekt`, `målemetode`, `svarperiode`, `vurdering`, `tilbakemelding`, `klage`, `analysereultat`, `tiltak`.

### SF29 – Dokumentendring/godkjenning
`dokumentref`, `fra_revisjon`, `til_revisjon`, `endringsårsak`, `endringsbeskrivelse`, `påvirkede_prosesser`, `kontrollert_av`, `godkjent_av`, `ikrafttredelse`, `lesebekreftelser`.

### SF30 – Sertifiserings-/revisjonsbevispakke
`sertifiseringsomfang`, `sertifikat`, `standardversjoner`, `revisjon`, `krav/filter`, `dokumenter`, `registreringer`, `anonymisering`, `godkjent_av`, `tilgangsvindu`, `eksportlogg`.

## Betinget visning (eksempler)

```json
{
  "formKey": "SF16_AVVIK",
  "formVersion": "1.0",
  "rules": [
    {"when": {"field":"category","equals":"HMS"}, "show": ["hmsType", "injurySeverity", "hmsRestrictedContext"]},
    {"when": {"field":"category","equals":"MILJO"}, "show": ["environmentalMedium", "releaseQuantity", "authorityNotificationRequired"]},
    {"when": {"field":"category","equals":"KVALITET"}, "show": ["deliverableId", "revision", "customerImpact"]},
    {"when": {"field":"authorityNotificationRequired","equals":true}, "require": ["notificationAssignee", "notificationDue"]}
  ]
}
```

## Generiske skjematilstander

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → LOCKED/ARCHIVED` der det er formålstjenlig. Forskjellige registreringstyper kan ha egne livsløp; konfigurasjonen må ikke bryte ISO-krav til dokumenterte registreringer, ansvar eller sporbarhet.

## Skjemabygger – UI-komponenter

- Sidepanel med feltpalett; midtflate med levende forhåndsvisning; inspector for valgt felt; toppen har `Utkast`, `Valider`, `Send til godkjenning`, `Publiser`, `Test som ansatt`.
- Valider alle `requiredIf`, valglister, referanseoppslag, beregningsuttrykk og rettighetskoblinger før publisering.
- Kan dras til rekkefølge og grupper. Skjult felt som inneholder sensitiv verdi skal vurderes for lagring, ikke bare CSS-skjules.
- Dynamiske skjema kan trigge oppgave og prosesshendelse ved godkjent innsending. IdempotencyKey for dupliserte submits.
- Skjema- og prosessversjon refereres fra instansen; historiske registreringer kan alltid leses med korrekt feltdefinisjon.
