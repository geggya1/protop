/**
 * Handlingene på fakturasiden. Hver funksjon lagrer og svarer med { invoice, message }.
 *
 * ctx: {
 *   familyId, store, supplier, logo, settings, chart, actor, invoices, mode ('protop' | 'poweroffice'),
 *   companyName,
 * }
 */
import {
  addNote,
  applyCreditToOriginal,
  approveDraft,
  buildCreditNote,
  isCreditNote,
  isDraftInvoice,
  isManagedInvoice,
  issueInvoice,
  mergeTemplate,
  nextInvoiceNumber,
  postponeReminder,
  projectInvoiceCountFor,
  recordDelivery,
  registerPayment,
  removePayment,
  settleCreditNote,
  unapproveDraft,
  updateDraft,
  withEvent,
  writeOffInvoice,
} from '../../../src/economy/invoiceFlow.js';
import { lineSources, totalsFromLines } from '../../../src/economy/invoiceLines.js';
import { normalizeInvoice } from '../../../src/economy/invoices.js';
import { attachVoucherSnapshot, ledgerVoucher } from '../../../src/economy/vouchers.js';
import { buildEhfXml } from '../../../src/economy/ehf.js';
import {
  buildCollectionLetterPdf,
  buildInvoicePdf,
  buildInvoiceSpecPdf,
  buildInvoiceWithTimeSpecPdf,
  buildTimeSpecPdf,
  collectionLetterName,
  invoicePdfName,
  pdfBase64,
} from '../../../src/economy/invoicePdf.js';
import {
  archiveInvoice,
  fileBase64,
  sendInvoiceEhf,
  ehfAlreadySent,
  ehfResendWanted,
  sendInvoiceMail,
  storeInvoiceFile,
} from '../../../src/economy/invoiceDelivery.js';
import { invoiceWorkIds, releaseWork } from '../../../src/economy/billingWork.js';
import { loadTimeEntriesByIds } from '../../../src/economy/timeEntryStorage.js';
import { withRegistryCustomer } from '../../../src/economy/invoiceCustomer.js';
import {
  addCollectionStep, buildInterestInvoice, checkDeadline, collectionLetter, collectionStatus,
} from '../../../src/economy/collection.js';

function demo(ctx) {
  return !ctx.familyId || ctx.familyId === '__demo__';
}

async function save(ctx, invoice) {
  return ctx.store.saveInvoice(ctx.familyId, normalizeInvoice(invoice));
}

/** Timene bak timelinjene, til timespesifikasjonen. */
export async function timeEntriesFor(ctx, invoice) {
  const ids = invoiceWorkIds(invoice).timeEntryIds;
  if (!ids.length || demo(ctx)) return ctx.demoEntries?.filter((row) => ids.includes(row.id)) || [];
  return loadTimeEntriesByIds(ctx.familyId, ids);
}

export function pdfFor(ctx, invoice, originalDate = '') {
  return buildInvoicePdf(invoice, { supplier: ctx.supplier, logo: ctx.logo, originalDate });
}

export async function timeSpecFor(ctx, invoice) {
  const entries = await timeEntriesFor(ctx, invoice);
  return buildTimeSpecPdf(invoice, entries, { supplier: ctx.supplier, settings: ctx.settings, logo: ctx.logo });
}

export async function invoiceWithTimeSpecFor(ctx, invoice, originalDate = '') {
  const entries = await timeEntriesFor(ctx, invoice);
  return buildInvoiceWithTimeSpecPdf(invoice, entries, { supplier: ctx.supplier, settings: ctx.settings, logo: ctx.logo, originalDate });
}

/** Hele fakturaen fra lagringen. Listeradene mangler linjer og skal aldri lagres tilbake. */
async function fullInvoice(ctx, row) {
  if (!row || typeof ctx.store.loadInvoice !== 'function') return row;
  const loaded = await ctx.store.loadInvoice(ctx.familyId, row.id).catch(() => null);
  if (!loaded || loaded.partial) throw new Error('Kunne ikke hente hele fakturaen. Sjekk nettet og prøv igjen.');
  return loaded;
}

