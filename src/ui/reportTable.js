/**
 * Felles rapporttabell: kolonnevalg, filter per kolonne, sortering og eksport.
 * Samme oppførsel som prosjektlisten, brukt av faktura- og kundelisten.
 *
 * Kolonne: { key, label, width, flex?, kind?: 'text'|'number'|'money'|'date',
 *   value?(row), text?(row), exportValue?(row), filter?: false, sortable?: false,
 *   export?: false, defaultVisible?: false, align?: 'right', strong?: true }
 */

export function foldReportText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('nb-NO')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function numeric(kind) {
  return kind === 'money' || kind === 'number';
}

export function columnValue(row, column) {
  if (!column) return '';
  if (typeof column.value === 'function') return column.value(row);
  const raw = row?.[column.key];
  return raw == null ? '' : raw;
}

export function columnText(row, column) {
  if (!column) return '';
  if (typeof column.text === 'function') return String(column.text(row) ?? '');
  const raw = columnValue(row, column);
  return raw == null ? '' : String(raw);
}

export function defaultVisibleKeys(columns) {
  return (columns || []).filter((col) => col.defaultVisible !== false).map((col) => col.key);
}

/** Ukjente nøkler droppes. Tom liste gir standardkolonnene. Rekkefølgen følger definisjonen. */
export function normalizeVisibleKeys(columns, keys) {
  const list = columns || [];
  if (!Array.isArray(keys) || !keys.length) return defaultVisibleKeys(list);
  const wanted = new Set(keys);
  const next = list.filter((col) => wanted.has(col.key)).map((col) => col.key);
  return next.length ? next : defaultVisibleKeys(list);
}

export function parseStoredKeys(columns, raw) {
  if (!raw) return defaultVisibleKeys(columns);
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) return normalizeVisibleKeys(columns, parsed);
    if (parsed && Array.isArray(parsed.visible)) return normalizeVisibleKeys(columns, parsed.visible);
  } catch { /* ugyldig lagring gir standard */ }
  return defaultVisibleKeys(columns);
}

/** Slå en kolonne av eller på. Minst én kolonne blir alltid stående. */
export function toggleColumnKey(columns, keys, key, on) {
  const current = normalizeVisibleKeys(columns, keys);
  if (!(columns || []).some((col) => col.key === key)) return current;
  if (on) return normalizeVisibleKeys(columns, [...current, key]);
  const next = current.filter((item) => item !== key);
  return next.length ? next : current;
}

export function visibleColumns(columns, keys) {
  const allowed = new Set(normalizeVisibleKeys(columns, keys));
  return (columns || []).filter((col) => allowed.has(col.key));
}

export function reportMinWidth(columns, extra = 0) {
  return (columns || []).reduce((sum, col) => sum + (col.width || 0), 0) + extra;
}

export function hasColumnFilter(filters) {
  return Object.values(filters || {}).some((value) => String(value || '').trim());
}

/** Filtertekst treffer både visningen («27.10.2026», «kr 1 500») og råverdien («2026-10-27»). */
export function matchesColumnFilters(row, filters, columns) {
  const wanted = filters && typeof filters === 'object' ? filters : {};
  return (columns || []).every((col) => {
    const needle = foldReportText(wanted[col.key]);
    if (!needle) return true;
    const hay = foldReportText(`${columnText(row, col)} ${columnValue(row, col)}`);
    return hay.includes(needle);
  });
}

function blank(value) {
  return value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value));
}

/** Tomme verdier havner nederst uansett retning, som i prosjektlisten. */
export function compareByColumn(a, b, sort, columns) {
  const column = (columns || []).find((col) => col.key === sort?.key);
  if (!column) return 0;
  const factor = sort?.dir === 'desc' ? -1 : 1;
  const left = columnValue(a, column);
  const right = columnValue(b, column);
  if (blank(left) && blank(right)) return 0;
  if (blank(left)) return 1;
  if (blank(right)) return -1;
  if (numeric(column.kind)) {
    const diff = Number(left) - Number(right);
    if (Number.isFinite(diff)) return diff * factor;
  }
  return String(left).localeCompare(String(right), 'nb', { numeric: true, sensitivity: 'base' }) * factor;
}

export function sortReportRows(rows, sort, columns) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (!sort?.key) return list;
  return list
    .map((row, index) => ({ row, index }))
    .sort((left, right) => compareByColumn(left.row, right.row, sort, columns) || left.index - right.index)
    .map((item) => item.row);
}

/** Ny kolonne: dato og beløp synkende, tekst stigende. Samme kolonne snur retningen. */
export function nextReportSort(current, column) {
  if (!column?.key) return current || null;
  if (current?.key === column.key) {
    return { key: column.key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  const down = column.kind === 'date' || numeric(column.kind);
  return { key: column.key, dir: down ? 'desc' : 'asc' };
}

/** Rader til Excel: overskrift og én linje per rad. Beløp og tall som tall. */
export function reportExportRows(rows, columns) {
  const cols = (columns || []).filter((col) => col.export !== false);
  const header = cols.map((col) => col.exportLabel || col.label);
  const body = (rows || []).map((row) => cols.map((col) => {
    if (typeof col.exportValue === 'function') return col.exportValue(row) ?? '';
    if (numeric(col.kind)) {
      const value = columnValue(row, col);
      return blank(value) || !Number.isFinite(Number(value)) ? '' : Number(value);
    }
    return columnText(row, col);
  }));
  return [header, ...body];
}

/** Summer beløpskolonner over radene. Gir { key: tall } for kolonner med kind money. */
export function reportTotals(rows, columns) {
  const out = {};
  for (const col of columns || []) {
    if (col.kind !== 'money' || col.total === false) continue;
    let sum = 0;
    for (const row of rows || []) {
      const value = Number(columnValue(row, col));
      if (Number.isFinite(value)) sum += value;
    }
    out[col.key] = Math.round(sum * 100) / 100;
  }
  return out;
}

export function reportPrefsKey(name, uid) {
  return `protop.report.${name}.columns.v1.${uid || 'anon'}`;
}
