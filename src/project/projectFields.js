/**
 * ProTop-prosjektfelter: prismodell, automatiske økonomifelter og opprydding
 * av Moment-importfelter som ikke skal redigeres manuelt i ProTop.
 */

function text(value) {
  return String(value || '').trim();
}

/**
 * Nøkkel for å kjenne igjen prosjektnummer.
 * Håndterer Excel-heltall (10951.0), mellomrom (10 951), ledende nuller og
 * vitenskapelig notasjon. Bokstaver/bindestreker (A-123) beholdes.
 */
export function projectNumberKey(value) {
  let raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) raw = String(Math.round(n));
  }
  if (/^\d+[.,]0+$/.test(raw)) raw = raw.replace(/[.,]0+$/, '');
  if (/^\d[\d\s]*\d$|^\d$/.test(raw) && /\s/.test(raw)) raw = raw.replace(/\s+/g, '');
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return String(n);
  }
  return raw;
}

/** Tall i parentes i prosjektnavnet, f.eks. «Myklebust CB6-12-13 (1882)». */
export function numbersInProjectName(name) {
  const found = [];
  const raw = String(name || '');
  const re = /\((\d[\d\s]*\d|\d)\)/g;
  let match = re.exec(raw);
  while (match) {
    const key = projectNumberKey(match[1]);
    if (key && !found.includes(key)) found.push(key);
    match = re.exec(raw);
  }
  return found;
}

/**
 * Numre en timeføring kan være lagret på: prosjektets eget nummer og
 * nummer som bare står i navnet.
 */
export function projectLookupNumbers(project) {
  const found = [];
  const own = projectNumberKey(project?.number);
  if (own) found.push(own);
  for (const alias of numbersInProjectName(project?.name)) {
    if (!found.includes(alias)) found.push(alias);
  }
  return found;
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
    probability: 100,
    rateBasis: 'single',
    estimatedTotalFee: null,
    showBillableExpenses: true,
    showBillableSales: true,
    markupHours: 0,
    markupExpenses: null,
    productPriceListId: '',
    newEntriesBillable: true,
    separateBilling: false,
    importedExpensesBillable: 'standard',
    activityIds: [],
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
  const imported = text(src.importedExpensesBillable).toLowerCase();
  const importedMode = ['yes', 'no', 'standard'].includes(imported) ? imported : 'standard';
  const activityIds = Array.isArray(src.activityIds)
    ? src.activityIds.map((id) => text(id)).filter(Boolean)
    : [];
  const next = {
    ...emptyPricingSettings(),
    hourlyRate: num(src.hourlyRate),
    fixedFee: num(src.fixedFee),
    retainerFee: num(src.retainerFee),
    unitPrice: num(src.unitPrice),
    unitLabel: text(src.unitLabel).slice(0, 80),
    note: text(src.note).slice(0, 500),
    probability: num(src.probability) ?? 100,
    rateBasis: text(src.rateBasis) || 'single',
    estimatedTotalFee: num(src.estimatedTotalFee),
    showBillableExpenses: src.showBillableExpenses !== false,
    showBillableSales: src.showBillableSales !== false,
    markupHours: num(src.markupHours) ?? 0,
    markupExpenses: num(src.markupExpenses),
    productPriceListId: text(src.productPriceListId).slice(0, 80),
    newEntriesBillable: src.newEntriesBillable !== false,
    separateBilling: !!src.separateBilling,
    importedExpensesBillable: importedMode,
    activityIds,
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

/** Ingen timepris er så høy. Et større tall i timeprisfeltet er et totalbeløp. */
export const HOURLY_RATE_CEILING = 10000;

function positiveAmount(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Prismodell og priser en prosjektliste kan fylle inn på et prosjekt som finnes.
 * Bare tomme felt fylles, og bare når listen har samme prismodell som prosjektet.
 * Unntaket er en timepris over taket som er lik honorarestimatet i listen: den kom
 * fra en eldre import som la Moments honorarestimat i timeprisfeltet. Den byttes ut,
 * eller tømmes når listen ikke har en sikker timepris.
 * offer: { pricingModel, hourlyRate, fixedFee, estimatedTotalFee }.
 * Svarer { pricingModel, pricingSettings, changes, previous } eller null når ingenting endres.
 */
export function pricingFill(project = {}, offer = {}) {
  const ownModel = normalizePricingModel(project?.pricingModel);
  const offerModel = normalizePricingModel(offer?.pricingModel);
  const model = ownModel || offerModel;
  if (!model || (offerModel && offerModel !== model)) return null;
  const previous = normalizePricingSettings(
    { ...(project?.pricingSettings || {}), feeEstimate: project?.feeEstimate },
    model,
  );
  const settings = { ...previous };
  const changes = [];
  if (!ownModel) changes.push('pricingModel');
  const rate = positiveAmount(offer?.hourlyRate);
  const fixedFee = positiveAmount(offer?.fixedFee);
  const estimate = positiveAmount(offer?.estimatedTotalFee);
  if (model === 'hourly') {
    const wrongRate = previous.hourlyRate != null
      && previous.hourlyRate >= HOURLY_RATE_CEILING
      && previous.hourlyRate === estimate;
    if (wrongRate) {
      settings.hourlyRate = rate;
      changes.push(rate == null ? 'hourlyRateCleared' : 'hourlyRateReplaced');
    } else if (previous.hourlyRate == null && rate != null) {
      settings.hourlyRate = rate;
      changes.push('hourlyRate');
    }
  }
  if (model === 'fixed' && previous.fixedFee == null && fixedFee != null) {
    settings.fixedFee = fixedFee;
    changes.push('fixedFee');
  }
  if (previous.estimatedTotalFee == null && estimate != null) {
    settings.estimatedTotalFee = estimate;
    changes.push('estimatedTotalFee');
  }
  if (!changes.length) return null;
  return { pricingModel: model, pricingSettings: settings, changes, previous };
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

/**
 * Fjern automatiske felter og Moment-rester på ett prosjekt.
 * Feltene slettes i stedet for å lagres som null: 26 tomme felt per prosjekt
 * sprengte 1 MiB-taket på prosjektdokumentet.
 */
export function scrubProjectFields(project = {}) {
  if (!project || typeof project !== 'object') return project;
  const next = { ...project };
  for (const key of PROJECT_AUTO_KEYS) delete next[key];
  for (const key of PROJECT_LEGACY_KEYS) delete next[key];
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

/** Fjern auto-/legacy-felter på alle prosjekter i state. */
export function scrubProjectState(state) {
  if (!state || typeof state !== 'object') return state;
  const projects = Array.isArray(state.projects)
    ? state.projects.map((row) => scrubProjectFields(row))
    : [];
  const byNumber = new Map(
    projects
      .filter((row) => row.status !== 'arkivert' && projectNumberKey(row.number))
      .map((row) => [projectNumberKey(row.number), row]),
  );
  const linked = projects.map((row) => {
    if (row.parentProjectId || !projectNumberKey(row.parentNumber)) return row;
    const parent = byNumber.get(projectNumberKey(row.parentNumber));
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
