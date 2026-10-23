/**
 * Startpakke ved aktivering: alt som kan genereres automatisk, opprettes med én gang.
 * Idempotent – det som finnes fra før, hoppes over.
 */
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { saveFormTemplate, normalizeFormTemplates } from '../../src/anbud/bidLibrary';
import { NORWEGIAN_OBLIGATIONS } from '../../src/iso/catalog';
import { approveTemplate, builderTemplateFromIso, formTemplateByKey, recommendedFormKeys, templateIdFor } from '../../src/iso/forms';
import { approveAndPublish, createProcess, submitForApproval } from '../../src/iso/processes';
import { templateByKey } from '../../src/iso/processTemplates';
import { createCustomRequirement } from '../../src/iso/requirements';
import { createDocument } from '../../src/iso/documents';
import { createRecord } from '../../src/iso/registers';
import {
  deviationRoutineDraft, policyDraft, requirementIdsForDocument, starterPlan,
} from '../../src/iso/integrations';

export const STARTER_OPTIONS = [
  { id: 'forms', label: 'Installer anbefalte ISO-skjema i Skjemabygger og godkjenn dem som styrte skjema' },
  { id: 'processes', label: 'Opprett og publiser standardprosesser (avvik, dokument, revisjon, ledelse, risiko, kunde …)' },
  { id: 'obligations', label: 'Legg inn norske lovkrav til vurdering (internkontroll, arbeidsmiljø, forurensning …)' },
  { id: 'documents', label: 'Lag utkast til policy og avviksrutine ut fra omfanget' },
  { id: 'plan', label: 'Planlegg internrevisjon per standard og ledelsens gjennomgang i år' },
];

