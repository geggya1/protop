/**
 * Kolonnedefinisjoner for prosjektlisten: synlighet, sortering og filtrering.
 */

export const PROJECT_LIST_COLUMNS = [
  { key: 'number', label: 'Nr', width: 100, kind: 'text', defaultVisible: true },
  { key: 'name', label: 'Prosjekt', width: 320, kind: 'text', defaultVisible: true },
  { key: 'projectStatus', label: 'Status', width: 140, kind: 'text', defaultVisible: true },
  { key: 'customerNumber', label: 'Kundenr', width: 100, kind: 'text', defaultVisible: true },
  { key: 'client', label: 'Kunde', width: 260, kind: 'text', defaultVisible: true },
  { key: 'orgnr', label: 'Org.nr', width: 120, kind: 'text', defaultVisible: true },
  { key: 'department', label: 'Avdeling', width: 140, kind: 'text', defaultVisible: true },
  { key: 'manager', label: 'Leder', width: 200, kind: 'text', defaultVisible: true },
  { key: 'start', label: 'Start', width: 110, kind: 'date', defaultVisible: true },
  { key: 'end', label: 'Slutt', width: 110, kind: 'date', defaultVisible: true },
  { key: 'agreement', label: 'Avtale', width: 240, kind: 'text', defaultVisible: true },
  { key: 'pricingModel', label: 'Prismodell', width: 160, kind: 'text', defaultVisible: true },
  { key: 'parentNumber', label: 'Hovedprosjekt', width: 160, kind: 'text', defaultVisible: true },
  { key: 'place', label: 'Sted', width: 240, kind: 'text', defaultVisible: true },
  { key: 'feeEstimate', label: 'Honorar', width: 120, kind: 'text', defaultVisible: true },
];

const COLUMN_KEYS = new Set(PROJECT_LIST_COLUMNS.map((col) => col.key));

export const DEFAULT_VISIBLE_COLUMN_KEYS = PROJECT_LIST_COLUMNS
  .filter((col) => col.defaultVisible)
  .map((col) => col.key);

const PREFS_PREFIX = 'protop.projectList.columns.v1';

export function columnPrefsKey(uid) {
  return `${PREFS_PREFIX}.${uid || 'anon'}`;
}

export function foldColumnText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Normaliser lagret nøkkeliste. Ukjente nøkler droppes; tom liste → standard. */
export function normalizeVisibleColumns(keys) {
  if (!Array.isArray(keys) || !keys.length) return [...DEFAULT_VISIBLE_COLUMN_KEYS];
  const next = [];
  const seen = new Set();
  for (const key of keys) {
    if (!COLUMN_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  return next.length ? next : [...DEFAULT_VISIBLE_COLUMN_KEYS];
}

export function parseStoredVisibleColumns(raw) {
  if (!raw) return [...DEFAULT_VISIBLE_COLUMN_KEYS];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return normalizeVisibleColumns(parsed);
    if (parsed && Array.isArray(parsed.visible)) return normalizeVisibleColumns(parsed.visible);
  } catch { /* ignore */ }
  return [...DEFAULT_VISIBLE_COLUMN_KEYS];
}

export function visibleColumnsOf(keys) {
  const allowed = new Set(normalizeVisibleColumns(keys));
  return PROJECT_LIST_COLUMNS.filter((col) => allowed.has(col.key));
}

export function tableMinWidth(columns, selectCol = false, selectWidth = 44) {
  const cols = columns || PROJECT_LIST_COLUMNS;
  const sum = cols.reduce((total, col) => total + (col.width || 0), 0);
  return sum + 80 + (selectCol ? selectWidth + 8 : 0);
}

/**
 * Hent sorterings-/filterverdi for en kolonne.
 * `helpers` kan gi avtale-tekst og kundenavn fra tilknyttede registre.
 */
export function projectColumnValue(project, key, helpers = {}) {
  const customer = helpers.customerOf?.(project) || null;
  switch (key) {
    case 'number':
      return project?.number || '';
    case 'name':
      return project?.name || '';
    case 'projectStatus':
      return project?.projectStatus || '';
    case 'customerNumber':
      return project?.customerNumber || customer?.customerNumber || '';
    case 'client':
      return customer?.name || project?.client || '';
    case 'orgnr':
      return project?.orgnr || customer?.orgnr || '';
    case 'department':
      return project?.department || '';
    case 'manager':
      return project?.manager || '';
    case 'start':
      return project?.start || '';
    case 'end':
      return project?.end || '';
    case 'agreement':
      return helpers.agreementText?.(project) || '';
    case 'pricingModel':
      return helpers.pricingLabel?.(project) || project?.pricingModel || '';
    case 'parentNumber':
      return project?.parentNumber || '';
    case 'place':
      return project?.place || '';
    case 'feeEstimate':
      return project?.feeEstimate === 0 || project?.feeEstimate
        ? String(project.feeEstimate)
        : '';
    default:
      return project?.[key] == null ? '' : String(project[key]);
  }
}

export function projectMatchesColumnFilters(project, colFilter, helpers = {}) {
  const filters = colFilter && typeof colFilter === 'object' ? colFilter : {};
  return PROJECT_LIST_COLUMNS.every((col) => {
    const needle = foldColumnText(filters[col.key] || '');
    if (!needle) return true;
    return foldColumnText(projectColumnValue(project, col.key, helpers)).includes(needle);
  });
}

export function compareProjectsByColumn(a, b, sort, helpers = {}) {
  const key = sort?.key || 'number';
  const factor = sort?.dir === 'desc' ? -1 : 1;
  const left = String(projectColumnValue(a, key, helpers) || '');
  const right = String(projectColumnValue(b, key, helpers) || '');
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right, 'nb', { numeric: true, sensitivity: 'base' }) * factor;
}

export function nextColumnSort(current, column) {
  if (!column?.key) return { key: 'number', dir: 'asc' };
  if (current?.key === column.key) {
    return { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: column.key, dir: column.kind === 'date' ? 'desc' : 'asc' };
}

export function toggleVisibleColumn(keys, columnKey, on) {
  const current = normalizeVisibleColumns(keys);
  if (!COLUMN_KEYS.has(columnKey)) return current;
  if (on) {
    if (current.includes(columnKey)) return current;
    // Behold definert kolonnerekkefølge
    return PROJECT_LIST_COLUMNS
      .map((col) => col.key)
      .filter((key) => key === columnKey || current.includes(key));
  }
  const next = current.filter((key) => key !== columnKey);
  // Minst én kolonne må være synlig
  return next.length ? next : current;
}
