/**
 * Registre for de operative og evaluerende ISO-modulene.
 * Én generisk motor (opprett, rediger, status, historikk, revisjonsspor) med
 * typeavhengige felt og regler. Spesialregler (risiko, miljøaspekt, kompetanse,
 * revisjon, ledelsens gjennomgang …) ligger som egne funksjoner under.
 */
import {
  addDays, auditEvent, bump, fail, isoDate, newId, nextNumber, nowIso, pushHistory, text, todayKey, uniq,
} from './core.js';
import { DEFAULT_RISK_METHOD, RISK_CATEGORIES, riskLevel } from './catalog.js';

const opt = (list) => list.map((x) => (typeof x === 'string' ? { id: x, label: x } : x));

/** Kontekstfaktorer: forhold, utfordringer/muligheter (6.1) og SWOT. */
export const CONTEXT_FACTOR_TYPES = ['Forhold', 'Utfordring', 'Mulighet', 'Styrke', 'Svakhet', 'Trussel'];

/** Leverandørklasser med evalueringsintervall (måneder, 0 = ingen periodisk evaluering). */
export const SUPPLIER_CLASSES = [
  { id: 'Kritisk', months: 12, criticality: 'Høy', hint: 'Avgjørende for leveransen, få eller ingen alternativer. Evalueres årlig.' },
  { id: 'Ikke kritisk – inngår i leveransen', months: 24, criticality: 'Middels', hint: 'Påvirker leveransen. Evalueres hvert 2. år.' },
  { id: 'Ikke kritisk – inngår ikke i leveransen', months: 60, criticality: 'Lav', hint: 'Inngår ikke i tjenestene. Godkjennes for 5 år.' },
];

export const ROLE_LEVELS = ['Styre og eiere', 'Ledelse', 'Administrasjon', 'Prosjekt', 'HMS og vern', 'Annet'];

export const COMMUNICATION_CHANNELS = ['Driftsmøte', 'Allmøte', 'Ledermøte', 'E-post', 'ProTop-nyhet', 'ProTop-oppgave', 'Telefon', 'Møte', 'Rapport', 'Nettside', 'Sosiale medier', 'Annet'];

export const MONTH_NAMES = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];

/** Hvor en årshjulsaktivitet utføres i ISO (side-id). */
export const ANNUAL_PAGES = [
  { id: 'ledelse', label: 'Ledelsens gjennomgang' },
  { id: 'revisjon', label: 'Internrevisjon' },
  { id: 'kontekst', label: 'Kontekst og interessenter' },
  { id: 'risiko', label: 'Risiko' },
  { id: 'miljo', label: 'Miljø' },
  { id: 'hms', label: 'HMS' },
  { id: 'mal', label: 'Mål og KPI' },
  { id: 'lovkrav', label: 'Lovkrav og samsvar' },
  { id: 'leverandorer', label: 'Leverandører' },
  { id: 'kompetanse', label: 'Kompetanse' },
  { id: 'beredskap', label: 'Beredskap' },
  { id: 'dokumenter', label: 'Dokumenter' },
  { id: 'kommunikasjon', label: 'Kommunikasjon' },
  { id: 'organisasjon', label: 'Organisasjon og roller' },
  { id: 'avvik', label: 'Avvik og forbedring' },
];

/**
 * Feltskjema per register. type: text | long | date | number | select | multi | person | project | check | scale
 *   | ref (én post i et annet register, eller ref: 'process' / 'requirement') | refmulti (flere poster i et annet register)
 */
