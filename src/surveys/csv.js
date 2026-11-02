/**
 * CSV for Excel (norsk oppsett): semikolon som skille, desimalkomma og BOM, så æøå vises riktig.
 * Brukes til eksport av resultater og utvikling fra undersøkelsene.
 */

function cell(value) {
  if (value == null) return '';
  const s = typeof value === 'number'
    ? (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace('.', ','))
    : String(value);
  // Formler i regneark: et felt som starter med = + - @ kan kjøres. Prefiks med apostrof.
  const safe = /^[=+\-@]/.test(s) && typeof value !== 'number' ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows) {
  return (rows || []).map((row) => (row || []).map(cell).join(';')).join('\r\n');
}

/** Filnavn uten tegn som ikke tåles i filsystemet. */
export function csvFileName(title, suffix = '') {
  const base = String(title || 'undersokelse')
    .toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'undersokelse';
  return `${base}${suffix ? `-${suffix}` : ''}.csv`;
}

/** Last ned på web. Gir false når det ikke går (app uten nettleser). */
export function downloadCsv(fileName, rows) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Utviklingen som tabell: én rad per område, én kolonne per undersøkelse. */
export function trendCsvRows(trend, { indexLabel = 'Totalindeks', npsLabel = 'NPS' } = {}) {
  if (!trend) return [];
  const head = ['Område', ...trend.points.map((p) => p.label), 'Endring fra forrige'];
  const rows = [head];
  if (trend.points.some((p) => p.nps != null)) {
    rows.push([npsLabel, ...trend.points.map((p) => p.nps), trend.npsDelta]);
  }
  if (trend.points.some((p) => p.index != null)) {
    rows.push([indexLabel, ...trend.points.map((p) => p.index), trend.indexDelta]);
  }
  rows.push(['Antall svar', ...trend.points.map((p) => p.count), '']);
  if (trend.points.some((p) => p.pct != null)) rows.push(['Svarprosent', ...trend.points.map((p) => p.pct), '']);
  for (const m of trend.matrix) rows.push([m.area, ...m.values, m.delta]);
  return rows;
}
