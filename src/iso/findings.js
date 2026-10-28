/**
 * Avvik, hendelser og korrigerende tiltak (P02 / SF16–SF18).
 *
 * Én kjernemotor for alle typer. Flyt:
 *   registrert → triage → vurdert → tiltak → effektkontroll → lukket
 * Gjenåpning ved manglende effekt går tilbake til «vurdert». Lukking avvises
 * hvis påkrevd tiltak, bevis eller effektverifikasjon mangler (A07 / T10).
 * Alle funksjoner er rene: de returnerer nytt objekt + revisjonshendelser.
 */
import {
  addDays, auditEvent, bump, fail, isoDate, newId, nextNumber, nowIso, pushHistory, text, todayKey, uniq,
} from './core.js';
import { FINDING_TYPES, INJURY_CLASSES, SEVERITIES, findingDomain, seriousInjury } from './catalog.js';

const OPEN_ACTION = new Set(['apen', 'pagar', 'til_verifisering', 'returnert']);

/** Personskade, nestenulykke og miljøhendelse: årsaken vurderes alltid (ISO 45001 10.2 b). */
export const HSE_FINDING_TYPES = ['hms', 'nestenulykke', 'miljo'];

function result(before, after, action, actor, now, reason = '') {
  return {
    ok: true,
    finding: after,
    events: [auditEvent({ entityType: 'finding', entityId: after.id, action, actor, before, after, reason, now })],
  };
}

/**
 * Skjermet som standard: personskade/HMS-hendelse og varsling av kritikkverdige forhold (aml kap. 2 A).
 * Nestenulykke og miljø er ikke skjermet uten valg.
 */
export function defaultRestricted(type) {
  return type === 'hms' || type === 'varsling';
}

export function validateNewFinding(input) {
  const errors = [];
  if (!text(input?.title)) errors.push('Skriv en kort tittel.');
  if (!text(input?.description)) errors.push('Beskriv hva som skjedde eller hva som er observert.');
  if (!FINDING_TYPES.some((row) => row.id === input?.type)) errors.push('Velg type.');
  if (input?.occurredAt && !isoDate(input.occurredAt)) errors.push('Ugyldig dato.');
  if (input?.authorityNotificationRequired && !text(input?.notificationAssignee)) {
    errors.push('Velg hvem som sørger for varsling til myndighet.');
  }
  return errors;
}

/**
 * Triage samme dag: kritisk alvorlighet, mulig meldeplikt eller alvorlig personskade/dødsfall.
 * Ellers tre dager (rutinen for avvik).
 */
export function urgentTriage(input) {
  return input?.severity === 'kritisk' || !!input?.authorityNotificationRequired || seriousInjury(input?.injuryClass);
}

/** Oppgaven til den som sørger for varsling til myndighet. Nøkkelen følger personen, så ny ansvarlig får egen oppgave. */
export function notificationTaskKey(finding) {
  const uid = text(finding?.notificationAssigneeUid, 128);
  return finding?.id && uid ? `iso_${finding.id}_varsling_${uid}` : '';
}