function originalOf(ctx, invoice) {
  if (!isCreditNote(invoice)) return null;
  return (ctx.invoices || []).find((row) => row.id === invoice.creditNoteForId) || null;
}

/** Lagrer endringer i utkastet. Linjer fra grunnlaget som fjernes, frigjøres. */
export async function saveDraft(ctx, previous, patch) {
  const result = updateDraft(previous, patch, { actor: ctx.actor });
  if (!result.ok) throw new Error(result.error);
  if (!result.changed) return { invoice: previous, message: '' };
  const before = invoiceWorkIds(previous);
  const after = invoiceWorkIds(result.invoice);
  const removed = [
    ...before.timeEntryIds.filter((id) => !after.timeEntryIds.includes(id)),
    ...before.expenseIds.filter((id) => !after.expenseIds.includes(id)),
    ...before.tripIds.filter((id) => !after.tripIds.includes(id)),
    ...before.saleIds.filter((id) => !after.saleIds.includes(id)),
  ];
  const saved = await save(ctx, result.invoice);
  if (removed.length && !isCreditNote(previous)) {
    await releaseWork(ctx.familyId, previous, { mode: 'release', onlyIds: removed });
  }
  return {
    invoice: saved,
    message: removed.length
      ? `Utkastet er lagret. ${removed.length === 1 ? '1 post' : `${removed.length} poster`} er tilbake i Til fakturering.`
      : 'Utkastet er lagret.',
  };
}

export async function toggleApproval(ctx, invoice) {
  const result = invoice.approval ? unapproveDraft(invoice, { actor: ctx.actor }) : approveDraft(invoice, { actor: ctx.actor });
  if (!result.ok) throw new Error(result.error);
  const saved = await save(ctx, result.invoice);
  return { invoice: saved, message: saved.approval ? 'Utkastet er godkjent.' : 'Godkjenningen er trukket tilbake.' };
}

export async function addNoteAction(ctx, invoice, body) {
  const saved = await save(ctx, addNote(invoice, { text: body, actor: ctx.actor }));
  return { invoice: saved, message: 'Notatet er lagt til.' };
}

export async function addEventAction(ctx, invoice, body) {
  const saved = await save(ctx, withEvent(invoice, { type: 'manual', text: body, actor: ctx.actor }));
  return { invoice: saved, message: 'Hendelsen er lagt i loggen.' };
}

/** Slett utkast. Postene frigjøres eller avskrives før utkastet fjernes. */
export async function deleteDraft(ctx, invoice, { mode = 'release', reason = '' } = {}) {
  const full = await fullInvoice(ctx, invoice);
  if (full?.issuedAt) throw new Error(`Faktura ${full.invoiceNumber} er ferdigstilt og kan ikke slettes. Krediter den i stedet.`);
  if (!isCreditNote(full)) {
    await releaseWork(ctx.familyId, full, { mode, reason, actor: ctx.actor });
  }
  await ctx.store.removeInvoice(ctx.familyId, full.id);
  return {
    message: mode === 'writeoff'
      ? 'Utkastet er slettet. Postene er avskrevet og faktureres ikke.'
      : 'Utkastet er slettet. Postene er tilbake i Til fakturering.',
  };
}

/**
 * Ferdigstill i ProTop: nummer (transaksjon), dato, forfall, KID, bilag og arkiv-PDF.
 * Kreditnota: originalen oppdateres og grunnlaget frigjøres når det er valgt.
 */
