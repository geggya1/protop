/**
 * Kravmatrise, vurderinger og felles bevisregister (U07 / A02 / A13 / T18).
 *
 * Ett bevis (dokumentrevisjon, avvikssak, prosessinstans, skjema, revisjon …) lagres én gang
 * og kan kobles til mange krav. Hver kobling vurderes for seg.
 * «Internt verifisert» krever godkjent bevis + begrunnelse + navngitt vurderer.
 * Ingen status settes automatisk som oppfylt.
 */
import {
  addDays, auditEvent, bump, checksum, fail, isoDate, newId, nowIso, pushHistory, text, todayKey, uniq,
} from './core.js';
import {
  ASSESSMENT_STATUSES, REQUIREMENT_KINDS, assessmentLabel, isoRequirementLibrary, mayBeNotApplicable,
} from './catalog.js';

export function allRequirements(state) {
  const standards = state?.system?.standards?.length ? state.system.standards : [];
  const lib = isoRequirementLibrary(standards);
  const custom = (state?.requirements || []).filter((r) => !r.archived);
  return [...lib, ...custom];
}

export function requirementById(state, id) {
  return allRequirements(state).find((r) => r.id === id) || null;
}

export function createCustomRequirement(input, { actor, now = new Date() } = {}) {
  const kind = REQUIREMENT_KINDS.some((k) => k.id === input?.kind) ? input.kind : '';
  if (!kind || kind === 'iso') return fail('Velg kravtype (lov, kontrakt, internt eller anbefalt).');
  if (!text(input?.title)) return fail('Skriv kravets tittel.');
  if (kind === 'lov' && !text(input?.source)) return fail('Lovkrav må ha kilde (lov/forskrift og paragraf).');
  const row = bump({
    id: newId('krav'),
    kind,
    title: text(input.title, 300),
    clause: text(input.clause, 80),
    summary: text(input.summary, 3000),
    source: text(input.source, 1000),
    authority: text(input.authority, 200),
    customerName: text(input.customerName, 200),
    contractRef: text(input.contractRef, 200),
    areaKeys: uniq(input.areaKeys),
    module: text(input.module, 40) || 'lovkrav',
    reviewStatus: kind === 'lov' ? 'krever_juridisk_vurdering' : 'egendefinert',
    lastCheckedAt: isoDate(input.lastCheckedAt),
    createdAt: nowIso(now),
    history: pushHistory({}, 'Opprettet', actor, '', now),
    rev: 0,
  }, actor, now);
  return { ok: true, requirement: row, events: [auditEvent({ entityType: 'requirement', entityId: row.id, action: 'iso.requirement.created', actor, after: row, now })] };
}

export function assessmentFor(state, requirementId) {
  return (state?.assessments || []).find((a) => a.requirementId === requirementId) || null;
}

export function linksFor(state, requirementId) {
  return (state?.evidenceLinks || []).filter((l) => l.requirementId === requirementId && l.reviewState !== 'fjernet');
}

/** Effektiv status: forfalt vurdering vises som «Må revurderes», aldri som oppfylt. */
export function effectiveStatus(state, requirementId, now = new Date()) {
  const a = assessmentFor(state, requirementId);
  if (!a) return 'ikke_vurdert';
  if (a.status === 'internt_verifisert' && a.nextReview && a.nextReview < todayKey(now)) return 'ma_revurderes';
  return a.status || 'ikke_vurdert';
}

/** Status som tekst (bevispakke, eksport): effektiv status, og utløpt «internt verifisert» vises som utløpt. */
export function statusText(state, requirementId, now = new Date()) {
  const a = assessmentFor(state, requirementId);
  const status = effectiveStatus(state, requirementId, now);
  if (a?.status === 'internt_verifisert' && status === 'ma_revurderes') {
    const [y, m, d] = String(a.nextReview || '').slice(0, 10).split('-');
    return `${assessmentLabel(status)} (verifisering utløpt${d ? ` ${d}.${m}.${y}` : ''})`;
  }
  return assessmentLabel(status);
}

/**
 * Lagrer bevis én gang (dedupe på type + objekt + revisjon) og kobler det til flere krav.
 * Returnerer nye/oppdaterte lister.
 */