export const REGISTERS = {
  kontekst: {
    title: 'Kontekst', prefix: 'KON', area: 'context', fields: [
      { key: 'title', label: 'Forhold', type: 'text', required: true },
      { key: 'scope', label: 'Internt / eksternt', type: 'select', options: opt(['Internt', 'Eksternt']), required: true },
      { key: 'factorType', label: 'Type', type: 'select', options: opt(CONTEXT_FACTOR_TYPES) },
      { key: 'area', label: 'Område', type: 'text' },
      { key: 'description', label: 'Beskrivelse og påvirkning', type: 'long', required: true },
      { key: 'climate', label: 'Klimarelevant', type: 'select', options: opt(['Ja', 'Nei', 'Ikke vurdert']) },
      { key: 'ownerName', label: 'Eier', type: 'person' },
      { key: 'nextReview', label: 'Neste vurdering', type: 'date' },
    ], states: ['aktiv', 'arkivert'],
  },
  interessent: {
    title: 'Interessenter', prefix: 'INT', area: 'parties', fields: [
      { key: 'title', label: 'Interessent', type: 'text', required: true },
      { key: 'category', label: 'Kategori', type: 'select', options: opt(['Kunde', 'Ansatte', 'Myndighet', 'Leverandør', 'Eier', 'Nabo/samfunn', 'Annet']) },
      { key: 'scope', label: 'Intern / ekstern', type: 'select', options: opt(['Intern', 'Ekstern']) },
      { key: 'parties', label: 'Konkrete parter', type: 'long' },
      { key: 'description', label: 'Behov og forventninger', type: 'long', required: true },
      { key: 'influence', label: 'Påvirkning på ledelsessystemet', type: 'select', options: opt(['Høy', 'Middels', 'Lav']) },
      { key: 'followUp', label: 'Hvordan følges forventningene opp', type: 'long' },
      { key: 'binding', label: 'Bindende forpliktelse', type: 'select', options: opt(['Ja', 'Nei']) },
      { key: 'ownerName', label: 'Eier', type: 'person' },
      { key: 'nextReview', label: 'Neste vurdering', type: 'date' },
    ], states: ['aktiv', 'arkivert'],
  },
  risiko: {
    title: 'Risiko og muligheter', prefix: 'RIS', area: 'risk', fields: [
      { key: 'kind', label: 'Type', type: 'select', options: opt(['Risiko', 'Mulighet']), required: true },
      { key: 'title', label: 'Risiko / mulighet', type: 'text', required: true },
      { key: 'category', label: 'Kategori', type: 'select', options: RISK_CATEGORIES, required: true },
      { key: 'processId', label: 'Prosess', type: 'ref', ref: 'process' },
      { key: 'activity', label: 'Aktivitet / område', type: 'text' },
      { key: 'description', label: 'Årsaker og konsekvenser', type: 'long' },
      { key: 'controls', label: 'Eksisterende barrierer', type: 'long' },
      { key: 'inherentL', label: 'Sannsynlighet (iboende)', type: 'scale' },
      { key: 'inherentC', label: 'Konsekvens (iboende)', type: 'scale' },
      { key: 'plan', label: 'Tiltak / handlingsplan', type: 'long' },
      { key: 'residualL', label: 'Sannsynlighet (rest)', type: 'scale' },
      { key: 'residualC', label: 'Konsekvens (rest)', type: 'scale' },
      { key: 'benefit', label: 'Forventet gevinst (mulighet)', type: 'long', showIf: { kind: 'Mulighet' } },
      { key: 'projectId', label: 'Prosjekt', type: 'project' },
      { key: 'ownerName', label: 'Eier', type: 'person', required: true },
      { key: 'nextReview', label: 'Revurdering', type: 'date' },
    ], states: ['aktiv', 'akseptert', 'lukket'],
  },
  miljoaspekt: {
    title: 'Miljøaspekter', prefix: 'MIL', area: 'aspects', fields: [
      { key: 'activity', label: 'Aktivitet', type: 'text', required: true },
      { key: 'lifecycle', label: 'Livsløpstrinn', type: 'select', options: opt(['Innkjøp', 'Prosjektering', 'Transport', 'Drift', 'Avfall', 'Avhending']) },
      { key: 'title', label: 'Miljøaspekt', type: 'text', required: true },
      { key: 'impact', label: 'Miljøpåvirkning', type: 'long', required: true },
      { key: 'situation', label: 'Situasjon', type: 'select', options: opt(['Normal', 'Unormal', 'Nødsituasjon']) },
      { key: 'control', label: 'Kontroll eller innflytelse', type: 'select', options: opt(['Direkte kontroll', 'Innflytelse']) },
      { key: 'extent', label: 'Omfang (1–5)', type: 'scale' },
      { key: 'severity', label: 'Alvorlighet (1–5)', type: 'scale' },
      { key: 'obligation', label: 'Knyttet til samsvarsforpliktelse (lov, tillatelse, kundekrav, Miljøfyrtårn)', type: 'select', options: opt(['Ja', 'Nei']) },
      { key: 'significant', label: 'Vesentlig', type: 'select', options: opt(['Ja', 'Nei']), required: true },
      { key: 'rationale', label: 'Begrunnelse etter kriterier', type: 'long', required: true },
      { key: 'controls', label: 'Operativ kontroll / tiltak', type: 'long' },
      { key: 'ownerName', label: 'Eier', type: 'person' },
      { key: 'nextReview', label: 'Revurdering', type: 'date' },
    ], states: ['aktiv', 'arkivert'],
  },
  miljodata: {
    title: 'Miljødata', prefix: 'MDA', area: 'monitoring', fields: [
      { key: 'title', label: 'Målepunkt', type: 'text', required: true },
      { key: 'period', label: 'Periode (ÅÅÅÅ-MM)', type: 'text', required: true },
      { key: 'value', label: 'Verdi', type: 'number', required: true },
      { key: 'unit', label: 'Enhet', type: 'select', options: opt(['kWh', 'kg', 'tonn', 'km', 'liter', 'kg CO₂e']), required: true },
      { key: 'quality', label: 'Datakvalitet', type: 'select', options: opt(['Målt', 'Estimert', 'Ukjent']), required: true },
      { key: 'method', label: 'Metode / kilde', type: 'text' },
      { key: 'factor', label: 'Faktor og versjon (ved CO₂e)', type: 'text' },
    ], states: ['aktiv'],
  },
  fare: {
    title: 'Farer og arbeidsmiljørisiko', prefix: 'FAR', area: 'hazards', fields: [
      { key: 'activity', label: 'Arbeidsaktivitet', type: 'text', required: true },
      { key: 'title', label: 'Fare', type: 'text', required: true },
      { key: 'hazardCategory', label: 'Farekategori', type: 'select', options: opt(['Fysisk', 'Psykososial', 'Organisatorisk', 'Ergonomisk', 'Kjemisk', 'Biologisk', 'Sikkerhet']) },
      { key: 'exposed', label: 'Utsatte roller', type: 'text' },
      { key: 'cause', label: 'Årsak / kilde til faren', type: 'long' },
      { key: 'consequence', label: 'Mulig konsekvens (skade, sykdom, belastning)', type: 'long' },
      { key: 'existingControls', label: 'Eksisterende barrierer', type: 'long' },
      { key: 'inherentL', label: 'Sannsynlighet', type: 'scale' },
      { key: 'inherentC', label: 'Konsekvens', type: 'scale' },
      { key: 'hierarchy', label: 'Tiltakshierarki', type: 'multi', options: opt(['Fjerne faren', 'Erstatte', 'Tekniske tiltak', 'Administrative tiltak', 'Verneutstyr']) },
      { key: 'controls', label: 'Tiltak', type: 'long' },
      { key: 'residualL', label: 'Sannsynlighet (rest)', type: 'scale' },
      { key: 'residualC', label: 'Konsekvens (rest)', type: 'scale' },
      { key: 'participation', label: 'Medvirkning (hvem deltok)', type: 'text', required: true },
      { key: 'ownerName', label: 'Ansvarlig', type: 'person', required: true },
      { key: 'nextReview', label: 'Revurdering', type: 'date' },
    ], states: ['aktiv', 'lukket'],
  },
  medvirkning: {
    title: 'Medvirkning', prefix: 'MED', area: 'participation', fields: [
      { key: 'title', label: 'Tema', type: 'text', required: true },
      { key: 'description', label: 'Innspill', type: 'long', required: true },
      { key: 'channel', label: 'Kanal', type: 'select', options: opt(['AMU', 'Verneombud', 'Avdelingsmøte', 'Digitalt innspill', 'Annet']) },
      { key: 'representative', label: 'Representant', type: 'text' },
      { key: 'decision', label: 'Vurdering og beslutning', type: 'long' },
      { key: 'feedback', label: 'Tilbakemeldt', type: 'select', options: opt(['Ja', 'Nei']) },
    ], states: ['mottatt', 'behandlet', 'tilbakemeldt'],
  },
  beredskap: {
    title: 'Beredskap', prefix: 'BER', area: 'emergency', fields: [
      { key: 'title', label: 'Scenario', type: 'text', required: true },
      { key: 'domain', label: 'Område', type: 'select', options: opt(['HMS', 'Miljø', 'Drift', 'IT']) },
      { key: 'alarm', label: 'Varsling og kontaktkjede', type: 'long', required: true },
      { key: 'contacts', label: 'Interne kontakter (velg blant ansatte)', type: 'contacts' },
      { key: 'roles', label: 'Roller og ansvar', type: 'long' },
      { key: 'equipment', label: 'Utstyr', type: 'long' },
      { key: 'instructions', label: 'Beredskapskort / instruks', type: 'long', required: true },
      { key: 'ownerName', label: 'Ansvarlig', type: 'person' },
      { key: 'nextExercise', label: 'Neste øvelse', type: 'date' },
    ], states: ['aktiv', 'arkivert'],
  },
  kompetansekrav: {
    title: 'Kompetansekrav', prefix: 'KKR', area: 'competence', fields: [
      { key: 'title', label: 'Kompetanse', type: 'text', required: true },
      { key: 'role', label: 'Rolle / funksjon', type: 'text', required: true },
      { key: 'persons', label: 'Gjelder også for', type: 'persons' },
      { key: 'level', label: 'Nivå', type: 'select', options: opt(['Grunnleggende', 'Selvstendig', 'Ekspert']) },
      { key: 'validityMonths', label: 'Gyldighet (måneder, 0 = varig)', type: 'number' },
      { key: 'source', label: 'Kilde (lov, kunde, intern)', type: 'text' },
    ], states: ['aktiv', 'arkivert'],
  },
  kompetanse: {
    title: 'Kompetansebevis', prefix: 'KOM', area: 'competence', fields: [
      { key: 'personName', label: 'Ansatt', type: 'person', required: true },
      { key: 'requirementId', label: 'Kompetansekrav', type: 'ref', ref: 'kompetansekrav', required: true },
      { key: 'title', label: 'Bevis / kurs', type: 'text', required: true },
      { key: 'validFrom', label: 'Gyldig fra', type: 'date' },
      { key: 'validTo', label: 'Gyldig til', type: 'date' },
      { key: 'evidenceUrl', label: 'Dokumentasjon (lenke)', type: 'text' },
      { key: 'effect', label: 'Effektvurdering', type: 'long' },
    ], states: ['gyldig', 'arkivert'],
  },
  leverandor: {
    title: 'Leverandører', prefix: 'LEV', area: 'suppliers', fields: [
      { key: 'title', label: 'Leverandør', type: 'text', required: true },
      { key: 'orgnr', label: 'Org.nr.', type: 'text' },
      { key: 'category', label: 'Kategori', type: 'text' },
      { key: 'services', label: 'Varer / tjenester', type: 'long' },
      { key: 'supplierClass', label: 'Leverandørklasse', type: 'select', options: opt(SUPPLIER_CLASSES.map((c) => c.id)) },
      { key: 'criticality', label: 'Kritikalitet', type: 'select', options: opt(['Lav', 'Middels', 'Høy']), required: true },
      { key: 'department', label: 'Avdeling som bruker leverandøren', type: 'text' },
      { key: 'contactPerson', label: 'Kontaktperson', type: 'text' },
      { key: 'email', label: 'E-post', type: 'text' },
      { key: 'phone', label: 'Telefon', type: 'text' },
      { key: 'address', label: 'Adresse', type: 'text' },
      { key: 'certificates', label: 'Sertifikater', type: 'long' },
      { key: 'diligence', label: 'Aktsomhetsvurdering (åpenhetsloven)', type: 'select', options: opt(['Utført', 'Ikke utført', 'Ikke relevant']) },
      { key: 'agreementUrl', label: 'Gyldig avtale (lenke)', type: 'text' },
      { key: 'deviations', label: 'Registrerte avvik', type: 'select', options: opt(['Nei', 'Ja']) },
      { key: 'approval', label: 'Status', type: 'select', options: opt(['Ikke vurdert', 'Godkjent', 'Betinget godkjent', 'Ikke godkjent']), required: true },
      { key: 'score', label: 'Siste evaluering (1–5)', type: 'scale' },
      { key: 'ownerName', label: 'Ansvarlig', type: 'person' },
      { key: 'nextReview', label: 'Neste evaluering', type: 'date' },
    ], states: ['aktiv', 'arkivert'],
  },
  mal: {
    title: 'Mål og KPI', prefix: 'MAL', area: 'objectives', fields: [
      { key: 'domain', label: 'Område', type: 'select', options: opt(['Kvalitet', 'Miljø', 'Arbeidsmiljø']), required: true },
      { key: 'title', label: 'Mål', type: 'text', required: true },
      { key: 'unit', label: 'Enhet', type: 'text', required: true },
      { key: 'direction', label: 'Retning', type: 'select', options: opt(['Øke', 'Redusere']), required: true },
      { key: 'baseline', label: 'Utgangsverdi', type: 'number' },
      { key: 'target', label: 'Måltall', type: 'number', required: true },
      { key: 'method', label: 'Målemetode og datakilde', type: 'long', required: true },
      { key: 'frequency', label: 'Målefrekvens', type: 'select', options: opt(['Måned', 'Kvartal', 'Halvår', 'År']) },
      { key: 'actions', label: 'Tiltak / handlingsplan', type: 'long' },
      { key: 'ownerName', label: 'Eier', type: 'person', required: true },
      { key: 'deadline', label: 'Frist', type: 'date' },
    ], states: ['aktiv', 'nådd', 'ikke_nådd', 'arkivert'],
  },
  samsvar: {
    title: 'Samsvarsvurderinger', prefix: 'SAM', area: 'evaluation', fields: [
      { key: 'requirementId', label: 'Lov-/kontraktskrav', type: 'ref', ref: 'requirement', required: true },
      { key: 'title', label: 'Vurdering', type: 'text', required: true },
      { key: 'method', label: 'Vurderingsmetode', type: 'long', required: true },
      { key: 'result', label: 'Resultat', type: 'select', options: opt(['Etterleves', 'Delvis', 'Etterleves ikke', 'Krever juridisk vurdering']), required: true },
      { key: 'evidence', label: 'Bevis', type: 'long' },
      { key: 'nextReview', label: 'Neste vurdering', type: 'date', required: true },
    ], states: ['aktiv'],
  },
  revisjon: {
    title: 'Internrevisjon', prefix: 'REV', area: 'internalAudit', fields: [
      { key: 'title', label: 'Revisjon', type: 'text', required: true },
      { key: 'scope', label: 'Omfang (prosesser/enheter)', type: 'long', required: true },
      { key: 'criteria', label: 'Kriterier', type: 'long', required: true },
      { key: 'standards', label: 'Standarder', type: 'multi', options: opt(['ISO 9001', 'ISO 14001', 'ISO 45001', 'Lovkrav']) },
      { key: 'auditorName', label: 'Revisor', type: 'person', required: true },
      { key: 'independence', label: 'Revisor reviderer ikke eget arbeid', type: 'check', required: true },
      { key: 'riskBasis', label: 'Risikobegrunnelse', type: 'long' },
      { key: 'plannedDate', label: 'Planlagt dato', type: 'date', required: true },
      { key: 'conclusion', label: 'Konklusjon', type: 'long' },
    ], states: ['planlagt', 'pagar', 'rapport', 'godkjent', 'oppfolging', 'lukket', 'avlyst'],
  },
  ledelse: {
    title: 'Ledelsens gjennomgang', prefix: 'LGJ', area: 'review', fields: [
      { key: 'title', label: 'Gjennomgang', type: 'text', required: true },
      { key: 'period', label: 'Periode', type: 'text', required: true },
      { key: 'meetingDate', label: 'Møtedato', type: 'date', required: true },
      { key: 'participants', label: 'Deltakere', type: 'long', required: true },
      { key: 'assessment', label: 'Vurdering av systemets egnethet, tilstrekkelighet og effektivitet', type: 'long' },
    ], states: ['planlagt', 'gjennomfort', 'godkjent'],
  },
  sertifikat: {
    title: 'Sertifisering', prefix: 'SER', area: 'scope', fields: [
      { key: 'title', label: 'Standard og utgave', type: 'text', required: true },
      { key: 'certBody', label: 'Sertifiseringsorgan', type: 'text', required: true },
      { key: 'accreditation', label: 'Akkreditering', type: 'text' },
      { key: 'certNumber', label: 'Sertifikatnummer', type: 'text' },
      { key: 'scopeText', label: 'Omfang', type: 'long' },
      { key: 'validFrom', label: 'Gyldig fra', type: 'date' },
      { key: 'validTo', label: 'Gyldig til', type: 'date' },
      { key: 'nextAudit', label: 'Neste eksterne revisjon', type: 'date' },
      { key: 'limitations', label: 'Begrensninger', type: 'long' },
    ], states: ['planlagt', 'gyldig', 'utlopt'],
  },
  kvalitetsplan: {
    title: 'Prosjektkvalitet', prefix: 'KVP', area: 'design', fields: [
      { key: 'projectId', label: 'Prosjekt', type: 'project', required: true },
      { key: 'title', label: 'Kvalitetsplan', type: 'text', required: true },
      { key: 'requirements', label: 'Gjeldende krav', type: 'long' },
      { key: 'roles', label: 'Roller og ansvar', type: 'long' },
      { key: 'controlPlan', label: 'Kontrollplan og faseporter', type: 'long', required: true },
      { key: 'risks', label: 'Prosjektrisiko', type: 'long' },
      { key: 'ownerName', label: 'Prosjektleder', type: 'person', required: true },
    ], states: ['utkast', 'godkjent', 'avsluttet'],
  },
  rolle: {
    title: 'Roller og stillinger', prefix: 'ROL', area: 'roles', fields: [
      { key: 'title', label: 'Rolle / stilling', type: 'text', required: true },
      { key: 'category', label: 'Nivå', type: 'select', options: opt(ROLE_LEVELS) },
      { key: 'reportsTo', label: 'Rapporterer til', type: 'text' },
      { key: 'department', label: 'Avdeling', type: 'department' },
      { key: 'location', label: 'Sted', type: 'text' },
      { key: 'purpose', label: 'Formål med rollen', type: 'long' },
      { key: 'responsibilities', label: 'Ansvar', type: 'long', required: true },
      { key: 'authority', label: 'Myndighet', type: 'long' },
      { key: 'mandates', label: 'Fullmakter', type: 'long' },
      { key: 'tasks', label: 'Arbeidsoppgaver', type: 'long' },
      { key: 'qualifications', label: 'Kvalifikasjoner og kompetansekrav', type: 'long' },
      { key: 'holders', label: 'Innehaves av', type: 'persons' },
      { key: 'ownerName', label: 'Eier av beskrivelsen', type: 'person' },
      { key: 'nextReview', label: 'Neste gjennomgang', type: 'date' },
    ], states: ['aktiv', 'arkivert'],
  },
  myndighet: {
    title: 'Myndighetsmatrise', prefix: 'MYN', area: 'roles', fields: [
      { key: 'title', label: 'Aktivitet / beslutning', type: 'text', required: true },
      { key: 'category', label: 'Kategori', type: 'text', required: true },
      { key: 'roles', label: 'Roller med myndighet', type: 'refmulti', ref: 'rolle', required: true },
      { key: 'limit', label: 'Beløpsgrense / vilkår', type: 'text' },
      { key: 'note', label: 'Merknad', type: 'long' },
    ], states: ['aktiv', 'arkivert'],
  },
  kommunikasjon: {
    title: 'Kommunikasjonsplan', prefix: 'KPL', area: 'communication', fields: [
      { key: 'title', label: 'Hva kommuniseres', type: 'text', required: true },
      { key: 'direction', label: 'Intern / ekstern', type: 'select', options: opt(['Intern', 'Ekstern', 'Intern og ekstern']), required: true },
      { key: 'audience', label: 'Til hvem', type: 'text', required: true },
      { key: 'purpose', label: 'Hvorfor', type: 'long' },
      { key: 'when', label: 'Når / hvor ofte', type: 'text', required: true },
      { key: 'channel', label: 'Kanal', type: 'multi', options: opt(COMMUNICATION_CHANNELS) },
      { key: 'responsible', label: 'Hvem kommuniserer (rolle)', type: 'text', required: true },
      { key: 'ownerName', label: 'Ansvarlig person', type: 'person' },
      { key: 'record', label: 'Hvor dokumenteres det', type: 'text' },
    ], states: ['aktiv', 'arkivert'],
  },
  aarshjul: {
    title: 'Årshjul', prefix: 'AHJ', area: 'review', fields: [
      { key: 'title', label: 'Aktivitet', type: 'text', required: true },
      { key: 'months', label: 'Måned(er)', type: 'multi', options: opt(MONTH_NAMES), required: true },
      { key: 'frequency', label: 'Hyppighet', type: 'select', options: opt(['Årlig', 'Halvårlig', 'Kvartalsvis', 'Månedlig', 'Ved behov']) },
      { key: 'year', label: 'Bare i år (tomt = hvert år)', type: 'number' },
      { key: 'category', label: 'Område', type: 'select', options: opt(['Ledelse', 'Kvalitet', 'Miljø', 'HMS', 'Personal', 'Marked', 'Økonomi', 'Annet']) },
      { key: 'responsibleRole', label: 'Ansvarlig rolle', type: 'text' },
      { key: 'ownerName', label: 'Ansvarlig person', type: 'person' },
      { key: 'page', label: 'Utføres i ProTop', type: 'select', options: ANNUAL_PAGES },
      { key: 'description', label: 'Beskrivelse', type: 'long' },
      { key: 'createTasks', label: 'Lag oppgave i ProTop når måneden starter', type: 'check' },
    ], states: ['aktiv', 'arkivert'],
  },
};

