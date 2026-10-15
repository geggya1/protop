/**
 * Lovpålagt og ISO-relatert oppfølging per ansatt.
 * Kilder: AML §§ 4-2/4-3/14-5/14-6, internkontrollforskriften, ISO 9001/14001/45001.
 */

export const COMPLIANCE_SOURCES = [
  { id: 'aml', label: 'Arbeidsmiljøloven' },
  { id: 'ik', label: 'Internkontroll' },
  { id: 'iso9001', label: 'ISO 9001' },
  { id: 'iso14001', label: 'ISO 14001' },
  { id: 'iso45001', label: 'ISO 45001' },
  { id: 'gdpr', label: 'GDPR' },
];

/** Standard sjekkliste — «skal være under kontroll» for oppdragsgiver. */
export const COMPLIANCE_CATALOG = [
  {
    id: 'aml_written_contract',
    source: 'aml',
    label: 'Skriftlig arbeidsavtale',
    hint: 'AML §§ 14-5 og 14-6 — alle skal ha skriftlig avtale.',
    required: true,
  },
  {
    id: 'aml_contract_minimum',
    source: 'aml',
    label: 'Avtalen dekker minimumskrav',
    hint: 'Partene, sted, stilling, start, stillings-%, lønn, arbeidstid, prøvetid, oppsigelse.',
    required: true,
  },
  {
    id: 'aml_probation_documented',
    source: 'aml',
    label: 'Prøvetid dokumentert (hvis avtalt)',
    hint: 'Maks 6 måneder; skriftlig i avtalen.',
    required: false,
  },
  {
    id: 'aml_followup_dialogue',
    source: 'aml',
    label: 'Systematisk oppfølging / medarbeidersamtale',
    hint: 'AML §§ 4-2 og 4-3 — helse, trivsel og utvikling.',
    required: true,
  },
  {
    id: 'ik_hms_intro',
    source: 'ik',
    label: 'HMS-introduksjon gjennomført',
    hint: 'Internkontroll: opplæring og informasjon til ansatte.',
    required: true,
  },
  {
    id: 'ik_deviation_known',
    source: 'ik',
    label: 'Kjenner avviksrutine',
    hint: 'Ansatt vet hvordan avvik meldes.',
    required: true,
  },
  {
    id: 'iso9001_competence',
    source: 'iso9001',
    label: 'Kompetanse for rollen dokumentert',
    hint: 'ISO 9001 kap. 7.2 — kompetanse og bevis.',
    required: true,
  },
  {
    id: 'iso9001_training',
    source: 'iso9001',
    label: 'Opplæring / bevissthet',
    hint: 'ISO 9001 kap. 7.3.',
    required: false,
  },
  {
    id: 'iso14001_role',
    source: 'iso14001',
    label: 'Miljøansvar / opplæring (ved behov)',
    hint: 'ISO 14001 — miljøkompetanse knyttet til rollen.',
    required: false,
  },
  {
    id: 'iso45001_hms',
    source: 'iso45001',
    label: 'Arbeidsmiljøopplæring',
    hint: 'ISO 45001 + AML — risikoforståelse og vern.',
    required: true,
  },
  {
    id: 'iso45001_ppe',
    source: 'iso45001',
    label: 'Verneutstyr utlevert (ved behov)',
    hint: 'Når rollen krever det.',
    required: false,
  },
  {
    id: 'gdpr_privacy_notice',
    source: 'gdpr',
    label: 'Personverninformasjon gitt',
    hint: 'Ansatt er informert om behandling av personaldata.',
    required: true,
  },
];

