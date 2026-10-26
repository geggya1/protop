/**
 * Skjema i ISO / K-HMS — bygger på ProTops eksisterende Skjemabygger.
 *
 * Skjemaene lages og redigeres i Skjemabygger (anbud-state `formTemplates`). ISO lager
 * ingen egen skjemabygger. ISO legger på et styringslag:
 *   - «Styrt skjema»: godkjent øyeblikksbilde (versjon) av et Skjemabygger-skjema
 *   - endring i Skjemabygger etter godkjenning vises som «endret – må godkjennes»
 *   - registreringer lagres låst med skjemaversjon og sjekksum (ISO-bevis)
 * Mange SF-maler håndteres av egne ISO-registre (avvik, risiko, miljø …) og blir derfor
 * ikke installert som skjema – de peker til registeret i stedet (ingen dobbel registrering).
 */
import {
  auditEvent, bump, checksum, fail, isoDate, newId, nowIso, pushHistory, text,
} from './core.js';

const F = (key, type, label, extra = {}) => ({ key, type, label, ...extra });
const YN = ['Ja', 'Nei'];
const STATUS = ['Utkast', 'Godkjent', 'Avvist'];

/** Malene som håndteres i et ISO-register (ikke som skjema). */
export const NATIVE_FORMS = {
  SF01_OMFANG: { page: 'innstillinger', label: 'Innstillinger' },
  SF02_KONTEKST: { page: 'kontekst', label: 'Kontekst' },
  SF03_INTERESSENT: { page: 'kontekst', label: 'Interessenter' },
  SF04_POLICY: { page: 'dokumenter', label: 'Dokumenter (policy)' },
  SF06_MAL: { page: 'mal', label: 'Mål og KPI' },
  SF07_RISIKO: { page: 'risiko', label: 'Risiko' },
  SF08_MULIGHET: { page: 'risiko', label: 'Risiko og muligheter' },
  SF10_MILJOASPEKT: { page: 'miljo', label: 'Miljø' },
  SF11_MILJOMALING: { page: 'miljo', label: 'Miljødata' },
  SF16_AVVIK: { page: 'avvik', label: 'Avvik' },
  SF17_ARSAK: { page: 'avvik', label: 'Avvik (årsak)' },
  SF18_TILTAK: { page: 'avvik', label: 'Avvik (tiltak)' },
  SF23_KOMPETANSE: { page: 'kompetanse', label: 'Kompetanse' },
  SF24_REVPROGRAM: { page: 'revisjon', label: 'Internrevisjon' },
  SF26_SAMSVAR: { page: 'lovkrav', label: 'Lovkrav og samsvar' },
  SF27_LEDELSE: { page: 'ledelse', label: 'Ledelsens gjennomgang' },
  SF30_BEVISPAKKE: { page: 'sertifisering', label: 'Sertifisering' },
  // Disse dekkes av registrene; eget skjema ville gitt to steder for det samme.
  SF09_ENDRING: { page: 'avvik', label: 'Avvik og forbedring (endringsforslag med endringsvurdering)' },
  SF14_MEDVIRKNING: { page: 'hms', label: 'HMS (medvirkning)' },
  SF15_BEREDSKAP: { page: 'beredskap', label: 'Beredskap (øvelser)' },
  SF20_KVALITETSPLAN: { page: 'prosjekt', label: 'Prosjektkvalitet (kvalitetsplan)' },
  SF22_LEVERANDOR: { page: 'leverandorer', label: 'Leverandører (evaluering)' },
  SF25_REVISJON: { page: 'revisjon', label: 'Internrevisjon' },
  SF29_DOKENDRING: { page: 'dokumenter', label: 'Dokumenter (revisjon med endringsårsak)' },
};

/** Id for en ISO-mal installert i Skjemabygger. Fast id gjør installasjon idempotent. */
export function templateIdFor(key) {
  return `iso_${String(key || '').toLowerCase()}`;
}

/** Hvilke skjema som foreslås installert ut fra aktive standarder. */
export function recommendedFormKeys(standards = []) {
  const s = new Set(standards);
  const keys = ['SF19_KONTRAKT', 'SF21_FAGKONTROLL', 'SF28_TILFREDSHET'];
  if (s.has('ISO45001')) keys.push('SF12_SJA', 'SF13_VERNERUNDE');
  return keys.filter((k) => !NATIVE_FORMS[k]);
}

