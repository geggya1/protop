/** Tabell over benyttede indekser og nye SSB-punkt siden forrige registrering. */

import { seriesById } from './catalog.js';
import { effectiveRegulation } from './settings.js';

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