export function createFinding(input, { actor, existing = [], now = new Date() } = {}) {
  const errors = validateNewFinding(input);
  if (errors.length) return fail(errors[0], { errors });
  const type = input.type;
  const restricted = input.restricted == null ? defaultRestricted(type) : !!input.restricted;
  const today = todayKey(now);
  const base = {
    id: newId('avv'),
    number: nextNumber('AVV', existing, now),
    type,
    domain: findingDomain(type),
    title: text(input.title, 200),
    description: text(input.description, 6000),
    occurredAt: isoDate(input.occurredAt) || today,
    reportedAt: nowIso(now),
    reportedBy: text(actor?.name, 160),
    reportedByUid: text(actor?.uid, 128),
    projectId: text(input.projectId, 120),
    projectName: text(input.projectName, 200),
    location: text(input.location, 300),
    actualConsequence: text(input.actualConsequence, 2000),
    potentialConsequence: text(input.potentialConsequence, 2000),
    immediateAction: text(input.immediateAction, 2000),
    severity: SEVERITIES.some((s) => s.id === input.severity) ? input.severity : '',
    injuryClass: INJURY_CLASSES.some((c) => c.id === input.injuryClass) ? input.injuryClass : '',
    restricted,
    personalDetails: restricted ? text(input.personalDetails, 4000) : '',
    customerImpact: text(input.customerImpact, 1000),
    deliverableRef: text(input.deliverableRef, 200),
    environmentalMedium: text(input.environmentalMedium, 200),
    authorityNotificationRequired: !!input.authorityNotificationRequired,
    notificationAssignee: text(input.notificationAssignee, 160),
    notificationAssigneeUid: input.authorityNotificationRequired ? text(input.notificationAssigneeUid, 128) : '',
    notificationDue: isoDate(input.notificationDue) || (input.authorityNotificationRequired ? today : ''),
    notificationDone: false,
    assigneeUid: text(input.assigneeUid, 128),
    assigneeName: text(input.assigneeName, 160),
    triageDue: addDays(today, urgentTriage(input) ? 0 : 3),
    dueAt: isoDate(input.dueAt) || '',
    state: 'registrert',
    triage: null,
    assessment: null,
    rootCause: null,
    actions: [],
    effect: { required: false, outcome: '', checks: [] },
    links: {
      requirementIds: uniq(input.requirementIds),
      processId: text(input.processId, 120),
      processInstanceId: text(input.processInstanceId, 120),
      documentIds: uniq(input.documentIds),
      riskIds: uniq(input.riskIds),
      auditId: text(input.auditId, 120),
      auditFindingRef: text(input.auditFindingRef, 120),
    },
    sourceRef: input.sourceRef?.id ? { module: text(input.sourceRef.module, 60), id: text(input.sourceRef.id, 120) } : null,
    formKey: 'SF16_AVVIK',
    formVersion: '1.0',
    createdAt: nowIso(now),
    rev: 0,
  };
  const created = bump({ ...base, history: pushHistory(base, 'Registrert', actor, '', now) }, actor, now);
  return {
    ok: true,
    finding: created,
    events: [auditEvent({ entityType: 'finding', entityId: created.id, action: 'iso.finding.created', actor, after: created, now })],
  };
}

export function triageFinding(finding, input, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  if (!['registrert', 'triage'].includes(finding.state)) return fail('Saken er allerede vurdert.');
  if (!SEVERITIES.some((s) => s.id === input?.severity)) return fail('Velg alvorlighet.');
  if (!text(input?.assigneeName) && !text(finding.assigneeName)) return fail('Velg ansvarlig for videre behandling.');
  if (input?.urgent && !text(input?.immediateAction) && !text(finding.immediateAction)) {
    return fail('Akutt fare: beskriv strakstiltak før saken går videre.');
  }
  const notifiable = input.notifiable == null ? !!finding.authorityNotificationRequired : !!input.notifiable;
  const next = bump({
    ...finding,
    severity: input.severity,
    assigneeUid: text(input.assigneeUid, 128) || finding.assigneeUid,
    assigneeName: text(input.assigneeName, 160) || finding.assigneeName,
    immediateAction: text(input.immediateAction, 2000) || finding.immediateAction,
    authorityNotificationRequired: notifiable,
    notificationAssignee: text(input.notificationAssignee, 160) || finding.notificationAssignee,
    // Ny person valgt: uid følger navnet (tom hvis personen ikke har innlogging).
    notificationAssigneeUid: text(input.notificationAssignee, 160) && text(input.notificationAssignee, 160) !== finding.notificationAssignee
      ? text(input.notificationAssigneeUid, 128)
      : (text(input.notificationAssigneeUid, 128) || finding.notificationAssigneeUid || ''),
    notificationDue: isoDate(input.notificationDue) || finding.notificationDue || (notifiable ? todayKey(now) : ''),
    injuryClass: INJURY_CLASSES.some((c) => c.id === input.injuryClass) ? input.injuryClass : (finding.injuryClass || ''),
    dueAt: isoDate(input.dueAt) || finding.dueAt || addDays(todayKey(now), input.severity === 'kritisk' ? 7 : 30),
    triage: {
      severity: input.severity,
      urgent: !!input.urgent,
      affected: text(input.affected, 1000),
      note: text(input.note, 2000),
      at: nowIso(now),
      by: text(actor?.name, 160),
    },
    state: 'triage',
    history: pushHistory(finding, 'Triagert', actor, text(input.note), now),
  }, actor, now);
  if (next.authorityNotificationRequired && !text(next.notificationAssignee)) {
    return fail('Mulig meldeplikt: velg hvem som varsler myndighet.');
  }
  return result(finding, next, 'iso.finding.triaged', actor, now);
}

