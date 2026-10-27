/**
 * Fakturautkast fra et utvalg i Til fakturering.
 * Innstillingene for selskap og prosjekt (Faktureringsvalg) styrer gruppering,
 * påslag, rabatt, adm.-kostnader, kontoer, tekster, referanser og vedlegg.
 * Utkastet får ikke nummer eller KID. Det skjer ved ferdigstilling.
 */
import { roundHours } from '../arbeid/hours.js';
import { timeTypeById } from '../arbeid/overtime.js';
import { emptyInvoice, newInvoiceId, text } from './invoices.js';
import { normalizeLine, normalizeLines, round2 } from './invoiceLines.js';
import { dueDateFor, recalcInvoice, withEvent } from './invoiceFlow.js';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function monthName(day) {
  const match = text(day).match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

function monthBounds(day) {
  const match = text(day).match(/^(\d{4})-(\d{2})/);
  if (!match) return { start: '', end: '' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${match[1]}-${match[2]}-01`, end: `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}` };
}

/** Mva-kode ut fra kontoens sats i kontoplanen. Ukjent konto gir høy sats. */
export function vatCodeForAccount(code, chart = []) {
  const row = (chart || []).find((item) => item.code === code);
  const rate = row?.vatRate;
  if (rate == null) return 'HIGH';
  if (rate >= 25) return 'HIGH';
  if (rate >= 15) return 'MID';
  if (rate >= 12) return 'LOW';
  if (row.vatLetter === 'E') return 'EXEMPT';
  return 'ZERO';
}

/** Kontoer for linjetypene, fra Faktureringsvalg eller standardkontoene. */
export function accountsFrom(settings = {}) {
  return {
    hours: text(settings.accountHours) || '3000',
    fees: text(settings.accountFees) || '3000',
    expenses: text(settings.accountExpenses) || '3001',
    products: text(settings.accountProducts) || '3001',
    admin: text(settings.accountAdmin) || '3000',
  };
}

/** Timer → linjer etter groupHoursBy: per medarbeider, aktivitet eller samlet, per måned når perioden vises. */
export function hourLines(entries = [], { settings = {}, accounts, chart = [], markupPercent = 0, discountPercent = 0 } = {}) {
  const mode = ['employee', 'activity', 'total', 'employee_activity'].includes(settings.groupHoursBy)
    ? settings.groupHoursBy
    : 'employee';
  const perMonth = settings.showPeriod !== false;
  const buckets = new Map();
  for (const row of entries) {
    const rate = Number(row._rate);
    if (!Number.isFinite(rate)) continue;
    const type = timeTypeById(row.timeType || 'ordinary');
    const who = text(row.employeeName) || 'Medarbeider';
    const what = text(row.activityName) || 'Hovedaktivitet';
    let label = text(settings.standardLineTextHours) || 'Konsulenttimer';
    let groupKey = 'total';
    if (mode === 'employee') { label = who; groupKey = text(row.employeeId) || who; }
    if (mode === 'activity') { label = what; groupKey = text(row.activityId) || what; }
    if (mode === 'employee_activity') { label = `${who} – ${what}`; groupKey = `${text(row.employeeId) || who}|${what}`; }
    if (type.id !== 'ordinary') label = `${label} (${type.label})`;
    const month = perMonth ? text(row.date).slice(0, 7) : '';
    const key = [groupKey, type.id, rate, month].join('|');
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: `hrs_${buckets.size + 1}_${Date.now().toString(36)}`,
        section: 'hours',
        description: label,
        quantity: 0,
        unit: 't',
        unitPrice: rate,
        markupPercent,
        discountPercent,
        vatCode: vatCodeForAccount(accounts.hours, chart),
        account: accounts.hours,
        employeeId: mode === 'employee' || mode === 'employee_activity' ? text(row.employeeId) : '',
        employeeName: mode === 'employee' || mode === 'employee_activity' ? who : '',
        activityName: mode === 'activity' || mode === 'employee_activity' ? what : '',
        periodStart: row.date,
        periodEnd: row.date,
        timeEntryIds: [],
      });
    }
    const bucket = buckets.get(key);
    bucket.quantity = roundHours(bucket.quantity + (Number(row._hours) || 0));
    bucket.timeEntryIds.push(row.id);
    if (row.date < bucket.periodStart) bucket.periodStart = row.date;
    if (row.date > bucket.periodEnd) bucket.periodEnd = row.date;
  }
  return [...buckets.values()]
    .map((line) => {
      if (!perMonth) return line;
      const bounds = monthBounds(line.periodStart);
      return { ...line, periodStart: bounds.start || line.periodStart, periodEnd: bounds.end || line.periodEnd };
    })
    .sort((a, b) => (
      a.periodStart.localeCompare(b.periodStart)
      || a.description.localeCompare(b.description, 'nb')
    ));
}

function expenseLines(rows = [], { accounts, chart }) {
  return rows.map((item, index) => {
    const row = item.row || item;
    return {
      id: `exp_${row.id || index + 1}`,
      section: 'expenses',
      description: text(item.description) || text(row.description) || text(row.purpose) || 'Utlegg',
      quantity: 1,
      unit: 'stk',
      unitPrice: Number(item.unitPrice ?? row.amountExVat) || 0,
      markupPercent: Number(item.markupPercent ?? row.markupPercent) || 0,
      discountPercent: Number(item.discountPercent) || 0,
      vatCode: vatCodeForAccount(accounts.expenses, chart),
      account: accounts.expenses,
      employeeName: text(row.employeeName),
      activityName: text(row.activityName),
      periodStart: row.date,
      periodEnd: row.date,
      expenseIds: row.id ? [row.id] : [],
    };
  });
}

function tripLines(rows = [], { accounts, chart }) {
  const vatCode = vatCodeForAccount(accounts.expenses, chart);
  return rows.flatMap((row) => {
    const rate = Number(row.billableRate || row.rate) || 0;
    const out = [{
      id: `trip_${row.id}`,
      section: 'trips',
      description: `Kjøring ${text(row.from)} – ${text(row.to)}`.trim(),
      quantity: Number(row.km) || 0,
      unit: 'km',
      unitPrice: rate,
      vatCode,
      account: accounts.expenses,
      employeeName: text(row.employeeName),
      periodStart: row.date,
      periodEnd: row.date,
      tripIds: [row.id],
    }];
    if (Number(row.extras) > 0) {
      out.push({
        id: `trip_${row.id}_extra`,
        section: 'trips',
        description: 'Bom, ferje og parkering',
        quantity: 1,
        unit: 'stk',
        unitPrice: Number(row.extras) || 0,
        vatCode,
        account: accounts.expenses,
        periodStart: row.date,
        periodEnd: row.date,
        tripIds: [row.id],
      });
    }
    return out;
  });
}

function saleLines(rows = [], { accounts, settings }) {
  return rows.map((item) => {
    const row = item.row || item;
    const account = text(row.account) && text(row.account) !== '3000' ? text(row.account) : accounts.products;
    const base = {
      id: `sale_${row.id}`,
      section: 'products',
      description: row.sku ? `${row.sku} ${row.name}` : (text(row.name) || 'Vare'),
      quantity: Number(row.quantity) || 1,
      unit: text(row.unit) || 'stk',
      unitPrice: Number(row.unitPrice) || 0,
      markupPercent: Number(item.markupPercent ?? row.surchargePercent) || 0,
      discountPercent: Number(item.discountPercent ?? row.discountPercent) || Number(settings.discountProducts) || 0,
      vatCode: text(row.vatCode) || 'HIGH',
      account,
      employeeName: text(row.employeeName),
      periodStart: row.date,
      periodEnd: row.date,
      saleIds: [row.id],
    };
    // Importerte salg med låste beløp beholder beløpet fra importen.
    if (row.lockAmounts) {
      return { ...base, fixedAmounts: true, amountExVat: row.amountExVat, vatAmount: row.vatAmount };
    }
    return base;
  });
}

function fixedLine(fixed, { accounts, chart, periodEnd }) {
  if (!fixed) return [];
  const quantity = Number(fixed.quantity) || 1;
  const amount = Number(fixed.model === 'unit' ? (fixed.unitPrice ?? fixed.amount) : fixed.amount) || 0;
  if (!amount) return [];
  const month = monthName(periodEnd);
  const description = fixed.model === 'retainer' && month && !text(fixed.description).includes(month)
    ? `${text(fixed.description) || 'Fast avtale'} ${month}`
    : (text(fixed.description) || 'Fastpris');
  const bounds = monthBounds(periodEnd);
  return [{
    id: `fix_${Date.now().toString(36)}`,
    section: 'fixed',
    description,
    quantity,
    unit: fixed.model === 'unit' ? 'stk' : (fixed.model === 'retainer' ? 'mnd' : 'stk'),
    unitPrice: amount,
    vatCode: vatCodeForAccount(accounts.fees, chart),
    account: accounts.fees,
    periodStart: bounds.start,
    periodEnd: bounds.end,
  }];
}

/**
 * Adm.-kostnader: fast beløp og/eller prosent av grunnlaget.
 * adminOn* styrer hvilke linjetyper som gir grunnlag.
 */
export function adminLine(lines = [], { settings = {}, accounts, chart = [], pricingModel = 'hourly' } = {}) {
  const amount = Number(settings.adminAmount) || 0;
  const percent = Number(settings.adminMarkupPercent) || 0;
  if (!amount && !percent) return null;
  const sections = new Set();
  if (pricingModel === 'fixed' || pricingModel === 'retainer' || pricingModel === 'unit') {
    if (settings.adminOnFixed !== false) sections.add('fixed');
  } else if (settings.adminOnHourly !== false) {
    sections.add('hours');
  }
  if (settings.adminOnExpenses !== false) { sections.add('expenses'); sections.add('trips'); }
  if (settings.adminOnProducts !== false) sections.add('products');
  const applicable = normalizeLines(lines).filter((line) => sections.has(line.section));
  if (!applicable.length) return null;
  const base = applicable.reduce((sum, line) => sum + line.amountExVat, 0);
  const total = round2(amount + base * (percent / 100));
  if (!total) return null;
  const dates = applicable.map((line) => line.periodEnd || line.periodStart).filter(Boolean).sort();
  const starts = applicable.map((line) => line.periodStart).filter(Boolean).sort();
  return normalizeLine({
    id: 'admin_cost',
    section: 'admin',
    description: 'Adm. kostnader',
    quantity: 1,
    unit: 'stk',
    unitPrice: total,
    vatCode: vatCodeForAccount(accounts.admin, chart),
    account: accounts.admin,
    periodStart: starts[0] || '',
    periodEnd: dates[dates.length - 1] || '',
    locked: true,
  });
}

/** Alle genererte linjer for utvalget, med adm.-kostnad til slutt. */
export function linesFromSelection(selection, { settings = {}, chart = [], periodEnd = '' } = {}) {
  const accounts = accountsFrom(settings);
  const hourGroup = selection.hourGroups?.[0];
  const lines = [
    ...fixedLine(selection.fixed, { accounts, chart, periodEnd }),
    ...hourLines(selection.entries || [], {
      settings,
      accounts,
      chart,
      markupPercent: hourGroup ? hourGroup.markupPercent : (Number(settings.markupHourly) || 0),
      discountPercent: hourGroup ? hourGroup.discountPercent : (Number(settings.discountHours) || 0),
    }),
    ...expenseLines(selection.expenseRows?.length ? selection.expenseRows : (selection.expenses || []), { accounts, chart }),
    ...tripLines(selection.trips || [], { accounts, chart }),
    ...saleLines(selection.saleRows?.length ? selection.saleRows : (selection.sales || []), { accounts, settings }),
  ];
  const normalized = normalizeLines(lines);
  const admin = adminLine(normalized, { settings, accounts, chart, pricingModel: selection.pricingModel });
  return admin ? [...normalized, admin] : normalized;
}

function customerAddress(customer, project) {
  return {
    street: text(customer?.address || project?.address),
    postalCode: text(customer?.postalCode),
    city: text(customer?.place),
    country: text(customer?.country) || 'NO',
  };
}

function ourReference(settings, project, actor) {
  const mode = text(settings.ourReferenceMode) || 'project_manager';
  if (mode === 'none') return '';
  if (mode === 'user') return text(actor?.byName);
  return text(project?.manager) || text(actor?.byName);
}

/** Vedlegg fra utleggene (kvitteringer) når copyExpenseAttachments er på. */
export function expenseAttachments(expenses = [], settings = {}) {
  if (settings.copyExpenseAttachments === false) return [];
  return expenses
    .map((item) => item.row || item)
    .filter((row) => text(row.receiptUri))
    .map((row) => ({
      id: `att_exp_${row.id}`,
      url: text(row.receiptUri),
      storagePath: '',
      name: text(row.receiptName) || `Kvittering ${text(row.description) || row.id}`,
      mime: /\.pdf($|\?)/i.test(text(row.receiptUri)) ? 'application/pdf' : '',
      source: 'expense',
      expenseId: row.id,
      include: true,
    }));
}

/** Standard forsendelse: EHF når kunden har org.nr., ellers e-post når adressen finnes. */
export function defaultDelivery({ settings = {}, customer = null, orgnr = '', mode = 'protop' } = {}) {
  if (mode === 'poweroffice') return 'poweroffice';
  const wanted = text(settings.defaultDelivery) || 'ehf';
  const email = text(customer?.invoiceEmail || customer?.email);
  if (wanted === 'ehf' && text(orgnr || customer?.orgnr)) return 'ehf';
  if (wanted === 'manual') return 'manual';
  return email ? 'email' : (text(orgnr || customer?.orgnr) ? 'ehf' : 'manual');
}

/**
 * Bygger utkastet. ctx:
 * - settings: effektive innstillinger for prosjektet
 * - chart: kontoplanen (for mva per konto)
 * - supplier: bedriften (kontonummer)
 * - actor: { byUid, byName }
 * - mode: 'protop' | 'poweroffice'
 */
export function buildInvoiceDraft(selection, {
  settings = {},
  chart = [],
  supplier = {},
  actor = null,
  today = '',
  periodEnd = '',
  mode = 'protop',
} = {}) {
  if (!selection || selection.empty) return { ok: false, error: 'Velg minst én post.', invoice: null };
  const lines = linesFromSelection(selection, { settings, chart, periodEnd });
  if (!lines.length) return { ok: false, error: 'Utvalget gir ingen fakturalinjer.', invoice: null };
  const stamp = text(today) ? `${today}T12:00:00.000Z` : new Date().toISOString();
  const day = stamp.slice(0, 10);
  const project = selection.project || {};
  const customer = selection.customer || null;
  const creditDays = Number.isFinite(Number(customer?.creditDays)) && Number(customer?.creditDays) > 0
    ? Number(customer.creditDays)
    : (Number.isFinite(Number(settings.creditDays)) ? Number(settings.creditDays) : 14);
  const activities = [...new Set(lines.map((line) => line.activityName).filter(Boolean))];
  const entryActivities = [...new Set((selection.entries || []).map((row) => text(row.activityName)).filter(Boolean))];
  const draft = emptyInvoice({
    id: newInvoiceId(''),
    kind: 'invoice',
    invoiceNumber: '',
    invoiceDate: day,
    status: 'draft',
    exportStatus: 'utkast',
    customerId: selection.customerId,
    customerNumber: selection.customerNumber,
    customerName: selection.customerName,
    orgnr: selection.orgnr,
    customerAddress: customerAddress(customer, project),
    customerEmail: text(customer?.invoiceEmail || customer?.email),
    customerContact: text(customer?.contactName),
    customerReference: text(settings.theirReference),
    orderReference: text(settings.orderReference),
    contractReference: text(settings.contractReference),
    addressLineAbove: text(settings.addressLineAbove),
    addressLineBelow: text(settings.addressLineBelow),
    ourReference: ourReference(settings, project, actor),
    projectId: selection.projectId,
    projectNumber: selection.projectNumber,
    projectName: selection.projectName,
    department: text(project.department),
    activities: (entryActivities.length ? entryActivities : activities).join(', '),
    projectTags: Array.isArray(project.tags) ? project.tags.join(', ') : text(project.tags),
    contractId: text(project.contractId),
    creditDays,
    bankAccount: text(supplier.bankAccount),
    currency: 'NOK',
    language: text(settings.invoiceLanguage) || 'nb',
    invoiceText: String(settings.introText ?? '').trim(),
    footerText: String(settings.footerText ?? '').trim(),
    deliveryMethod: defaultDelivery({ settings, customer, orgnr: selection.orgnr, mode }),
    lines,
    attachments: expenseAttachments(selection.expenseRows?.length ? selection.expenseRows : selection.expenses, settings),
    source: { filename: 'til-fakturering', importedAt: stamp, values: { origin: 'billingReady' } },
    createdAt: stamp,
    updatedAt: stamp,
  });
  let invoice = recalcInvoice(draft);
  invoice = {
    ...invoice,
    dueDate: dueDateFor(invoice, { creditDays, dueDateMode: settings.dueDateMode || 'invoice_date' }),
  };
  invoice = withEvent(invoice, { type: 'create', text: 'opprettet fakturautkast', actor, at: stamp });
  return { ok: true, error: null, invoice: recalcInvoice(invoice) };
}

/**
 * Oppdater utkast: linjer fra grunnlaget bygges på nytt fra utvalget.
 * Manuelle linjer beholdes. Hodet (mottaker, referanser, tekster) røres ikke.
 */
export function refreshDraftLines(invoice, selection, { settings = {}, chart = [], periodEnd = '' } = {}) {
  // Manuelle linjer og fastprislinjer beholdes. De kommer ikke fra timer eller utlegg.
  const manual = (invoice?.lines || []).filter((line) => line.manual || line.section === 'fixed');
  const fresh = linesFromSelection(selection, { settings, chart, periodEnd: periodEnd || invoice?.periodEnd });
  const kept = new Set((invoice?.lines || []).filter((line) => !line.manual && line.section !== 'fixed').map((line) => line.id));
  const before = sourceSet(invoice?.lines || []);
  const after = sourceSet(fresh);
  const added = [...after].filter((id) => !before.has(id)).length;
  const removed = [...before].filter((id) => !after.has(id)).length;
  return {
    lines: [...fresh, ...manual],
    added,
    removed,
    changed: added > 0 || removed > 0 || fresh.length !== kept.size,
  };
}

function sourceSet(lines) {
  const out = new Set();
  for (const line of lines) {
    for (const key of ['timeEntryIds', 'expenseIds', 'tripIds', 'saleIds']) {
      for (const id of line?.[key] || []) out.add(`${key}:${id}`);
    }
  }
  return out;
}