export function registerDef(key) {
  return REGISTERS[key] || null;
}

/** ISO-siden der et register vises (for lenker fra oversikt, årshjul og import). */
const REGISTER_PAGES = {
  kontekst: 'kontekst', interessent: 'kontekst', risiko: 'risiko', miljoaspekt: 'miljo', miljodata: 'miljo', fare: 'hms', medvirkning: 'hms',
  beredskap: 'beredskap', kompetansekrav: 'kompetanse', kompetanse: 'kompetanse', leverandor: 'leverandorer', mal: 'mal', samsvar: 'lovkrav',
  revisjon: 'revisjon', ledelse: 'ledelse', sertifikat: 'sertifisering', kvalitetsplan: 'prosjekt', rolle: 'organisasjon', myndighet: 'organisasjon',
  kommunikasjon: 'kommunikasjon', aarshjul: 'arshjul',
};

export function registerPage(key) {
  return REGISTER_PAGES[key] || 'oversikt';
}

/** Poster merket «Må gjennomgås», per register (flest først). */
export function recordsNeedingReview(records) {
  return Object.entries(records || {})
    .map(([key, rows]) => ({ key, title: REGISTERS[key]?.title || key, page: registerPage(key), count: (rows || []).filter((r) => r?.needsReview && r.state !== 'arkivert').length }))
    .filter((x) => x.count)
    .sort((a, b) => b.count - a.count);
}

