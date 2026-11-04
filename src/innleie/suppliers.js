/**
 * Leverandørkontroll: bemanningsforetak, underentreprenører og leverandører dere bruker.
 * Det dere som oppdragsgiver skal påse før og under oppdraget, per firma (ikke per person).
 *
 * Kilder: forskrift om bemanningsforetak, allmenngjøringsloven § 12 og forskrift om
 * informasjons- og påseplikt og innsynsrett, forskrift om HMS-kort, byggherreforskriften
 * § 15 (oversiktsliste), arbeidsmiljøloven § 14-12c og allmenngjøringsloven § 13 (solidaransvar).
 *
 * Lagres i HR-dokumentet som hr.suppliers (samme tilgang som Innleie).
 * Ren modul – testes uten Firebase.
 */

function text(value) {
  return String(value ?? '').trim();
}

function dayKey(value) {
  const m = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function addMonths(iso, months) {
  const m = dayKey(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1 + months, +m[3])).toISOString().slice(0, 10);
}

export const SUPPLIER_KINDS = [
  { id: 'bemanning', label: 'Bemanningsforetak', short: 'Bemanning', icon: 'people-outline' },
  { id: 'underentreprenor', label: 'Underentreprenør', short: 'UE', icon: 'construct-outline' },
  { id: 'leverandor', label: 'Leverandør', short: 'Leverandør', icon: 'cube-outline' },
];

export function supplierKindLabel(kind) {
  return SUPPLIER_KINDS.find((row) => row.id === kind)?.label || 'Leverandør';
}

/**
 * level: 'law' er lovkrav, 'advice' er anbefalt.
 * validMonths: hvor lenge en kontroll gjelder før den må tas på nytt (skatteattest o.l.).
 */
export const SUPPLIER_CHECKS = [
  {
    id: 'sup_registry',
    level: 'law',
    label: 'Registrert hos Arbeidstilsynet',
    appliesTo: ['bemanning'],
    hint: 'Det er ikke lov å leie inn fra et bemanningsforetak som ikke står i Arbeidstilsynets register. Sjekk før innleien starter.',
  },
  {
    id: 'sup_brreg',
    level: 'advice',
    label: 'Enhetsregisteret og MVA-registeret',
    appliesTo: ['bemanning', 'underentreprenor', 'leverandor'],
    hint: 'Firmaet finnes, er ikke slettet eller under konkurs, og er registrert for MVA når det fakturerer MVA.',
  },
  {
    id: 'sup_tax',
    level: 'advice',
    label: 'Skatteattest',
    appliesTo: ['bemanning', 'underentreprenor'],
    validMonths: 6,
    hint: 'Viser at skatt og MVA er betalt. Be om en attest som ikke er eldre enn seks måneder.',
  },
  {
    id: 'sup_terms',
    level: 'law',
    label: 'Påseplikt: lønns- og arbeidsvilkår',
    appliesTo: ['bemanning', 'underentreprenor'],
    validMonths: 12,
    hint: 'I byggebransjen gjelder allmenngjort tariff. Dere skal informere om vilkårene i kontrakten og påse at de følges hos underleverandørene, f.eks. med lønnsslipper og timelister.',
  },
  {
    id: 'sup_hms_cards',
    level: 'law',
    label: 'HMS-kort for alle som arbeider for dere',
    appliesTo: ['bemanning', 'underentreprenor'],
    hint: 'Alle på bygge- og anleggsplass skal bære gyldig HMS-kort, også underentreprenørers folk.',
  },
  {
    id: 'sup_crew_list',
    level: 'law',
    label: 'Oversiktsliste over personell',
    appliesTo: ['underentreprenor'],
    hint: 'Byggherreforskriften § 15: det føres daglig oversikt over hvem som arbeider på byggeplassen. Underentreprenøren må gi dere opplysningene.',
  },
  {
    id: 'sup_hse',
    level: 'advice',
    label: 'HMS-egenerklæring',
    appliesTo: ['bemanning', 'underentreprenor', 'leverandor'],
    validMonths: 12,
    hint: 'Firmaet bekrefter at det har HMS-system, verneombud og opplæring. Be om den før første oppdrag og så én gang i året.',
  },
  {
    id: 'sup_insurance',
    level: 'advice',
    label: 'Ansvarsforsikring',
    appliesTo: ['underentreprenor', 'leverandor'],
    validMonths: 12,
    hint: 'Firmaet har forsikring som dekker skade det gjør på prosjektet.',
  },
  {
    id: 'sup_contract',
    level: 'advice',
    label: 'Skriftlig avtale',
    appliesTo: ['bemanning', 'underentreprenor', 'leverandor'],
    hint: 'Avtalen sier pris, omfang, kontraktsledd og at dere har innsyn i lønns- og arbeidsvilkår. Ved innleie og underentreprise har dere solidaransvar for lønn.',
  },
];

