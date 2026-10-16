/** Aktiv plattform først, så resten, kuttet til lytter-taket. */
export function selectListenerPlatformIds(platformIds, activePlatformId, limit = 6) {
  const ids = [...new Set((platformIds || []).filter(Boolean))];
  const active = String(activePlatformId || '').trim();
  const ordered = active ? [active, ...ids.filter((id) => id !== active)] : ids;
  const cap = Number.isFinite(limit) && limit > 0 ? limit : ordered.length;
  return ordered.slice(0, cap);
}
