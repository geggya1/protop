/**
 * Indekser og regler som brukes til prisjustering i bygg, anlegg og leie.
 * Seriene peker på Statistikkbanken. SSB har ikke ansvar for valg av indeks.
 * Navnene er bokmål; tabellene hos SSB er ofte ført på nynorsk.
 */

export const MODELS = [
  {
    id: 'ns3405',
    label: 'NS 3405, én kalendermåned',
    short: 'Totalindeks, måned',
    formula: 'e = A × s × (t − t0) / t0',
  },
  {
    id: 'engang',
    label: 'Engangsregulering av sum og satser',
    short: 'Engangsregulering',
    formula: 'ny verdi = opprinnelig × (1 − s + s × t / t0)',
  },
  {
    id: 'husleie',
    label: 'Husleie etter konsumprisindeksen',
    short: 'Husleie, KPI',
    formula: 'ny leie = gjeldende leie × (KPI ny / KPI sist)',
  },
  {
    id: 'vektet',
    label: 'Vektet delindeks',
    short: 'Vektet',
    formula: 'I = Σ (vekt × delindeks) / Σ vekt, deretter e = A × s × (I − I0) / I0',
  },
];

export const STANDARDS = {
  'NS 8405': {
    label: 'NS 8405 Utførelsesentreprise',
    model: 'ns3405',
    indexId: 'bki-bustader',
    summary: 'Når ikke annet er avtalt, reguleres kontraktssummen etter NS 3405, totalindeksmetoden, med én kalendermåned som avregningsperiode. NS 3405 viser til SSBs indeks for fagområdet kontrakten gjelder, dersom serien ikke er navngitt.',
  },
  'NS 8406': {
    label: 'NS 8406 Forenklet utførelse',
    model: 'ns3405',
    indexId: 'bki-bustader',
    summary: 'Samme utgangspunkt som NS 8405: indeksregulering etter NS 3405 når avtalen ikke sier noe annet.',
  },
  'NS 8407': {
    label: 'NS 8407 Totalentreprise',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    summary: 'Når ikke annet er avtalt, reguleres kontraktssummen etter NS 3405. NS 8407 punkt 26.2 peker på SSBs indeks «boligblokk, i alt» dersom partene ikke har valgt en annen serie.',
  },
  'NS 8415': {
    label: 'NS 8415 Underentreprise, utførelse',
    model: 'ns3405',
    indexId: 'bki-bustader',
    summary: 'Underentreprise følger samme indeksmetode som utførelsesentreprisen når ikke annet er avtalt.',
  },
  'NS 8416': {
    label: 'NS 8416 Underentreprise, forenklet',
    model: 'ns3405',
    indexId: 'bki-bustader',
    summary: 'Underentreprise i forenklet utførelse reguleres etter NS 3405 når ikke annet er avtalt.',
  },
  'NS 8417': {
    label: 'NS 8417 Underentreprise, total',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    summary: 'NS 8417 punkt 26.2 bruker «boligblokk, i alt» når partene ikke har avtalt en annen indeks.',
  },
  husleieloven: {
    label: 'Husleieloven',
    model: 'husleie',
    indexId: 'kpi',
    summary: 'Husleieloven § 4-2 lar hver av partene kreve leien endret med konsumprisindeksen. Endringen kan ikke være større enn KPI-endringen siden siste leiefastsetting, kan tidligst virke ett år etter den, og krever skriftlig varsel med minst én måneds frist. For lokaler kan partene avtale noe annet. For bolig kan de ikke.',
  },
  bustadoppføringslova: {
    label: 'Bustadoppføringslova',
    model: 'engang',
    indexId: 'bki-enebolig',
    summary: 'I forbrukerentrepriser etter bustadoppføringslova er utgangspunktet avtalt pris. Indeksregulering må være avtalt. Loven gir ikke entreprenøren den samme automatiske reguleringen som NS 8405 og NS 8407.',
  },
  håndverkertjenesteloven: {
    label: 'Håndverkertjenesteloven',
    model: 'engang',
    indexId: 'bki-bustader',
    summary: 'Prisen er den som er avtalt. Indeksregulering krever avtale. Uten en slik klausul kan ikke satser justeres med SSB-indeks i ettertid.',
  },
  avtalt: {
    label: 'Avtalt indeks',
    model: 'engang',
    indexId: 'bki-boligblokk',
    summary: 'Partene har selv valgt indeks, basismåned og andel. SSB anbefaler å navngi serien og kilden, og å ikke skrive faste indekstall inn i avtalen.',
  },
};

