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
 * Arbeidstidsgrenser i AML (Lovdata-utskrift 05.10.2026):
 * § 10-4 (1) alminnelig arbeidstid 9 t / 24 t og 40 t / 7 dager; det overskytende er overtid (§ 10-6 (2)).
 * § 10-6 (4) overtid høyst 10 t / 7 dager, 25 t / 4 uker, 200 t / 52 uker. Tariffbundet virksomhet
 * kan avtale 20 / 50 / 300 (§ 10-6 (5)). § 10-6 (8) samlet høyst 13 t / 24 t og 48 t / 7 dager.
 * § 10-8 hvile minst 11 t sammenhengende per døgn og 35 t per sju dager.
 * Grensene kan fravikes ved avtale, så funnene er varsler, ikke stopp.
 */
export const WORKING_TIME_LIMITS = {
  dayNormal: 9,
  weekNormal: 40,
  weekOvertime: 10,
  fourWeekOvertime: 25,
  yearOvertime: 200,
  dayTotal: 13,
  weekTotal: 48,
  dailyRest: 11,
};

export const TARIFF_OVERTIME_LIMITS = { weekOvertime: 20, fourWeekOvertime: 50, yearOvertime: 300 };

function utcDay(dateKey) {
  const [y, m, d] = text(dateKey).split('-').map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) : NaN;
}

function weekStart(dateKey) {
  const ms = utcDay(dateKey);
  if (!Number.isFinite(ms)) return '';
  const day = (new Date(ms).getUTCDay() + 6) % 7;
  return new Date(ms - day * 86400000).toISOString().slice(0, 10);
}

function clockMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Overtid etter loven for én uke: timer over 9 per dag eller 40 per uke, uten dobbelttelling. */
export function statutoryOvertime(dayTotals, limits = WORKING_TIME_LIMITS) {
  const days = Object.values(dayTotals || {});
  const daily = days.reduce((sum, h) => sum + Math.max(0, h - limits.dayNormal), 0);
  const week = days.reduce((sum, h) => sum + h, 0);
  return roundHours(Math.max(daily, week - limits.weekNormal));
}

/**
 * Varsler om arbeidstid for én ansatt. entries er perioden som kontrolleres,
 * history er tidligere føringer (for fire uker og 52 uker).
 */