/** Leverandørklassen gir kritikalitet når den ikke er satt. */
function withDefaults(key, values) {
  if (key !== 'leverandor' || !values?.supplierClass || values.criticality) return values;
  const cls = SUPPLIER_CLASSES.find((c) => c.id === values.supplierClass);
  return cls ? { ...values, criticality: cls.criticality } : values;
}

function showField(field, values) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, v]) => values?.[k] === v);
}

export function validateRecord(key, values) {
  const def = registerDef(key);
  if (!def) return ['Ukjent register.'];
  const errors = [];
  for (const f of def.fields) {
    if (!showField(f, values)) continue;
    const v = values?.[f.key];
    const missing = v == null || (Array.isArray(v) ? !v.length : (typeof v === 'boolean' ? !v : !String(v).trim()));
    if (f.required && missing) errors.push(`${f.label} må fylles ut.`);
    if (!missing && f.type === 'date' && !isoDate(v)) errors.push(`${f.label}: ugyldig dato.`);
    if (!missing && f.type === 'number' && !Number.isFinite(Number(String(v).replace(',', '.')))) errors.push(`${f.label} må være et tall.`);
    if (!missing && f.type === 'scale' && !(Number(v) >= 1 && Number(v) <= 5)) errors.push(`${f.label} må være 1–5.`);
  }
  // Spesialregler
  if (key === 'miljoaspekt' && values?.significant === 'Ja' && !text(values?.controls)) errors.push('Vesentlig miljøaspekt krever operativ kontroll eller tiltak.');
  if ((key === 'risiko' || key === 'fare') && (values?.residualL || values?.residualC) && !(values?.inherentL && values?.inherentC)) {
    errors.push('Iboende risiko må vurderes før rest-risiko.');
  }
  if (key === 'kompetanse' && values?.validFrom && values?.validTo && values.validTo < values.validFrom) errors.push('Gyldig til er før gyldig fra.');
  return errors;
}

/** Personliste: navn (tekst eller { name, uid, employeeId }). Tekst kan være kommadelt. */
export function cleanPersons(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]+/);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const p = typeof item === 'object' && item ? item : { name: item };
    const name = text(p.name, 160);
    if (!name) continue;
    const id = String(p.uid || p.employeeId || name).toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ name, uid: text(p.uid, 128), employeeId: text(p.employeeId, 128) });
  }
  return out.slice(0, 40);
}