export async function finalize(ctx, invoice, { date = '', dueDate = '' } = {}) {
  const settings = ctx.settings || {};
  const minimum = nextInvoiceNumber(ctx.invoices || [], settings.invoiceNumberStart);
  const build = (number, current) => {
    const merged = current && current.status === 'draft' ? { ...current, ...invoice } : invoice;
    // Kunden kopieres fra registeret nå, ved ferdigstilling, og låses deretter (DS-09).
    const base = withRegistryCustomer(merged, ctx.customers || []);
    const issued = issueInvoice(base, {
      number,
      date,
      dueDate,
      creditDays: base.creditDays,
      dueDateMode: settings.dueDateMode || 'invoice_date',
      kidFormat: settings.kidFormat || 'customer_invoice',
      kidMethod: settings.kidMethod || 'mod10',
      projectInvoiceCount: isCreditNote(base) ? null : projectInvoiceCountFor(ctx.invoices || [], base.projectId, base.id),
      actor: ctx.actor,
      // Påbudt innhold sjekkes også for selger ved utstedelse (bokføringsforskriften § 5-1-1).
      supplier: ctx.supplier || null,
    });
    if (!issued.ok) return issued;
    const voucher = ledgerVoucher(issued.invoice, {
      totals: totalsFromLines(issued.invoice.lines),
      accountNames: ctx.accountNames || {},
      ...(settings.accountRounding ? { roundingAccount: settings.accountRounding } : {}),
    });
    return { ok: true, invoice: voucher.ok ? attachVoucherSnapshot(issued.invoice, voucher) : issued.invoice };
  };
  let issued;
  if (typeof ctx.store.issueInvoiceWithNumber === 'function' && !demo(ctx)) {
    issued = await ctx.store.issueInvoiceWithNumber(ctx.familyId, invoice, {
      minimum,
      build,
      numberJumps: settings.numberJumps || [],
    });
  } else {
    const result = build(minimum, null);
    if (!result.ok) throw new Error(result.error);
    issued = await save(ctx, result.invoice);
  }

  // Arkiv: PDF-en slik den ble utstedt (bokføringsloven § 13).
  const original = originalOf(ctx, issued);
  const originalDate = original ? original.invoiceDate.split('-').reverse().join('.') : '';
  let archived = issued;
  try {
    const pdf = pdfFor(ctx, issued, originalDate);
    const timeSpec = !isCreditNote(issued) && settings.attachTimeSpec && (issued.timeEntryIds || []).length
      ? await timeSpecFor(ctx, issued)
      : null;
    const archive = await archiveInvoice(ctx.familyId, issued, {
      pdf,
      pdfName: invoicePdfName(issued),
      timeSpec,
      timeSpecName: `Timespesifikasjon-${issued.invoiceNumber}.pdf`,
    });
    archived = await save(ctx, { ...issued, archive, previewReady: true });
  } catch (cause) {
    archived = await save(ctx, withEvent(issued, { type: 'archive', text: `PDF-arkivet feilet: ${String(cause?.message || cause).slice(0, 120)}` }));
  }

  if (original) {
    const full = await fullInvoice(ctx, original);
    const updated = applyCreditToOriginal(full, archived, { actor: ctx.actor });
    await save(ctx, updated);
    archived = await save(ctx, settleCreditNote(archived, updated, { actor: ctx.actor }));
    if (archived.creditReleaseWork) {
      const ids = lineSources(archived.lines);
      await releaseWork(ctx.familyId, updated, {
        mode: 'release',
        onlyIds: [...ids.timeEntryIds, ...ids.expenseIds, ...ids.tripIds, ...ids.saleIds],
      });
    }
  }
  return {
    invoice: archived,
    message: `${isCreditNote(archived) ? 'Kreditnotaen' : 'Fakturaen'} ble ferdigstilt som nummer ${archived.invoiceNumber}.`,
  };
}

function attachmentAllowed(familyId, row) {
  const path = row?.storagePath || '';
  if (path) return path.startsWith(`families/${familyId}/`);
  const match = String(row?.url || '').match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)/);
  if (!match) return false;
  try {
    return decodeURIComponent(match[1]).startsWith(`families/${familyId}/`);
  } catch {
    return false;
  }
}

