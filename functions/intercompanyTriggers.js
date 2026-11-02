/**
 * Speiling fra prosjektkopien hos leverandøren til prosjektet hos eier (se src/intercompany/model.js).
 *
 * - Timer: families/{leverandør}/timeEntries/{id} på en kopi (prosjekt-id prjic_…) skrives som
 *   families/{eier}/timeEntries/ic_{leverandør}_{id}. Godkjent hos leverandøren = til godkjenning hos eier.
 * - Salg og utleie: state.sales på kopien skrives som families/{eier}/productSales/ic_{leverandør}_{id}.
 * - Utlegg: state.expenses og projectExpenses på kopien skrives som families/{eier}/projectExpenses/ic_….
 * - Faktura: når leverandøren fakturerer eier, får de speilede radene fakturaens nummer og status.
 *
 * Hendelser kan komme i feil rekkefølge, så kilden leses på nytt: speilet blir alltid som kilden
 * er nå, uansett hvilken hendelse som kom sist. Hendelser eldre enn et døgn droppes. Alt annet (vanlige prosjekter) slipper gjennom uten lesing.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  LINK_STATUS,
  diffCloneSales,
  expensesToMirror,
  externalEmployeeId,
  isCloneProjectId,
  linkView,
  mirrorExpense,
  mirrorId,
  mirrorSale,
  mirrorTimeEntry,
  normalizeLink,
  normalizeLinkSettings,
  parseCloneProjectId,
  salesToMirror,
} from '../src/intercompany/model.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

// Uten automatiske nye forsøk: slim-deploy kjører uten --force, som Firebase krever for retry.
// Hver hendelse leser kilden på nytt, så neste endring retter et speil som ble stående.
const TRIGGER = { region: 'europe-west1', timeoutSeconds: 120, memory: '256MiB', retry: false };
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
// gRPC-koder og navn for feil som går over: avbrutt transaksjon, utilgjengelig, tidsavbrudd, kvote.
const TRANSIENT = new Set(['aborted', 'unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal', '10', '14', '4', '8', '13']);

function text(value) {
  return String(value ?? '').trim();
}

function clean(row) {
  return JSON.parse(JSON.stringify(row));
}

function tooOld(event) {
  const at = Date.parse(event?.time || '');
  return Number.isFinite(at) && Date.now() - at > MAX_EVENT_AGE_MS;
}

/** Forbigående feil kastes videre så hendelsen prøves igjen. Andre feil logges og droppes. */
function handle(error, context) {
  const code = String(error?.code ?? '').toLowerCase();
  if (TRANSIENT.has(code)) {
    logger.warn('intercompany mirror retry', { ...context, code, message: error?.message });
    throw error;
  }
  logger.error('intercompany mirror failed', { ...context, code, message: error?.message });
}

/** Avtalen og tildelingen for kopien, sett fra leverandøren. Null når den ikke hører til oss. */
async function cloneContext(supplierId, projectId, cache = new Map()) {
  const parsed = parseCloneProjectId(projectId);
  if (!parsed) return null;
  const key = `${parsed.linkId}|${parsed.ownerProjectId}`;
  if (cache.has(key)) return cache.get(key);
  const [linkSnap, allocSnap] = await Promise.all([
    db.doc(`intercompanyLinks/${parsed.linkId}`).get(),
    db.doc(`intercompanyLinks/${parsed.linkId}/projects/${parsed.ownerProjectId}`).get(),
  ]);
  let ctx = null;
  if (linkSnap.exists && allocSnap.exists) {
    const link = normalizeLink(linkSnap.data(), linkSnap.id);
    const view = linkView(link, supplierId);
    const alloc = allocSnap.data() || {};
    if (view && text(alloc.supplierCompanyId) === supplierId) {
      ctx = {
        link,
        active: link.status === LINK_STATUS.active,
        employees: new Set((Array.isArray(alloc.employees) ? alloc.employees : []).map((id) => text(id))),
        ownerId: text(alloc.ownerCompanyId),
        supplier: { id: supplierId, name: text(alloc.supplierCompanyName) || (link.parent.id === supplierId ? link.parent.name : link.child.name) },
        clone: {
          id: projectId,
          intercompany: {
            linkId: link.id,
            ownerProjectId: text(alloc.ownerProjectId),
            ownerProjectNumber: text(alloc.ownerProjectNumber),
            ownerProjectName: text(alloc.ownerProjectName),
          },
        },
      };
    }
  }
  cache.set(key, ctx);
  return ctx;
}

/** Leverandørens faktura (nummer og status) i transaksjonen, når raden er fakturert. */
async function invoiceIn(tx, supplierId, source) {
  const id = text(source?.invoiceId);
  if (!id || id.includes('/')) return null;
  const snap = await tx.get(db.doc(`families/${supplierId}/invoices/${id}`));
  return snap.exists ? snap.data() || null : null;
}