/** Kontaktliste: rolle, person (ansatt eller navn), telefon og merknad. */
export function cleanContacts(value) {
  return (Array.isArray(value) ? value : [])
    .map((c) => ({
      role: text(c?.role, 120),
      name: text(c?.name, 160),
      uid: text(c?.uid, 128),
      employeeId: text(c?.employeeId, 128),
      phone: text(c?.phone, 40),
      email: text(c?.email, 160),
      note: text(c?.note, 300),
    }))
    .filter((c) => c.role || c.name || c.phone)
    .slice(0, 40);
}

/** Visningstekst for person- og kontaktlister. */
export function personsLabel(value) {
  return cleanPersons(value).map((p) => p.name).join(', ');
}

export function contactsLabel(value) {
  return cleanContacts(value).map((c) => `${c.role ? `${c.role}: ` : ''}${c.name || '–'}${c.phone ? ` (${c.phone})` : ''}`).join(' · ');
}

function clean(key, values) {
  const def = registerDef(key);
  const out = {};
  for (const f of def.fields) {
    const v = values?.[f.key];
    if (v === undefined) continue;
    if (f.type === 'number' || f.type === 'scale') out[f.key] = v === '' || v == null ? null : Number(String(v).replace(',', '.'));
    else if (f.type === 'multi' || f.type === 'refmulti') out[f.key] = uniq(Array.isArray(v) ? v : [v]);
    else if (f.type === 'persons') out[f.key] = cleanPersons(v);
    else if (f.type === 'contacts') out[f.key] = cleanContacts(v);
    else if (f.type === 'check') out[f.key] = !!v;
    else if (f.type === 'date') out[f.key] = isoDate(v);
    else out[f.key] = text(v, f.type === 'long' ? 6000 : 400);
  }
  for (const extra of ['ownerUid', 'personUid', 'auditorUid', 'projectName', 'requirementIds', 'linkedFindingIds', 'importKey']) {
    if (values?.[extra] !== undefined) out[extra] = Array.isArray(values[extra]) ? uniq(values[extra]) : text(values[extra], 300);
  }
  // Til gjennomgang: f.eks. importert post der kilden manglet opplysninger (ansvarlig, frist …).
  if (values?.needsReview !== undefined) out.needsReview = !!values.needsReview;
  if (values?.reviewNote !== undefined) out.reviewNote = text(values.reviewNote, 1000);
  // Opphav (import fra tidligere system). Eget navn: «source» er et vanlig tekstfelt i noen registre.
  if (values?.origin !== undefined) out.origin = values.origin && typeof values.origin === 'object'
    ? { system: text(values.origin.system, 120), ref: text(values.origin.ref, 300), url: text(values.origin.url, 2000) }
    : null;
  return out;
}

export function createRecord(key, values, { actor, existing = [], now = new Date(), riskMethod = DEFAULT_RISK_METHOD } = {}) {
  const def = registerDef(key);
  if (!def) return fail('Ukjent register.');
  values = withDefaults(key, values);
  const errors = validateRecord(key, values);
  if (errors.length) return fail(errors[0], { errors });
  const data = clean(key, values);
  const record = bump({
    id: newId(def.prefix.toLowerCase()),
    register: key,
    number: nextNumber(def.prefix, existing, now),
    ...data,
    state: def.states[0],
    ...(key === 'risiko' || key === 'fare' ? methodFields(riskMethod) : {}),
    createdAt: nowIso(now),
    createdBy: text(actor?.name, 160),
    history: pushHistory({}, 'Opprettet', actor, '', now),
    rev: 0,
  }, actor, now);
  return { ok: true, record, events: [auditEvent({ entityType: key, entityId: record.id, action: `iso.${key}.created`, actor, after: record, now })] };
}

/** Metoden vurderingen gjøres etter, lagret på posten: tersklene gjelder vurderingen også når metoden endres senere. */
function methodFields(method) {
  const m = method || DEFAULT_RISK_METHOD;
  return { methodVersion: m.version, methodName: m.name, methodThresholds: { ...(m.thresholds || DEFAULT_RISK_METHOD.thresholds) } };
}

const RISK_SCORES = ['inherentL', 'inherentC', 'residualL', 'residualC'];

/** Er sannsynlighet eller konsekvens endret? Da er det en ny vurdering etter gjeldende metode. */
export function riskScoresChanged(record, values) {
  return RISK_SCORES.some((k) => values?.[k] !== undefined && String(values[k] ?? '') !== String(record?.[k] ?? ''));
}

export function updateRecord(record, values, { actor, now = new Date(), note = '', riskMethod = null } = {}) {
  if (!record) return fail('Fant ikke posten.');
  if (record.locked) return fail('Posten er godkjent og låst. Lag ny vurdering.');
  if (record.register === 'leverandor') values = withDefaults('leverandor', { supplierClass: record.supplierClass, criticality: record.criticality, ...values });
  const merged = { ...record, ...values };
  const errors = validateRecord(record.register, merged);
  if (errors.length) return fail(errors[0], { errors });
  // Ny vurdering (endrede tall) gjøres etter gjeldende metode; ellers beholder posten metoden den ble vurdert etter.
  const reassessed = riskMethod && ['risiko', 'fare'].includes(record.register) && riskScoresChanged(record, values) ? methodFields(riskMethod) : {};
  const next = bump({ ...record, ...clean(record.register, values), ...reassessed, history: pushHistory(record, 'Endret', actor, note, now) }, actor, now);
  return { ok: true, record: next, events: [auditEvent({ entityType: record.register, entityId: record.id, action: `iso.${record.register}.updated`, actor, before: record, after: next, now })] };
}

/** Registre der godkjenning låser posten (rapport og referat er bevis). */
const LOCKING_REGISTERS = ['ledelse', 'revisjon'];
/** Statuser etter godkjenning. Låsen beholdes; bare å gå tilbake til før godkjenning opphever den. */
const APPROVED_STATES = ['godkjent', 'oppfolging', 'lukket'];

export function setRecordState(record, state, { actor, now = new Date(), note = '', caps = null } = {}) {
  const def = registerDef(record?.register);
  if (!def) return fail('Ukjent register.');
  if (!def.states.includes(state)) return fail('Ugyldig status.');
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å endre status.');
  if (['godkjent', 'lukket'].includes(state) && caps && !caps.approve) return fail('Godkjenning krever en godkjennerrolle i ISO.');
  if (record.locked && caps && !caps.approve) return fail('Posten er godkjent og låst. Bare en godkjenner kan endre status.');
  // Tilbake til før godkjenning (f.eks. «planlagt») opphever godkjenningen: krever begrunnelse, og ny godkjenning låser igjen.
  const revoke = !!record.locked && !APPROVED_STATES.includes(state);
  if (revoke && text(note).length < 5) return fail('Begrunn hvorfor godkjenningen oppheves.');
  const locked = LOCKING_REGISTERS.includes(record.register) && (state === 'godkjent' || (!!record.locked && !revoke));
  const next = bump({
    ...record,
    state,
    locked,
    history: pushHistory(record, revoke ? `Godkjenning opphevet – status: ${state}` : `Status: ${state}`, actor, note, now),
  }, actor, now);
  return { ok: true, record: next, events: [auditEvent({ entityType: record.register, entityId: record.id, action: `iso.${record.register}.state`, actor, before: record, after: next, reason: note, now })] };
}

/* ───────── Risiko ───────── */