export async function runStarterKit({ companyId, state, store, actor, caps, options }) {
  const log = [];
  const system = state.system;
  const plan = starterPlan(system);
  let forms = [...(state.forms || [])];

  if (options.forms) {
    const keys = recommendedFormKeys(system.standards);
    let anbud = await loadAnbudState(companyId);
    let changed = false;
    for (const key of keys) {
      const iso = formTemplateByKey(key);
      if (!iso) continue;
      const id = templateIdFor(key);
      if (normalizeFormTemplates(anbud.formTemplates).some((t) => t.id === id)) continue;
      const res = saveFormTemplate(anbud, builderTemplateFromIso(iso));
      if (res.ok) { anbud = res.state; changed = true; }
    }
    if (changed) anbud = await saveAnbudState(anbud, companyId);
    const templates = normalizeFormTemplates(anbud.formTemplates);
    let approved = 0;
    for (const key of keys) {
      const tpl = templates.find((t) => t.id === templateIdFor(key));
      if (!tpl) continue;
      const control = forms.find((f) => f.templateId === tpl.id) || null;
      if (control?.publishedVersion) continue;
      const res = approveTemplate(control, tpl, { actor, caps, note: 'Godkjent ved aktivering av ledelsessystemet', templateKey: key });
      if (!res.ok) continue;
      const saved = await store.commit('forms', 'form', res, { previous: control });
      if (saved.ok) { forms = [...forms.filter((f) => f.id !== res.form.id), res.form]; approved += 1; }
    }
    log.push(`${approved} skjema lagt i Skjemabygger og godkjent som styrte skjema.`);
  }

  const processes = [...(state.processes || [])];
  if (options.processes) {
    let published = 0;
    let drafts = 0;
    for (const key of plan.processes) {
      if (processes.some((p) => p.templateKey === key && !p.archived)) continue;
      const template = templateByKey(key);
      if (!template) continue;
      const owner = system.roleMap?.quality_manager || system.roleMap?.system_owner || { name: system.ownerName, uid: system.ownerUid };
      let res = createProcess({ title: template.title, ownerName: owner?.name || actor.name, ownerUid: owner?.uid || actor.uid, category: template.category }, { actor, template });
      if (!res.ok) continue;
      let proc = res.process;
      const context = { forms, documents: state.documents, processes };
      const sub = submitForApproval(proc, context, { actor, caps });
      if (sub.ok) {
        const pub = approveAndPublish(sub.process, context, { actor, caps, note: 'Standardprosess godkjent ved aktivering' });
        if (pub.ok) { proc = pub.process; res = { ...res, events: [...res.events, ...sub.events, ...pub.events] }; }
      }
      const saved = await store.commit('processes', 'process', { ...res, process: proc });
      if (saved.ok) {
        processes.push(proc);
        if (proc.publishedVersion) published += 1; else drafts += 1;
      }
    }
    log.push(`${published} prosesser publisert${drafts ? `, ${drafts} lagt som utkast (må fullføres)` : ''}.`);
  }

  if (options.obligations) {
    let added = 0;
    const have = new Set((state.requirements || []).map((r) => r.templateKey).filter(Boolean));
    for (const key of plan.obligations) {
      if (have.has(key)) continue;
      const o = NORWEGIAN_OBLIGATIONS.find((x) => x.key === key);
      const res = createCustomRequirement({ kind: 'lov', title: o.title, summary: o.summary, source: o.source, authority: o.authority, areaKeys: o.areaKeys }, { actor });
      if (!res.ok) continue;
      const saved = await store.commit('requirements', 'requirement', { ...res, requirement: { ...res.requirement, templateKey: key } });
      if (saved.ok) added += 1;
    }
    log.push(`${added} lovkrav lagt inn til vurdering.`);
  }

  if (options.documents) {
    const docs = [...(state.documents || [])];
    const owner = system.roleMap?.top_management || { name: system.ownerName, uid: system.ownerUid };
    const avvik = processes.find((p) => p.templateKey === 'P02_avvik');
    const wanted = [
      { key: 'policy', title: 'Policy for kvalitet, miljø og arbeidsmiljø', docType: 'policy', content: policyDraft(system), readAckRequired: true, ownerName: owner?.name || actor.name, ownerUid: owner?.uid || '' },
      { key: 'avviksrutine', title: 'Rutine for avvik og forbedring', docType: 'prosedyre', content: deviationRoutineDraft(), readAckRequired: true, ownerName: system.roleMap?.quality_manager?.name || actor.name, processIds: avvik ? [avvik.id] : [] },
    ];
    let made = 0;
    for (const w of wanted) {
      if (docs.some((d) => d.templateKey === w.key && !d.archived)) continue;
      const res = createDocument({ ...w, requirementIds: requirementIdsForDocument(state, w.docType) }, { actor, existing: docs });
      if (!res.ok) continue;
      const doc = { ...res.document, templateKey: w.key };
      const saved = await store.commit('documents', 'document', { ...res, document: doc });
      if (saved.ok) { docs.push(doc); made += 1; }
    }
    log.push(`${made} dokumentutkast laget (må godkjennes).`);
  }

  if (options.plan) {
    const audits = [...(state.records?.revisjon || [])];
    const auditor = system.roleMap?.internal_auditor || system.roleMap?.quality_manager || { name: actor.name, uid: actor.uid };
    let planned = 0;
    if (!audits.length) {
      for (const a of plan.audits) {
        const res = createRecord('revisjon', { ...a, scope: system.scopeText || 'Hele ledelsessystemet', criteria: `${a.standards?.[0] || 'ISO'}, egne prosesser og lovkrav`, auditorName: auditor.name, auditorUid: auditor.uid, independence: true, riskBasis: 'Første revisjonsprogram etter aktivering. Juster frekvens etter risiko og resultater.' }, { actor, existing: audits });
        if (!res.ok) continue;
        const saved = await store.commit('records', 'record', res);
        if (saved.ok) { audits.push(res.record); planned += 1; }
      }
    }
    const reviews = state.records?.ledelse || [];
    if (!reviews.some((r) => String(r.period) === plan.review.period)) {
      const res = createRecord('ledelse', { ...plan.review, participants: system.roleMap?.top_management?.name ? `${system.roleMap.top_management.name} og ledergruppen` : 'Ledergruppen' }, { actor, existing: reviews });
      if (res.ok && (await store.commit('records', 'record', res)).ok) planned += 1;
    }
    log.push(`${planned} revisjoner og gjennomganger planlagt.`);
  }
  return log;
}