export const FORM_TEMPLATES = [
  { key: 'SF01_OMFANG', title: 'Etabler ledelsessystem / sertifiseringsomfang', category: 'Styring', fields: [F('virksomhet', 'short_text', 'Virksomhet', { required: true }), F('org_enhet', 'short_text', 'Organisasjonsenhet'), F('standarder', 'multi_select', 'Standarder', { options: ['ISO 9001:2026', 'ISO 14001:2026', 'ISO 45001:2018+A1:2024'], required: true }), F('lokasjoner', 'long_text', 'Lokasjoner'), F('tjenester', 'long_text', 'Tjenester og aktiviteter', { required: true }), F('omfangstekst', 'long_text', 'Omfangserklæring', { required: true }), F('avgrensning', 'long_text', 'Avgrensning og begrunnelse'), F('prosessansvarlig', 'user_ref', 'Systemansvarlig'), F('godkjenningsdato', 'date', 'Godkjent dato')] },
  { key: 'SF02_KONTEKST', title: 'Kontekstkartlegging', category: 'Styring', fields: [F('internt_eksternt', 'single_select', 'Internt eller eksternt', { options: ['Internt', 'Eksternt'], required: true }), F('forhold', 'short_text', 'Forhold', { required: true }), F('arsak', 'long_text', 'Årsak / kilde'), F('pavirkning', 'long_text', 'Mulig påvirkning', { required: true }), F('klima', 'yes_no_na', 'Klimarelevant?'), F('eier', 'user_ref', 'Eier'), F('revurdering', 'date', 'Neste vurdering')] },
  { key: 'SF03_INTERESSENT', title: 'Interessentregister', category: 'Styring', fields: [F('interessent', 'short_text', 'Interessent', { required: true }), F('kategori', 'single_select', 'Kategori', { options: ['Kunde', 'Ansatte', 'Myndighet', 'Leverandør', 'Eier', 'Nabo/samfunn', 'Annet'] }), F('behov', 'long_text', 'Behov og forventninger', { required: true }), F('forpliktelse', 'single_select', 'Blir det en samsvarsforpliktelse?', { options: YN }), F('kravref', 'requirement_ref', 'Kravreferanse', { showIf: { field: 'forpliktelse', equals: 'Ja' } }), F('eier', 'user_ref', 'Eier'), F('neste', 'date', 'Neste revisjon')] },
  { key: 'SF04_POLICY', title: 'Policygodkjenning', category: 'Ledelse', fields: [F('policytype', 'single_select', 'Policytype', { options: ['Kvalitet', 'Miljø', 'Arbeidsmiljø', 'Integrert'], required: true }), F('tekst', 'long_text', 'Policytekst', { required: true }), F('omfang', 'short_text', 'Omfang'), F('godkjenner', 'user_ref', 'Ledelsesgodkjenner', { required: true }), F('ikraft', 'date', 'Ikrafttredelse', { required: true }), F('revisjonsdato', 'date', 'Neste revisjon')] },
  { key: 'SF05_RACI', title: 'RACI / ansvarsmatrise', category: 'Ledelse', fields: [F('prosess', 'short_text', 'Prosess', { required: true }), F('raci', 'table_repeatable', 'Ansvar', { columns: ['Rolle', 'R', 'A', 'C', 'I'] }), F('fullmakt', 'long_text', 'Fullmakter'), F('godkjent_av', 'user_ref', 'Godkjent av'), F('dato', 'date', 'Dato')] },
  { key: 'SF06_MAL', title: 'Mål og handlingsplan', category: 'Mål', fields: [F('omrade', 'single_select', 'Standardområde', { options: ['Kvalitet', 'Miljø', 'Arbeidsmiljø'], required: true }), F('mal', 'short_text', 'Mål', { required: true }), F('enhet', 'short_text', 'Måleenhet', { required: true }), F('baseline', 'decimal', 'Utgangsverdi'), F('maltall', 'decimal', 'Måltall', { required: true }), F('datakilde', 'short_text', 'Datakilde'), F('frekvens', 'single_select', 'Målefrekvens', { options: ['Måned', 'Kvartal', 'År'] }), F('eier', 'user_ref', 'Eier', { required: true }), F('frist', 'date', 'Frist')] },
  { key: 'SF07_RISIKO', title: 'Risikovurdering', category: 'Risiko', fields: [F('kategori', 'single_select', 'Risikokategori', { options: ['Strategisk', 'Kvalitet', 'Miljø', 'Arbeidsmiljø', 'Prosjekt', 'Beredskap', 'Leverandør'], required: true }), F('aktivitet', 'short_text', 'Område/aktivitet'), F('hendelse', 'long_text', 'Fare / risikohendelse', { required: true }), F('arsaker', 'long_text', 'Årsaker'), F('konsekvenser', 'long_text', 'Konsekvenser'), F('barrierer', 'long_text', 'Eksisterende barrierer'), F('s', 'likelihood', 'Sannsynlighet', { required: true }), F('k', 'consequence', 'Konsekvens', { required: true }), F('score', 'calculated', 'Risikotall (S × K)', { calc: { op: 'product', fields: ['s', 'k'] } }), F('tiltak', 'long_text', 'Tiltak'), F('eier', 'user_ref', 'Eier'), F('revurdering', 'date', 'Revurderingsdato')] },
  { key: 'SF08_MULIGHET', title: 'Mulighetsvurdering', category: 'Risiko', fields: [F('mulighet', 'short_text', 'Mulighet', { required: true }), F('malrelasjon', 'short_text', 'Mål den støtter'), F('gevinst', 'long_text', 'Potensiell gevinst', { required: true }), F('forutsetninger', 'long_text', 'Forutsetninger'), F('handling', 'long_text', 'Valgt handling'), F('eier', 'user_ref', 'Eier'), F('effekt', 'short_text', 'Effektmåling')] },
  { key: 'SF09_ENDRING', title: 'Endringsvurdering', category: 'Risiko', fields: [F('endring', 'long_text', 'Endring', { required: true }), F('begrunnelse', 'long_text', 'Begrunnelse'), F('prosesser', 'long_text', 'Berørte prosesser'), F('lovkrav', 'long_text', 'Berørte lovkrav'), F('risiko', 'long_text', 'Risikovurdering', { required: true }), F('kompetanse', 'long_text', 'Kompetansetiltak'), F('dokumenter', 'long_text', 'Dokumenter som må revideres'), F('beslutning', 'single_select', 'Beslutning', { options: STATUS, required: true }), F('godkjent_av', 'user_ref', 'Godkjent av')] },
  { key: 'SF10_MILJOASPEKT', title: 'Miljøaspekt og vesentlighetsvurdering', category: 'Miljø', fields: [F('aktivitet', 'short_text', 'Aktivitet', { required: true }), F('livslop', 'single_select', 'Livsløpstrinn', { options: ['Innkjøp', 'Prosjektering', 'Transport', 'Drift', 'Avfall', 'Avhending'] }), F('aspekt', 'short_text', 'Miljøaspekt', { required: true }), F('pavirkning', 'long_text', 'Miljøpåvirkning', { required: true }), F('situasjon', 'single_select', 'Situasjon', { options: ['Normal', 'Unormal', 'Nødsituasjon'] }), F('kontroll', 'single_select', 'Kontroll eller innflytelse', { options: ['Direkte kontroll', 'Innflytelse'] }), F('omfang', 'rating', 'Omfang (1–5)'), F('alvor', 'rating', 'Alvorlighet (1–5)'), F('vesentlig', 'single_select', 'Vesentlig?', { options: YN, required: true }), F('begrunnelse', 'long_text', 'Begrunnelse', { required: true }), F('tiltak', 'long_text', 'Tiltak/kontroller', { requireIf: { field: 'vesentlig', equals: 'Ja' } })] },
  { key: 'SF11_MILJOMALING', title: 'Miljømåling', category: 'Miljø', fields: [F('malepunkt', 'short_text', 'Målepunkt', { required: true }), F('periode', 'short_text', 'Periode (ÅÅÅÅ-MM)', { required: true }), F('verdi', 'decimal', 'Verdi', { required: true }), F('enhet', 'single_select', 'Enhet', { options: ['kWh', 'kg', 'tonn', 'km', 'liter', 'kg CO₂e'], required: true }), F('kvalitet', 'single_select', 'Datakvalitet', { options: ['Målt', 'Estimert', 'Ukjent'], required: true }), F('metode', 'short_text', 'Metode'), F('kilde', 'short_text', 'Datakilde'), F('faktor', 'short_text', 'Faktor og versjon (ved omregning)', { requireIf: { field: 'enhet', equals: 'kg CO₂e' } })] },
  { key: 'SF12_SJA', title: 'Arbeidsmiljøfare / SJA', category: 'HMS', fields: [F('aktivitet', 'short_text', 'Arbeidsaktivitet', { required: true }), F('sted', 'location', 'Sted / prosjekt'), F('deltakere', 'long_text', 'Deltakere', { required: true }), F('farer', 'table_repeatable', 'Farer og tiltak', { columns: ['Fare', 'Risiko før', 'Tiltak (hierarki)', 'Ansvar', 'Rest-risiko'] }), F('bekreftet', 'signature_ack', 'SJA gjennomgått med alle deltakere', { required: true }), F('gyldig', 'date', 'Gyldig til')] },
  { key: 'SF13_VERNERUNDE', title: 'Vernerunde', category: 'HMS', fields: [F('sted', 'location', 'Sted', { required: true }), F('dato', 'date', 'Dato', { required: true }), F('deltakere', 'long_text', 'Deltakere'), F('punkter', 'table_repeatable', 'Kontrollpunkter', { columns: ['Punkt', 'OK / Ikke OK', 'Observasjon', 'Tiltak', 'Frist'] }), F('alvor', 'single_select', 'Mest alvorlige funn', { options: ['Ingen', 'Lav', 'Middels', 'Høy'] })] },
  { key: 'SF14_MEDVIRKNING', title: 'Arbeidstakermedvirkning', category: 'HMS', fields: [F('tema', 'short_text', 'Tema', { required: true }), F('innspill', 'long_text', 'Innspill', { required: true }), F('representant', 'short_text', 'Representant'), F('kanal', 'single_select', 'Møte/kanal', { options: ['AMU', 'Verneombud', 'Avdelingsmøte', 'Digitalt innspill', 'Annet'] }), F('vurdering', 'long_text', 'Vurdering'), F('beslutning', 'long_text', 'Beslutning'), F('tilbakemeldt', 'yes_no_na', 'Tilbakemeldt?'), F('note', 'help_text', 'Personsaker og varsling skal ikke registreres her.')] },
  { key: 'SF15_BEREDSKAP', title: 'Beredskapsplan og øvelse', category: 'HMS', fields: [F('scenario', 'short_text', 'Scenario', { required: true }), F('dato', 'date', 'Øvelsesdato', { required: true }), F('forlop', 'long_text', 'Hendelsesforløp'), F('funn', 'long_text', 'Evalueringsfunn', { required: true }), F('tiltak', 'long_text', 'Tiltak'), F('ansvar', 'user_ref', 'Ansvar')] },
  { key: 'SF16_AVVIK', title: 'Avvik / RUH / hendelse', category: 'Avvik', createsFinding: true, fields: [F('kategori', 'single_select', 'Kategori', { options: ['KVALITET', 'MILJO', 'HMS'], required: true }), F('tittel', 'short_text', 'Tittel', { required: true }), F('beskrivelse', 'long_text', 'Beskrivelse', { required: true }), F('dato', 'date', 'Dato', { required: true }), F('prosjekt', 'project_ref', 'Prosjekt'), F('sted', 'location', 'Sted'), F('konsekvens', 'long_text', 'Faktisk konsekvens'), F('mulig', 'long_text', 'Mulig konsekvens'), F('midlertidig', 'long_text', 'Midlertidige tiltak'), F('skade', 'single_select', 'Personskade', { options: ['Ingen', 'Førstehjelp', 'Fravær', 'Alvorlig'], showIf: { field: 'kategori', equals: 'HMS' }, sensitive: true }), F('medium', 'single_select', 'Miljømedium', { options: ['Luft', 'Vann', 'Jord', 'Avfall', 'Annet'], showIf: { field: 'kategori', equals: 'MILJO' } }), F('leveranse', 'short_text', 'Leveranse / dokument-ID', { showIf: { field: 'kategori', equals: 'KVALITET' } }), F('varsling', 'single_select', 'Mulig meldeplikt til myndighet?', { options: YN }), F('varsler', 'user_ref', 'Hvem varsler', { requireIf: { field: 'varsling', equals: 'Ja' }, showIf: { field: 'varsling', equals: 'Ja' } })] },
  { key: 'SF17_ARSAK', title: 'Årsaksanalyse', category: 'Avvik', fields: [F('metode', 'single_select', 'Metode', { options: ['5 × hvorfor', 'Fiskebein', 'Fritekst'], required: true }), F('hva', 'long_text', 'Hva skjedde', { required: true }), F('hvorfor1', 'short_text', 'Hvorfor 1'), F('hvorfor2', 'short_text', 'Hvorfor 2'), F('hvorfor3', 'short_text', 'Hvorfor 3'), F('hvorfor4', 'short_text', 'Hvorfor 4'), F('hvorfor5', 'short_text', 'Hvorfor 5'), F('systemarsak', 'long_text', 'Systemårsak', { required: true }), F('berort', 'long_text', 'Andre berørte forhold')] },
  { key: 'SF18_TILTAK', title: 'Korrigerende tiltak og effektkontroll', category: 'Avvik', fields: [F('tiltak', 'long_text', 'Tiltak', { required: true }), F('type', 'single_select', 'Type', { options: ['Korreksjon', 'Korrigerende', 'Forebyggende'] }), F('ansvarlig', 'user_ref', 'Ansvarlig', { required: true }), F('frist', 'date', 'Frist', { required: true }), F('bevis', 'short_text', 'Påkrevd bevis'), F('effektmetode', 'short_text', 'Effektmetode'), F('utfall', 'single_select', 'Utfall', { options: ['Verifisert', 'Ikke verifisert'] })] },
  { key: 'SF19_KONTRAKT', title: 'Kundekrav- og kontraktsgjennomgang', category: 'Prosjekt', fields: [F('kunde', 'customer_ref', 'Kunde', { required: true }), F('foresporsel', 'long_text', 'Forespørsel / avtale'), F('omfang', 'long_text', 'Leveranseomfang', { required: true }), F('krav', 'long_text', 'Krav (kunde, lov, standard)'), F('kapasitet', 'yes_no_na', 'Kapasitet OK?', { required: true }), F('kompetanse', 'yes_no_na', 'Kompetanse OK?', { required: true }), F('forbehold', 'long_text', 'Forbehold og uklarheter'), F('aksept', 'single_select', 'Konklusjon', { options: ['Aksepteres', 'Avklares', 'Avstås'], required: true }), F('godkjent_av', 'user_ref', 'Godkjent av')] },
  { key: 'SF20_KVALITETSPLAN', title: 'Prosjektkvalitetsplan', category: 'Prosjekt', fields: [F('prosjekt', 'project_ref', 'Prosjekt', { required: true }), F('leveranse', 'long_text', 'Leveranser'), F('krav', 'long_text', 'Gjeldende krav'), F('roller', 'table_repeatable', 'Roller', { columns: ['Rolle', 'Person', 'Ansvar'] }), F('kontrollplan', 'table_repeatable', 'Kontrollplan', { columns: ['Fase', 'Kontroll', 'Kontrollør', 'Dokumentasjon'] }), F('risiko', 'long_text', 'Risiko'), F('endring', 'long_text', 'Endringsrutine'), F('godkjent', 'signature_ack', 'Kvalitetsplan godkjent', { required: true })] },
  { key: 'SF21_FAGKONTROLL', title: 'Prosjekteringskontroll og leveransegodkjenning', category: 'Prosjekt', fields: [F('prosjekt', 'project_ref', 'Prosjekt', { required: true }), F('fag', 'short_text', 'Fag', { required: true }), F('dokument', 'short_text', 'Dokument-ID', { required: true }), F('revisjon', 'short_text', 'Revisjon', { required: true }), F('kontrolltype', 'single_select', 'Kontrolltype', { options: ['Egenkontroll', 'Sidemannskontroll', 'Tverrfaglig kontroll', 'Uavhengig kontroll'], required: true }), F('punkter', 'table_repeatable', 'Kontrollpunkter', { columns: ['Punkt', 'OK / Merknad'] }), F('funn', 'long_text', 'Funn og korrigeringer'), F('frigivelse', 'single_select', 'Frigivelse', { options: ['Frigis', 'Frigis ikke'], required: true })] },
  { key: 'SF22_LEVERANDOR', title: 'Leverandørkvalifisering og evaluering', category: 'Leverandør', fields: [F('leverandor', 'short_text', 'Leverandør', { required: true }), F('kategori', 'short_text', 'Kategori'), F('kritikalitet', 'single_select', 'Kritikalitet', { options: ['Lav', 'Middels', 'Høy'], required: true }), F('kvalitet', 'rating', 'Kvalitet (1–5)'), F('hms', 'rating', 'HMS (1–5)'), F('miljo', 'rating', 'Miljø (1–5)'), F('levering', 'rating', 'Leveringsdyktighet (1–5)'), F('sertifikater', 'long_text', 'Sertifikater'), F('status', 'single_select', 'Status', { options: ['Godkjent', 'Betinget godkjent', 'Ikke godkjent'], required: true }), F('neste', 'date', 'Neste evaluering')] },
  { key: 'SF23_KOMPETANSE', title: 'Kompetansekrav og -bevis', category: 'Kompetanse', fields: [F('person', 'user_ref', 'Ansatt', { required: true }), F('krav', 'short_text', 'Kompetansekrav', { required: true }), F('dokumentasjon', 'file', 'Dokumentasjon'), F('gyldig_fra', 'date', 'Gyldig fra'), F('gyldig_til', 'date', 'Gyldig til'), F('effekt', 'long_text', 'Effektvurdering')] },
  { key: 'SF24_REVPROGRAM', title: 'Internrevisjonsprogram', category: 'Revisjon', fields: [F('periode', 'short_text', 'Periode', { required: true }), F('prosesser', 'long_text', 'Prosesser/enheter', { required: true }), F('risiko', 'long_text', 'Risikobegrunnelse', { required: true }), F('revisor', 'user_ref', 'Revisor'), F('uavhengighet', 'signature_ack', 'Revisor reviderer ikke eget arbeid', { required: true })] },
  { key: 'SF25_REVISJON', title: 'Internrevisjon og sjekkliste', category: 'Revisjon', fields: [F('dato', 'date', 'Dato', { required: true }), F('kriterier', 'long_text', 'Revisjonskriterier', { required: true }), F('punkter', 'table_repeatable', 'Kravpunkter', { columns: ['Krav', 'Bevis', 'Vurdering'] }), F('konklusjon', 'long_text', 'Konklusjon', { required: true })] },
  { key: 'SF26_SAMSVAR', title: 'Vurdering av lov-/samsvarsforpliktelse', category: 'Lovkrav', fields: [F('lovkrav', 'requirement_ref', 'Lovkrav', { required: true }), F('relevans', 'long_text', 'Virksomhetsrelevans', { required: true }), F('plikt', 'long_text', 'Tolket plikt'), F('metode', 'short_text', 'Vurderingsmetode', { required: true }), F('resultat', 'single_select', 'Resultat', { options: ['Etterleves', 'Delvis', 'Etterleves ikke', 'Krever juridisk vurdering'], required: true }), F('neste', 'date', 'Neste vurdering', { required: true })] },
  { key: 'SF27_LEDELSE', title: 'Ledelsens gjennomgang', category: 'Ledelse', fields: [F('periode', 'short_text', 'Periode', { required: true }), F('deltakere', 'long_text', 'Deltakere', { required: true }), F('vurdering', 'long_text', 'Vurdering av systemets egnethet og effektivitet', { required: true }), F('beslutninger', 'table_repeatable', 'Beslutninger', { columns: ['Beslutning', 'Ansvar', 'Frist'] })] },
  { key: 'SF28_TILFREDSHET', title: 'Kunde-/prosjekttilfredshet', category: 'Prosjekt', fields: [F('kunde', 'customer_ref', 'Kunde', { required: true }), F('prosjekt', 'project_ref', 'Prosjekt'), F('vurdering', 'rating', 'Samlet vurdering (1–5)', { required: true }), F('tilbakemelding', 'long_text', 'Tilbakemelding'), F('klage', 'single_select', 'Inneholder klage?', { options: YN })] },
  { key: 'SF29_DOKENDRING', title: 'Dokumentendring / godkjenning', category: 'Dokument', fields: [F('dokument', 'short_text', 'Dokument', { required: true }), F('arsak', 'long_text', 'Endringsårsak', { required: true }), F('beskrivelse', 'long_text', 'Endringsbeskrivelse', { required: true }), F('prosesser', 'long_text', 'Berørte prosesser'), F('ikraft', 'date', 'Ikrafttredelse')] },
  { key: 'SF30_BEVISPAKKE', title: 'Sertifiserings-/revisjonsbevispakke', category: 'Sertifisering', fields: [F('omfang', 'long_text', 'Sertifiseringsomfang', { required: true }), F('revisjon', 'short_text', 'Revisjon / sertifiseringsorgan', { required: true }), F('utvalg', 'long_text', 'Utvalg av krav og bevis', { required: true }), F('anonymisering', 'signature_ack', 'Persondata er sladdet der det ikke trengs', { required: true }), F('tilgang', 'date', 'Tilgang til og med', { required: true })] },
];



