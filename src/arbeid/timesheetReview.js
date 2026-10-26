/**
 * Kontroll av låst timeliste: periode siden forrige godkjenning,
 * lokale avvik/skrivefeil, og køene på Godkjenninger.
 */

const REPLACEMENTS = [
  ['proskjekt', 'prosjekt'],
  ['prosjket', 'prosjekt'],
  ['prosjektet', 'prosjektet'],
  ['gjenomført', 'gjennomført'],
  ['gjennonført', 'gjennomført'],
  ['gjenomfort', 'gjennomført'],
  ['dokumetasjon', 'dokumentasjon'],
  ['dokumentasjonn', 'dokumentasjon'],
  ['reperasjon', 'reparasjon'],
  ['reparasion', 'reparasjon'],
  ['instalasjon', 'installasjon'],
  ['installasion', 'installasjon'],
  ['befarning', 'befaring'],
  ['oppfølgin', 'oppfølging'],
  ['oppfolging', 'oppfølging'],
  ['arbied', 'arbeid'],
  ['arbeideid', 'arbeid'],
  ['kundemøtte', 'kundemøte'],
  ['kunde møte', 'kundemøte'],
  ['tegnign', 'tegning'],
  ['tegningg', 'tegning'],
  ['kontrll', 'kontroll'],
  ['kontrroll', 'kontroll'],
  ['justertt', 'justert'],
  ['avik', 'avvik'],
  ['avvikk', 'avvik'],
];

function text(value) {
  return String(value || '').trim();
}

function roundHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Etter godkjenning viser vi timene som nettopp ble kontrollert, ikke et tomt vindu. */
export function reportedLock(lock) {
  if (!lock?.approvedAt) return lock;
  return { ...lock, approvedThrough: lock.periodFrom || '' };
}

export function controlBounds(lock) {
  return {
    fromExclusive: text(lock?.approvedThrough),
    through: text(lock?.throughDate),
  };
}

export function entryInControl(entry, lock) {
  const date = text(entry?.date);
  const { fromExclusive, through } = controlBounds(lock);
  if (!date || !through || date > through) return false;
  if (fromExclusive && date <= fromExclusive) return false;
  return true;
}

export function controlEntries(state, lock) {
  const employeeId = text(lock?.employeeId);
  const hours = (state?.timeEntries || []).filter((row) => (
    row.employeeId === employeeId && entryInControl(row, lock) && !row.invoiceId
  ));
  const absences = (state?.absences || []).filter((row) => (
    row.employeeId === employeeId && entryInControl(row, lock)
  ));
  return {
    hours: [...hours].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    absences: [...absences].sort((a, b) => String(a.date).localeCompare(String(b.date))),
  };
}

export function sumHours(rows) {
  return roundHours((rows || []).reduce((sum, row) => sum + roundHours(row.hours), 0));
}

