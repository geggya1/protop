/** Tabell over benyttede indekser og nye SSB-punkt siden forrige registrering. */

import { seriesById } from './catalog.js';
import { effectiveRegulation } from './settings.js';

/** Standardseriene avtalene oftest peker på, mest brukt først. */
export const MOST_USED_INDEX_IDS = [
  'bki-boligblokk',
  'bki-bustader',
  'bki-enebolig',
  'ppi-byggeteknisk',
  'kpi',
  'bki-veg',
];

export const INDEX_TIME_WINDOWS = [
  { id: 3, label: 'Siste 3 år' },
  { id: 5, label: 'Siste 5 år' },
  { id: 10, label: 'Siste 10 år' },
  { id: 0, label: 'Hele serien' },
];

function text(value) {
  return String(value || '').trim();
}

export function usedIndexIds(contracts = []) {
  const ids = [];
  const seen = new Set();
  (Array.isArray(contracts) ? contracts : []).forEach((contract) => {
    const settings = effectiveRegulation(contract, contracts);
    if (!settings.regulatesHere) return;
    const named = text(contract?.fields?.indexId || contract?.indexDraft?.indexId);
    if (!named || seen.has(named)) return;
    seen.add(named);
    ids.push(named);
  });
  return ids;
}

export function agreementCountByIndex(contracts = []) {
  const counts = {};
  usedIndexIds(contracts).forEach((id) => { counts[id] = 0; });
  (Array.isArray(contracts) ? contracts : []).forEach((contract) => {
    const settings = effectiveRegulation(contract, contracts);
    if (!settings.regulatesHere) return;
    const id = text(contract?.fields?.indexId || contract?.indexDraft?.indexId);
    if (!id || counts[id] == null) return;
    counts[id] += 1;
  });
  return counts;
}

export function appendIndexHistory(history, news, foundAt) {
  const rows = Array.isArray(history) ? history.filter((row) => row && row.id && row.period) : [];
  const fresh = (Array.isArray(news) ? news : []).map((item) => ({
    id: text(item.id),
    name: text(item.name) || text(item.id),
    table: text(item.table),
    period: text(item.period),
    value: item.value,
    previousPeriod: text(item.previousPeriod),
    previousValue: item.previousValue,
    foundAt: text(foundAt),
  })).filter((item) => item.id && item.period && !rows.some((row) => row.id === item.id && row.period === item.period));
  return [...fresh, ...rows].slice(0, 200);
}

export function mergeIndexSnapshot(localSeries, remote) {
  const series = { ...(localSeries || {}) };
  Object.entries(remote?.series || {}).forEach(([id, row]) => {
    if (!row) return;
    const current = series[id] || {};
    const latest = row.period
      ? { period: row.period, value: row.value }
      : current.latest;
    series[id] = {
      ...current,
      id,
      name: row.name || current.name || '',
      table: row.table || current.table || '',
      latest: latest || current.latest || null,
    };
  });
  return series;
}