/**
 * Tiltaksbeslutning. Uten korrigerende tiltak kreves begrunnelse (lukking krever i tillegg godkjenning).
 */
export function assessFinding(finding, input, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  if (!['triage', 'vurdert'].includes(finding.state)) return fail('Saken må triageres før vurdering.');
  const required = input?.correctiveRequired;
  if (required !== true && required !== false) return fail('Velg om korrigerende tiltak er nødvendig.');
  if (required === false && text(input?.rationale).length < 10) {
    return fail('Begrunn hvorfor korrigerende tiltak ikke er nødvendig (minst én setning).');
  }
  const next = bump({
    ...finding,
    assessment: {
      correctiveRequired: required,
      rationale: text(input.rationale, 3000),
      correction: text(input.correction, 3000),
      at: nowIso(now),
      by: text(actor?.name, 160),
    },
    effect: { ...(finding.effect || {}), required: required === true, checks: finding.effect?.checks || [] },
    state: required ? (finding.actions?.length ? 'tiltak' : 'vurdert') : 'vurdert',
    history: pushHistory(finding, required ? 'Korrigerende tiltak besluttet' : 'Ingen korrigerende tiltak (begrunnet)', actor, text(input.rationale), now),
  }, actor, now);
  return result(finding, next, 'iso.finding.assessed', actor, now);
}

export function recordRootCause(finding, input, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  if (['lukket', 'kansellert'].includes(finding.state)) return fail('Saken er avsluttet.');
  const whys = (input?.whys || []).map((w) => text(w, 500)).filter(Boolean).slice(0, 5);
  const systemCause = text(input?.systemCause, 2000);
  if (!systemCause && !whys.length) return fail('Beskriv årsaken (fritekst eller 5 × hvorfor).');
  const next = bump({
    ...finding,
    rootCause: {
      method: ['5whys', 'fiskebein', 'fritekst'].includes(input?.method) ? input.method : (whys.length ? '5whys' : 'fritekst'),
      whys,
      categories: uniq(input?.categories),
      systemCause,
      similar: text(input?.similar, 1000),
      at: nowIso(now),
      by: text(actor?.name, 160),
    },
    history: pushHistory(finding, 'Årsak registrert', actor, systemCause, now),
  }, actor, now);
  return result(finding, next, 'iso.finding.rootcause', actor, now);
}

export function addAction(finding, input, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  if (['lukket', 'kansellert', 'registrert'].includes(finding.state)) {
    return fail(finding.state === 'registrert' ? 'Triager saken før tiltak legges til.' : 'Saken er avsluttet.');
  }
  if (!text(input?.title)) return fail('Beskriv tiltaket.');
  if (!text(input?.ownerName)) return fail('Velg ansvarlig for tiltaket.');
  const due = isoDate(input?.dueAt);
  if (!due) return fail('Sett frist for tiltaket.');
  const action = {
    id: newId('tlt'),
    title: text(input.title, 300),
    description: text(input.description, 3000),
    type: ['korreksjon', 'korrigerende', 'forebyggende'].includes(input.type) ? input.type : 'korrigerende',
    ownerUid: text(input.ownerUid, 128),
    ownerName: text(input.ownerName, 160),
    dueAt: due,
    requiredEvidence: text(input.requiredEvidence, 500),
    state: 'apen',
    createdAt: nowIso(now),
    taskKey: '',
    taskId: '',
    evidence: [],
  };
  action.taskKey = `iso_${finding.id}_${action.id}`;
  const actions = [...(finding.actions || []), action];
  const next = bump({
    ...finding,
    actions,
    effect: { ...(finding.effect || {}), required: finding.effect?.required || action.type !== 'korreksjon' },
    state: finding.state === 'effektkontroll' ? 'tiltak' : (['triage', 'vurdert'].includes(finding.state) ? 'tiltak' : finding.state),
    history: pushHistory(finding, 'Tiltak lagt til', actor, `${action.title} · ${action.ownerName} · frist ${action.dueAt}`, now),
  }, actor, now);
  return { ...result(finding, next, 'iso.action.created', actor, now), action };
}