export function formTemplateByKey(key) {
  return FORM_TEMPLATES.find((t) => t.key === key) || null;
}

/* ───────── Konvertering til Skjemabygger-format ───────── */

const KIND = {
  short_text: 'text', long_text: 'long', integer: 'number', decimal: 'number', percentage: 'number',
  date: 'date', time: 'time', multi_select: 'checks', checkbox: 'check', signature_ack: 'check',
  rating: 'scale', likelihood: 'scale', consequence: 'scale', file: 'file', heading: 'title', help_text: 'note',
  user_ref: 'text', project_ref: 'text', customer_ref: 'text', requirement_ref: 'text', location: 'text', table_repeatable: 'long',
};

const REF_HELP = {
  user_ref: 'Navn på person',
  project_ref: 'Prosjektnummer og navn',
  customer_ref: 'Kunde',
  requirement_ref: 'Krav (lov, kontrakt eller ISO-klausul)',
  location: 'Sted eller adresse',
};

/** ISO-mal → felt i Skjemabygger-format (samme struktur som src/anbud/formBuilder.js). */
export function builderFieldsFromTemplate(template) {
  const out = [];
  for (const f of template?.fields || []) {
    if (f.type === 'calculated') continue;
    let kind = KIND[f.type] || 'text';
    let options = [];
    if (f.type === 'single_select') kind = (f.options || []).length > 4 ? 'dropdown' : 'choice';
    if (f.type === 'yes_no_na') { kind = 'choice'; options = ['Ja', 'Nei', 'Ikke aktuelt']; }
    if (['single_select', 'multi_select'].includes(f.type)) options = f.options || [];
    const id = String(f.key).slice(0, 40);
    let help = f.help || REF_HELP[f.type] || '';
    if (f.type === 'table_repeatable' && f.columns?.length) help = `Én linje per rad: ${f.columns.join(' | ')}`;
    if (f.showIf) help = [help, `Fylles ut når «${f.showIf.field}» er «${f.showIf.equals}».`].filter(Boolean).join(' ');
    out.push({
      id,
      label: f.type === 'signature_ack' ? `Jeg bekrefter: ${f.label}` : f.label,
      kind,
      required: !!f.required && !f.showIf && !['heading', 'help_text'].includes(f.type),
      help: help.slice(0, 180),
      options: options.map((label, i) => ({ id: `${id}_${i}`, label })),
      scaleMax: kind === 'scale' ? 5 : undefined,
      lowLabel: kind === 'scale' ? 'Lav' : undefined,
      highLabel: kind === 'scale' ? 'Høy' : undefined,
    });
  }
  return out;
}