export function supplierChecksFor(kind) {
  return SUPPLIER_CHECKS.filter((row) => row.appliesTo.includes(kind));
}

const KIND_IDS = SUPPLIER_KINDS.map((row) => row.id);
const STATUSES = ['ok', 'missing', 'na'];

export function normalizeSupplier(raw = {}) {
  const kind = KIND_IDS.includes(raw?.kind) ? raw.kind : 'underentreprenor';
  const checks = {};
  for (const row of SUPPLIER_CHECKS) {
    const src = raw?.checks?.[row.id];
    if (!src || typeof src !== 'object') continue;
    const status = STATUSES.includes(src.status) ? src.status : '';
    if (!status) continue;
    checks[row.id] = { status, date: dayKey(src.date), note: text(src.note).slice(0, 500) };
  }
  const orgNr = text(raw?.orgNr).replace(/\s+/g, '');
  return {
    id: text(raw?.id) || `sup_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: text(raw?.name).slice(0, 160),
    orgNr: /^\d{9}$/.test(orgNr) ? orgNr : '',
    kind,
    contact: text(raw?.contact).slice(0, 200),
    employeeIds: [...new Set((Array.isArray(raw?.employeeIds) ? raw.employeeIds : []).map(text).filter(Boolean))],
    checks,
    note: text(raw?.note).slice(0, 2000),
    archived: raw?.archived === true,
    createdAt: text(raw?.createdAt),
    updatedAt: text(raw?.updatedAt),
  };
}

/**
 * Status for hver kontroll: 'ok', 'expired' (gått ut på tid), 'missing' eller 'na'.
 * Lovkrav som mangler eller er utløpt teller som mangel.
 */
export function supplierStatus(supplier, { today = '' } = {}) {
  const now = dayKey(today) || new Date().toISOString().slice(0, 10);
  const row = normalizeSupplier(supplier);
  const items = supplierChecksFor(row.kind).map((check) => {
    const saved = row.checks[check.id];
    let status = saved?.status || 'missing';
    let validTo = '';
    if (status === 'ok' && check.validMonths) {
      validTo = saved.date ? addMonths(saved.date, check.validMonths) : '';
      if (!validTo || validTo < now) status = 'expired';
    }
    return {
      ...check, status, date: saved?.date || '', note: saved?.note || '', validTo,
    };
  });
  const counted = items.filter((item) => item.status !== 'na');
  const ok = counted.filter((item) => item.status === 'ok').length;
  const lawGaps = items.filter((item) => item.level === 'law' && (item.status === 'missing' || item.status === 'expired'));
  return {
    supplier: row,
    items,
    ok,
    total: counted.length,
    pct: counted.length ? Math.round((ok / counted.length) * 100) : 100,
    lawGaps,
    expired: items.filter((item) => item.status === 'expired'),
  };
}

/** Oversikt over alle aktive leverandører, med de som mangler lovkrav først. */
export function suppliersSummary(suppliers, { today = '' } = {}) {
  const rows = (suppliers || [])
    .map((raw) => supplierStatus(raw, { today }))
    .filter((row) => !row.supplier.archived)
    .sort((a, b) => b.lawGaps.length - a.lawGaps.length || a.pct - b.pct
      || a.supplier.name.localeCompare(b.supplier.name, 'nb'));
  const byKind = SUPPLIER_KINDS.map((kind) => ({
    ...kind,
    count: rows.filter((row) => row.supplier.kind === kind.id).length,
  }));
  const ok = rows.reduce((n, row) => n + row.ok, 0);
  const total = rows.reduce((n, row) => n + row.total, 0);
  return {
    rows,
    byKind,
    count: rows.length,
    withLawGaps: rows.filter((row) => row.lawGaps.length).length,
    expired: rows.reduce((n, row) => n + row.expired.length, 0),
    pct: total ? Math.round((ok / total) * 100) : 100,
  };
}

/** Leverandøren personen kommer fra, slått opp i registeret. */
export function supplierForEmployee(suppliers, employeeId) {
  const id = text(employeeId);
  if (!id) return null;
  return (suppliers || []).map(normalizeSupplier).find((row) => !row.archived && row.employeeIds.includes(id)) || null;
}