function replaceAction(finding, actionId, patch) {
  return (finding.actions || []).map((row) => (row.id === actionId ? { ...row, ...patch } : row));
}

function allActionsDone(actions) {
  const live = (actions || []).filter((a) => a.state !== 'kansellert');
  return live.length > 0 && live.every((a) => a.state === 'verifisert');
}

export function linkActionTask(finding, actionId, taskId) {
  if (!finding) return finding;
  return { ...finding, actions: replaceAction(finding, actionId, { taskId: text(taskId, 200) }) };
}

/** Tiltakseier melder tiltaket utført med dokumentasjon. */
export function completeAction(finding, actionId, input, { actor, now = new Date() } = {}) {
  const action = (finding?.actions || []).find((a) => a.id === actionId);
  if (!action) return fail('Fant ikke tiltaket.');
  if (!OPEN_ACTION.has(action.state)) return fail('Tiltaket er ikke åpent.');
  const note = text(input?.note, 3000);
  const evidence = (input?.evidence || [])
    .map((e) => ({ label: text(e?.label, 200), url: text(e?.url, 1000), ref: text(e?.ref, 200) }))
    .filter((e) => e.label || e.url || e.ref);
  if (!note) return fail('Beskriv hva som er gjort.');
  if (action.requiredEvidence && !evidence.length && !(action.evidence || []).length) {
    return fail(`Tiltaket krever dokumentasjon: ${action.requiredEvidence}`);
  }
  const next = bump({
    ...finding,
    // Reglene har ikke løkker: indeksen sier hvilket tiltak tiltakseieren har endret.
    doneActionIndex: (finding.actions || []).findIndex((a) => a.id === actionId),
    actions: replaceAction(finding, actionId, {
      state: 'til_verifisering',
      completedAt: nowIso(now),
      completedBy: text(actor?.name, 160),
      completedByUid: text(actor?.uid, 128),
      completionNote: note,
      evidence: [...(action.evidence || []), ...evidence],
    }),
    history: pushHistory(finding, 'Tiltak meldt utført', actor, `${action.title}: ${note}`, now),
  }, actor, now);
  return result(finding, next, 'iso.action.submitted', actor, now);
}

/**
 * Er det samme person som meldte tiltaket utført? Sammenlignes på bruker-id; to ansatte kan ha samme navn.
 * Eldre tiltak uten uid sammenlignes på navn.
 */
export function completedBySelf(action, actor) {
  const uid = text(actor?.uid, 128);
  if (action?.completedByUid) return !!uid && action.completedByUid === uid;
  return !!action?.completedBy && action.completedBy === text(actor?.name, 160);
}

/** Kontroll av gjennomføring: godkjent eller returnert. */
export function verifyAction(finding, actionId, input, { actor, now = new Date() } = {}) {
  const action = (finding?.actions || []).find((a) => a.id === actionId);
  if (!action) return fail('Fant ikke tiltaket.');
  if (action.state !== 'til_verifisering') return fail('Tiltaket er ikke meldt utført.');
  const approved = !!input?.approved;
  const note = text(input?.note, 2000);
  if (!approved && !note) return fail('Skriv hvorfor tiltaket returneres.');
  const self = completedBySelf(action, actor);
  if (self && approved && !input?.allowSelf) {
    return fail('Gjennomføringen bør kontrolleres av en annen enn den som utførte tiltaket.');
  }
  const actions = replaceAction(finding, actionId, {
    state: approved ? 'verifisert' : 'returnert',
    verifiedAt: approved ? nowIso(now) : '',
    verifiedBy: approved ? text(actor?.name, 160) : '',
    returnNote: approved ? '' : note,
  });
  const done = allActionsDone(actions);
  const next = bump({
    ...finding,
    actions,
    state: done && finding.state === 'tiltak' ? 'effektkontroll' : finding.state,
    history: pushHistory(
      finding,
      approved ? (input?.allowSelf && self ? 'Tiltak kontrollert (egenkontroll)' : 'Tiltak kontrollert') : 'Tiltak returnert',
      actor,
      note,
      now,
    ),
  }, actor, now);
  return result(finding, next, approved ? 'iso.action.verified' : 'iso.action.returned', actor, now);
}