/** Vedlegg som ikke ligger i ProTop (for eksempel en lenke), kan ikke sendes med. */
export function sendableAttachments(familyId, invoice) {
  return (invoice?.attachments || []).filter((row) => row.include !== false && (demo({ familyId }) || attachmentAllowed(familyId, row)));
}

/** Base64-tegn som får plass i ett kall til serveren (grensen er rundt 10 MB). */
const POWEROFFICE_UPLOAD_CHARS = 9_000_000;

/**
 * Vedleggene som legges på utkastet i PowerOffice og følger med fakturaen:
 * fakturaspesifikasjonen i ProTop sitt design (med timespesifikasjon når fakturaen har timer
 * og den ikke er slått av), og fakturaens vedlegg og kvitteringer.
 * Returnerer { files: [{ name, mime, base64 }], skipped: [navn som ikke fikk plass] }.
 */
export async function powerOfficeAttachments(ctx, invoice) {
  const full = await fullInvoice(ctx, invoice);
  const settings = ctx.settings || {};
  const entries = settings.attachTimeSpec !== false && (full.timeEntryIds || []).length
    ? await timeEntriesFor(ctx, full).catch(() => [])
    : [];
  const spec = buildInvoiceSpecPdf(full, entries, { supplier: ctx.supplier, settings, logo: ctx.logo });
  const project = String(full.projectNumber || '').replace(/[^\w-]+/g, '');
  const files = [{ name: `Fakturaspesifikasjon${project ? `-${project}` : ''}.pdf`, mime: 'application/pdf', base64: pdfBase64(spec) }];
  const skipped = [];
  let used = files[0].base64.length;
  for (const row of sendableAttachments(ctx.familyId, full)) {
    const base64 = await fileBase64(row).catch(() => '');
    if (!base64) {
      skipped.push(row.name);
      continue;
    }
    if (used + base64.length > POWEROFFICE_UPLOAD_CHARS) {
      skipped.push(row.name);
      continue;
    }
    used += base64.length;
    files.push({ name: row.name, mime: row.mime || '', base64 });
  }
  return { files, skipped };
}