export function builderTemplateFromIso(template) {
  return {
    id: templateIdFor(template.key),
    title: template.title.slice(0, 80),
    category: 'skjema',
    intro: `ISO / K-HMS ${template.key.split('_')[0]} – ${template.category}.`.slice(0, 280),
    fields: builderFieldsFromTemplate(template),
  };
}

const ANSWER_KINDS = new Set(['long', 'text', 'choice', 'checks', 'dropdown', 'scale', 'date', 'time', 'number', 'check', 'image', 'file']);

function fieldShape(fields) {
  return (fields || []).map((f) => ({
    id: f.id, label: f.label, kind: f.kind, required: !!f.required, options: (f.options || []).map((o) => o.label),
  }));
}

/** Sjekksum av skjemaets innhold. Endring i Skjemabygger gir ny sjekksum. */
export function templateHash(template) {
  return checksum(fieldShape(template?.fields));
}

/* ───────── Styrt skjema (versjoner) ───────── */

export function controlledVersion(control) {
  return (control?.versions || []).find((v) => v.version === control?.publishedVersion) || null;
}

/** «ok» | «endret» (Skjemabygger-skjemaet er endret etter godkjenning) | «slettet» */
export function driftStatus(control, template) {
  if (!template) return 'slettet';
  const v = controlledVersion(control);
  if (!v) return 'endret';
  return v.hash === templateHash(template) ? 'ok' : 'endret';
}