export function cancelAction(finding, actionId, reason, { actor, now = new Date() } = {}) {
  const action = (finding?.actions || []).find((a) => a.id === actionId);
  if (!action) return fail('Fant ikke tiltaket.');
  if (text(reason).length < 5) return fail('Begrunn hvorfor tiltaket kanselleres.');
  const actions = replaceAction(finding, actionId, { state: 'kansellert', cancelReason: text(reason, 1000) });
  const done = allActionsDone(actions);
  const next = bump({
    ...finding,
    actions,
    state: done && finding.state === 'tiltak' ? 'effektkontroll' : finding.state,
    history: pushHistory(finding, 'Tiltak kansellert', actor, reason, now),
  }, actor, now);
  return result(finding, next, 'iso.action.cancelled', actor, now, reason);
}

/**
 * Siste effektkontroll var «ikke verifisert», og ingen tiltak er lagt til etter den.
 * Da kan effekten ikke kontrolleres på nytt før det er gjort noe nytt.
 */
export function needsNewActions(finding) {
  const last = (finding?.effect?.checks || []).at(-1);
  if (last?.outcome !== 'ikke_verifisert') return false;
  return !(finding.actions || []).some((a) => a.state !== 'kansellert' && String(a.createdAt || '') > String(last.at || ''));
}

/** Effektverifikasjon. «Ikke verifisert» gjenåpner saken for ny vurdering/nye tiltak (T11). */
export function verifyEffect(finding, input, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  const ready = finding.state === 'effektkontroll' || (finding.state === 'vurdert' && allActionsDone(finding.actions));
  if (!ready) return fail('Alle tiltak må være kontrollert før effektvurdering.');
  if (needsNewActions(finding)) return fail('Effekten ble ikke verifisert sist. Legg inn og gjennomfør nye tiltak før ny effektkontroll.');
  const outcome = input?.outcome;
  if (!['verifisert', 'ikke_verifisert'].includes(outcome)) return fail('Velg utfall av effektkontrollen.');
  if (!text(input?.method)) return fail('Beskriv hvordan effekten er kontrollert.');
  if (!text(input?.note)) return fail('Beskriv resultatet av kontrollen.');
  const check = {
    at: nowIso(now),
    by: text(actor?.name, 160),
    byUid: text(actor?.uid, 128),
    method: text(input.method, 1000),
    note: text(input.note, 2000),
    outcome,
  };
  const effect = {
    ...(finding.effect || {}),
    outcome,
    method: check.method,
    checkedAt: check.at,
    checkedBy: check.by,
    checks: [...(finding.effect?.checks || []), check],
  };
  const next = bump({
    ...finding,
    effect,
    state: outcome === 'verifisert' ? 'effektkontroll' : 'vurdert',
    reopenCount: outcome === 'verifisert' ? (finding.reopenCount || 0) : (finding.reopenCount || 0) + 1,
    history: pushHistory(finding, outcome === 'verifisert' ? 'Effekt verifisert' : 'Effekt ikke verifisert – saken gjenåpnet', actor, check.note, now),
  }, actor, now);
  return result(finding, next, outcome === 'verifisert' ? 'iso.finding.effect_verified' : 'iso.finding.reopened', actor, now);
}

/**
 * Årsaksvurdering kreves for middels og høyere alvorlighet når tiltak er besluttet, og alltid for
 * personskade, nestenulykke og miljøhendelse, også når det besluttes «ingen tiltak».
 */
export function rootCauseRequired(finding) {
  if (HSE_FINDING_TYPES.includes(finding?.type)) return true;
  return !!finding?.assessment?.correctiveRequired && ['middels', 'hoy', 'kritisk'].includes(finding?.severity);
}