/** Sender en ferdigstilt faktura: e-post, EHF (med e-post i tillegg) eller manuelt. */
export async function send(ctx, invoice, options = {}) {
  const channel = options.channel || 'email';
  let current = invoice;
  const credit = isCreditNote(current);
  const values = { company: ctx.companyName || ctx.supplier?.name || '', replyTo: options.replyTo || '' };
  const messages = [];

  if (channel === 'manual') {
    current = recordDelivery(current, { channel: 'manual', actor: ctx.actor });
    current = await save(ctx, current);
    return { invoice: current, message: `${credit ? 'Kreditnotaen' : 'Fakturaen'} er markert som sendt. Last ned PDF-en og send den selv.` };
  }

  if (channel === 'ehf') {
    const pdf = pdfFor(ctx, current);
    const embedded = [{ id: invoicePdfName(current), name: invoicePdfName(current), mime: 'application/pdf', base64: pdfBase64(pdf), description: credit ? 'Kreditnota' : 'Faktura' }];
    if (options.includeTimeSpec && (current.timeEntryIds || []).length) {
      const spec = await timeSpecFor(ctx, current);
      embedded.push({ id: 'Timespesifikasjon', name: `Timespesifikasjon-${current.invoiceNumber}.pdf`, mime: 'application/pdf', base64: pdfBase64(spec), description: 'Timespesifikasjon' });
    }
    if (options.includeAttachments !== false) {
      for (const row of sendableAttachments(ctx.familyId, current)) {
        const base64 = await fileBase64(row).catch(() => '');
        if (base64) embedded.push({ id: row.name, name: row.name, mime: row.mime, base64, description: 'Vedlegg' });
      }
    }
    const built = buildEhfXml(current, { supplier: ctx.supplier, attachments: embedded });
    if (!built.ok) throw new Error(built.error);
    const ehfTo = [`0192:${String(current.orgnr).replace(/\D/g, '')}`];
    let result = null;
    try {
      // Avsenderens orgnr hentes av serveren. senderOrgnr sendes bare med for eldre servere.
      result = await sendInvoiceEhf({
        familyId: ctx.familyId,
        invoiceId: current.id,
        xml: built.xml,
        senderOrgnr: ctx.supplier?.orgnr,
        resend: ehfResendWanted(current),
      });
    } catch (cause) {
      const already = ehfAlreadySent(cause);
      if (!already) {
        current = recordDelivery(current, { channel: 'ehf', status: 'failed', message: String(cause?.message || cause), actor: ctx.actor });
        current = await save(ctx, current);
        throw new Error(`EHF-sendingen feilet: ${String(cause?.message || cause)}`);
      }
      // Sendt før (svaret kom aldri fram): registrer leveransen i stedet for å sende igjen.
      current = recordDelivery(current, { channel: 'ehf', to: ehfTo, providerId: already.providerId, actor: ctx.actor });
      messages.push('var allerede sendt som EHF');
    }
    if (result) {
      let archive = current.archive || {};
      try {
        const xmlFile = await storeInvoiceFile(ctx.familyId, current.id, `${invoicePdfName(current).replace(/\.pdf$/, '')}-EHF.xml`, new TextEncoder().encode(built.xml), 'application/xml');
        archive = { ...archive, xml: xmlFile };
      } catch {
        // XML-arkivet er en kopi. PDF-en ligger allerede i arkivet.
      }
      current = recordDelivery({ ...current, archive }, { channel: 'ehf', to: ehfTo, providerId: result.providerId, actor: ctx.actor });
      messages.push('sendt som EHF');
    }
  }

  if (channel === 'email' || options.alsoEmail) {
    const to = options.to || [];
    const subject = mergeTemplate(options.subject || 'Faktura @invoiceNumber fra @company', current, values);
    const body = mergeTemplate(options.body || '', current, values);
    const archive = current.archive || {};
    const files = [];
    if (options.includePdf !== false) {
      files.push(archive.pdf?.storagePath
        ? { name: archive.pdf.name, storagePath: archive.pdf.storagePath, mime: 'application/pdf' }
        : { name: invoicePdfName(current), base64: pdfBase64(pdfFor(ctx, current)), mime: 'application/pdf' });
    }
    if (options.includeTimeSpec && (current.timeEntryIds || []).length) {
      files.push(archive.timeSpec?.storagePath
        ? { name: archive.timeSpec.name, storagePath: archive.timeSpec.storagePath, mime: 'application/pdf' }
        : { name: `Timespesifikasjon-${current.invoiceNumber}.pdf`, base64: pdfBase64(await timeSpecFor(ctx, current)), mime: 'application/pdf' });
    }
    if (options.includeAttachments !== false) {
      for (const row of sendableAttachments(ctx.familyId, current)) {
        files.push({ name: row.name, storagePath: row.storagePath, url: row.url, mime: row.mime });
      }
    }
    try {
      const result = demo(ctx)
        ? { providerId: 'demo', to }
        : await sendInvoiceMail({
          familyId: ctx.familyId,
          invoiceId: current.id,
          to: to.slice(0, 1),
          cc: to.slice(1),
          replyTo: options.replyTo || '',
          fromName: values.company,
          subject,
          text: body,
          files,
        });
      current = recordDelivery(current, { channel: 'email', to: result.to || to, providerId: result.providerId, actor: ctx.actor });
      messages.push(`sendt på e-post til ${to.join(', ')}`);
    } catch (cause) {
      current = recordDelivery(current, { channel: 'email', to, status: 'failed', message: String(cause?.message || cause), actor: ctx.actor });
      current = await save(ctx, current);
      throw new Error(`E-posten ble ikke sendt: ${String(cause?.message || cause)}`);
    }
  }
  current = await save(ctx, current);
  return {
    invoice: current,
    message: `${credit ? 'Kreditnota' : 'Faktura'} ${current.invoiceNumber} er ${messages.join(' og ')}.`,
  };
}