/**
 * Speil én føring for én kopi. Kilden leses i transaksjonen; står den nå på en annen kopi eller
 * er slettet, fjernes speilet. Nye speil krever aktiv avtale med timer og tildelt medarbeider.
 */
async function mirrorEntry({ supplierId, entryId, projectId }) {
  const ctx = await cloneContext(supplierId, projectId);
  if (!ctx || !ctx.ownerId) return;
  const hoursOn = normalizeLinkSettings(ctx.link.settings).hours.enabled;
  const sourceRef = db.doc(`families/${supplierId}/timeEntries/${entryId}`);
  const ref = db.doc(`families/${ctx.ownerId}/timeEntries/${mirrorId(supplierId, entryId)}`);
  await db.runTransaction(async (tx) => {
    const [sourceSnap, snap] = await Promise.all([tx.get(sourceRef), tx.get(ref)]);
    const fresh = sourceSnap.exists ? sourceSnap.data() || {} : null;
    const source = fresh && fresh.projectId === projectId ? { ...fresh, id: entryId } : null;
    const existing = snap.exists ? { id: snap.id, ...snap.data() } : null;
    if (source && !existing && (!ctx.active || !hoursOn || !ctx.employees.has(text(source.employeeId)))) return;
    const invoice = await invoiceIn(tx, supplierId, source);
    const out = mirrorTimeEntry({
      source,
      existing,
      invoice,
      clone: ctx.clone,
      supplier: ctx.supplier,
      ownerEmployeeId: externalEmployeeId(supplierId, source?.employeeId || existing?.intercompany?.sourceEmployeeId || ''),
    });
    if (out.action === 'delete') tx.delete(ref);
    if (out.action === 'set') {
      const row = { ...out.row };
      if (source?.employeeId) row.intercompany = { ...row.intercompany, sourceEmployeeId: text(source.employeeId) };
      tx.set(ref, clean(row));
    }
  });
}

export const onIcTimeEntryWritten = onDocumentWritten(
  { ...TRIGGER, document: 'families/{companyId}/timeEntries/{entryId}' },
  async (event) => {
    const supplierId = event.params.companyId;
    const entryId = event.params.entryId;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const projects = new Set([before?.projectId, after?.projectId].filter((id) => isCloneProjectId(id)));
    if (!projects.size) return;
    if (tooOld(event)) {
      logger.warn('intercompany hour event too old, dropped', { supplierId, entryId });
      return;
    }
    try {
      // Begge kopiene (før og etter en flytting): mirrorEntry ser selv hvor føringen står nå.
      for (const projectId of projects) await mirrorEntry({ supplierId, entryId, projectId });
    } catch (error) {
      handle(error, { supplierId, entryId });
    }
  },
);

function salesOf(snap) {
  if (!snap?.exists) return [];
  const data = snap.data() || {};
  const state = data.state && typeof data.state === 'object' ? data.state : data;
  return Array.isArray(state.sales) ? state.sales : [];
}

function expensesOf(snap) {
  if (!snap?.exists) return [];
  const data = snap.data() || {};
  const state = data.state && typeof data.state === 'object' ? data.state : data;
  return Array.isArray(state.expenses) ? state.expenses : [];
}

const KINDS = {
  sale: {
    collection: 'productSales',
    mirror: mirrorSale,
    wanted: (row, ctx) => salesToMirror([row], ctx.link.settings).length > 0,
  },
  expense: {
    collection: 'projectExpenses',
    mirror: mirrorExpense,
    wanted: (row) => expensesToMirror([row]).length > 0,
  },
};

/**
 * Speil én rad (salg eller utlegg). source er raden slik den er nå hos leverandøren, eller null
 * når den er slettet eller flyttet bort fra kopien.
 */