/** Hentinger mot PxWebApi v2. Én forespørsel per tabell gir alle delseriene. */
export const SSB_FETCHES = [
  {
    table: '08655',
    contentsDim: 'ContentsCode',
    contents: 'Byggindeks',
    dims: ['Arbeidstype'],
  },
  {
    table: '08653',
    contentsDim: 'ContentsCode',
    contents: 'BKIIndex',
    dims: ['Arbeidstype'],
  },
  {
    table: '08651',
    contentsDim: 'ContentsCode',
    contents: 'Byggindeks',
    dims: ['Arbeidstype'],
  },
  {
    table: '08662',
    contentsDim: 'ContentsCode',
    contents: 'ByggIndex',
    dims: ['Veganlegg'],
  },
  {
    table: '04534',
    contentsDim: 'ContentsCode',
    contents: 'ByggKostInd',
    dims: ['ArbType', 'Innsatsfaktor'],
  },
  {
    table: '14710',
    contentsDim: 'ContentsCode',
    contents: 'KpiIndMnd',
    dims: [],
  },
];

export const INDEX_SERIES = [
  series('bki-boligblokk', '08655', ['20'], 'Boligblokk, i alt', 'month', '2015 = 100', 'Bygg', 'Standardvalg i NS 8407 og NS 8417 når annet ikke er avtalt.'),
  series('bki-boligblokk-materialer', '08655', ['21'], 'Boligblokk, materialer', 'month', '2015 = 100', 'Bygg'),
  series('bki-boligblokk-grunn', '08655', ['22'], 'Boligblokk, grunnarbeid', 'month', '2015 = 100', 'Bygg'),
  series('bki-boligblokk-tommer', '08655', ['24'], 'Boligblokk, tømring og snekring', 'month', '2015 = 100', 'Bygg'),
  series('bki-boligblokk-maling', '08655', ['26'], 'Boligblokk, maling og gulv', 'month', '2015 = 100', 'Bygg'),
  series('bki-boligblokk-ror', '08655', ['28'], 'Boligblokk, rørleggerarbeid', 'month', '2015 = 100', 'Bygg'),
  series('bki-boligblokk-el', '08655', ['30'], 'Boligblokk, elektrikerarbeid', 'month', '2015 = 100', 'Bygg'),

  series('bki-enebolig', '08653', ['04'], 'Enebolig av tre, i alt', 'month', '2015 = 100', 'Bygg', 'Passer for småhus når avtalen peker på enebolig.'),
  series('bki-enebolig-materialer', '08653', ['05'], 'Enebolig av tre, materialer', 'month', '2015 = 100', 'Bygg'),
  series('bki-enebolig-grunn', '08653', ['08'], 'Enebolig, grunnarbeid', 'month', '2015 = 100', 'Bygg'),
  series('bki-enebolig-tommer', '08653', ['12'], 'Enebolig, tømring og snekring', 'month', '2015 = 100', 'Bygg'),
  series('bki-enebolig-ror', '08653', ['16'], 'Enebolig, rørleggerarbeid', 'month', '2015 = 100', 'Bygg'),
  series('bki-enebolig-el', '08653', ['18'], 'Enebolig, elektrikerarbeid', 'month', '2015 = 100', 'Bygg'),

  series('bki-bustader', '08651', ['01'], 'Boliger i alt', 'month', '2015 = 100', 'Bygg', 'Samlet byggekostnadsindeks for boliger. Brukes når fagområdet ikke er spesifisert.'),
  series('bki-bustader-arbeid', '08651', ['02'], 'Boliger, arbeidskraft', 'month', '2015 = 100', 'Bygg'),
  series('bki-bustader-materialer', '08651', ['03'], 'Boliger, materialer', 'month', '2015 = 100', 'Bygg'),

  series('bki-veg', '08662', ['00'], 'Veganlegg, i alt', 'quarter', '4. kvartal 2024 = 100', 'Anlegg', 'Kvartalsindeks. Publiseres om lag tre uker etter kvartalet.'),
  series('bki-veg-materialer', '08662', ['01'], 'Veganlegg, materialer', 'quarter', '4. kvartal 2024 = 100', 'Anlegg'),
  series('bki-veg-maskiner', '08662', ['02'], 'Veganlegg, maskiner', 'quarter', '4. kvartal 2024 = 100', 'Anlegg'),
  series('bki-veg-arbeid', '08662', ['03'], 'Veganlegg, arbeidskraft', 'quarter', '4. kvartal 2024 = 100', 'Anlegg'),
  series('bki-veg-dagen', '08662', ['04'], 'Veg i dagen', 'quarter', '4. kvartal 2024 = 100', 'Anlegg'),
  series('bki-veg-bru', '08662', ['06'], 'Betongbru', 'quarter', '4. kvartal 2024 = 100', 'Anlegg'),
  series('bki-veg-tunnel', '08662', ['08'], 'Fjelltunnel', 'quarter', '4. kvartal 2024 = 100', 'Anlegg'),

  series('bki-ror', '04534', ['1', '00'], 'Rørleggerarbeid i kontor- og forretningsbygg', 'month', '2000 = 100', 'Installasjon'),
  series('bki-ror-arbeid', '04534', ['1', '02'], 'Rørleggerarbeid, arbeidskraft', 'month', '2000 = 100', 'Installasjon'),
  series('bki-ror-materialer', '04534', ['1', '03'], 'Rørleggerarbeid, materialer', 'month', '2000 = 100', 'Installasjon'),
  series('bki-ror-sanitaer', '04534', ['2', '00'], 'Sanitærinstallasjoner, i alt', 'month', '2000 = 100', 'Installasjon'),
  series('bki-ror-varme', '04534', ['3', '00'], 'Varmeinstallasjoner, i alt', 'month', '2000 = 100', 'Installasjon'),

  series('kpi', '14710', [], 'Konsumprisindeksen', 'month', '2025 = 100', 'Pris', 'Husleieloven § 4-2 bruker endringen i KPI. SSB publiserer nå serien med 2025 = 100.'),
];