/** Hva mangler før saken kan lukkes? Tom liste = kan lukkes. Brukes både i UI og ved lagring. */
export function closeBlockers(finding) {
  const out = [];
  if (!finding) return ['Fant ikke saken.'];
  if (['lukket', 'kansellert'].includes(finding.state)) return ['Saken er allerede avsluttet.'];
  if (!finding.triage) out.push('Saken er ikke triagert.');
  if (!finding.assessment) out.push('Tiltaksbeslutning mangler.');
  if (finding.triage?.urgent && !text(finding.immediateAction)) out.push('Strakstiltak er ikke dokumentert.');
  if (finding.authorityNotificationRequired && !finding.notificationDone) {
    out.push('Mulig meldeplikt: bekreft at varsling til myndighet er vurdert/utført.');
  }
  const live = (finding.actions || []).filter((a) => a.state !== 'kansellert');
  if (finding.assessment?.correctiveRequired && !live.length) out.push('Korrigerende tiltak er besluttet, men ingen tiltak er registrert.');
  if (!finding.rootCause && rootCauseRequired(finding)) out.push('Årsaksvurdering mangler.');
  const open = live.filter((a) => a.state !== 'verifisert');
  if (open.length) out.push(`${open.length} tiltak er ikke kontrollert.`);
  if (finding.effect?.required && finding.effect?.outcome !== 'verifisert') {
    out.push('Effekten av tiltakene er ikke verifisert.');
  }
  if (finding.assessment && finding.assessment.correctiveRequired === false && text(finding.assessment.rationale).length < 10) {
    out.push('Begrunnelse for at tiltak ikke trengs mangler.');
  }
  return out;
}

export function closeFinding(finding, input, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.approve) return fail('Du har ikke fullmakt til å lukke saker.');
  if (finding?.restricted && caps && !caps.restrictedManage) return fail('Skjermede saker krever særskilt fullmakt.');
  const blockers = closeBlockers(finding);
  if (blockers.length) return fail(blockers[0], { blockers });
  const note = text(input?.note, 3000);
  if (!note) return fail('Skriv en kort lukkebegrunnelse.');
  const next = bump({
    ...finding,
    state: 'lukket',
    closedAt: nowIso(now),
    closedBy: text(actor?.name, 160),
    closedByUid: text(actor?.uid, 128),
    closeNote: note,
    learning: text(input?.learning, 3000),
    links: {
      ...(finding.links || {}),
      requirementIds: uniq([...(finding.links?.requirementIds || []), ...(input?.requirementIds || [])]),
    },
    history: pushHistory(finding, 'Lukket', actor, note, now),
  }, actor, now);
  return result(finding, next, 'iso.finding.closed', actor, now);
}

export function reopenFinding(finding, reason, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å gjenåpne saker.');
  if (finding?.state !== 'lukket') return fail('Bare lukkede saker kan gjenåpnes.');
  if (text(reason).length < 5) return fail('Begrunn gjenåpningen.');
  const next = bump({
    ...finding,
    state: 'vurdert',
    reopenCount: (finding.reopenCount || 0) + 1,
    effect: { ...(finding.effect || {}), outcome: '' },
    history: pushHistory(finding, 'Gjenåpnet', actor, reason, now),
  }, actor, now);
  return result(finding, next, 'iso.finding.reopened', actor, now, reason);
}

export function cancelFinding(finding, reason, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.approve) return fail('Bare en godkjenner kan kansellere saker.');
  if (['lukket', 'kansellert'].includes(finding?.state)) return fail('Saken er allerede avsluttet.');
  if (text(reason).length < 5) return fail('Begrunn kanselleringen.');
  const next = bump({
    ...finding,
    state: 'kansellert',
    cancelReason: text(reason, 1000),
    history: pushHistory(finding, 'Kansellert', actor, reason, now),
  }, actor, now);
  return result(finding, next, 'iso.finding.cancelled', actor, now, reason);
}

export function confirmNotification(finding, note, { actor, now = new Date() } = {}) {
  if (!finding?.authorityNotificationRequired) return fail('Saken har ikke meldeplikt registrert.');
  if (text(note).length < 5) return fail('Skriv hvordan varslingen er vurdert/utført (myndighet, tidspunkt, referanse).');
  const next = bump({
    ...finding,
    notificationDone: true,
    notificationNote: text(note, 1000),
    notificationAt: nowIso(now),
    history: pushHistory(finding, 'Varsling til myndighet bekreftet', actor, note, now),
  }, actor, now);
  return result(finding, next, 'iso.finding.notification_confirmed', actor, now);
}