async function mirrorRow({ kind, supplierId, row, source, cache }) {
  const spec = KINDS[kind];
  const ctx = await cloneContext(supplierId, row.projectId, cache);
  if (!ctx || !ctx.ownerId) return;
  let current = source && source.projectId === row.projectId ? source : null;
  if (current && !spec.wanted(current, ctx)) current = null;
  const ref = db.doc(`families/${ctx.ownerId}/${spec.collection}/${mirrorId(supplierId, row.id)}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? { id: snap.id, ...snap.data() } : null;
    if (current && !existing && !ctx.active) return;
    const invoice = await invoiceIn(tx, supplierId, current);
    const out = spec.mirror({ source: current, existing, clone: ctx.clone, supplier: ctx.supplier, invoice });
    if (out.action === 'delete') tx.delete(ref);
    if (out.action === 'set') tx.set(ref, clean(out.row));
  });
}

/** Speil en liste endrede rader. Forbigående feil kastes etter at resten er skrevet. */
async function mirrorRows(kind, supplierId, rows, currentById) {
  const cache = new Map();
  const seen = new Set();
  let retry = null;
  for (const row of rows) {
    const key = `${row?.id}|${row?.projectId}`;
    if (!row?.id || seen.has(key)) continue;
    seen.add(key);
    try {
      await mirrorRow({ kind, supplierId, row, source: currentById.get(row.id) || null, cache });
    } catch (error) {
      try { handle(error, { supplierId, kind, id: row.id }); } catch (transient) { retry = transient; }
    }
  }
  if (retry) throw retry;
}

export const onIcProjectStateWritten = onDocumentWritten(
  { ...TRIGGER, document: 'families/{companyId}/projects/state' },
  async (event) => {
    const supplierId = event.params.companyId;
    const sales = diffCloneSales(salesOf(event.data?.before), salesOf(event.data?.after));
    const expenses = diffCloneSales(expensesOf(event.data?.before), expensesOf(event.data?.after));
    if (!sales.changed.length && !sales.removed.length && !expenses.changed.length && !expenses.removed.length) return;
    if (tooOld(event)) {
      logger.warn('intercompany state event too old, dropped', { supplierId });
      return;
    }
    // Listene slik de er nå, ikke slik hendelsen så dem (rekkefølgen er ikke sikker).
    let fresh;
    try {
      fresh = await db.doc(`families/${supplierId}/projects/state`).get();
    } catch (error) {
      handle(error, { supplierId });
      return;
    }
    const byId = (list) => new Map(list.map((row) => [row?.id, row]));
    let retry = null;
    for (const [kind, diff, current] of [
      ['sale', sales, byId(salesOf(fresh))],
      ['expense', expenses, byId(expensesOf(fresh))],
    ]) {
      try {
        await mirrorRows(kind, supplierId, [...diff.changed, ...diff.removed], current);
      } catch (error) {
        retry = error;
      }
    }
    if (retry) throw retry;
  },
);

/** Importerte utlegg i egen samling hos leverandøren (projectExpenses). */
export const onIcProjectExpenseWritten = onDocumentWritten(
  { ...TRIGGER, document: 'families/{companyId}/projectExpenses/{expenseId}' },
  async (event) => {
    const supplierId = event.params.companyId;
    const expenseId = event.params.expenseId;
    const before = event.data?.before?.exists ? { id: expenseId, ...event.data.before.data() } : null;
    const after = event.data?.after?.exists ? { id: expenseId, ...event.data.after.data() } : null;
    const rows = [before, after].filter((row) => row && isCloneProjectId(row.projectId));
    if (!rows.length || tooOld(event)) return;
    let current = null;
    try {
      const snap = await db.doc(`families/${supplierId}/projectExpenses/${expenseId}`).get();
      current = snap.exists ? { id: expenseId, ...snap.data() } : null;
    } catch (error) {
      handle(error, { supplierId, expenseId });
      return;
    }
    await mirrorRows('expense', supplierId, rows, new Map(current ? [[expenseId, current]] : []));
  },
);

/**
 * Leverandørens faktura til eier fikk nummer eller ny status: oppdater fakturaen på de speilede
 * timene, salgene og utleggene den gjelder, så eier ser hvilken faktura de belastes på.
 */
export const onIcInvoiceWritten = onDocumentWritten(
  { ...TRIGGER, document: 'families/{companyId}/invoices/{invoiceId}' },
  async (event) => {
    const supplierId = event.params.companyId;
    const invoiceId = event.params.invoiceId;
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    const projectId = text(after?.projectId || before?.projectId);
    if (!isCloneProjectId(projectId)) return;
    if (before && after && text(before.invoiceNumber) === text(after.invoiceNumber) && text(before.status) === text(after.status)) return;
    if (tooOld(event)) return;
    try {
      const entries = await db.collection(`families/${supplierId}/timeEntries`).where('invoiceId', '==', invoiceId).limit(2000).get();
      const projects = new Set();
      for (const doc of entries.docs) {
        const pid = text(doc.data()?.projectId);
        if (isCloneProjectId(pid)) await mirrorEntry({ supplierId, entryId: doc.id, projectId: pid });
        projects.add(pid);
      }
      const state = await db.doc(`families/${supplierId}/projects/state`).get();
      const sales = salesOf(state).filter((row) => text(row?.invoiceId) === invoiceId && isCloneProjectId(row.projectId));
      const expenses = expensesOf(state).filter((row) => text(row?.invoiceId) === invoiceId && isCloneProjectId(row.projectId));
      await mirrorRows('sale', supplierId, sales, new Map(sales.map((row) => [row.id, row])));
      await mirrorRows('expense', supplierId, expenses, new Map(expenses.map((row) => [row.id, row])));
    } catch (error) {
      handle(error, { supplierId, invoiceId });
    }
  },
);