function series(id, table, codes, name, frequency, basis, group, note = '') {
  return {
    id,
    table,
    codes,
    name,
    frequency,
    basis,
    group,
    note,
    source: `SSB Statistikkbanken, tabell ${table}`,
    url: `https://www.ssb.no/statbank/table/${table}/`,
  };
}

export function seriesById(id) {
  return INDEX_SERIES.find((row) => row.id === id) || null;
}

export function modelById(id) {
  return MODELS.find((row) => row.id === id) || MODELS[0];
}

export function standardById(id) {
  return STANDARDS[id] || STANDARDS.avtalt;
}

export const METHOD_NOTES = [
  'Basismåneden er måneden tilbudsfristen løp ut. Finnes det ingen tilbudsfrist, brukes tilbudsdatoen.',
  'Grunnlaget er ytelsen i kontraktens priser, eksklusive merverdiavgift. Forskudd og innestående beløp trekkes ikke fra.',
  'Er det avtalt at bare en andel skal reguleres, ganges grunnlaget med den andelen først. Resten ligger fast.',
  'SSB publiserer byggekostnadsindeksen for boliger om lag den 12. i måneden etter. Et krav kan ikke bruke en måned som ennå ikke er publisert.',
  'Skriv serienavn, tabellnummer og kilde inn i avtalen. Ikke lås selve indekstallet. Bruk siste publiserte basisår.',
];