/**
 * Metoden en vurdering ble gjort etter: terskler lagret på posten, ellers versjonen i metodehistorikken
 * (method.history), ellers gjeldende metode. Eldre vurderinger klassifiseres dermed ikke om når tersklene endres.
 */
export function recordRiskMethod(record, method = DEFAULT_RISK_METHOD) {
  const current = method || DEFAULT_RISK_METHOD;
  if (record?.methodThresholds) {
    return { ...current, version: record.methodVersion || current.version, name: record.methodName || current.name, thresholds: record.methodThresholds };
  }
  if (record?.methodVersion && record.methodVersion !== current.version) {
    const old = (current.history || []).find((m) => m?.version === record.methodVersion && m?.thresholds);
    if (old) return { ...current, ...old };
  }
  return current;
}

export function riskSummary(record, method = DEFAULT_RISK_METHOD) {
  const used = recordRiskMethod(record, method);
  return {
    inherent: riskLevel(record?.inherentL, record?.inherentC, used),
    residual: riskLevel(record?.residualL, record?.residualC, used),
  };
}

/** 5×5-matrise. «iboende» og «rest» telles aldri sammen. */
export function riskMatrix(records, which = 'inherent') {
  const cells = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
  for (const r of records || []) {
    if (['lukket', 'arkivert'].includes(r.state)) continue;
    const l = Number(which === 'residual' ? r.residualL : r.inherentL);
    const c = Number(which === 'residual' ? r.residualC : r.inherentC);
    if (!(l >= 1 && l <= 5 && c >= 1 && c <= 5)) continue;
    cells[l - 1][c - 1].push(r.id);
  }
  return cells;
}

/* ───────── Kompetanse ───────── */

/** Siste gyldighetsdag for et bevis: «gyldig til», ellers «gyldig fra» + kravets gyldighet. Tom = varig eller udatert. */
export function proofEnd(record, requirement) {
  if (record?.validTo) return record.validTo;
  if (record?.validFrom && Number(requirement?.validityMonths) > 0) return addDays(record.validFrom, Math.round(requirement.validityMonths * 30.4));
  return '';
}

const PROOF_RANK = { gyldig: 0, utloper: 1, utlopt: 2 };

/** Beste bevis for et krav: gyldig foran utløpende foran utløpt, og blant like det som varer lengst. */
export function bestProof(records, requirement, now = new Date()) {
  return (records || [])
    .map((r) => ({ r, status: competenceStatus(r, requirement, now), end: proofEnd(r, requirement) || '9999-12-31' }))
    .sort((a, b) => (PROOF_RANK[a.status] - PROOF_RANK[b.status]) || b.end.localeCompare(a.end))[0]?.r || null;
}

export function competenceStatus(record, requirement, now = new Date()) {
  if (!record) return 'mangler';
  const today = todayKey(now);
  if (record.validTo && record.validTo < today) return 'utlopt';
  if (record.validTo && addDays(today, 60) >= record.validTo) return 'utloper';
  if (!record.validTo && requirement?.validityMonths > 0 && record.validFrom) {
    const end = addDays(record.validFrom, Math.round(requirement.validityMonths * 30.4));
    if (end < today) return 'utlopt';
  }
  return 'gyldig';
}

const lowerText = (v) => String(v || '').trim().toLowerCase();

/** Gjelder kravet denne personen? Krav til en rolle gjelder dem som har rollen; ellers alle. */
const ALL_ROLES = ['alle', 'alle ansatte'];

/**
 * Hvem et krav gjelder: 'ja', 'nei' eller 'uten' (rollen har ingen innehavere og ingen er valgt på kravet).
 * Uten rolleregister gjelder kravet alle.
 */
export function requirementScope(req, person, roles) {
  const isMe = (h) => (h.uid && h.uid === person.uid) || (h.employeeId && h.employeeId === person.id) || lowerText(h.name) === lowerText(person.name);
  const extra = cleanPersons(req.persons);
  if (extra.some(isMe)) return 'ja';
  const role = lowerText(req.role);
  if (!role || ALL_ROLES.includes(role) || !roles?.length) return 'ja';
  const match = roles.find((r) => r.state !== 'arkivert' && lowerText(r.title) === role);
  const holders = cleanPersons(match?.holders);
  if (holders.length) return holders.some(isMe) ? 'ja' : 'nei';
  return extra.length ? 'nei' : 'uten';
}

/** Krav som ingen er knyttet til ennå: rollen mangler innehavere, og ingen ansatte er valgt på kravet. */
export function unassignedRequirements(requirements, roles) {
  if (!roles?.length) return [];
  return (requirements || []).filter((r) => r.state !== 'arkivert' && requirementScope(r, { name: '\u0000' }, roles) === 'uten').map((r) => ({
    requirement: r,
    role: roles.find((x) => x.state !== 'arkivert' && lowerText(x.title) === lowerText(r.role)) || null,
  }));
}

/** Ord i en tittel. Bindestrek hører til ordet: «HMS-introduksjon» er ett ord, ikke «HMS». */
function titleWords(s) {
  return lowerText(s).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
}