export function indexTableRows({ contracts = [], series = null, history = [] } = {}) {
  const counts = agreementCountByIndex(contracts);
  return Object.keys(counts).map((id) => {
    const meta = seriesById(id);
    const live = series?.[id] || {};
    const events = (Array.isArray(history) ? history : []).filter((row) => row.id === id);
    const latestEvent = events[0] || null;
    const latest = live.latest?.period
      ? live.latest
      : (latestEvent ? { period: latestEvent.period, value: latestEvent.value } : null);
    const changed = !!(latestEvent && latest?.period && latestEvent.period === latest.period);
    return {
      id,
      name: live.name || meta?.name || id,
      table: live.table || meta?.table || latestEvent?.table || '',
      frequency: live.frequency || meta?.frequency || '',
      period: latest?.period || '',
      value: latest?.value ?? '',
      previousPeriod: latestEvent?.previousPeriod || '',
      previousValue: latestEvent?.previousValue ?? '',
      changed,
      agreements: counts[id] || 0,
      foundAt: latestEvent?.foundAt || '',
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

/** Mest brukte indekser først. Standardseriene ligger alltid med, så siden har kolonner før en avtale er registrert. */
export function indexColumnIds(contracts = []) {
  const counts = agreementCountByIndex(contracts);
  const rank = new Map(MOST_USED_INDEX_IDS.map((id, index) => [id, index]));
  const ids = [...new Set([...Object.keys(counts), ...MOST_USED_INDEX_IDS])];
  return ids.sort((a, b) => {
    const byUse = (counts[b] || 0) - (counts[a] || 0);
    if (byUse) return byUse;
    const left = rank.has(a) ? rank.get(a) : 1000;
    const right = rank.has(b) ? rank.get(b) : 1000;
    if (left !== right) return left - right;
    return (seriesById(a)?.name || a).localeCompare(seriesById(b)?.name || b, 'nb');
  });
}

export function yearWindow(years, now = new Date()) {
  const span = Number(years);
  if (!span) return { fromYear: null, toYear: null };
  const toYear = now.getFullYear();
  return { fromYear: toYear - span + 1, toYear };
}

function columnFrequency(live, meta) {
  const named = live?.frequency || meta?.frequency || '';
  if (named) return named;
  const period = live?.points?.[0]?.period || live?.latest?.period || '';
  if (/^\d{4}M\d{2}$/.test(period)) return 'month';
  if (/^\d{4}K[1-4]$/.test(period)) return 'quarter';
  return '';
}

function periodYear(period) {
  const year = Number(String(period || '').slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * Én indeks per kolonne, perioden nedover.
 * Rekkefølgen følger SSB-listen: eldste øverst, nyeste nederst.
 */
export function indexTimeTable({
  series = null,
  ids = [],
  frequency = '',
  fromYear = null,
  toYear = null,
} = {}) {
  const columns = (Array.isArray(ids) ? ids : []).map((id) => {
    const meta = seriesById(id) || {};
    const live = series?.[id] || {};
    const points = Array.isArray(live.points) ? live.points : [];
    return {
      id,
      name: live.name || meta.name || id,
      table: live.table || meta.table || '',
      basis: live.basis || meta.basis || '',
      frequency: columnFrequency(live, meta),
      points,
    };
  }).filter((column) => !frequency || column.frequency === frequency);

  const valuesById = new Map();
  const periods = new Set();
  columns.forEach((column) => {
    const values = new Map();
    column.points.forEach((point) => {
      const period = String(point?.period || '');
      const value = Number(point?.value);
      const year = periodYear(period);
      if (!period || !Number.isFinite(value) || year == null) return;
      if (fromYear && year < fromYear) return;
      if (toYear && year > toYear) return;
      values.set(period, value);
      periods.add(period);
    });
    valuesById.set(column.id, values);
  });

  const rows = [...periods].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((period) => ({
    period,
    values: Object.fromEntries(columns.map((column) => {
      const value = valuesById.get(column.id)?.get(period);
      return [column.id, value == null ? null : value];
    })),
  }));

  return {
    columns: columns.map(({ points, ...column }) => column),
    rows,
  };
}

const SECTION_TITLE = { quarter: 'Kvartal', month: 'Måned' };

export function indexTimeSections({ series = null, ids = [], years = 3, now = new Date() } = {}) {
  const { fromYear, toYear } = yearWindow(years, now);
  const list = Array.isArray(ids) ? ids : [];
  const sections = ['quarter', 'month'].map((frequency) => ({
    frequency,
    title: SECTION_TITLE[frequency],
    ...indexTimeTable({ series, ids: list, frequency, fromYear, toYear }),
  })).filter((section) => section.columns.length);
  const shown = new Set(sections.flatMap((section) => section.columns.map((column) => column.id)));
  const rest = list.filter((id) => !shown.has(id));
  if (!rest.length) return sections;
  return [
    ...sections,
    {
      frequency: 'other',
      title: 'Andre',
      ...indexTimeTable({ series, ids: rest, fromYear, toYear }),
    },
  ];
}
