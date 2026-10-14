/** Temporary debug NDJSON logger for agreement-import investigation. */

export function agentLog(hypothesisId, location, message, data = {}) {
  // #region agent log
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  try {
    if (typeof globalThis !== 'undefined') {
      (globalThis.__PT_DEBUG_LOGS__ = globalThis.__PT_DEBUG_LOGS__ || []).push(entry);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      // Avoid static `fs` import so Metro/web bundles stay clean.
      const fs = typeof process.getBuiltinModule === 'function'
        ? process.getBuiltinModule('fs')
        : null;
      if (fs?.appendFileSync) {
        fs.appendFileSync('/opt/cursor/logs/debug.log', `${JSON.stringify(entry)}\n`);
      }
    }
  } catch {
    // ignore
  }
  // #endregion
  return entry;
}

export function flushAgentLogsToFile(filePath = '/opt/cursor/logs/debug.log') {
  const rows = (typeof globalThis !== 'undefined' && globalThis.__PT_DEBUG_LOGS__) || [];
  if (!rows.length) return 0;
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = typeof process.getBuiltinModule === 'function'
        ? process.getBuiltinModule('fs')
        : null;
      if (!fs?.appendFileSync) return 0;
      for (const entry of rows) {
        fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
      }
      return rows.length;
    }
  } catch {
    // ignore
  }
  return 0;
}
