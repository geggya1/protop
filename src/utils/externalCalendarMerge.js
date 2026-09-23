/**
 * Merge and error helpers for Outlook/Google/ICS event fetches.
 * Keep server events as source of truth when two mailboxes are connected;
 * the browser Graph token only covers the last-connected account.
 */

export function mergeExternalEvents(serverEvents, clientEvents) {
  const byId = new Map();
  for (const ev of clientEvents || []) {
    if (ev?.id) byId.set(ev.id, ev);
  }
  // Server wins on id collision so a single-mailbox browser token cannot
  // overwrite the other connection's events (or steal their connectionId).
  for (const ev of serverEvents || []) {
    if (ev?.id) byId.set(ev.id, ev);
  }
  return [...byId.values()].sort((a, b) => {
    const d = String(a.dateKey).localeCompare(String(b.dateKey));
    if (d !== 0) return d;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });
}

/** Keep client Graph events only for connections the server did not return. */
export function clientEventsFillingGaps(serverEvents, clientEvents) {
  const serverConnIds = new Set(
    (serverEvents || []).map((e) => e.connectionId).filter(Boolean),
  );
  return (clientEvents || []).filter((e) => (
    !e?.connectionId || !serverConnIds.has(e.connectionId)
  ));
}

export function combineExternalCalendarErrors(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const err of list || []) {
      if (!err) continue;
      const message = String(err.message || '').trim();
      if (!message && !err.connectionId) continue;
      const key = `${err.connectionId || ''}|${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(err);
    }
  }
  return out;
}

export function isCalendarRateLimitMessage(message) {
  return /for mange kall|for mange forespørsler|resource-exhausted/i.test(String(message || ''));
}

export function isSoftCalendarWarning(message) {
  return isCalendarRateLimitMessage(message)
    || /delt kalender|kunne ikke leses|Hoppet over kalendere|ICS-henting tok for lang tid|Ugyldig ICS/i.test(String(message || ''));
}

export function brokenCalendarConnections(connections = []) {
  return (connections || []).filter((c) => (
    c
    && c.enabled !== false
    && (c.needsReauth || (!!c.lastError && !isSoftCalendarWarning(c.lastError)))
  ));
}

/**
 * User-facing notice when one of several external calendars failed to sync.
 * Returns null when everything looks healthy.
 */
export function calendarSyncNotice({ connections = [], fetchErrors = [] } = {}) {
  const broken = brokenCalendarConnections(connections);
  const extra = (fetchErrors || []).filter((err) => (
    err?.message
    && !err.soft
    && !isSoftCalendarWarning(err.message)
    && !isCalendarRateLimitMessage(err.message)
    && !broken.some((c) => c.id && c.id === err.connectionId)
  ));
  if (!broken.length && !extra.length) return null;

  const byId = new Map((connections || []).map((c) => [c.id, c]));
  const names = [];
  const addName = (raw) => {
    const n = String(raw || '').trim();
    if (n && !names.includes(n)) names.push(n);
  };
  for (const c of broken) {
    addName(c.email || c.label || (c.type === 'microsoft' ? 'Outlook' : 'Kalender'));
  }
  for (const err of extra) {
    const conn = err.connectionId ? byId.get(err.connectionId) : null;
    addName(err.email || err.label || conn?.email || conn?.label);
  }

  const outlookIssue = broken.some((c) => c.type === 'microsoft' || c.needsReauth)
    || extra.some((err) => err.type === 'microsoft' || byId.get(err.connectionId)?.type === 'microsoft');

  if (names.length === 1) {
    return {
      reconnect: outlookIssue,
      names,
      message: outlookIssue
        ? `${names[0]} synkroniserer ikke. Koble til på nytt under kalenderinnstillinger.`
        : `${names[0]} synkroniserer ikke. Åpne kalenderinnstillinger for detaljer.`,
    };
  }
  if (names.length > 1) {
    return {
      reconnect: true,
      names,
      message: `${names.join(' og ')} synkroniserer ikke. Koble til på nytt under kalenderinnstillinger.`,
    };
  }
  return {
    reconnect: outlookIssue,
    names,
    message: extra[0]?.message
      || (outlookIssue
        ? 'Klarte ikke oppdatere Outlook. Prøv igjen, eller koble til på nytt under kalenderinnstillinger.'
        : 'Klarte ikke oppdatere eksterne kalendere. Prøv igjen om et øyeblikk.'),
  };
}
