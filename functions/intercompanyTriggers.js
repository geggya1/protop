/**
 * Speiling fra prosjektkopien hos leverandøren til prosjektet hos eier (se src/intercompany/model.js).
 *
 * - Timer: families/{leverandør}/timeEntries/{id} på en kopi (prosjekt-id prjic_…) skrives som
 *   families/{eier}/timeEntries/ic_{leverandør}_{id}. Godkjent hos leverandøren = til godkjenning hos eier.
 * - Salg og utleie: state.sales på kopien skrives som families/{eier}/productSales/ic_{leverandør}_{id}.
 *
 * Hendelser kan komme i feil rekkefølge, så kilden leses på nytt: speilet blir alltid som kilden
 * er nå, uansett hvilken hendelse som kom sist. Forbigående feil prøves på nytt (retry), og
 * hendelser eldre enn et døgn droppes. Alt annet (vanlige prosjekter) slipper gjennom uten lesing.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  LINK_STATUS,
  diffCloneSales,
  externalEmployeeId,
  isCloneProjectId,
  linkView,
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

const TRIGGER = { region: 'europe-west1', timeoutSeconds: 120, memory: '256MiB', retry: true };
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
    const out = mirrorTimeEntry({
      source,
      existing,
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

export const onIcProjectStateWritten = onDocumentWritten(
  { ...TRIGGER, document: 'families/{companyId}/projects/state' },
  async (event) => {
    const supplierId = event.params.companyId;
    const { changed, removed } = diffCloneSales(salesOf(event.data?.before), salesOf(event.data?.after));
    if (!changed.length && !removed.length) return;
    if (tooOld(event)) {
      logger.warn('intercompany sale event too old, dropped', { supplierId });
      return;
    }
    // Salgslisten slik den er nå, ikke slik hendelsen så den (rekkefølgen er ikke sikker).
    let current;
    try {
      current = new Map(salesOf(await db.doc(`families/${supplierId}/projects/state`).get()).map((row) => [row?.id, row]));
    } catch (error) {
      handle(error, { supplierId });
      return;
    }
    const cache = new Map();
    const seen = new Set();
    let retry = null;
    for (const row of [...changed, ...removed]) {
      const key = `${row?.id}|${row?.projectId}`;
      if (!row?.id || seen.has(key)) continue;
      seen.add(key);
      try {
        const ctx = await cloneContext(supplierId, row.projectId, cache);
        if (!ctx || !ctx.ownerId) continue;
        const now = current.get(row.id);
        let source = now && now.projectId === row.projectId ? now : null;
        if (source && !salesToMirror([source], ctx.link.settings).length) source = null;
        const ref = db.doc(`families/${ctx.ownerId}/productSales/${mirrorId(supplierId, row.id)}`);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const existing = snap.exists ? { id: snap.id, ...snap.data() } : null;
          if (source && !existing && !ctx.active) return;
          const out = mirrorSale({ source, existing, clone: ctx.clone, supplier: ctx.supplier });
          if (out.action === 'delete') tx.delete(ref);
          if (out.action === 'set') tx.set(ref, clean(out.row));
        });
      } catch (error) {
        // Resten av salgene skrives først; så prøves hele hendelsen igjen (idempotent).
        try { handle(error, { supplierId, saleId: row.id }); } catch (transient) { retry = transient; }
      }
    }
    if (retry) throw retry;
  },
);
