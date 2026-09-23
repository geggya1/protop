export function senderInitials(name, address) {
  const src = String(name || address || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function normalizeMailAddress(email) {
  return String(email || '').trim().toLowerCase();
}

function connectionRecency(conn) {
  const raw = conn?.updatedAtMs ?? conn?.expiresAt ?? conn?.updatedAt;
  if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
  if (raw && typeof raw.seconds === 'number') return raw.seconds * 1000;
  return Number(raw) || 0;
}

export function pickPreferredMicrosoftConnection(a, b) {
  if (!a) return b;
  if (!b) return a;
  const am = a.mailAccess ? 1 : 0;
  const bm = b.mailAccess ? 1 : 0;
  if (am !== bm) return am > bm ? a : b;
  const at = connectionRecency(a);
  const bt = connectionRecency(b);
  if (at !== bt) return at > bt ? a : b;
  return String(a.id || '') <= String(b.id || '') ? a : b;
}

/** One Outlook mailbox per address. Connections without email stay distinct. */
export function uniqueMicrosoftConnections(list) {
  const map = new Map();
  (list || []).forEach((conn) => {
    if (!conn || (conn.type && conn.type !== 'microsoft')) return;
    const email = normalizeMailAddress(conn.email);
    const key = email || `id:${conn.id}`;
    const prev = map.get(key);
    map.set(key, prev ? pickPreferredMicrosoftConnection(prev, conn) : conn);
  });
  return [...map.values()];
}

export function duplicateMicrosoftConnectionIds(list) {
  const keep = new Set(uniqueMicrosoftConnections(list).map((c) => c.id));
  return (list || [])
    .filter((c) => c && (!c.type || c.type === 'microsoft') && c.id && !keep.has(c.id))
    .map((c) => c.id);
}