/** Kreditnotautkast fra en ferdigstilt faktura. */
export async function createCredit(ctx, invoice, { lineIds = null, reason = '', release = false } = {}) {
  const full = await fullInvoice(ctx, invoice);
  const result = buildCreditNote(full, { lineIds, reason, releaseWork: release, actor: ctx.actor, account: ctx.settings?.accountFees || '' });
  if (!result.ok) throw new Error(result.error);
  const saved = await save(ctx, result.invoice);
  return { invoice: saved, message: 'Kreditnotautkastet er laget. Kontroller det og ferdigstill.' };
}

export async function payment(ctx, invoice, input) {
  const result = registerPayment(invoice, { ...input, actor: ctx.actor });
  if (!result.ok) throw new Error(result.error);
  const saved = await save(ctx, result.invoice);
  return { invoice: saved, message: saved.status === 'paid' ? 'Betalingen er registrert. Fakturaen er betalt.' : 'Betalingen er registrert.' };
}

export async function deletePayment(ctx, invoice, paymentId) {
  const result = removePayment(invoice, paymentId, { actor: ctx.actor });
  if (!result.ok) throw new Error(result.error);
  return { invoice: await save(ctx, result.invoice), message: 'Betalingen er fjernet.' };
}

export async function loss(ctx, invoice, input) {
  const result = writeOffInvoice(invoice, { ...input, actor: ctx.actor });
  if (!result.ok) throw new Error(result.error);
  return { invoice: await save(ctx, result.invoice), message: 'Restbeløpet er ført som tap.' };
}

export async function postpone(ctx, invoice, date) {
  return { invoice: await save(ctx, postponeReminder(invoice, date, { actor: ctx.actor })), message: '' };
}

/** Last opp et vedlegg til fakturaen (PDF eller bilde). */
export async function uploadAttachment(ctx, invoice, file, bytes) {
  const type = file.mimeType || file.type || 'application/octet-stream';
  const ref = await storeInvoiceFile(ctx.familyId, invoice.id, file.name || 'vedlegg', bytes, type, { unique: true });
  // Importert faktura: den første PDF-en er selve fakturaen fra det andre systemet.
  const imported = !isManagedInvoice(invoice) && !isDraftInvoice(invoice);
  const asDocument = imported && !invoice.attachment?.url && /pdf/i.test(type || ref.name);
  const next = withEvent({
    ...invoice,
    ...(asDocument ? { attachment: { url: ref.url, name: ref.name, storagePath: ref.storagePath || '' }, previewReady: true } : {}),
    attachments: [...(invoice.attachments || []), { id: `att_${Date.now().toString(36)}`, ...ref, source: 'upload', include: true }],
  }, { type: 'attachment', text: `la ved ${ref.name}`, actor: ctx.actor });
  return { invoice: await save(ctx, next), message: `${ref.name} er lagt ved.` };
}

/**
 * Oppdater utkast: henter ferske timer, utlegg, kjøring og salg for prosjektet.
 * Poster som allerede er på utkastet regnes som åpne, så de kommer med på nytt.
 * Svarer med forhåndsvisning: { lines, selection, added, removed, changed }.
 */
