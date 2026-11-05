/**
 * E-posten til regnskapsfører med månedens lønnsgrunnlag (overtid, sykdom, kjøring m.m.).
 * Ren funksjon uten avhengigheter: brukes både i appen (forhåndsvisning) og på serveren.
 * Rader kommer fra buildPayrollSummary (src/arbeid/payroll.js), lagret i lønnskjøringen.
 */

const MONTH_NAMES = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

const ABSENCE_LINES = [
  { id: 'egenmelding', label: 'Sykdom med egenmelding' },
  { id: 'syk_melding', label: 'Sykdom med sykemelding' },
  { id: 'sykt_barn', label: 'Sykt barn' },
];

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function payrollMonthName(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(text(month));
  if (!match) return text(month);
  return `${MONTH_NAMES[Number(match[2]) - 1] || ''} ${match[1]}`.trim();
}

/** 3.5 → «3,5», 2 → «2». */
export function nbNumber(value, decimals = 2) {
  const n = Math.round(num(value) * 10 ** decimals) / 10 ** decimals;
  return String(n).replace('.', ',');
}

export function nbMoney(value) {
  const n = Math.round(num(value) * 100) / 100;
  const [whole, cents = ''] = n.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return cents === '00' ? `${grouped},-` : `${grouped},${cents}`;
}

function hoursText(value) {
  const n = num(value);
  return `${nbNumber(n)} ${n === 1 ? 'time' : 'timer'}`;
}

function daysText(value) {
  const n = num(value);
  return `${nbNumber(n)} ${n === 1 ? 'dag' : 'dager'}`;
}

/** Linjene for én ansatt, som i e-posten. */
export function payrollLinesFor(row) {
  const lines = [];
  if (row?.fixedSalary) {
    lines.push('Overtid: Fastlønn');
  } else {
    const bank50 = num(row?.bank50);
    const bank100 = num(row?.bank100);
    lines.push(`Overtid 50 %: ${hoursText(row?.overtime50)}${bank50 > 0 ? ` (herav ${hoursText(bank50)} fra timebanken)` : ''}`);
    if (num(row?.overtime100) > 0) {
      lines.push(`Overtid 100 %: ${hoursText(row?.overtime100)}${bank100 > 0 ? ` (herav ${hoursText(bank100)} fra timebanken)` : ''}`);
    }
  }
  for (const type of ABSENCE_LINES) {
    const days = num(row?.absence?.[type.id]);
    // Fastlønn: bare fravær som faktisk er registrert. Ellers alltid, også 0, som regnskapsfører er vant med.
    if (row?.fixedSalary && !days) continue;
    lines.push(`${type.label}: ${daysText(days)}`);
  }
  if (num(row?.km) > 0) {
    lines.push(`Kjøregodtgjørelse: ${nbNumber(row.km, 1)} km${num(row?.mileageAmount) > 0 ? ` (${nbMoney(row.mileageAmount)})` : ''}`);
  }
  for (const line of Array.isArray(row?.lines) ? row.lines : []) {
    const label = text(line?.label, 80);
    if (!label) continue;
    const value = text(line?.value, 80);
    lines.push(value ? `${label}: ${value}` : label);
  }
  const note = text(row?.note, 300);
  if (note) lines.push(`Merknad: ${note}`);
  return lines;
}

/**
 * Emne og tekst. rows: lagrede rader fra lønnskjøringen. intro/closing kan settes per bedrift.
 */
