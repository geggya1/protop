/**
 * Speiling fra prosjektkopien hos leverandøren til prosjektet hos eier (se src/intercompany/model.js).
 *
 * - Timer: families/{leverandør}/timeEntries/{id} på en kopi (prosjekt-id prjic_…) skrives som
 *   families/{eier}/timeEntries/ic_{leverandør}_{id}. Godkjent hos leverandøren = til godkjenning hos eier.
 * - Salg og utleie: state.sales på kopien skrives som families/{eier}/productSales/ic_{leverandør}_{id}.
 *
 * Alt annet (vanlige prosjekter) slipper gjennom uten lesing.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
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

const TRIGGER = { region: 'europe-west1', timeoutSeconds: 60, memory: '256MiB', retry: false };

function text(value) {
  return String(value ?? '').trim();
}

function clean(row) {
  return JSON.parse(JSON.stringify(row));
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

async function mirrorEntry({ supplierId, entryId, source, projectId }) {
  const ctx = await cloneContext(supplierId, projectId);
  if (!ctx || !ctx.ownerId) return;
  if (source && !normalizeLinkSettings(ctx.link.settings).hours.enabled) return;
  const ref = db.doc(`families/${ctx.ownerId}/timeEntries/${mirrorId(supplierId, entryId)}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? { id: snap.id, ...snap.data() } : null;
    // Bare medarbeidere som er tildelt prosjektet. Føringer som allerede er speilet, følges videre.
    if (source && !existing && !ctx.employees.has(text(source.employeeId))) return;
    const out = mirrorTimeEntry({
      source: source ? { ...source, id: entryId } : null,
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
    const beforeClone = before && isCloneProjectId(before.projectId);
    const afterClone = after && isCloneProjectId(after.projectId);
    if (!beforeClone && !afterClone) return;
    try {
      // Flyttet bort fra kopien (eller slettet): fjern speilet på den gamle kopien.
      if (beforeClone && (!afterClone || before.projectId !== after.projectId)) {
        await mirrorEntry({ supplierId, entryId, source: null, projectId: before.projectId });
      }
      if (afterClone) await mirrorEntry({ supplierId, entryId, source: after, projectId: after.projectId });
    } catch (error) {
      logger.error('intercompany hour mirror failed', { supplierId, entryId, message: error?.message });
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
    const before = salesOf(event.data?.before);
    const after = salesOf(event.data?.after);
    const { changed, removed } = diffCloneSales(before, after);
    if (!changed.length && !removed.length) return;
    const cache = new Map();
    const jobs = [
      ...changed.map((row) => ({ row, source: row })),
      ...removed.map((row) => ({ row, source: null })),
    ];
    for (const job of jobs) {
      try {
        const ctx = await cloneContext(supplierId, job.row.projectId, cache);
        if (!ctx || !ctx.ownerId) continue;
        let source = job.source;
        if (source && !salesToMirror([source], ctx.link.settings).length) source = null;
        const ref = db.doc(`families/${ctx.ownerId}/productSales/${mirrorId(supplierId, job.row.id)}`);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const existing = snap.exists ? { id: snap.id, ...snap.data() } : null;
          const out = mirrorSale({ source, existing, clone: ctx.clone, supplier: ctx.supplier });
          if (out.action === 'delete') tx.delete(ref);
          if (out.action === 'set') tx.set(ref, clean(out.row));
        });
      } catch (error) {
        logger.error('intercompany sale mirror failed', { supplierId, saleId: job.row?.id, message: error?.message });
      }
    }
  },
);