/** Godkjenn gjeldende innhold i Skjemabygger som ny styrt versjon. */
export function approveTemplate(control, template, { actor, caps, now = new Date(), note = '', templateKey = '' } = {}) {
  if (caps && !caps.approve) return fail('Bare en godkjenner kan godkjenne styrte skjema.');
  if (!template?.id) return fail('Fant ikke skjemaet i Skjemabygger.');
  const answerFields = (template.fields || []).filter((f) => ANSWER_KINDS.has(f.kind));
  if (!answerFields.length) return fail('Skjemaet har ingen felt å fylle ut.');
  const hash = templateHash(template);
  const current = controlledVersion(control);
  if (current && current.hash === hash) return fail('Denne versjonen er allerede godkjent.');
  const version = Math.max(0, ...((control?.versions || []).map((v) => v.version))) + 1;
  const base = control || {
    id: newId('frm'),
    templateId: template.id,
    templateKey: text(templateKey, 60),
    versions: [],
    publishedVersion: 0,
    rev: 0,
    createdAt: nowIso(now),
  };
  const next = bump({
    ...base,
    title: text(template.title, 200),
    versions: [...(base.versions || []), {
      version,
      hash,
      title: text(template.title, 200),
      fields: (template.fields || []).map((f) => ({ ...f, value: undefined })),
      approvedAt: nowIso(now),
      approvedBy: text(actor?.name, 160),
      note: text(note, 500),
    }],
    publishedVersion: version,
    history: pushHistory(base, `v${version} godkjent`, actor, note, now),
  }, actor, now);
  return { ok: true, form: next, events: [auditEvent({ entityType: 'form', entityId: next.id, action: 'iso.form.approved', actor, before: control, after: next, now })] };
}