export function emptyComplianceItem(catalogId, employeeId) {
  const cat = COMPLIANCE_CATALOG.find((row) => row.id === catalogId);
  return {
    id: `${catalogId}_${employeeId || 'x'}`,
    catalogId,
    employeeId: String(employeeId || ''),
    source: cat?.source || '',
    label: cat?.label || catalogId,
    status: 'missing', // missing | ok | na | overdue
    dueDate: '',
    completedAt: '',
    note: '',
    evidenceUrl: '',
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeComplianceItem(row = {}) {
  const catalogId = String(row.catalogId || row.id || '').trim();
  const cat = COMPLIANCE_CATALOG.find((item) => item.id === catalogId);
  const status = ['missing', 'ok', 'na', 'overdue'].includes(row.status) ? row.status : 'missing';
  return {
    id: String(row.id || '').trim() || `${catalogId}_${row.employeeId || 'x'}`,
    catalogId: catalogId || 'unknown',
    employeeId: String(row.employeeId || '').trim(),
    source: String(row.source || cat?.source || '').trim(),
    label: String(row.label || cat?.label || catalogId).trim(),
    status,
    dueDate: String(row.dueDate || '').slice(0, 10),
    completedAt: String(row.completedAt || '').slice(0, 10),
    note: String(row.note || '').trim(),
    evidenceUrl: String(row.evidenceUrl || '').trim(),
    updatedAt: String(row.updatedAt || '') || new Date().toISOString(),
  };
}

/** Sikre at alle katalogpunkter finnes for en ansatt. */
export function ensureEmployeeCompliance(existing, employeeId) {
  const emp = String(employeeId || '').trim();
  if (!emp) return [];
  const map = new Map(
    (existing || [])
      .filter((row) => String(row.employeeId) === emp)
      .map((row) => [row.catalogId, normalizeComplianceItem(row)]),
  );
  return COMPLIANCE_CATALOG.map((cat) => (
    map.get(cat.id) || emptyComplianceItem(cat.id, emp)
  ));
}

export function complianceSummary(items) {
  const rows = Array.isArray(items) ? items : [];
  const required = rows.filter((row) => {
    const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
    return cat?.required && row.status !== 'na';
  });
  const ok = required.filter((row) => row.status === 'ok').length;
  const missing = required.filter((row) => row.status === 'missing' || row.status === 'overdue').length;
  return {
    total: required.length,
    ok,
    missing,
    pct: required.length ? Math.round((ok / required.length) * 1000) / 10 : 100,
  };
}

/** AML § 14-6 minimumsfelter for arbeidsavtale (lagres på kontrakt/person). */
export const AML_CONTRACT_FIELDS = [
  { key: 'employerName', label: 'Arbeidsgiver (part)', aml: 'a' },
  { key: 'employeeName', label: 'Arbeidstaker (part)', aml: 'a' },
  { key: 'workplace', label: 'Arbeidssted', aml: 'b' },
  { key: 'title', label: 'Stilling / tittel', aml: 'c' },
  { key: 'roleDescription', label: 'Beskrivelse av arbeidet / rollen', aml: 'c' },
  { key: 'startDate', label: 'Startdato', aml: 'd' },
  { key: 'endDate', label: 'Sluttdato (hvis midlertidig)', aml: 'e' },
  { key: 'temporaryBasis', label: 'Grunnlag for midlertidighet', aml: 'e' },
  { key: 'probationMonths', label: 'Prøvetid (måneder)', aml: 'f' },
  { key: 'holidayTerms', label: 'Ferie / feriepenger', aml: 'g' },
  { key: 'noticePeriod', label: 'Oppsigelsesfrist', aml: 'h' },
  { key: 'salaryAmount', label: 'Lønn ved start', aml: 'i' },
  { key: 'salaryExtras', label: 'Tillegg / godtgjørelser', aml: 'i' },
  { key: 'paySchedule', label: 'Utbetalingsmåte / tidspunkt', aml: 'i' },
  { key: 'workPercent', label: 'Stillingsprosent / omfang', aml: 'j' },
  { key: 'workHours', label: 'Daglig / ukentlig arbeidstid', aml: 'j' },
  { key: 'breakLength', label: 'Pauser', aml: 'k' },
  { key: 'collectiveAgreement', label: 'Tariffavtale', aml: 'n' },
  { key: 'passportOrId', label: 'ID / pass (referanse)', aml: '' },
  { key: 'loanOrAdvance', label: 'Lån / forskudd (hvis aktuelt)', aml: '' },
  { key: 'otherTerms', label: 'Øvrige betingelser', aml: '' },
];

export function amlContractCompleteness(contract = {}) {
  const requiredKeys = [
    'employerName', 'employeeName', 'workplace', 'title', 'startDate',
    'workPercent', 'salaryAmount', 'workHours', 'noticePeriod',
  ];
  const filled = requiredKeys.filter((key) => String(contract[key] || '').trim()).length;
  return {
    filled,
    total: requiredKeys.length,
    pct: Math.round((filled / requiredKeys.length) * 1000) / 10,
    missing: requiredKeys.filter((key) => !String(contract[key] || '').trim()),
  };
}
