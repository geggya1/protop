/** Ren logikk for den daglige SSB-registreringen. */

import { indexNews, latestMap } from './watch.js';

function text(value) {
  return String(value || '').trim();
}

export function indexIdsInDocument(data) {
  const ids = new Set();
  (Array.isArray(data?.contracts) ? data.contracts : []).forEach((contract) => {
    const id = text(contract?.fields?.indexId || contract?.indexDraft?.indexId);
    if (id) ids.add(id);
  });
  return [...ids];
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

export function nextSsbRecord(previous, bundle, foundAt) {
  const next = latestMap(bundle?.series);
  const news = indexNews(previous?.series, next);
  return {
    checkedAt: foundAt,
    errors: bundle?.errors || [],
    series: next,
    news,
    history: appendIndexHistory(previous?.history, news, foundAt),
  };
}