function weekday(dateKey) {
  const [y, m, d] = text(dateKey).split('-').map(Number);
  if (!y || !m || !d) return -1;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function clockHours(clockIn, clockOut) {
  const start = /^(\d{1,2}):(\d{2})$/.exec(text(clockIn));
  const end = /^(\d{1,2}):(\d{2})$/.exec(text(clockOut));
  if (!start || !end) return null;
  let mins = (Number(end[1]) * 60 + Number(end[2])) - (Number(start[1]) * 60 + Number(start[2]));
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function correctSpelling(raw) {
  let next = String(raw || '');
  let changed = false;
  next = next.replace(/[ ]{2,}/g, ' ');
  if (next !== String(raw || '')) changed = true;
  const doubled = next.match(/\b([\p{L}]{3,})\s+\1\b/iu);
  if (doubled) {
    next = next.replace(doubled[0], doubled[1]);
    changed = true;
  }
  for (const [from, to] of REPLACEMENTS) {
    if (from === to) continue;
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    if (pattern.test(next)) {
      pattern.lastIndex = 0;
      next = next.replace(pattern, to);
      changed = true;
    }
  }
  if (/(.)\1\1/u.test(next)) {
    const collapsed = next.replace(/(.)\1{2,}/gu, '$1$1');
    if (collapsed !== next) {
      next = collapsed;
      changed = true;
    }
  }
  return changed ? next.replace(/\s+/g, ' ').trim() : '';
}

function finding(entryId, code, patch) {
  return {
    id: `${entryId}:${code}`,
    entryId,
    severity: 'error',
    kind: 'avvik',
    message: '',
    suggestion: '',
    ...patch,
  };
}

/**
 * Lokal gjennomgang. Feil (severity error) må rettes eller ignoreres før godkjenning.
 * @returns {{ id: string, entryId: string, severity: 'error'|'warn', kind: string, message: string, suggestion: string }[]}
 */
export function reviewTimesheetEntries(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const findings = [];
  const byDate = new Map();
  const descriptions = new Map();
  for (const row of rows) {
    const id = text(row.id);
    if (!id) continue;
    const hours = roundHours(row.hours);
    const description = String(row.description || '');
    const trimmed = description.trim();
    if (hours > 0 && trimmed.length < 3) {
      findings.push(finding(id, 'tekst', {
        kind: 'skrivefeil',
        message: 'Mangler beskrivelse av arbeidet.',
        suggestion: '',
      }));
    } else {
      const suggestion = correctSpelling(description);
      if (suggestion && suggestion !== trimmed) {
        findings.push(finding(id, 'skrivefeil', {
          kind: 'skrivefeil',
          message: 'Mulig skrivefeil i teksten.',
          suggestion,
        }));
      }
    }
    if (hours > 12) {
      findings.push(finding(id, 'timer', {
        message: `${hours} timer på én føring er uvanlig høyt.`,
      }));
    } else if (hours > 9) {
      findings.push(finding(id, 'langdag', {
        severity: 'warn',
        message: `${hours} timer på én føring. Sjekk at dagen stemmer.`,
      }));
    }
    const clock = clockHours(row.clockIn, row.clockOut);
    if (clock != null && Math.abs(clock - hours) > 0.75) {
      findings.push(finding(id, 'klokke', {
        message: `Registrert ${hours} t, mens fra/til gir ${roundHours(clock)} t.`,
      }));
    }
    const day = weekday(row.date);
    if (day === 0 || day === 6) {
      findings.push(finding(id, 'helg', {
        severity: 'warn',
        message: 'Føring på lørdag eller søndag.',
      }));
    }
    const date = text(row.date);
    if (date) {
      const bucket = byDate.get(date) || [];
      bucket.push(row);
      byDate.set(date, bucket);
    }
    const key = trimmed.toLowerCase();
    if (key.length >= 8) {
      const hits = descriptions.get(key) || [];
      hits.push(id);
      descriptions.set(key, hits);
    }
  }
  for (const [date, bucket] of byDate) {
    const total = sumHours(bucket);
    if (total > 12 && bucket.length > 1) {
      const last = bucket[bucket.length - 1];
      findings.push(finding(last.id, 'dagsum', {
        message: `${date} har ${total} timer til sammen.`,
      }));
    }
  }
  for (const ids of descriptions.values()) {
    if (ids.length < 4) continue;
    findings.push(finding(ids[0], 'gjentatt', {
      severity: 'warn',
      message: 'Samme tekst er brukt på flere dager.',
    }));
  }
  return findings;
}

export function openFindings(findings, dismissedIds = []) {
  const dismissed = new Set((dismissedIds || []).map((id) => text(id)).filter(Boolean));
  return (findings || []).filter((row) => row && !dismissed.has(row.id));
}

export function blockingFindings(findings) {
  return (findings || []).filter((row) => row?.severity === 'error');
}

export function formatLockAge(lockedAt, now = new Date()) {
  const stamp = text(lockedAt);
  if (!stamp) return 'Aldri låst';
  const then = new Date(stamp);
  if (Number.isNaN(then.getTime())) return 'Aldri låst';
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return 'Sist låst i dag';
  if (days === 1) return 'Sist låst for 1 dag siden';
  return `Sist låst for ${days} dager siden`;
}

export function latestLockArchive(archive, employeeId) {
  const id = text(employeeId);
  let best = null;
  for (const row of archive || []) {
    if (!row || row.employeeId !== id || !row.lockedAt) continue;
    if (!best || String(row.lockedAt) > String(best.lockedAt)) best = row;
  }
  return best;
}

function byName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), 'nb');
}

/**
 * Del aktive medarbeidere i låst (til kontroll) og ulåst.
 */
export function splitApprovalQueues({ employees = [], locks = [], archive = [], now = new Date() } = {}) {
  const lockByEmployee = new Map();
  for (const row of locks || []) {
    if (!row?.employeeId) continue;
    const prev = lockByEmployee.get(row.employeeId);
    if (!prev || String(row.throughDate || '') > String(prev.throughDate || '')) {
      lockByEmployee.set(row.employeeId, row);
    }
  }
  const locked = [];
  const unlocked = [];
  for (const employee of employees || []) {
    const lock = lockByEmployee.get(employee.id);
    if (lock?.throughDate) {
      locked.push({ employee, lock });
      continue;
    }
    const last = latestLockArchive(archive, employee.id);
    unlocked.push({
      employee,
      last,
      ageLabel: formatLockAge(last?.lockedAt, now),
      lastThrough: last?.throughDate || '',
    });
  }
  locked.sort((a, b) => byName(
    { name: a.employee?.name },
    { name: b.employee?.name },
  ));
  unlocked.sort((a, b) => byName(
    { name: a.employee?.name },
    { name: b.employee?.name },
  ));
  return { locked, unlocked };
}

/** Lås uten førte timer i perioden har ingenting å kontrollere. */
export function lockNeedsControl(state, lock) {
  return sumHours(controlEntries(state, reportedLock(lock)).hours) > 0;
}