export function releaseControl(control, reason, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.approve) return fail('Bare en godkjenner kan fjerne styring.');
  if (text(reason).length < 5) return fail('Begrunn hvorfor skjemaet ikke lenger er styrt.');
  const next = bump({ ...control, archived: true, history: pushHistory(control, 'Ikke lenger styrt', actor, reason, now) }, actor, now);
  return { ok: true, form: next, events: [auditEvent({ entityType: 'form', entityId: control.id, action: 'iso.form.released', actor, before: control, after: next, reason, now })] };
}

function empty(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'boolean') return value === false;
  return String(value).trim() === '';
}

/** Validering av svar mot Skjemabygger-felt. */
export function validateAnswers(fields, answers) {
  const errors = {};
  for (const f of fields || []) {
    if (!ANSWER_KINDS.has(f.kind)) continue;
    const v = answers?.[f.id];
    if (f.required && empty(v)) { errors[f.id] = f.kind === 'check' ? 'Må bekreftes.' : 'Må fylles ut.'; continue; }
    if (empty(v)) continue;
    if (f.kind === 'number' && !Number.isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.')))) errors[f.id] = 'Må være et tall.';
    if (f.kind === 'date' && !isoDate(v)) errors[f.id] = 'Bruk dato.';
    if (['choice', 'dropdown'].includes(f.kind) && (f.options || []).length && !(f.options || []).some((o) => o.label === v)) errors[f.id] = 'Ugyldig valg.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Låst registrering av et styrt skjema. Idempotent med nøkkel (dobbeltklikk/retry). */
export function submitControlled(control, answers, { actor, now = new Date(), subjectRef = null, idempotencyKey = '', existing = [] } = {}) {
  const version = controlledVersion(control);
  if (!version) return fail('Skjemaet er ikke godkjent for bruk i ISO.');
  const key = text(idempotencyKey, 160);
  if (key) {
    const dup = (existing || []).find((s) => s.idempotencyKey === key);
    if (dup) return { ok: true, submission: dup, events: [], duplicate: true };
  }
  const check = validateAnswers(version.fields, answers);
  if (!check.ok) return fail('Noen felt mangler eller er ugyldige.', { errors: check.errors });
  const clean = {};
  for (const f of version.fields) {
    if (!ANSWER_KINDS.has(f.kind)) continue;
    if (answers?.[f.id] !== undefined && !empty(answers[f.id])) clean[f.id] = answers[f.id];
  }
  const submission = {
    id: newId('reg'),
    formId: control.id,
    templateId: control.templateId,
    templateKey: control.templateKey || '',
    formTitle: version.title,
    formVersion: version.version,
    formHash: version.hash,
    answers: clean,
    subjectRef: subjectRef || null,
    submittedAt: nowIso(now),
    submittedBy: text(actor?.name, 160),
    submittedByUid: text(actor?.uid, 128),
    state: 'innsendt',
    locked: true,
    hash: checksum(clean),
    idempotencyKey: key,
  };
  return { ok: true, submission, events: [auditEvent({ entityType: 'formSubmission', entityId: submission.id, action: 'iso.form.submitted', actor, after: submission, now })] };
}

/** Retting av låst registrering: ny hendelse, originalen bevares. */
export function correctSubmission(submission, patch, reason, { actor, now = new Date() } = {}) {
  if (text(reason).length < 5) return fail('Begrunn rettingen.');
  const corrections = [...(submission.corrections || []), { at: nowIso(now), by: text(actor?.name, 160), reason: text(reason, 1000), patch, beforeHash: submission.hash }];
  const answers = { ...submission.answers, ...patch };
  const next = { ...submission, answers, corrections, hash: checksum(answers) };
  return { ok: true, submission: next, events: [auditEvent({ entityType: 'formSubmission', entityId: submission.id, action: 'iso.form.corrected', actor, before: submission, after: next, reason, now })] };
}

/** Skjema som kan brukes i prosesstrinn: styrte og godkjente. */
export function usableForms(controls) {
  return (controls || []).filter((c) => !c.archived && c.publishedVersion);
}
