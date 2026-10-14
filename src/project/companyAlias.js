/**
 * Skjulte alias-id for selskapet som er åpent.
 * Lesere (ansatte, timer, anbud) slår opp her, så begge org.nr lastes som ett selskap.
 */
const SOURCES = new Map();
const LISTENERS = new Set();

function keyOf(companyId) {
  return String(companyId || '').trim();
}

export function bindCompanyAliases(companyId, aliasIds = []) {
  const key = keyOf(companyId);
  const next = [...new Set((aliasIds || []).map((id) => keyOf(id)).filter((id) => id && id !== key))];
  const prev = SOURCES.get(key) || [];
  if (prev.join('|') === next.join('|')) return;
  if (key) SOURCES.set(key, next);
  LISTENERS.forEach((fn) => {
    try { fn(key); } catch { /* en lytter skal ikke stoppe de andre */ }
  });
}

export function aliasSourceIds(companyId) {
  return SOURCES.get(keyOf(companyId)) || [];
}

export function subscribeCompanyAliases(listener) {
  if (typeof listener !== 'function') return () => {};
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

export function clearCompanyAliases() {
  SOURCES.clear();
}

/** Slå sammen rader. Hovedlisten vinner når id er lik. Alias-rader kommer med når de mangler. */
export function mergeRowsById(primary = [], extras = []) {
  const byId = new Map();
  for (const row of primary || []) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of extras || []) {
    if (row?.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}
