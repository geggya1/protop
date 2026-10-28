/**
 * Ferieplan for ett år: saldo, frister og hva som skal varsles.
 * Ren logikk uten Firestore, slik at både klient og planlagt jobb bruker samme regler.
 *
 * Dager er virkedager mandag–fredag, samme som resten av fraværet.
 * Ferieloven gir 25 virkedager inkludert lørdag, og én ekstra uke fra året man fyller 60.
 * Når lørdag ikke telles, er standarden 25 ordinære dager og 5 dager senioruke.
 * Overføring er avtalt per ansatt, innenfor et maksantall (loven åpner for 12 virkedager
 * mandag–lørdag; to uker uten lørdag er 10).
 */

export const VACATION_PLAN_DEFAULTS = {
  ordinaryDays: 25,
  seniorEnabled: true,
  seniorAge: 60,
  seniorDays: 5,
  carryoverMax: 10,
  extraAgreedDays: 0,
  approvalDays: 14,
  mainVacationDays: 15,
  memo: '',
};

export const EXTRAORDINARY_NOTICE = 'Fristen for ferieplanlegging er passert. Registreringen sendes til særskilt godkjenning og kan ikke påregnes godkjent uten videre.';

export const FIXED_EXTRA_TEMPLATES = [
  { label: 'Inneklemte dager i påsken' },
  { label: 'Mellom jul og nyttår' },
];

function text(value) {
  return String(value ?? '').trim();
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function clampDays(value, max = 366) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return round2(Math.min(max, Math.max(0, n)));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function vacationPlanId(prefix = 'fpl') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

export function addIsoDays(iso, days) {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatPlanDate(iso) {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/** Mandag først. month er 1–12. Celler er ISO-dato eller null. */
export function monthGrid(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || m < 1 || m > 12) return [];
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) cells.push(`${y}-${pad(m)}-${pad(day)}`);
  return cells;
}

export function weekdayKeys(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return [];
  const out = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    const [year, month, day] = cursor.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) out.push(cursor);
    cursor = addIsoDays(cursor, 1);
    guard += 1;
  }
  return out;
}

export function osloToday(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}

/** Fra oktober foreslås neste kalenderår som planleggingsår. */
export function defaultVacationPlanYear(now = new Date()) {
  const key = osloToday(now);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month >= 10 ? year + 1 : year;
}

function defaultYear(now = new Date()) {
  return defaultVacationPlanYear(now);
}

export function emptyVacationPlan(year = defaultYear()) {
  return normalizeVacationPlan({ year });
}

/**
 * Er planåret det neste kalenderåret som allerede er i vente?
 * Brukes for å merke inngående feriedagssaldo tydelig (f.eks. «til 2027»).
 */
export function isUpcomingVacationPlanYear(planYear, today = '') {
  const year = Number(planYear) || 0;
  const key = isIsoDate(today) ? today : osloToday();
  const current = Number(key.slice(0, 4));
  return year === current + 1;
}

/** Kort forklaring av hva saldoen gjelder for et gitt planår. */
export function openingBalanceYearLabel(planYear, today = '') {
  const year = Number(planYear) || defaultYear();
  if (isUpcomingVacationPlanYear(year, today)) {
    return `Inngående feriedagssaldo til ${year}`;
  }
  return `Inngående feriedagssaldo for ${year}`;
}

/**
 * Påminnelse om å fastsette startsaldo første virkedag i planåret.
 * Når man setter opp neste års plan, er det første virkedag i det året.
 */
export function firstWorkingDayBalanceReminder(planYear) {
  const year = Number(planYear) || defaultYear();
  return `Husk: første virkedag i ${year} bør du fastsette start fraværssaldo til alle aktive interne ansatte, og sende ferieplanen.`;
}

function normalizeGrant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const senior = raw.senior === true ? true : (raw.senior === false ? false : null);
  const extra = raw.extraAgreedDays == null || raw.extraAgreedDays === ''
    ? null
    : clampDays(raw.extraAgreedDays);
  return {
    carryoverDays: clampDays(raw.carryoverDays, 366),
    extraAgreedDays: extra,
    senior,
  };
}