export async function refreshPreview(ctx, invoice) {
  const [{ loadProjectState }, { loadTimeEntries }, { loadProjectExpenses }, { loadProductSales }, { combineExpenses }, { combineSales }] = await Promise.all([
    import('../../../src/project/storage'),
    import('../../../src/economy/timeEntryStorage.js'),
    import('../../../src/economy/expenseStorage.js'),
    import('../../../src/economy/productSalesStorage.js'),
    import('../../../src/economy/expenseSave.js'),
    import('../../../src/economy/productSaleSave.js'),
  ]);
  const [{ buildReadyProjects, periodEndFor, selectableKeys, selectionFor, approvedOnly }, { refreshDraftLines }, { resolveProjectInvoiceSettings }] = await Promise.all([
    import('../../../src/economy/billingReady.js'),
    import('../../../src/economy/invoiceDraft.js'),
    import('../../../src/project/invoiceSettings.js'),
  ]);
  const [state, entries, extExpenses, extSales] = await Promise.all([
    loadProjectState(ctx.familyId, { force: true }),
    loadTimeEntries(ctx.familyId, { projectId: invoice.projectId }).catch(() => []),
    loadProjectExpenses(ctx.familyId).catch(() => []),
    loadProductSales(ctx.familyId).catch(() => []),
  ]);
  const project = (state.projects || []).find((row) => row.id === invoice.projectId);
  if (!project) throw new Error('Fant ikke prosjektet til utkastet.');
  const reopen = (row) => {
    if (String(row?.invoiceId || '') !== invoice.id) return row;
    return { ...row, invoiceId: '', status: row.status === 'låst' ? 'godkjent' : (row.status === 'invoiced' ? 'approved' : row.status) };
  };
  const lastMonth = periodEndFor('lastMonth');
  const periodEnd = String(invoice.periodEnd || '') > lastMonth ? invoice.periodEnd : lastMonth;
  const ready = buildReadyProjects({
    projects: [project],
    customers: ctx.customers || [],
    timeEntries: entries.map(reopen),
    expenses: combineExpenses(state.expenses, extExpenses).map(reopen),
    trips: (state.mileageTrips || []).map(reopen),
    sales: combineSales(state.sales, extSales).map(reopen),
    invoices: (ctx.invoices || []).filter((row) => row.id !== invoice.id),
    timesheetLocks: state.timesheetLocks || [],
    contracts: ctx.contracts || [],
    settingsFor: (row) => resolveProjectInvoiceSettings(state, row).effective,
    chart: ctx.chart || [],
    periodEnd,
    includeEmpty: true,
  })[0];
  if (!ready) throw new Error('Fant ikke grunnlaget til prosjektet.');
  if (ready.blocked) throw new Error(`${ready.blockReasons.join('. ')}.`);
  const selection = approvedOnly(selectionFor(ready, new Set(selectableKeys(ready))));
  const result = refreshDraftLines(invoice, selection, {
    settings: resolveProjectInvoiceSettings(state, project).effective,
    chart: ctx.chart || [],
    periodEnd,
  });
  if (result.error) throw new Error(result.error);
  return { ...result, selection };
}