export function buildPayrollMail({
  month, rows = [], companyName = '', senderName = '', note = '',
} = {}) {
  const monthText = payrollMonthName(month);
  const subject = `Oversikt over overtid og km. mm. for ${monthText} til utbetaling${companyName ? ` – ${text(companyName, 80)}` : ''}`;
  const parts = ['Hei,', '', `Her kommer oversikt over overtid og km. mm. for ${monthText} til utbetaling.`, ''];
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = text(row?.name, 120) || 'Uten navn';
    parts.push(`${name}:`);
    for (const line of payrollLinesFor(row)) parts.push(`  • ${line}`);
    parts.push('');
  }
  const extra = text(note, 2000);
  if (extra) parts.push(extra, '');
  parts.push('Med vennlig hilsen');
  if (text(senderName, 120)) parts.push(text(senderName, 120));
  if (text(companyName, 120)) parts.push(text(companyName, 120));
  const body = parts.join('\n');
  return { subject, text: body };
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Samme innhold som HTML (punktlister per ansatt). */
export function buildPayrollMailHtml(input = {}) {
  const { subject, text: body } = buildPayrollMail(input);
  const html = [];
  let inList = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('  • ')) {
      if (!inList) { html.push('<ul style="margin:4px 0 12px 0;padding-left:20px">'); inList = true; }
      html.push(`<li>${escapeHtml(line.slice(4))}</li>`);
      continue;
    }
    if (inList) { html.push('</ul>'); inList = false; }
    if (!line) continue;
    const bold = /:$/.test(line) && !line.startsWith('Hei');
    html.push(bold ? `<p style="margin:12px 0 0 0"><strong>${escapeHtml(line)}</strong></p>` : `<p style="margin:0 0 8px 0">${escapeHtml(line)}</p>`);
  }
  if (inList) html.push('</ul>');
  return {
    subject,
    text: body,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">${html.join('')}</div>`,
  };
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

export function isPayrollEmail(value) {
  return EMAIL_RE.test(text(value, 200));
}

function lineList(value) {
  return (Array.isArray(value) ? value : [])
    .map((row) => ({ label: text(row?.label, 80), value: text(row?.value, 80) }))
    .filter((row) => row.label)
    .slice(0, 12);
}

function lineMap(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [id, rows] of Object.entries(value)) {
    const key = text(id, 120);
    const clean = lineList(rows);
    if (key && !key.includes('/') && clean.length) out[key] = clean;
  }
  return out;
}

/** families/{id}/hr/payroll: regnskapsfører og faste linjer per ansatt. */
export function normalizePayrollSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const email = text(src.accountantEmail, 200).toLowerCase();
  const cc = text(src.ccEmail, 200).toLowerCase();
  return {
    accountantName: text(src.accountantName, 120),
    accountantEmail: isPayrollEmail(email) ? email : '',
    ccEmail: isPayrollEmail(cc) ? cc : '',
    autoSend: src.autoSend === true,
    recurring: lineMap(src.recurring),
    updatedAt: text(src.updatedAt, 40),
  };
}

const RUN_STATUSES = new Set(['draft', 'approved', 'sent']);

function numberOr0(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function normalizePayrollRow(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const absence = {};
  for (const type of ABSENCE_LINES) absence[type.id] = numberOr0(src.absence?.[type.id]);
  return {
    employeeId: text(src.employeeId, 120),
    name: text(src.name, 120),
    fixedSalary: src.fixedSalary === true,
    overtime50: numberOr0(src.overtime50),
    overtime100: numberOr0(src.overtime100),
    bank50: numberOr0(src.bank50),
    bank100: numberOr0(src.bank100),
    absence,
    km: numberOr0(src.km),
    mileageAmount: numberOr0(src.mileageAmount),
    lines: lineList(src.lines),
    note: text(src.note, 300),
  };
}

/** families/{id}/hr/payroll/runs/{YYYY-MM}: månedens lønnsgrunnlag, godkjent og sendt. */
export function normalizePayrollRun(raw = {}, month = '') {
  const src = raw && typeof raw === 'object' ? raw : {};
  const status = RUN_STATUSES.has(src.status) ? src.status : 'draft';
  return {
    month: text(src.month || month, 7),
    status,
    rows: (Array.isArray(src.rows) ? src.rows : []).map(normalizePayrollRow).filter((row) => row.employeeId).slice(0, 500),
    extra: lineMap(src.extra),
    notes: (() => {
      const out = {};
      if (src.notes && typeof src.notes === 'object' && !Array.isArray(src.notes)) {
        for (const [id, value] of Object.entries(src.notes)) {
          const note = text(value, 300);
          if (note && !id.includes('/')) out[text(id, 120)] = note;
        }
      }
      return out;
    })(),
    note: text(src.note, 2000),
    approvedAt: text(src.approvedAt, 40),
    approvedByUid: text(src.approvedByUid, 128),
    approvedByName: text(src.approvedByName, 120),
    sentAt: text(src.sentAt, 40),
    sentTo: (Array.isArray(src.sentTo) ? src.sentTo : []).map((v) => text(v, 200)).filter(Boolean).slice(0, 5),
    sendError: text(src.sendError, 300),
    updatedAt: text(src.updatedAt, 40),
  };
}