/** Felt i endringsvurderingen (ISO 9001 6.3, ISO 45001 8.1.3, ISO 14001 6.1). */
export const CHANGE_FIELDS = [
  { key: 'purpose', label: 'Formål og mulige konsekvenser' },
  { key: 'processes', label: 'Berørte prosesser og roller' },
  { key: 'legal', label: 'Berørte lovkrav og samsvarsforpliktelser' },
  { key: 'risk', label: 'Risiko og muligheter (kvalitet, miljø, arbeidsmiljø)' },
  { key: 'participation', label: 'Medvirkning (verneombud og berørte ansatte)' },
  { key: 'resources', label: 'Ressurser og kompetanse' },
  { key: 'documents', label: 'Dokumenter, prosesskart og opplæring som må oppdateres' },
];

/**
 * Endringsvurdering for et endringsforslag: konsekvenser vurderes før endringen besluttes.
 * Beslutningen (Godkjent / Avvist / Utsatt) lagres med hvem og når. Tiltak følges opp som i andre saker.
 */
export function assessChange(finding, input, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  if (finding.type !== 'endringsforslag') return fail('Endringsvurdering gjelder endringsforslag.');
  const change = {};
  for (const f of CHANGE_FIELDS) change[f.key] = text(input?.[f.key], 3000);
  if (!change.risk) return fail('Vurder risiko og muligheter før endringen besluttes.');
  const decision = ['Godkjent', 'Avvist', 'Utsatt'].includes(input?.decision) ? input.decision : '';
  if (decision && !change.purpose) return fail('Beskriv formål og konsekvenser før beslutning.');
  const next = bump({
    ...finding,
    change: { ...change, decision, decidedBy: decision ? text(actor?.name, 160) : '', decidedAt: decision ? nowIso(now) : '' },
    history: pushHistory(finding, decision ? `Endring ${decision.toLowerCase()}` : 'Endringsvurdering lagret', actor, '', now),
  }, actor, now);
  return result(finding, next, 'iso.finding.change', actor, now);
}

export function updateFindingLinks(finding, patch, { actor, now = new Date() } = {}) {
  if (!finding) return fail('Fant ikke saken.');
  const links = {
    ...(finding.links || {}),
    ...(patch.requirementIds ? { requirementIds: uniq(patch.requirementIds) } : {}),
    ...(patch.documentIds ? { documentIds: uniq(patch.documentIds) } : {}),
    ...(patch.riskIds ? { riskIds: uniq(patch.riskIds) } : {}),
    ...(patch.processId != null ? { processId: text(patch.processId, 120) } : {}),
  };
  const next = bump({ ...finding, links, history: pushHistory(finding, 'Koblinger oppdatert', actor, '', now) }, actor, now);
  return result(finding, next, 'iso.finding.links', actor, now);
}

/** Fase i flyten — brukes av funnel/fasefordeling og stepper. */
export function findingStep(finding) {
  const order = ['registrert', 'triage', 'vurdert', 'tiltak', 'effektkontroll', 'lukket'];
  return Math.max(0, order.indexOf(finding?.state));
}

/** Hvem som er involvert i en sak (melder, ansvarlig, den som varsler myndighet, tiltakseiere) – brukes av reglene. */
export function withInvolved(finding) {
  const notifier = finding?.authorityNotificationRequired ? finding?.notificationAssigneeUid : '';
  const set = new Set([finding?.reportedByUid, finding?.assigneeUid, notifier, ...((finding?.actions || []).map((a) => a?.ownerUid))].filter(Boolean).map(String));
  return { ...finding, involvedUids: [...set] };
}

export function isOpenFinding(finding) {
  return finding && !['lukket', 'kansellert'].includes(finding.state);
}

export function openActions(findings) {
  const out = [];
  for (const f of findings || []) {
    for (const a of f.actions || []) {
      if (OPEN_ACTION.has(a.state)) out.push({ ...a, findingId: f.id, findingNumber: f.number, findingTitle: f.title, restricted: !!f.restricted });
    }
  }
  return out;
}

export function overdueActions(findings, now = new Date()) {
  const today = todayKey(now);
  return openActions(findings).filter((a) => a.dueAt && a.dueAt < today);
}
