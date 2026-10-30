# HMS-kort — API-tilgang og integrasjon

Sist oppdatert: 30.10.2026

## Status

- ProTop har ikke API-tilgang ennå. Søknaden under er ikke sendt.
- Det som virker uten API (bygget og i produksjon):
  - Skann QR-koden på kortet. Lenken til kortets side i HMS-kortregisteret (`hmskort.no/v/<id>`)
    lagres på personen med en gang, og «Åpne kortet i HMS-kortregisteret» viser status der.
  - «Ta bilde av kortet»: AI leser kortnummer, gyldig til, navn, fødselsdato og arbeidsgiver fra
    forsiden (`interpretImport`, kind `hmsCard`). Navn og fødselsdato som ikke stemmer med personen,
    gir advarsel.
  - Den ansatte registrerer kortet selv under Gjøremål (`employeesPrivate/{id}.hmsCard`). HR ser det i
    Lovpålagt (`mergeHmsCards`).
  - Varsel og oppgave til HR 30 dager før utløpsdato (`useHmsTasks`).
- Det som krever API: navn, fødselsdato, arbeidsgiver og gyldighet rett fra registeret etter skanning,
  og status på alle kort hver natt (kort sperres før utløpsdato ved jobbskifte, navneendring o.l.).

## Det vi vet om registeret

| Oppslag | Gir | Åpent |
|---|---|---|
| Søk på kortnummer på hmskort.no | Status (gyldig eller ikke) | Nettside, ikke dokumentert API |
| Skann QR-koden (kortets side) | Navn, arbeidsgiver og status | Nettside. Opplysninger om kortholder vises bare ved skanning |
| API for HMS-kort | Fornavn, etternavn, fødselsdato og arbeidsgiver (ifølge Kvipp, som bruker det) | Krever søknad |

- Løsningen driftes av Tietoevry (Evry Card Services AS) for Arbeidstilsynet.
- Sidene bak QR-koden og kortnummersøket er laget for mennesker. Vi henter ikke persondata derfra fra
  serveren uten avtale: det er uoffisielt, kan slutte å virke uten varsel og reiser spørsmål om vilkår
  og personvern.
- Ikke bekreftet: om `<id>` i QR-lenken er kortnummeret eller en egen nøkkel, og hvordan API-et
  autentiseres (Maskinporten eller egen nøkkel).

Kilder: [Arbeidstilsynet – HMS-kort](https://inte.arbeidstilsynet.no/hms/hms-kort/),
[hmskort.no – hjelp med API](https://www.hmskort.no/support/faq/need-help-with-our-api),
[hmskort.no – gyldighet](https://hmskort.no/support/faq/hvor-lenge-er-hms-kortet-gyldig),
[Kvipp – identifiser person](https://digiquip.no/en/kvipp/identify-person/).

## Søknad (sendes via hmskort.no → Support → Velg tema: API)

> **Emne:** Søknad om API-tilgang til HMS-kortløsningen – ProTop (Invest AS)
>
> Hei,
>
> Invest AS utvikler ProTop, et ledelsessystem for bedrifter i bygg og anlegg med HR, timeføring,
> prosjekt og KS/HMS. Vi søker om tilgang til API-et for HMS-kort.
>
> **Formål:** Arbeidsgivere skal kunne kontrollere at egne ansatte har gyldig HMS-kort, slik forskrift
> om HMS-kort på bygge- og anleggsplasser og byggherreforskriften § 15 (oversiktsliste) krever.
>
> **Bruk:**
> 1. Når arbeidsgiver eller den ansatte skanner QR-koden på kortet, slår vi opp kortet og registrerer
>    kortnummer, gyldig til, status, navn, fødselsdato og arbeidsgiver på den ansatte.
> 2. Én gang i døgnet kontrollerer vi status på kortene som er registrert på bedriftens egne ansatte,
>    så arbeidsgiver får varsel når et kort er sperret eller går ut.
>
> **Avgrensning:** Vi slår bare opp kort som tilhører ansatte i bedriften som bruker ProTop, og bare på
> vegne av den bedriften. Opplysningene lagres i bedriftens personalmappe med tilgangsstyring og slettes
> etter bedriftens lagringstid. Bilde av kortholder lagres ikke.
>
> **Omfang:** Oppslag ved skanning og én statuskontroll per kort per døgn.
>
> **Vi trenger:** dokumentasjon av API-et, testmiljø og hvordan tilgangen autentiseres
> (Maskinporten eller egen nøkkel), og vilkårene for bruk.
>
> **Kontakt:** [navn, e-post og telefon]
>
> Med vennlig hilsen
> Invest AS (org.nr. [org.nr.])

## Plan når tilgangen er gitt

| Steg | Hvor |
|---|---|
| Nøkler som hemmelighet på serveren (aldri i repoet), slik som PowerOffice | `functions/` |
| Callable `hmsCardLookup({ familyId, qrId, number })`: krever HR-tilgang eller egen ansattpost, slår opp, returnerer kortnummer, gyldig til, status, navn, fødselsdato og arbeidsgiver | ny `functions/hmsCardApi.js` |
| Kall etter skann i `HmsCardEditor` (onScan): fyll inn og lagre med kilde `registry` og tidspunkt | `screens/hr/HmsCardEditor.jsx`, `src/hr/hmsCard.js` |
| Nattlig statuskontroll av registrerte kort per bedrift. Sperret kort gir oppgave og varsel til HR (samme vei som `useHmsTasks`) | planlagt funksjon i `functions/` |
| Felt på kortet: `registryStatus`, `checkedAt` | `normalizeHmsCard` |
| Personverninformasjonen (KS-malen) nevner oppslaget i HMS-kortregisteret | `src/forms/ksLibrary.js` |
