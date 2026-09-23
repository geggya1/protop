/** In-memory last snapshot of family calendar events for instant Plan paint. */

const MEMORY = new Map();

function key(platformIds) {
  return (platformIds || []).slice().sort().join(',') || 'none';
}

export function peekFamilyEventsCache(platformIds) {
  return MEMORY.get(key(platformIds)) || null;
}

export function putFamilyEventsCache(platformIds, events) {
  MEMORY.set(key(platformIds), Array.isArray(events) ? events : []);
}