export async function applyRefresh(ctx, invoice, preview) {
  const { syncDraftWork } = await import('../../../src/economy/billingWork.js');
  const result = updateDraft(invoice, { lines: preview.lines }, { actor: ctx.actor, message: 'oppdaterte utkastet fra grunnlaget' });
  if (!result.ok) throw new Error(result.error);
  const saved = await save(ctx, result.invoice);
  await syncDraftWork(ctx.familyId, invoice, saved, preview.selection);
  const parts = [
    preview.added ? `${preview.added} nye poster` : '',
    preview.removed ? `${preview.removed} poster fjernet` : '',
  ].filter(Boolean);
  return { invoice: saved, message: parts.length ? `Utkastet er oppdatert: ${parts.join(', ')}.` : 'Utkastet er oppdatert.' };
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LETTER_SUBJECT = {
  reminder: (no, company) => `Purring: faktura ${no} fra ${company}`,
  notice: (no, company) => `Inkassovarsel: faktura ${no} fra ${company}`,
  debt: (no, company, customer) => `Inkasso: faktura ${no} fra ${company} til ${customer}`,
};

/** PDF-en til purring, inkassovarsel eller kravsoppstilling, uten å sende eller lagre noe. */
export async function collectionLetterPdf(ctx, invoice, { kind, fee = 0, deadline = '' } = {}) {
  const full = await fullInvoice(ctx, invoice);
  const today = localToday();
  const status = collectionStatus(full, { today, settings: ctx.settings || {} });
  const letter = collectionLetter(full, kind, { fee, deadline, today, supplier: ctx.supplier, status });
  return {
    full,
    letter,
    name: collectionLetterName(full, kind),
    pdf: buildCollectionLetterPdf(full, letter, { supplier: ctx.supplier, logo: ctx.logo, date: today }),
  };
}

/**
 * Send purring, inkassovarsel eller saken til inkasso. channel 'email' sender PDF-en (for
 * inkasso også fakturaen), 'manual' gir PDF-en til nedlasting. Steget lagres i begge tilfeller.
 */
export async function sendCollection(ctx, invoice, { kind, fee = 0, deadline = '', to = [], channel = 'email', replyTo = '' } = {}) {
  if (kind !== 'debt') {
    const check = checkDeadline(deadline, localToday());
    if (!check.ok) throw new Error(check.error);
  }
  const { full, letter, name, pdf } = await collectionLetterPdf(ctx, invoice, { kind, fee, deadline });
  const company = ctx.companyName || ctx.supplier?.name || '';
  const recipients = (to || []).map((row) => String(row || '').trim()).filter(Boolean);
  if (channel === 'email') {
    if (!recipients.length) throw new Error(kind === 'debt' ? 'Skriv inn e-posten til inkassobyrået.' : 'Skriv inn e-postadressen til kunden.');
    const files = [{ name, base64: pdfBase64(pdf), mime: 'application/pdf' }];
    if (kind === 'debt') files.push({ name: invoicePdfName(full), base64: pdfBase64(pdfFor(ctx, full)), mime: 'application/pdf' });
    const text = `${letter.paragraphs.join('\n\n')}\n\nMed vennlig hilsen\n${company}`;
    if (!demo(ctx)) {
      await sendInvoiceMail({
        familyId: ctx.familyId,
        invoiceId: full.id,
        to: recipients.slice(0, 1),
        cc: recipients.slice(1),
        replyTo,
        fromName: company,
        subject: LETTER_SUBJECT[kind](full.invoiceNumber, company, full.customerName || ''),
        text,
        files,
      });
    }
  }
  const step = addCollectionStep(full, {
    kind,
    fee: kind === 'debt' ? 0 : fee,
    deadline: kind === 'debt' ? '' : deadline,
    to: channel === 'email' ? recipients.join(', ') : '',
    channel,
  }, { actor: ctx.actor });
  if (!step.ok) throw new Error(step.error);
  const saved = await save(ctx, step.invoice);
  const what = { reminder: 'Purringen', notice: 'Inkassovarselet', debt: 'Kravsoppstillingen' }[kind];
  return {
    invoice: saved,
    pdf: channel === 'manual' ? pdf : null,
    name,
    message: channel === 'email'
      ? `${what} er sendt til ${recipients.join(', ')}.${kind === 'debt' ? ' Fakturaen er lagt ved.' : ''}`
      : `${what} er lastet ned og registrert. Send den til ${kind === 'debt' ? 'inkassobyrået' : 'kunden'}.`,
  };
}

/** Rentefaktura som utkast: forsinkelsesrente og gebyr som ikke er fakturert. */
export async function createInterestInvoice(ctx, invoice, { includeFees = true } = {}) {
  const full = await fullInvoice(ctx, invoice);
  const built = buildInterestInvoice(full, {
    today: localToday(),
    includeFees,
    actor: ctx.actor,
    creditDays: Number(ctx.settings?.creditDays) || 14,
  });
  if (!built.ok) throw new Error(built.error);
  const draft = await save(ctx, built.invoice);
  const step = addCollectionStep(full, {
    kind: 'interest', amount: built.amount, invoiceId: draft.id, feeStepIds: built.feeStepIds,
  }, { actor: ctx.actor });
  await save(ctx, step.invoice);
  return { invoice: draft, message: 'Rentefakturaen er laget som utkast. Kontroller og send den som en vanlig faktura.' };
}
