/**
 * Lovpålagt oppfølging per ansatt: arbeidsavtale, oppfølging, verneutstyr og personvern.
 * Kilder: AML §§ 4-2/4-3/14-5/14-6 og personvernforordningen.
 * Kompetanse, opplæring, HMS-introduksjon og avviksrutine følges opp i ISO / K-HMS → Kompetanse.
 */

export const COMPLIANCE_SOURCES = [
  { id: 'aml', label: 'Arbeidsmiljøloven' },
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
    // Id-en er beholdt fra da punktet lå under ISO 45001, så lagrede avkrysninger følger med.
    id: 'iso45001_ppe',
    source: 'aml',
    label: 'Verneutstyr utlevert (ved behov)',
    hint: 'Når rollen krever det. Arbeidsgiver stiller verneutstyret til rådighet.',
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

const CATALOG_IDS = new Set(COMPLIANCE_CATALOG.map((row) => row.id));

/**
 * Punkter som før lå i sjekklisten og nå følges opp i ISO / K-HMS → Kompetanse.
 * Lagrede rader for dem beholdes, så ISO kan ta med det som er krysset av.
 */
export const MOVED_TO_ISO = [
  { id: 'ik_hms_intro', label: 'HMS-introduksjon gjennomført' },
  { id: 'ik_deviation_known', label: 'Kjenner avviksrutine' },
  { id: 'iso9001_competence', label: 'Kompetanse for rollen dokumentert' },
  { id: 'iso9001_training', label: 'Opplæring / bevissthet' },
  { id: 'iso14001_role', label: 'Miljøansvar / opplæring (ved behov)' },
  { id: 'iso45001_hms', label: 'Arbeidsmiljøopplæring' },
];

/** Bytt ut én ansatts sjekkliste. Rader utenfor katalogen (flyttet til ISO) blir stående. */
export function replaceEmployeeCompliance(all, employeeId, rows) {
  const emp = String(employeeId || '').trim();
  const kept = (all || []).filter((row) => String(row.employeeId) !== emp || !CATALOG_IDS.has(row.catalogId));
  return [...kept, ...(rows || [])];
}

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
    source: String(cat?.source || row.source || '').trim(),
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
  { key: 'positionTitle', label: 'Stilling / tittel', aml: 'c' },
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
    'employerName', 'employeeName', 'workplace', 'positionTitle', 'startDate',
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

function markOk(row, note = '') {
  return {
    ...row,
    status: 'ok',
    completedAt: row.completedAt || new Date().toISOString().slice(0, 10),
    note: note || row.note,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Synkroniser sjekkliste fra avtaler og samtaler (Personio/BambooHR-mønster).
 * Skriver bare opp mangler → OK når evidens finnes; overskriver ikke manuell OK/NA.
 */
export function syncComplianceFromEvidence(compliance, {
  employeeId,
  contracts = [],
  reviews = [],
} = {}) {
  const emp = String(employeeId || '').trim();
  if (!emp) return Array.isArray(compliance) ? compliance : [];
  const rows = ensureEmployeeCompliance(compliance, emp);
  const active = (contracts || []).find(
    (c) => String(c.employeeId) === emp && c.status === 'active',
  );
  const aml = active ? amlContractCompleteness(active) : null;
  const hasDoneReview = (reviews || []).some(
    (r) => String(r.employeeId) === emp && r.status === 'done',
  );

  const next = rows.map((row) => {
    if (row.status === 'ok' || row.status === 'na') return row;
    if (row.catalogId === 'aml_written_contract' && active) {
      return markOk(row, 'Aktiv arbeidsavtale i HR');
    }
    if (row.catalogId === 'aml_contract_minimum' && aml && aml.pct >= 100) {
      return markOk(row, `AML-minimum dekket (${aml.filled}/${aml.total})`);
    }
    if (row.catalogId === 'aml_probation_documented' && active?.probationMonths) {
      return markOk(row, `Prøvetid ${active.probationMonths} mnd i avtale`);
    }
    if (row.catalogId === 'aml_followup_dialogue' && hasDoneReview) {
      return markOk(row, 'Medarbeidersamtale gjennomført');
    }
    return row;
  });

  return replaceEmployeeCompliance(compliance, emp, next);
}

/** Oversikt over compliance-gap for hele selskapet (sortert verst først). */
export function companyComplianceOverview(employees, compliance, {
  contracts = [],
  reviews = [],
  applyEvidence = true,
} = {}) {
  const rows = [];
  for (const emp of employees || []) {
    if (emp?.company?.status === 'deleted') continue;
    const id = String(emp?.id || '');
    if (!id) continue;
    const sourced = applyEvidence
      ? syncComplianceFromEvidence(compliance || [], {
        employeeId: id,
        contracts,
        reviews,
      })
      : (compliance || []);
    const items = ensureEmployeeCompliance(sourced, id);
    const summary = complianceSummary(items);
    const gapRows = items.filter((row) => {
      const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
      return cat?.required && (row.status === 'missing' || row.status === 'overdue');
    });
    rows.push({
      employeeId: id,
      missing: summary.missing,
      ok: summary.ok,
      total: summary.total,
      pct: summary.pct,
      gaps: gapRows.map((row) => row.label),
      gapIds: gapRows.map((row) => row.catalogId),
    });
  }
  return rows.sort((a, b) => b.missing - a.missing || a.pct - b.pct);
}