export function attachEvidence(state, input, requirementIds, { actor, now = new Date() } = {}) {
  const type = text(input?.type, 40);
  const objectId = text(input?.objectId, 160);
  if (!type || !objectId) return fail('Beviset mangler type eller objekt.');
  const ids = uniq(requirementIds);
  if (!ids.length) return fail('Velg minst ett krav.');
  const revision = text(input?.objectRevision ?? '', 40);
  // Skjermede saker: beviset er synlig for alle med lesetilgang, så det får ingen detaljer.
  const label = input?.restricted ? 'Skjermet sak (detaljer bare for særskilt autoriserte)' : text(input?.label, 300);
  const evidence = [...(state?.evidence || [])];
  let row = evidence.find((e) => e.type === type && e.objectId === objectId && String(e.objectRevision || '') === revision);
  const events = [];
  if (!row) {
    row = {
      id: newId('bev'),
      type,
      objectId,
      objectRevision: revision,
      label,
      classification: input?.restricted ? 'skjermet' : 'intern',
      validTo: isoDate(input.validTo),
      createdAt: nowIso(now),
      createdBy: text(actor?.name, 160),
      hash: checksum({ type, objectId, revision, label }),
    };
    evidence.push(row);
    events.push(auditEvent({ entityType: 'evidence', entityId: row.id, action: 'iso.evidence.created', actor, after: row, now }));
  }
  const links = [...(state?.evidenceLinks || [])];
  for (const requirementId of ids) {
    const exists = links.find((l) => l.evidenceId === row.id && l.requirementId === requirementId && l.reviewState !== 'fjernet');
    if (exists) continue;
    const link = {
      id: newId('lnk'),
      evidenceId: row.id,
      requirementId,
      reviewState: 'til_vurdering',
      note: text(input.note, 1000),
      createdAt: nowIso(now),
      createdBy: text(actor?.name, 160),
    };
    links.push(link);
    events.push(auditEvent({ entityType: 'evidenceLink', entityId: link.id, action: 'iso.evidence.linked', actor, after: link, now }));
  }
  // En kobling gjør at et uvurdert krav får «Bevis tilgjengelig», ikke «oppfylt».
  let assessments = [...(state?.assessments || [])];
  for (const requirementId of ids) {
    const current = assessments.find((a) => a.requirementId === requirementId);
    if (!current) {
      assessments.push(bump({
        id: newId('vrd'),
        requirementId,
        status: 'dokumentert',
        relevance: 'relevant',
        rationale: '',
        history: pushHistory({}, 'Bevis koblet', actor, row.label, now),
        rev: 0,
      }, actor, now));
    } else if (['ikke_vurdert', 'mangler'].includes(current.status)) {
      assessments = assessments.map((a) => (a.requirementId === requirementId ? bump({
        ...a,
        status: 'dokumentert',
        history: pushHistory(a, 'Bevis koblet', actor, row.label, now),
      }, actor, now) : a));
    }
  }
  return { ok: true, evidence, evidenceLinks: links, assessments, evidenceRow: row, events };
}

export function reviewEvidenceLink(state, linkId, input, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å vurdere bevis.');
  const links = [...(state?.evidenceLinks || [])];
  const idx = links.findIndex((l) => l.id === linkId);
  if (idx < 0) return fail('Fant ikke koblingen.');
  const decision = input?.decision;
  if (!['godkjent', 'avvist', 'fjernet'].includes(decision)) return fail('Velg vurdering.');
  if (decision !== 'godkjent' && !text(input?.note)) return fail('Skriv hvorfor beviset ikke godtas.');
  const before = links[idx];
  links[idx] = {
    ...before,
    reviewState: decision,
    reviewNote: text(input?.note, 1000),
    reviewedAt: nowIso(now),
    reviewedBy: text(actor?.name, 160),
  };
  return {
    ok: true,
    evidenceLinks: links,
    events: [auditEvent({ entityType: 'evidenceLink', entityId: linkId, action: `iso.evidence.${decision}`, actor, before, after: links[idx], now })],
  };
}