export function workingTimeFindings(entries, { history = [], tariff = false, limits: custom } = {}) {
  const limits = { ...WORKING_TIME_LIMITS, ...(tariff ? TARIFF_OVERTIME_LIMITS : {}), ...(custom || {}) };
  const rows = (Array.isArray(entries) ? entries : []).filter((row) => text(row.id) && text(row.date));
  if (!rows.length) return [];
  const seen = new Set(rows.map((row) => text(row.id)));
  const all = [...rows, ...(Array.isArray(history) ? history : []).filter((row) => text(row.date) && !seen.has(text(row.id)))];
  const byDay = new Map();
  for (const row of all) {
    const date = text(row.date);
    const day = byDay.get(date) || { hours: 0, start: null, end: null };
    day.hours += Number(row.hours) || 0;
    const a = clockMinutes(row.clockIn);
    const b = clockMinutes(row.clockOut);
    if (a != null) day.start = day.start == null ? a : Math.min(day.start, a);
    if (b != null) {
      // Utklokking over midnatt teller som neste døgn.
      const end = a != null && b < a ? b + 1440 : b;
      day.end = day.end == null ? end : Math.max(day.end, end);
    }
    byDay.set(date, day);
  }
  const weeks = new Map();
  for (const [date, day] of byDay) {
    const key = weekStart(date);
    const week = weeks.get(key) || {};
    week[date] = day.hours;
    weeks.set(key, week);
  }
  const overtimeByWeek = new Map([...weeks].map(([key, days]) => [key, statutoryOvertime(days, limits)]));
  const lastInDay = new Map();
  for (const row of rows) lastInDay.set(text(row.date), text(row.id));
  const reviewDates = [...lastInDay.keys()].sort();
  const reviewWeeks = [...new Set(reviewDates.map(weekStart))].sort();
  const anchorFor = (week) => lastInDay.get(reviewDates.filter((d) => weekStart(d) === week).pop());
  const out = [];
  const warn = (entryId, code, message) => out.push(finding(entryId, code, { severity: 'warn', kind: 'arbeidstid', message }));

  for (const date of reviewDates) {
    const day = byDay.get(date);
    if (day.hours > limits.dayTotal) {
      warn(lastInDay.get(date), `arbeidstid-dogn-${date}`, `${date}: ${roundHours(day.hours)} timer. Samlet arbeidstid kan ikke overstige ${limits.dayTotal} timer per døgn (aml § 10-6 (8)).`);
    }
    const prev = new Date(utcDay(date) - 86400000).toISOString().slice(0, 10);
    const before = byDay.get(prev);
    if (before?.end != null && day.start != null) {
      const rest = (day.start + 1440 - before.end) / 60;
      if (rest < limits.dailyRest) {
        warn(lastInDay.get(date), `arbeidstid-hvile-${date}`, `Bare ${roundHours(rest)} timer hvile før ${date}. Loven krever minst ${limits.dailyRest} timer sammenhengende (aml § 10-8 (1)).`);
      }
    }
  }

  for (const week of reviewWeeks) {
    const days = weeks.get(week) || {};
    const total = roundHours(Object.values(days).reduce((sum, h) => sum + h, 0));
    const anchor = anchorFor(week);
    if (total > limits.weekTotal) {
      warn(anchor, `arbeidstid-uke-${week}`, `Uken fra ${week}: ${total} timer. Samlet arbeidstid kan ikke overstige ${limits.weekTotal} timer på sju dager (aml § 10-6 (8)), med mindre det er avtalt gjennomsnittsberegning.`);
    }
    const worked = Object.values(days).filter((h) => h > 0).length;
    if (worked >= 7) {
      warn(anchor, `arbeidstid-fri-${week}`, `Arbeid alle sju dager i uken fra ${week}. Sjekk at det har vært 35 timer sammenhengende fri (aml § 10-8 (2)).`);
    }
    const ot = overtimeByWeek.get(week) || 0;
    if (ot > limits.weekOvertime) {
      warn(anchor, `arbeidstid-overtid-uke-${week}`, `Uken fra ${week}: ${ot} timer overtid etter loven. Grensen er ${limits.weekOvertime} timer på sju dager (aml § 10-6).`);
    }
    const ms = utcDay(week);
    const sumBack = (n) => {
      let sum = 0;
      for (let i = 0; i < n; i += 1) {
        const key = new Date(ms - i * 7 * 86400000).toISOString().slice(0, 10);
        sum += overtimeByWeek.get(key) || 0;
      }
      return roundHours(sum);
    };
    const four = sumBack(4);
    if (four > limits.fourWeekOvertime) {
      warn(anchor, `arbeidstid-overtid-4u-${week}`, `${four} timer overtid de siste fire ukene. Grensen er ${limits.fourWeekOvertime} timer (aml § 10-6).`);
    }
    const year = sumBack(52);
    if (year > limits.yearOvertime) {
      warn(anchor, `arbeidstid-overtid-52u-${week}`, `${year} timer overtid de siste 52 ukene. Grensen er ${limits.yearOvertime} timer (aml § 10-6).`);
    }
  }
  return out;
}

/**
 * Lokal gjennomgang. Feil (severity error) må rettes eller ignoreres før godkjenning.
 * opts.history gir tidligere føringer for samme ansatt, så overtid over fire og 52 uker kan sjekkes.
 * @returns {{ id: string, entryId: string, severity: 'error'|'warn', kind: string, message: string, suggestion: string }[]}
 */
export function reviewTimesheetEntries(entries, opts = {}) {
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
  findings.push(...workingTimeFindings(rows, opts));
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
