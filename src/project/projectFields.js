/**
 * ProTop-prosjektfelter: prismodell, automatiske økonomifelter og opprydding
 * av Moment-importfelter som ikke skal redigeres manuelt i ProTop.
 */

function text(value) {
  return String(value || '').trim();
}

/** Prismodeller i ProTop (ikke Moment-råverdier som "notbillable"). */
export const PRICING_MODELS = [
  { id: 'not_billable', label: 'Ikke fakturerbar' },
  { id: 'hourly', label: 'Timepris' },
  { id: 'fixed', label: 'Fastpris' },
  { id: 'retainer', label: 'Fast avtale / retainer' },
  { id: 'unit', label: 'Enhetspris' },
];

const PRICING_ALIASES = {
  notbillable: 'not_billable',
  not_billable: 'not_billable',
  'not billable': 'not_billable',
  nonbillable: 'not_billable',
  hourlyrate: 'hourly',
  hourly: 'hourly',
  timepris: 'hourly',
  fixedprice: 'fixed',
  fixed: 'fixed',
  fastpris: 'fixed',
  retainer: 'retainer',
  unit: 'unit',
  unitprice: 'unit',
  enhetspris: 'unit',
};

export function normalizePricingModel(value) {
  const raw = text(value);
  if (!raw) return '';
  const folded = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (PRICING_ALIASES[folded]) return PRICING_ALIASES[folded];
  if (PRICING_MODELS.some((row) => row.id === raw)) return raw;
  return '';
}

export function pricingModelLabel(value) {
  const id = normalizePricingModel(value);
  return PRICING_MODELS.find((row) => row.id === id)?.label || '';
}

/** Felter som fylles av timer/økonomi-moduler — ikke manuelt i prosjekt­skjema. */
export const PROJECT_AUTO_KEYS = [
  'hoursPeriod',
  'billableHours',
  'toInvoice',
  'totalCost',
  'invoices',
  'estimatedIncome',
  'totalPlanned',
  'futurePlanned',
  'forecast',
  'estimatedCosts',
  'expenses',
  'estimatedResult',
  'estimatedResultPct',
  'profitFactor',
  'expectedProfitFactor',
  'billedOnPricingModels',
  'exportStatus',
];

/** Moment-spesifikke / irrelevante felter som ikke skal brukes i ProTop-UI. */
export const PROJECT_LEGACY_KEYS = [
  'supplierLabel',
  'customerTags',
  'inboxEmail',
  'openedAt',
  'createdBy',
  'customerSegment',
  'marketArea',
  'projectTags',
  'size',
];

const AUTO_KEY_SET = new Set(PROJECT_AUTO_KEYS);
const LEGACY_KEY_SET = new Set(PROJECT_LEGACY_KEYS);

export function emptyPricingSettings() {
  return {
    hourlyRate: null,
    fixedFee: null,
    retainerFee: null,
    unitPrice: null,
    unitLabel: '',
    note: '',
  };
}

export function normalizePricingSettings(raw = {}, pricingModel = '') {
  const src = raw && typeof raw === 'object' ? raw : {};
  const model = normalizePricingModel(pricingModel);
  const num = (value) => {
    if (value === '' || value == null) return null;
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const next = {
    ...emptyPricingSettings(),
    hourlyRate: num(src.hourlyRate),
    fixedFee: num(src.fixedFee),
    retainerFee: num(src.retainerFee),
    unitPrice: num(src.unitPrice),
    unitLabel: text(src.unitLabel).slice(0, 80),
    note: text(src.note).slice(0, 500),
  };
  if (model === 'hourly' && next.hourlyRate == null && num(src.feeEstimate) != null) {
    next.hourlyRate = num(src.feeEstimate);
  }
  if (model === 'fixed' && next.fixedFee == null && num(src.feeEstimate) != null) {
    next.fixedFee = num(src.feeEstimate);
  }
  if (model === 'retainer' && next.retainerFee == null && num(src.feeEstimate) != null) {
    next.retainerFee = num(src.feeEstimate);
  }
  if (model === 'unit' && next.unitPrice == null && num(src.feeEstimate) != null) {
    next.unitPrice = num(src.feeEstimate);
  }
  return next;
}

export function feeEstimateFromSettings(pricingModel, settings = {}) {
  const model = normalizePricingModel(pricingModel);
  const s = normalizePricingSettings(settings, model);
  if (model === 'hourly') return s.hourlyRate ?? '';
  if (model === 'fixed') return s.fixedFee ?? '';
  if (model === 'retainer') return s.retainerFee ?? '';
  if (model === 'unit') return s.unitPrice ?? '';
  return '';
}

function normalizeDocList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((doc) => {
      if (!doc || typeof doc !== 'object') return null;
      const id = text(doc.id) || `doc_${Math.random().toString(36).slice(2, 8)}`;
      const name = text(doc.name) || text(doc.title) || 'Dokument';
      return {
        id,
        name,
        title: text(doc.title) || name,
        url: text(doc.url),
        storagePath: text(doc.storagePath),
        mimeType: text(doc.mimeType),
        size: Number(doc.size) || 0,
        source: text(doc.source) || 'upload',
        sourceId: text(doc.sourceId),
        uploadedAt: text(doc.uploadedAt) || '',
      };
    })
    .filter(Boolean);
}

/** Nullstill automatiske felter og Moment-rester på ett prosjekt. */
export function scrubProjectFields(project = {}) {
  if (!project || typeof project !== 'object') return project;
  const next = { ...project };
  for (const key of PROJECT_AUTO_KEYS) next[key] = null;
  for (const key of PROJECT_LEGACY_KEYS) next[key] = null;
  next.pricingModel = normalizePricingModel(next.pricingModel);
  next.pricingSettings = normalizePricingSettings(next.pricingSettings, next.pricingModel);
  if (next.feeEstimate !== undefined && next.pricingModel) {
    const fromSettings = feeEstimateFromSettings(next.pricingModel, {
      ...next.pricingSettings,
      feeEstimate: next.feeEstimate,
    });
    next.feeEstimate = fromSettings === '' ? null : fromSettings;
  } else if (AUTO_KEY_SET.has('feeEstimate') === false) {
    // feeEstimate styres av prismodell-innstillinger, ikke auto-modul
  }
  next.parentProjectId = text(next.parentProjectId) || null;
  next.agreementDocuments = normalizeDocList(next.agreementDocuments);
  next.offerDocuments = normalizeDocList(next.offerDocuments);
  return next;
}

/** Nullstill auto-/legacy-felter på alle prosjekter i state. */
export function scrubProjectState(state) {
  if (!state || typeof state !== 'object') return state;
  const projects = Array.isArray(state.projects)
    ? state.projects.map((row) => scrubProjectFields(row))
    : [];
  const byNumber = new Map(
    projects
      .filter((row) => row.status !== 'arkivert' && text(row.number))
      .map((row) => [text(row.number), row]),
  );
  const linked = projects.map((row) => {
    if (row.parentProjectId || !text(row.parentNumber)) return row;
    const parent = byNumber.get(text(row.parentNumber));
    if (!parent || parent.id === row.id) return row;
    return {
      ...row,
      parentProjectId: parent.id,
      parentName: row.parentName || parent.name || '',
    };
  });
  return { ...state, projects: linked };
}

export function isAutoProjectKey(key) {
  return AUTO_KEY_SET.has(key);
}

export function isLegacyProjectKey(key) {
  return LEGACY_KEY_SET.has(key);
}