function normalizeFixed(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = text(raw.label).slice(0, 80);
  if (!label) return null;
  const from = isIsoDate(raw.from) ? raw.from : '';
  const to = isIsoDate(raw.to) ? raw.to : '';
  let days = clampDays(raw.days);
  if (!days && from && to) days = weekdayKeys(from, to).length;
  return {
    id: text(raw.id) || vacationPlanId('fex'),
    label,
    days,
    from,
    to: to && from && to < from ? from : to,
    assign: raw.assign === true,
  };
}

function snapshotPlan(plan) {
  const next = { ...plan };
  delete next.archive;
  delete next.active;
  delete next.docKind;
  delete next.companyId;
  return next;
}

export function normalizeVacationPlan(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const year = Number(src.year) || defaultYear();
  const grants = {};
  const grantSrc = src.grants && typeof src.grants === 'object' ? src.grants : {};
  for (const [id, grant] of Object.entries(grantSrc)) {
    const key = text(id);
    const next = normalizeGrant(grant);
    if (key && next) grants[key] = next;
  }
  const notices = {};
  const noticeSrc = src.notices && typeof src.notices === 'object' ? src.notices : {};
  for (const [id, notice] of Object.entries(noticeSrc)) {
    const key = text(id);
    if (!key || !notice || typeof notice !== 'object') continue;
    notices[key] = {
      reminderAt: text(notice.reminderAt),
      dunningAt: text(notice.dunningAt),
      lockAt: text(notice.lockAt),
    };
  }
  const archive = {};
  const archiveSrc = src.archive && typeof src.archive === 'object' ? src.archive : {};
  for (const [key, value] of Object.entries(archiveSrc)) {
    if (!/^\d{4}$/.test(key) || !value || typeof value !== 'object') continue;
    archive[key] = normalizeVacationPlan({ ...value, year: Number(key), archive: {} });
  }
  const planDeadline = isIsoDate(src.planDeadline) ? src.planDeadline : '';
  let extendedDeadline = isIsoDate(src.extendedDeadline) ? src.extendedDeadline : '';
  if (extendedDeadline && planDeadline && extendedDeadline <= planDeadline) extendedDeadline = '';
  const announcedAt = text(src.announcedAt);
  return {
    docKind: 'vacationPlan',
    year,
    ordinaryDays: clampDays(src.ordinaryDays ?? VACATION_PLAN_DEFAULTS.ordinaryDays),
    seniorEnabled: src.seniorEnabled !== false,
    seniorAge: Math.min(100, Math.max(50, Math.round(Number(src.seniorAge) || VACATION_PLAN_DEFAULTS.seniorAge))),
    seniorDays: clampDays(src.seniorDays ?? VACATION_PLAN_DEFAULTS.seniorDays),
    carryoverMax: clampDays(src.carryoverMax ?? VACATION_PLAN_DEFAULTS.carryoverMax),
    extraAgreedDays: clampDays(src.extraAgreedDays ?? VACATION_PLAN_DEFAULTS.extraAgreedDays),
    approvalDays: Math.min(90, Math.max(1, Math.round(Number(src.approvalDays) || VACATION_PLAN_DEFAULTS.approvalDays))),
    mainVacationDays: clampDays(src.mainVacationDays ?? VACATION_PLAN_DEFAULTS.mainVacationDays),
    memo: text(src.memo).slice(0, 2000),
    planDeadline,
    extendedDeadline,
    fixedExtras: (Array.isArray(src.fixedExtras) ? src.fixedExtras : []).map(normalizeFixed).filter(Boolean).slice(0, 12),
    grants,
    notices,
    announcedAt,
    lastSweepOn: isIsoDate(src.lastSweepOn) ? src.lastSweepOn : '',
    archive,
    active: !!(announcedAt && planDeadline),
  };
}