/** Står ordene i needle som hele ord, i samme rekkefølge, i hay? */
function containsWords(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

/** Står kompetansen i CV-en (sertifisering, kurs eller utdanning)? Hele ord, ikke delord («HMS» ≠ «HMS-introduksjon»). */
export function cvEvidence(person, req) {
  const cv = person?.cv;
  const t = titleWords(req?.title);
  if (!cv || lowerText(req?.title).length < 3) return null;
  const hit = (s) => { const x = titleWords(s); return x.length > 0 && (containsWords(x, t) || containsWords(t, x)); };
  const cert = (cv.certifications || []).find((c) => hit(c.title));
  if (cert) return { kind: 'Sertifisering', title: cert.title };
  const course = (cv.courses || []).find((c) => hit(c.title));
  if (course) return { kind: 'Kurs', title: course.title, date: course.date };
  const edu = (cv.education || []).find((e) => hit(e.program));
  if (edu) return { kind: 'Utdanning', title: [edu.program, edu.school].filter(Boolean).join(', ') };
  return null;
}

/**
 * Matrise personer × krav. people: [{ id, name, uid, cv? }] fra ProTops ansattregister.
 * Krav til en rolle gjelder dem som har rollen (roles = registeret «rolle») og dem som er valgt på kravet; ellers «na».
 * Har rollen ingen innehavere, er kravet «uten innehaver» (unassigned) og teller ikke som gap for alle.
 * Uten ISO-bevis teller CV-en: varig krav i CV-en = gyldig, krav med gyldighet = «cv» (mangler dato/bevis).
 */
export function competenceMatrix(people, requirements, records, now = new Date(), { roles = null } = {}) {
  const reqs = (requirements || []).filter((r) => r.state !== 'arkivert');
  return (people || []).map((p) => ({
    person: p,
    cells: reqs.map((req) => {
      const scope = requirementScope(req, p, roles);
      if (scope !== 'ja') return { requirement: req, record: null, status: 'na', unassigned: scope === 'uten' };
      const mine = (records || []).filter((r) => r.state !== 'arkivert' && r.requirementId === req.id
        && ((p.uid && r.personUid === p.uid) || (!r.personUid && r.personName === p.name)));
      const best = bestProof(mine, req, now);
      if (!best) {
        const cv = cvEvidence(p, req);
        if (cv) return { requirement: req, record: null, cv, status: Number(req.validityMonths) > 0 ? 'cv' : 'gyldig' };
      }
      return { requirement: req, record: best, status: competenceStatus(best, req, now) };
    }),
  }));
}

/** Kompetansekravene som gjelder én person, med status. Brukes der ISO-kompetansen vises utenfor ISO (HR). */
export function competenceForPerson(person, records, now = new Date()) {
  if (!person) return [];
  const row = competenceMatrix([person], records?.kompetansekrav, records?.kompetanse, now, { roles: records?.rolle })[0];
  return (row?.cells || [])
    .filter((cell) => cell.status !== 'na')
    .map((cell) => ({ id: cell.requirement.id, title: cell.requirement.title, status: cell.status, validTo: cell.record?.validTo || '' }));
}

export function competenceGaps(matrix) {
  let gaps = 0;
  for (const row of matrix || []) for (const cell of row.cells) if (!['gyldig', 'na'].includes(cell.status)) gaps += 1;
  return gaps;
}

/* ───────── Mål og målinger ───────── */

/**
 * Sorteringsnøkkel for en måleperiode: slutten av perioden. Årsmåling «2026» kommer etter «2026-05»
 * (og etter «2026-12»), kvartal etter månedene i kvartalet.
 */
export function periodSortKey(period) {
  const p = String(period || '');
  let m = /^(\d{4})$/.exec(p);
  if (m) return `${m[1]}-12-3`;
  m = /^(\d{4})-Q([1-4])$/.exec(p);
  if (m) return `${m[1]}-${String(Number(m[2]) * 3).padStart(2, '0')}-2`;
  m = /^(\d{4})-(\d{2})/.exec(p);
  if (m) return `${m[1]}-${m[2]}-1`;
  return p;
}

/** Målingene i periodeorden (eldste først). */
export function sortedMeasurements(record) {
  return [...(record?.measurements || [])].sort((a, b) => periodSortKey(a.period).localeCompare(periodSortKey(b.period)));
}

export function addMeasurement(record, input, { actor, now = new Date() } = {}) {
  if (record?.register !== 'mal') return fail('Ikke et mål.');
  const value = Number(String(input?.value ?? '').replace(',', '.'));
  if (!Number.isFinite(value)) return fail('Skriv en tallverdi.');
  const period = text(input?.period, 20);
  if (!/^\d{4}(-\d{2})?(-Q[1-4])?$/.test(period)) return fail('Periode som ÅÅÅÅ-MM eller ÅÅÅÅ.');
  const quality = ['Målt', 'Estimert', 'Ukjent'].includes(input?.quality) ? input.quality : 'Målt';
  const measurements = sortedMeasurements({ measurements: [...(record.measurements || []).filter((m) => m.period !== period), {
    period, value, quality, source: text(input?.source, 300), at: nowIso(now), by: text(actor?.name, 160),
  }] });
  const next = bump({ ...record, measurements, history: pushHistory(record, `Måling ${period}`, actor, String(value), now) }, actor, now);
  return { ok: true, record: next, events: [auditEvent({ entityType: 'mal', entityId: record.id, action: 'iso.objective.measured', actor, before: record, after: next, now })] };
}

/** Måloppnåelse. Uten måling: ingen datagrunnlag (aldri 100 %). Uten utgangsverdi: ingen prosent. */
export function objectiveProgress(record) {
  const last = sortedMeasurements(record).at(-1);
  if (!last) return { status: 'ingen_data', label: 'Ingen datagrunnlag', value: null };
  const target = Number(record.target);
  // Number(null) og Number('') er 0: tom utgangsverdi ble regnet som 0 og ga «100 % av veien».
  const base = record.baseline == null || String(record.baseline).trim() === '' ? NaN : Number(record.baseline);
  const up = record.direction !== 'Redusere';
  const reached = up ? last.value >= target : last.value <= target;
  let pct = null;
  if (Number.isFinite(base) && base !== target) pct = Math.max(0, Math.min(100, Math.round(((last.value - base) / (target - base)) * 100)));
  return { status: reached ? 'naadd' : 'underveis', label: reached ? 'Nådd' : 'Underveis', value: last.value, period: last.period, quality: last.quality, pct };
}

/* ───────── Internrevisjon ───────── */

export const AUDIT_FINDING_CLASSES = [
  { id: 'samsvar', label: 'Samsvar' },
  { id: 'forbedring', label: 'Forbedringsmulighet' },
  { id: 'avvik', label: 'Avvik' },
];

export function addAuditFinding(audit, input, { actor, now = new Date() } = {}) {
  if (audit?.register !== 'revisjon') return fail('Ikke en revisjon.');
  if (audit.locked || ['lukket', 'avlyst', 'godkjent'].includes(audit.state)) return fail('Revisjonen er avsluttet eller godkjent og låst.');
  if (!AUDIT_FINDING_CLASSES.some((c) => c.id === input?.classification)) return fail('Klassifiser funnet.');
  if (!text(input?.description)) return fail('Beskriv funnet.');
  if (input.classification !== 'samsvar' && !text(input?.evidence)) return fail('Beskriv objektivt bevis for funnet.');
  const row = {
    id: newId('rfn'),
    classification: input.classification,
    requirementIds: uniq(input.requirementIds),
    processRef: text(input.processRef, 200),
    description: text(input.description, 3000),
    evidence: text(input.evidence, 3000),
    findingId: '',
    at: nowIso(now),
    by: text(actor?.name, 160),
  };
  const next = bump({
    ...audit,
    findings: [...(audit.findings || []), row],
    state: audit.state === 'planlagt' ? 'pagar' : audit.state,
    history: pushHistory(audit, `Funn: ${row.classification}`, actor, row.description, now),
  }, actor, now);
  return { ok: true, record: next, auditFinding: row, events: [auditEvent({ entityType: 'revisjon', entityId: audit.id, action: 'iso.audit.finding', actor, before: audit, after: next, now })] };
}

/** Input for å opprette avvikssak fra revisjonsfunn (A08 / T16). */
export function findingInputFromAudit(audit, auditFinding) {
  return {
    type: 'revisjonsfunn',
    title: `Revisjonsfunn: ${text(auditFinding.description, 80)}`,
    description: `${auditFinding.description}\n\nBevis: ${auditFinding.evidence}\nRevisjon: ${audit.number} ${audit.title}`,
    requirementIds: auditFinding.requirementIds,
    auditId: audit.id,
    auditFindingRef: auditFinding.id,
    severity: auditFinding.classification === 'avvik' ? 'middels' : 'lav',
  };
}

export function linkAuditFinding(audit, auditFindingId, findingId) {
  return {
    ...audit,
    findings: (audit.findings || []).map((f) => (f.id === auditFindingId ? { ...f, findingId } : f)),
  };
}

/* ───────── Ledelsens gjennomgang ───────── */

/** Låser inndata som snapshot når referatet godkjennes (T17). */
export function attachReviewSnapshot(record, snapshot, { actor, now = new Date() } = {}) {
  if (record?.register !== 'ledelse') return fail('Ikke en ledelsens gjennomgang.');
  if (record.locked) return fail('Referatet er godkjent og låst.');
  const next = bump({ ...record, snapshot: { ...snapshot, takenAt: nowIso(now), takenBy: text(actor?.name, 160) }, history: pushHistory(record, 'Grunnlag hentet', actor, '', now) }, actor, now);
  return { ok: true, record: next, events: [] };
}

export function addReviewDecision(record, input, { actor, now = new Date() } = {}) {
  if (record?.register !== 'ledelse') return fail('Ikke en ledelsens gjennomgang.');
  if (record.locked) return fail('Referatet er godkjent og låst.');
  if (!text(input?.decision)) return fail('Skriv beslutningen.');
  if (!text(input?.ownerName)) return fail('Velg ansvarlig.');
  if (!isoDate(input?.dueAt)) return fail('Sett frist.');
  const row = {
    id: newId('vdk'),
    decision: text(input.decision, 2000),
    kind: ['forbedring', 'ressurs', 'endring', 'annet'].includes(input.kind) ? input.kind : 'forbedring',
    ownerName: text(input.ownerName, 160),
    ownerUid: text(input.ownerUid, 128),
    dueAt: isoDate(input.dueAt),
    done: false,
    taskKey: '',
  };
  row.taskKey = `iso_${record.id}_${row.id}`;
  const next = bump({ ...record, decisions: [...(record.decisions || []), row], history: pushHistory(record, 'Beslutning', actor, row.decision, now) }, actor, now);
  return { ok: true, record: next, decision: row, events: [auditEvent({ entityType: 'ledelse', entityId: record.id, action: 'iso.review.decision', actor, before: record, after: next, now })] };
}

/**
 * Vedtaket er gjennomført. Kan gjøres av den ansvarlige også når referatet er godkjent og låst:
 * bare vedtaket endres (reglene sjekker det via doneDecisionIndex), ikke resten av referatet.
 */
export function markDecisionDone(record, decisionId, { actor, now = new Date(), caps = null } = {}) {
  if (record?.register !== 'ledelse') return fail('Ikke en ledelsens gjennomgang.');
  const index = (record.decisions || []).findIndex((d) => d.id === decisionId);
  const row = index >= 0 ? record.decisions[index] : null;
  if (!row) return fail('Fant ikke vedtaket.');
  if (row.done) return fail('Vedtaket er allerede gjennomført.');
  if (caps && !caps.manage && !(row.ownerUid && row.ownerUid === text(actor?.uid, 128))) return fail('Bare ansvarlig for vedtaket eller en saksbehandler kan merke det gjennomført.');
  const decisions = record.decisions.map((d, i) => (i === index ? { ...d, done: true, doneAt: nowIso(now), doneBy: text(actor?.name, 160), doneByUid: text(actor?.uid, 128) } : d));
  const next = bump({ ...record, decisions, doneDecisionIndex: index, history: pushHistory(record, 'Beslutning gjennomført', actor, row.decision, now) }, actor, now);
  return { ok: true, record: next, events: [auditEvent({ entityType: 'ledelse', entityId: record.id, action: 'iso.review.decision_done', actor, before: record, after: next, now })] };
}

/** Vedtak som er gjennomført i ISO, eller der oppgaven er markert ferdig i Oppgaver. */
export function decisionCompleted(decision, taskStatus = null) {
  if (decision?.done) return true;
  const key = String(decision?.taskKey || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140);
  return !!(key && taskStatus?.[key]?.done);
}

/* ───────── Beredskap ───────── */

/**
 * Registrerer en øvelse og flytter neste øvelse frem: valgt dato, ellers 12 måneder etter øvelsen.
 * En neste øvelse som allerede er planlagt senere, beholdes.
 */
export function addExercise(record, input, { actor, now = new Date() } = {}) {
  if (record?.register !== 'beredskap') return fail('Ikke et beredskapsscenario.');
  if (!isoDate(input?.date)) return fail('Sett dato for øvelsen.');
  if (!text(input?.evaluation)) return fail('Skriv evalueringen.');
  if (input?.nextExercise && !isoDate(input.nextExercise)) return fail('Ugyldig dato for neste øvelse.');
  const row = { id: newId('ovl'), date: isoDate(input.date), participants: text(input.participants, 1000), evaluation: text(input.evaluation, 3000), improvement: !!input.improvement, by: text(actor?.name, 160), at: nowIso(now) };
  if (input?.nextExercise && isoDate(input.nextExercise) <= row.date) return fail('Neste øvelse må være etter denne øvelsen.');
  const yearAfter = addDays(row.date, Math.round(12 * 30.4));
  const nextExercise = isoDate(input?.nextExercise) || (record.nextExercise && record.nextExercise > yearAfter ? record.nextExercise : yearAfter);
  const next = bump({ ...record, exercises: [...(record.exercises || []), row], nextExercise, history: pushHistory(record, 'Øvelse registrert', actor, `${row.evaluation} · neste øvelse ${nextExercise}`, now) }, actor, now);
  return { ok: true, record: next, exercise: row, events: [auditEvent({ entityType: 'beredskap', entityId: record.id, action: 'iso.emergency.exercise', actor, before: record, after: next, now })] };
}

/* ───────── Leverandørevaluering (8.4) ───────── */

export const SUPPLIER_CRITERIA = [
  { key: 'quality', label: 'Kvalitet' },
  { key: 'hse', label: 'HMS' },
  { key: 'environment', label: 'Miljø' },
  { key: 'delivery', label: 'Leveringsevne' },
];

/**
 * Evaluering av en leverandør: kriteriene 1–5, beslutning og kommentar. Evalueringen legges i historikken,
 * score og status oppdateres, og neste evaluering settes ut fra leverandørklassen (ellers 12 mnd).
 * Erstatter et eget evalueringsskjema, så resultatet bare ligger ett sted.
 */
export function addSupplierEvaluation(record, input, { actor, now = new Date() } = {}) {
  if (record?.register !== 'leverandor') return fail('Ikke en leverandør.');
  const scores = {};
  for (const c of SUPPLIER_CRITERIA) {
    const v = Number(input?.[c.key]);
    if (!(v >= 1 && v <= 5)) return fail(`Gi ${c.label.toLowerCase()} en score fra 1 til 5.`);
    scores[c.key] = v;
  }
  const decision = ['Godkjent', 'Betinget godkjent', 'Ikke godkjent'].includes(input?.decision) ? input.decision : '';
  if (!decision) return fail('Velg beslutning.');
  if (decision !== 'Godkjent' && !text(input?.comment)) return fail('Begrunn beslutningen.');
  const total = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / SUPPLIER_CRITERIA.length) * 10) / 10;
  const date = isoDate(input?.date) || todayKey(now);
  const cls = SUPPLIER_CLASSES.find((c) => c.id === record.supplierClass);
  const months = cls ? cls.months : 12;
  const row = { id: newId('lev'), date, ...scores, total, decision, comment: text(input?.comment, 2000), by: text(actor?.name, 160), at: nowIso(now) };
  const next = bump({
    ...record,
    evaluations: [...(record.evaluations || []), row],
    score: Math.round(total),
    approval: decision,
    nextReview: months ? addDays(date, Math.round(months * 30.4)) : (record.nextReview || ''),
    history: pushHistory(record, `Evaluert: ${decision} (${total})`, actor, row.comment, now),
  }, actor, now);
  return { ok: true, record: next, evaluation: row, events: [auditEvent({ entityType: 'leverandor', entityId: record.id, action: 'iso.supplier.evaluated', actor, before: record, after: next, now })] };
}

/* ───────── Samsvar → kravstatus (aldri automatisk «verifisert») ───────── */

export function assessmentStatusFromCompliance(result) {
  if (result === 'Etterleves') return 'dokumentert';
  if (result === 'Delvis') return 'under_arbeid';
  if (result === 'Etterleves ikke') return 'avvik';
  return 'ma_revurderes';
}

export function overdueRecords(records, field = 'nextReview', now = new Date()) {
  const today = todayKey(now);
  return (records || []).filter((r) => !['arkivert', 'lukket'].includes(r.state) && r[field] && r[field] < today);
}