export function setAssessment(state, requirementId, input, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å vurdere krav.');
  const req = requirementById(state, requirementId);
  if (!req) return fail('Fant ikke kravet.');
  const status = input?.status;
  if (!ASSESSMENT_STATUSES.some((s) => s.id === status)) return fail('Velg status.');
  const rationale = text(input?.rationale, 4000);
  if (status === 'internt_verifisert') {
    const approved = linksFor(state, requirementId).filter((l) => l.reviewState === 'godkjent');
    if (!approved.length) return fail('Internt verifisert krever minst ett vurdert og godkjent bevis.');
    if (rationale.length < 15) return fail('Begrunn vurderingen: hva er kontrollert, og mot hvilket bevis?');
  }
  if (status === 'ikke_relevant') {
    if (!mayBeNotApplicable(req)) return fail('Dette kravet kan ikke settes som ikke relevant. Krav i ISO 14001/45001 og ISO 9001 kap. 4–7, 9–10 gjelder alltid innenfor omfanget.');
    if (caps && !caps.approve) return fail('Ikke-relevans må godkjennes av en godkjenner.');
    if (rationale.length < 15) return fail('Begrunn hvorfor kravet ikke er relevant.');
  }
  if (['mangler', 'avvik', 'ma_revurderes'].includes(status) && !rationale) {
    return fail('Skriv en kort merknad om hva som mangler.');
  }
  const assessments = [...(state?.assessments || [])];
  const idx = assessments.findIndex((a) => a.requirementId === requirementId);
  const before = idx >= 0 ? assessments[idx] : null;
  const nextReview = isoDate(input?.nextReview) || (status === 'internt_verifisert' ? addDays(todayKey(now), 365) : (before?.nextReview || ''));
  const row = bump({
    ...(before || { id: newId('vrd'), requirementId, rev: 0 }),
    status,
    relevance: status === 'ikke_relevant' ? 'ikke_relevant' : 'relevant',
    rationale,
    ownerName: text(input?.ownerName, 160) || before?.ownerName || '',
    ownerUid: text(input?.ownerUid, 128) || before?.ownerUid || '',
    assessedAt: nowIso(now),
    assessedBy: text(actor?.name, 160),
    assessedByUid: text(actor?.uid, 128),
    nextReview,
    history: pushHistory(before || {}, `Status: ${status}`, actor, rationale, now),
  }, actor, now);
  if (idx >= 0) assessments[idx] = row; else assessments.push(row);
  return {
    ok: true,
    assessments,
    assessment: row,
    events: [auditEvent({ entityType: 'assessment', entityId: row.id, action: 'iso.requirement.assessed', actor, before, after: row, now })],
  };
}

/** Flagg krav for ny vurdering (scope-endring, dokument-/prosessendring, lovendring). */
export function markForReassessment(state, requirementIds, reason, { actor, now = new Date() } = {}) {
  const ids = new Set(uniq(requirementIds));
  const events = [];
  const assessments = (state?.assessments || []).map((a) => {
    if (!ids.has(a.requirementId)) return a;
    if (['ikke_vurdert', 'ma_revurderes'].includes(a.status)) return a;
    const next = bump({ ...a, status: 'ma_revurderes', history: pushHistory(a, 'Må revurderes', actor, reason, now) }, actor, now);
    events.push(auditEvent({ entityType: 'assessment', entityId: a.id, action: 'iso.requirement.reassessment', actor, before: a, after: next, reason, now }));
    return next;
  });
  return { ok: true, assessments, events };
}

export function matrixRows(state, { standard = '', kind = '', status = '', search = '', onlyNoEvidence = false, onlyOverdue = false } = {}, now = new Date()) {
  const q = text(search).toLowerCase();
  const today = todayKey(now);
  return allRequirements(state)
    .map((req) => {
      const a = assessmentFor(state, req.id);
      const links = linksFor(state, req.id);
      return {
        ...req,
        status: effectiveStatus(state, req.id, now),
        ownerName: a?.ownerName || '',
        assessedAt: a?.assessedAt || '',
        assessedBy: a?.assessedBy || '',
        nextReview: a?.nextReview || '',
        rationale: a?.rationale || '',
        evidenceCount: links.length,
        approvedEvidence: links.filter((l) => l.reviewState === 'godkjent').length,
        overdue: !!(a?.nextReview && a.nextReview < today),
      };
    })
    .filter((row) => !standard || row.standard === standard)
    .filter((row) => !kind || row.kind === kind)
    .filter((row) => !status || row.status === status)
    .filter((row) => !onlyNoEvidence || row.evidenceCount === 0)
    .filter((row) => !onlyOverdue || row.overdue)
    .filter((row) => !q || `${row.clause} ${row.title} ${row.summary} ${row.source || ''}`.toLowerCase().includes(q))
    .sort((a, b) => groupOrder(a) - groupOrder(b) || clauseOrder(a.clause, b.clause) || String(a.title).localeCompare(String(b.title)));
}

const GROUP = ['ISO9001', 'ISO14001', 'ISO45001', 'lov', 'kontrakt', 'intern', 'anbefalt'];
function groupOrder(row) {
  const i = GROUP.indexOf(row.kind === 'iso' ? row.standard : row.kind);
  return i < 0 ? 99 : i;
}

function clauseOrder(a, b) {
  const pa = String(a || '').split(/[.–-]/).map((n) => Number(n) || 0);
  const pb = String(b || '').split(/[.–-]/).map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function statusCounts(rows) {
  const counts = Object.fromEntries(ASSESSMENT_STATUSES.map((s) => [s.id, 0]));
  for (const row of rows || []) counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}

/** Krav som berøres av et kravområde (brukes for automatisk kobling fra moduler). */
export function requirementIdsForArea(state, areaKey) {
  return allRequirements(state).filter((r) => r.areaKey === areaKey || (r.areaKeys || []).includes(areaKey)).map((r) => r.id);
}