export function vacationPlanForYear(plan, year) {
  const current = normalizeVacationPlan(plan);
  const nextYear = Number(year);
  if (!nextYear || current.year === nextYear) return current;
  const archive = {
    ...current.archive,
    [String(current.year)]: snapshotPlan(current),
  };
  const stored = archive[String(nextYear)];
  if (stored) {
    return normalizeVacationPlan({ ...stored, year: nextYear, archive });
  }
  return normalizeVacationPlan({
    year: nextYear,
    ordinaryDays: current.ordinaryDays,
    seniorEnabled: current.seniorEnabled,
    seniorAge: current.seniorAge,
    seniorDays: current.seniorDays,
    carryoverMax: current.carryoverMax,
    extraAgreedDays: current.extraAgreedDays,
    approvalDays: current.approvalDays,
    mainVacationDays: current.mainVacationDays,
    memo: current.memo,
    fixedExtras: current.fixedExtras.map((row) => ({
      ...row,
      id: vacationPlanId('fex'),
      from: '',
      to: '',
      assign: false,
    })),
    archive,
  });
}

/** Aktive interne ansatte — ekstern/innleid-utenfor og avsluttet status telles ikke. */
export function isPlanningEmployee(employee) {
  const company = employee?.company || {};
  const status = text(company.status) || 'active';
  if (status !== 'active') return false;
  if (company.personnelKind === 'external' || company.external === true) return false;
  return !!text(employee?.id);
}

export function employeePlanName(employee) {
  const person = employee?.person || {};
  const joined = [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean).join(' ');
  return joined || text(employee?.name) || 'Medarbeider';
}

export function employeePlanEmails(employee) {
  const values = [employee?.person?.email, employee?.company?.email, employee?.invite?.email];
  const out = [];
  for (const value of values) {
    const email = text(value).toLowerCase();
    if (!email.includes('@') || email.includes(' ') || out.includes(email)) continue;
    out.push(email);
  }
  return out;
}

export function ageInVacationYear(birthDate, year) {
  const iso = text(birthDate).slice(0, 10);
  const born = Number(iso.slice(0, 4));
  if (!/^\d{4}/.test(iso) || !born) return null;
  return Number(year) - born;
}

export function vacationQuota(employee, planInput, { absences = [], today = '', dayHours = 8 } = {}) {
  const plan = normalizeVacationPlan(planInput);
  const grant = plan.grants[text(employee?.id)] || { carryoverDays: 0, extraAgreedDays: null, senior: null };
  const age = ageInVacationYear(employee?.person?.birthDate, plan.year);
  let senior = false;
  if (plan.seniorEnabled) {
    if (grant.senior === true) senior = true;
    else if (grant.senior === false) senior = false;
    else senior = age != null && age >= plan.seniorAge;
  }
  const carryoverWanted = clampDays(grant.carryoverDays);
  const carryover = Math.min(carryoverWanted, plan.carryoverMax);
  const extra = grant.extraAgreedDays == null ? plan.extraAgreedDays : grant.extraAgreedDays;
  const lines = [
    { key: 'ordinary', label: 'ordinær ferie', days: plan.ordinaryDays },
  ];
  if (senior && plan.seniorDays > 0) {
    lines.push({ key: 'senior', label: 'senioruke', days: plan.seniorDays });
  }
  if (carryover > 0) {
    lines.push({ key: 'carryover', label: `overført fra ${plan.year - 1}`, days: carryover });
  }
  for (const extraRow of plan.fixedExtras) {
    if (extraRow.days > 0) lines.push({ key: extraRow.id, label: extraRow.label.toLowerCase(), days: extraRow.days });
  }
  if (extra > 0) lines.push({ key: 'agreed', label: 'ekstra avtalt ferie', days: extra });
  const total = round2(lines.reduce((sum, row) => sum + row.days, 0));
  const usage = vacationUsage(absences, employee?.id, plan.year, today, dayHours);
  const remaining = round2(total - usage.registered);
  return {
    lines,
    total,
    senior,
    seniorUnknown: plan.seniorEnabled && grant.senior == null && age == null,
    age,
    carryover,
    carryoverCapped: carryoverWanted > plan.carryoverMax,
    extra,
    ...usage,
    remaining,
  };
}

export function vacationUsage(absences, employeeId, year, today, dayHours = 8) {
  const id = text(employeeId);
  const y = String(year || '');
  const day = Number(dayHours) > 0 ? Number(dayHours) : 8;
  let taken = 0;
  let planned = 0;
  let main = 0;
  const mainFrom = `${y}-06-01`;
  const mainTo = `${y}-09-30`;
  for (const row of absences || []) {
    if (!row || text(row.employeeId) !== id) continue;
    if ((row.type || 'ferie') !== 'ferie') continue;
    const date = text(row.date).slice(0, 10);
    if (!date.startsWith(y)) continue;
    const days = round2((Number(row.hours) || 0) / day);
    if (today && date > today) planned = round2(planned + days);
    else taken = round2(taken + days);
    if (date >= mainFrom && date <= mainTo) main = round2(main + days);
  }
  return { taken, planned, registered: round2(taken + planned), main };
}

export function planningWindow(planInput, today) {
  const plan = normalizeVacationPlan(planInput);
  const deadline = plan.planDeadline;
  const extended = plan.extendedDeadline;
  if (!deadline) {
    return {
      phase: 'open',
      locked: false,
      effectiveDeadline: '',
      reminderFrom: '',
      extensionDue: false,
    };
  }
  const reminderFrom = addIsoDays(deadline, -3);
  if (extended) {
    return {
      phase: today > extended ? 'locked' : 'extended',
      locked: today > extended,
      effectiveDeadline: extended,
      reminderFrom,
      extensionDue: false,
    };
  }
  if (today > deadline) {
    return {
      phase: 'overdue',
      locked: false,
      effectiveDeadline: deadline,
      reminderFrom,
      extensionDue: true,
    };
  }
  if (today >= reminderFrom) {
    return {
      phase: 'reminder',
      locked: false,
      effectiveDeadline: deadline,
      reminderFrom,
      extensionDue: false,
    };
  }
  return {
    phase: 'open',
    locked: false,
    effectiveDeadline: deadline,
    reminderFrom,
    extensionDue: false,
  };
}

export function planningPhaseLabel(phase) {
  if (phase === 'reminder') return 'Fristen nærmer seg';
  if (phase === 'extended') return 'Utvidet frist';
  if (phase === 'overdue') return 'Fristen er passert';
  if (phase === 'locked') return 'Planleggingen er låst';
  return 'Åpen for planlegging';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dayText(value) {
  const n = round2(value);
  const shown = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return shown;
}

function messageDoc({ subject, intro, lines, total, extra }) {
  const body = [
    intro,
    '',
    ...lines.map((row) => `+ ${dayText(row.days)} dager ${row.label}`),
    `= ${dayText(total)} dager til planlegging`,
    '',
    ...extra.filter(Boolean),
  ].join('\n');
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    '<ul>',
    ...lines.map((row) => `<li>+ ${escapeHtml(dayText(row.days))} dager ${escapeHtml(row.label)}</li>`),
    '</ul>',
    `<p><strong>= ${escapeHtml(dayText(total))} dager til planlegging</strong></p>`,
    ...extra.filter(Boolean).map((row) => `<p>${escapeHtml(row)}</p>`),
  ].join('');
  return { subject, text: body, html };
}

export function buildAnnouncement({ companyName, employee, plan, quota }) {
  const name = employeePlanName(employee);
  const deadline = formatPlanDate(plan.planDeadline);
  const intro = deadline
    ? `Hei ${name}! ${companyName || 'Bedriften'} har åpnet ferieplanen for ${plan.year}. Fristen for å planlegge ferien er ${deadline}.`
    : `Hei ${name}! ${companyName || 'Bedriften'} har satt ferieplanen for ${plan.year}.`;
  const extra = [
    plan.memo,
    `Planlegg ferien i ProTop. All ferie skal godkjennes av HR innen ${plan.approvalDays} dager.`,
    'Tre dager før fristen går det ut en påminnelse hvis du har dager igjen. Etter fristen får du én uke ekstra. Deretter må nye registreringer til særskilt godkjenning.',
    plan.seniorEnabled
      ? `Senioruke (${plan.seniorDays} dager) gjelder fra året man fyller ${plan.seniorAge} år.`
      : '',
  ];
  return messageDoc({
    subject: `Ferieplan ${plan.year}: ${dayText(quota.total)} dager til planlegging`,
    intro,
    lines: quota.lines,
    total: quota.total,
    extra,
  });
}

export function buildReminder({ employee, plan, quota }) {
  const name = employeePlanName(employee);
  const deadline = formatPlanDate(plan.planDeadline);
  return messageDoc({
    subject: `Påminnelse: planlegg ferien innen ${deadline}`,
    intro: `Hei ${name}! Fristen for ferieplanen ${plan.year} er ${deadline}, om tre dager eller mindre. Du har ${dayText(quota.remaining)} dager igjen å planlegge.`,
    lines: quota.lines,
    total: quota.total,
    extra: [
      `Planlagt: ${dayText(quota.planned)} dager. Tatt ut: ${dayText(quota.taken)} dager.`,
      'Registrer resten i ProTop før fristen.',
    ],
  });
}

export function buildDunning({ employee, plan, quota, extendedDeadline }) {
  const name = employeePlanName(employee);
  const extended = formatPlanDate(extendedDeadline);
  return messageDoc({
    subject: `Purring: ny frist for ferieplan ${plan.year} er ${extended}`,
    intro: `Hei ${name}! Fristen ${formatPlanDate(plan.planDeadline)} er passert, og du har fortsatt ${dayText(quota.remaining)} feriedager som ikke er planlagt. Ny frist er ${extended}, én uke ekstra.`,
    lines: quota.lines,
    total: quota.total,
    extra: [
      'Etter den nye fristen låses ordinær registrering. Du kan fortsatt sende inn ferie, men den krever særskilt godkjenning og kan ikke påregnes godkjent uten videre.',
    ],
  });
}

export function buildLockNotice({ employee, plan, quota }) {
  const name = employeePlanName(employee);
  return messageDoc({
    subject: `Ferieplan ${plan.year} er låst`,
    intro: `Hei ${name}! Den utvidede fristen ${formatPlanDate(plan.extendedDeadline)} er passert. Du har ${dayText(quota.remaining)} dager igjen som ikke er planlagt.`,
    lines: quota.lines,
    total: quota.total,
    extra: [EXTRAORDINARY_NOTICE],
  });
}

/**
 * Hva den daglige jobben skal sende, og hvordan planen skal se ut etterpå.
 * Meldinger stemples i notices slik at de bare går ut én gang.
 */
export function planSweep({ plan, employees = [], absences = [], today, dayHours = 8 } = {}) {
  const current = normalizeVacationPlan(plan);
  if (!current.announcedAt || !current.planDeadline || !isIsoDate(today)) {
    return { plan: current, messages: [] };
  }
  const window = planningWindow(current, today);
  const people = (employees || []).filter(isPlanningEmployee).map((employee) => ({
    employee,
    quota: vacationQuota(employee, current, { absences, today, dayHours }),
  }));
  const notices = { ...current.notices };
  const messages = [];
  let extendedDeadline = current.extendedDeadline;

  if (window.phase === 'reminder') {
    for (const row of people) {
      if (row.quota.remaining <= 0.001) continue;
      if (notices[row.employee.id]?.reminderAt) continue;
      notices[row.employee.id] = { ...(notices[row.employee.id] || {}), reminderAt: today };
      const message = buildReminder({ employee: row.employee, plan: current, quota: row.quota });
      messages.push({ employee: row.employee, kind: 'reminder', ...message });
    }
  }

  if (window.extensionDue && people.some((row) => row.quota.remaining > 0.001)) {
    extendedDeadline = addIsoDays(current.planDeadline, 7);
    for (const row of people) {
      if (row.quota.remaining <= 0.001) continue;
      if (notices[row.employee.id]?.dunningAt) continue;
      notices[row.employee.id] = { ...(notices[row.employee.id] || {}), dunningAt: today };
      const message = buildDunning({
        employee: row.employee,
        plan: current,
        quota: row.quota,
        extendedDeadline,
      });
      messages.push({ employee: row.employee, kind: 'dunning', ...message });
    }
  }

  if (window.phase === 'locked') {
    for (const row of people) {
      if (row.quota.remaining <= 0.001) continue;
      if (notices[row.employee.id]?.lockAt) continue;
      notices[row.employee.id] = { ...(notices[row.employee.id] || {}), lockAt: today };
      const message = buildLockNotice({ employee: row.employee, plan: current, quota: row.quota });
      messages.push({ employee: row.employee, kind: 'lock', ...message });
    }
  }

  return {
    plan: normalizeVacationPlan({ ...current, extendedDeadline, notices }),
    messages,
  };
}

function continues(prev, next) {
  if (!prev || !next || next <= prev) return false;
  let cursor = addIsoDays(prev, 1);
  let guard = 0;
  while (cursor < next && guard < 6) {
    const [year, month, day] = cursor.split('-').map(Number);
    const dow = new Date(year, month - 1, day).getDay();
    if (dow !== 0 && dow !== 6) return false;
    cursor = addIsoDays(cursor, 1);
    guard += 1;
  }
  return cursor === next;
}

function vacationStatusBucket(status) {
  const key = text(status) || 'registrert';
  if (key === 'godkjent' || key === 'låst') return 'approved';
  if (key === 'registrert') return 'pending';
  return '';
}

function groupVacationPeriods(absences, { year, bucket } = {}) {
  const y = String(year || '');
  const rows = (absences || [])
    .filter((row) => row && (row.type || 'ferie') === 'ferie')
    .filter((row) => vacationStatusBucket(row.status) === bucket)
    .filter((row) => text(row.date).startsWith(y))
    .map((row) => ({ ...row, date: text(row.date).slice(0, 10) }))
    .sort((a, b) => text(a.employeeId).localeCompare(text(b.employeeId)) || a.date.localeCompare(b.date));
  const periods = [];
  for (const row of rows) {
    const last = periods[periods.length - 1];
    if (last && last.employeeId === row.employeeId && continues(last.end, row.date)) {
      last.end = row.date;
      last.hours = round2(last.hours + (Number(row.hours) || 0));
      last.ids.push(row.id);
      last.extraordinary = last.extraordinary || row.extraordinary === true;
      const created = text(row.createdAt).slice(0, 10);
      if (isIsoDate(created) && (!last.created || created < last.created)) last.created = created;
      continue;
    }
    periods.push({
      employeeId: row.employeeId,
      // Kopien på fraværet, bare som reserve når personen ikke finnes i registeret.
      storedName: text(row.employeeName),
      start: row.date,
      end: row.date,
      hours: round2(Number(row.hours) || 0),
      ids: [row.id].filter(Boolean),
      extraordinary: row.extraordinary === true,
      created: isIsoDate(text(row.createdAt).slice(0, 10)) ? text(row.createdAt).slice(0, 10) : '',
      status: vacationStatusBucket(row.status),
    });
  }
  return periods;
}

function decorateVacationPeriods(periods, { today, approvalDays = 14, dayHours = 8, names = {} } = {}) {
  const day = Number(dayHours) > 0 ? Number(dayHours) : 8;
  return periods.map((period) => {
    const due = addIsoDays(period.created || today, approvalDays);
    return {
      ...period,
      days: round2(period.hours / day),
      employeeName: names[period.employeeId] || period.storedName || 'Ansatt',
      due,
      overdue: !!(today && due && today > due),
      shortNotice: !!(today && period.start <= addIsoDays(today, 60)),
    };
  });
}

export function pendingVacationRequests(absences, opts = {}) {
  return decorateVacationPeriods(
    groupVacationPeriods(absences, { year: opts.year, bucket: 'pending' }),
    opts,
  );
}

export function approvedVacationRequests(absences, opts = {}) {
  return decorateVacationPeriods(
    groupVacationPeriods(absences, { year: opts.year, bucket: 'approved' }),
    opts,
  );
}
