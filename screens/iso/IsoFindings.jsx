import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { radius } from '../../src/ui/tokens';
import { prettyDate, todayKey } from '../../src/iso/core';
import {
  FINDING_STATES, FINDING_TYPES, INJURY_CLASSES, SEVERITIES, actionStateLabel, findingStateLabel, findingTypeLabel, injuryClassLabel, seriousInjury, severityLabel,
} from '../../src/iso/catalog';
import {
  CHANGE_FIELDS, DISPOSITIONS, addAction, assessChange, confirmReverified, dispositionLabel, setDisposition, assessFinding, cancelAction, cancelFinding, closeBlockers, closeFinding, completeAction, completedBySelf, confirmNotification,
  createFinding, defaultRestricted, findingStep, isOpenFinding, needsNewActions, notificationTaskKey, recordRootCause, reopenFinding, rootCauseRequired, triageFinding,
  updateFindingLinks, verifyAction, verifyEffect,
} from '../../src/iso/findings';
import {
  HIDDEN_REPORTER, canCloseFinding, canManageFinding, displayFinding, reporterVisible, visibleFindings,
} from '../../src/iso/access';
import { allRequirements, attachEvidence, requirementIdsForArea } from '../../src/iso/requirements';
import { loadAuditFor, watchFinding } from '../../src/iso/storage';
import { autoAssignee, legacyProjectCases, newFindingEffects, notificationTaskEffects, requirementIdsForFinding } from '../../src/iso/integrations';
import { ksDeviationCandidates } from '../../src/iso/forms';
import { publishedVersionOf, normalizeDiagram } from '../../src/iso/processes';
import IsoDiagram, { fitView } from './IsoDiagram';
import QuickReportButton from './QuickReport';
import { useShellDetail } from '../../src/navigation/shellDetail';
import { DetailMissing } from '../../src/ui/BackLink';
import {
  Banner, Btn, Card, Check, Choice, DateIn, Divider, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

/** Handlinger nederst i saken: feilen vises ved knappen, ikke øverst på siden. */
const INLINE_ERRORS = ['Effektkontroll', 'Saken er lukket', 'Saken er kansellert', 'Gjenåpnet'];
const STATE_TONE = { registrert: 'warn', triage: 'warn', vurdert: 'info', tiltak: 'info', effektkontroll: 'info', lukket: 'ok', kansellert: 'muted' };

export default function IsoFindings({ ctx }) {
  const { state, caps, params, go, wide, store } = ctx;
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState(params?.overdue ? 'forfalt' : (params?.open ? 'apne' : ''));
  const [typeFilter, setTypeFilter] = useState('');
  const [creating, setCreating] = useState(!!params?.create);
  const [openId, setOpenId] = useState(params?.open || '');
  const drillIds = params?.ids || null;

  useEffect(() => {
    if (params?.create) setCreating(true);
    if (params?.open) setOpenId(params.open);
  }, [params]);

  const visible = useMemo(() => visibleFindings(caps, state.findings), [caps, state.findings]);
  const today = todayKey();
  const rows = useMemo(() => visible
    .filter((f) => !drillIds || drillIds.includes(f.id))
    .filter((f) => !typeFilter || f.type === typeFilter)
    .filter((f) => {
      if (stateFilter === 'apne') return isOpenFinding(f);
      if (stateFilter === 'forfalt') return (f.actions || []).some((a) => ['apen', 'pagar', 'til_verifisering', 'returnert'].includes(a.state) && a.dueAt && a.dueAt < today);
      if (stateFilter) return f.state === stateFilter;
      return true;
    })
    .filter((f) => !query || `${f.number} ${f.title} ${f.description} ${f.projectName}`.toLowerCase().includes(query.toLowerCase())), [visible, drillIds, typeFilter, stateFilter, query, today]);

  const legacy = useMemo(() => (caps.manage ? legacyProjectCases(ctx.sources?.projectState, state.findings) : []), [caps.manage, ctx.sources?.projectState, state.findings]);
  // Avvik i utfylte KS-sjekklister og vernerunder (Skjemabygger) som ikke er sak ennå.
  const ksRows = useMemo(() => ksDeviationCandidates(ctx.sources?.formTemplates, state.findings), [ctx.sources?.formTemplates, state.findings]);

  async function adopt(cases) {
    let existing = store.current().findings;
    for (const c of cases) {
      const who = autoAssignee(state.system, c.type);
      const res = createFinding({
        type: c.type, title: c.title, description: c.description || c.title, projectId: c.projectId, projectName: c.projectName,
        severity: c.severity, sourceRef: c.sourceRef || { module: c.module, id: c.id }, assigneeName: who?.name, assigneeUid: who?.uid,
        requirementIds: requirementIdsForFinding(state, c.type), immediateAction: c.immediateAction, dueAt: c.dueAt,
      }, { actor: ctx.actor, existing });
      if (!res.ok) continue;
      const saved = await store.commit('findings', 'finding', res, { effects: newFindingEffects(res.finding, state.system) });
      if (saved.ok) existing = [...existing, res.finding];
    }
  }

  // Saken har egen adresse (/hjem/iso/avvik/:id). Tilbake i nettleseren går til listen.
  const link = useShellDetail('finding', openId, { onOpen: setOpenId, onClose: () => setOpenId('') });
  const selected = visible.find((f) => f.id === openId) || null;
  if (selected) return <FindingDetail ctx={ctx} finding={selected} onBack={() => setOpenId('')} />;
  // Lenke til en sak som ikke finnes her, er skjermet eller tilhører en annen bedrift.
  if (openId && !store.loading) {
    return <DetailMissing list={link.list} thing={link.thing} onBack={() => setOpenId('')} />;
  }

  return (
    <Page
      wide={wide}
      crumb={['Avvik og forbedring']}
      title="Avvik og forbedring"
      intro="Meld avvik, hendelser, kundeklager og forbedringsforslag. Saken følges gjennom triage, tiltak og effektkontroll før den lukkes."
      actions={(
        <>
          <QuickReportButton variant="button" onSent={ctx.onQuickSent} />
          <Btn kind="primary" icon="add" label="Meld avvik" onPress={() => setCreating(true)} />
        </>
      )}
    >
      {drillIds ? <Banner tone="info" text={`Viser utvalg fra oversikten: ${params?.label || ''} (${rows.length})`} /> : null}
      <Card>
        <TextIn value={query} onChangeText={setQuery} placeholder="Søk i saksnummer, tittel, prosjekt" />
        {/* To nedtrekk side om side: status og type. Begge får plass også på mobil, så «Flere filtre» trengs ikke. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Choice small options={[{ id: 'apne', label: 'Åpne' }, { id: 'forfalt', label: 'Forfalte tiltak' }, ...FINDING_STATES.map((s) => ({ id: s.id, label: s.label }))]} value={stateFilter} onChange={setStateFilter} placeholder="Alle statuser" title="Status" />
          </View>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Choice small options={FINDING_TYPES.map((t) => ({ id: t.id, label: t.label }))} value={typeFilter} onChange={setTypeFilter} placeholder="Alle typer" title="Type" />
          </View>
        </View>
      </Card>
      {legacy.length && caps.manage ? (
        <Card title={`Fra Prosjekt-modulen (${legacy.length})`} subtitle="Avvik og RUH registrert i prosjektene som ikke er behandlet i ISO. Ta dem inn, så følger de samme flyt – uten å registreres på nytt.">
          {legacy.slice(0, 8).map((c) => (
            <ListRow key={c.id} icon="briefcase-outline" title={c.title} subtitle={`${c.label}${c.projectName ? ` · ${c.projectName}` : ''}`} right={<Btn small label="Ta inn" onPress={() => adopt([c])} />} />
          ))}
          {legacy.length > 1 ? <Btn small icon="download-outline" label={`Ta inn alle ${legacy.length}`} onPress={() => adopt(legacy)} /> : null}
        </Card>
      ) : null}
      {ksRows.length && caps.view ? (
        <Card title={`Avvik fra sjekklister og vernerunder (${ksRows.length})`} subtitle="Punkter merket «Avvik», «N» eller «Nei» i KS-sjekklistene i Skjemabygger. Ett trykk gjør punktet til en sak med behandler, oppgave og frist.">
          {ksRows.slice(0, 8).map((c) => (
            <ListRow key={c.id} icon="clipboard-outline" tone="warn" title={c.title} subtitle={[c.label, c.immediateAction].filter(Boolean).join(' · ')} right={<Btn small kind="primary" label="Opprett sak" onPress={() => adopt([c])} />} />
          ))}
          {ksRows.length > 1 ? <Btn small icon="layers-outline" label={`Opprett saker for alle ${ksRows.length}`} onPress={() => adopt(ksRows)} /> : null}
        </Card>
      ) : null}
      <Card title={`${rows.length} saker`}>
        {!rows.length ? (
          <Empty
            icon="flag-outline"
            title={visible.length ? 'Ingen treff' : 'Ingen saker ennå'}
            text={visible.length ? 'Endre filter eller søk.' : 'Når noen melder et avvik, vises det her.'}
          />
        ) : rows.map((f) => (
          <ListRow
            key={f.id}
            icon={f.restricted ? 'lock-closed-outline' : 'flag-outline'}
            tone={f.severity === 'kritisk' || f.severity === 'hoy' ? 'danger' : 'muted'}
            title={`${f.number} · ${f.title}`}
            subtitle={[findingTypeLabel(f.type), f.severity ? severityLabel(f.severity) : 'Ikke vurdert', f.projectName, prettyDate(f.occurredAt), f.assigneeName, f.quick ? 'hurtigmelding' : '', (f.attachments || []).length ? `${f.attachments.length} foto` : ''].filter(Boolean).join(' · ')}
            right={<Pill label={findingStateLabel(f.state)} tone={STATE_TONE[f.state]} />}
            onPress={() => setOpenId(f.id)}
          />
        ))}
      </Card>
      <NewFindingSheet ctx={ctx} visible={creating} onClose={() => { setCreating(false); if (params?.create) go('avvik', {}); }} onCreated={(f) => { setCreating(false); setOpenId(f.id); }} />
    </Page>
  );
}

function NewFindingSheet({ ctx, visible, onClose, onCreated }) {
  const colors = useColors();
  const { state, actor, projects, people, store, wide, prefill } = ctx;
  const blank = { type: 'prosess', title: '', description: '', occurredAt: todayKey(), projectId: '', location: '', actualConsequence: '', potentialConsequence: '', immediateAction: '', restricted: null, personalDetails: '', authorityNotificationRequired: false, notificationAssignee: '', notificationAssigneeUid: '', deliverableRef: '', environmentalMedium: '', customerImpact: '', severity: '', injuryClass: '' };
  const [v, setV] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setV({ ...blank, ...(prefill || {}) }); setError(''); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }));
  const domain = FINDING_TYPES.find((t) => t.id === v.type)?.domain;
  const restricted = v.restricted == null ? defaultRestricted(v.type) : v.restricted;
  const injury = ['hms', 'nestenulykke'].includes(v.type);
  const { suppliers, customers } = linkOptions(ctx);
  // Alvorlig personskade eller dødsfall: foreslå meldeplikt med en gang.
  const pickInjury = (x) => setV((cur) => ({ ...cur, injuryClass: x || '', authorityNotificationRequired: seriousInjury(x) ? true : cur.authorityNotificationRequired }));

  async function save() {
    setBusy(true);
    const project = projects.find((p) => p.id === v.projectId);
    const who = autoAssignee(state.system, v.type);
    const res = createFinding({
      ...v,
      restricted,
      assigneeName: who?.name || '',
      assigneeUid: who?.uid || '',
      requirementIds: requirementIdsForFinding(state, v.type),
      projectName: project ? `${project.number || ''} ${project.name || ''}`.trim() : '',
    }, { actor, existing: state.findings, now: new Date() });
    if (!res.ok) { setError(res.error); setBusy(false); return; }
    // Behandler får oppgave i Oppgaver med en gang (fast nøkkel → én oppgave). Mulig meldeplikt:
    // den som varsler myndighet får egen oppgave med frist i dag, og de ansvarlige varsles straks.
    const effects = newFindingEffects(res.finding, state.system);
    const saved = await store.commit('findings', 'finding', res, { effects });
    setBusy(false);
    if (!saved.ok) { setError(saved.error); return; }
    onCreated(res.finding);
  }

  return (
    <Sheet
      visible={visible}
      wide={wide}
      title="Meld avvik"
      onClose={onClose}
      footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Send inn" busy={busy} onPress={save} /></>}
    >
      <Field label="Type" required><Choice options={FINDING_TYPES.map((t) => ({ id: t.id, label: t.label }))} value={v.type} onChange={(x) => set('type')(x || 'prosess')} /></Field>
      {autoAssignee(state.system, v.type) ? <Text style={{ color: colors.muted, fontSize: 12 }}>Saken tildeles automatisk {autoAssignee(state.system, v.type).name} og kobles til relevante krav.</Text> : null}
      <Field label="Tittel" required><TextIn value={v.title} onChangeText={set('title')} placeholder="Kort hva som skjedde" /></Field>
      <Field label="Beskrivelse" required hint="Beskriv fakta. Ikke legg inn helseopplysninger her."><TextIn multiline value={v.description} onChangeText={set('description')} /></Field>
      <Field label="Dato"><DateIn value={v.occurredAt} onChange={set('occurredAt')} /></Field>
      {injury ? (
        <Field label="Skadeklasse" hint="Din vurdering. Behandler kan endre den i triage.">
          <Choice small options={INJURY_CLASSES.map((c) => ({ id: c.id, label: c.label }))} value={v.injuryClass} onChange={pickInjury} placeholder="Velg" title="Skadeklasse" />
        </Field>
      ) : null}
      <Field label="Alvorlighet" hint="Din vurdering. «Kritisk» gir behandling i dag.">
        <Choice small options={SEVERITIES.map((x) => ({ id: x.id, label: x.label }))} value={v.severity} onChange={(x) => set('severity')(x || '')} placeholder="Vet ikke" title="Alvorlighet" />
      </Field>
      {projects.length ? (
        <Field label="Prosjekt"><Choice small title="Prosjekt" options={projects.map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() }))} value={v.projectId} onChange={set('projectId')} /></Field>
      ) : null}
      {['leverandor', 'leveranse'].includes(v.type) && suppliers.length ? (
        <Field label="Leverandør"><Choice small clearable title="Leverandør" options={suppliers} value={v.supplierId} onChange={(x) => setV((cur) => ({ ...cur, supplierId: x || '', supplierName: suppliers.find((o) => o.id === x)?.label || '' }))} /></Field>
      ) : null}
      {['kundeklage', 'positiv', 'leveranse'].includes(v.type) && customers.length ? (
        <Field label="Kunde"><Choice small clearable title="Kunde" options={customers} value={v.customerId} onChange={(x) => setV((cur) => ({ ...cur, customerId: x || '', customerName: customers.find((o) => o.id === x)?.label || '' }))} /></Field>
      ) : null}
      <Field label="Sted"><TextIn value={v.location} onChangeText={set('location')} placeholder="Adresse, bygg eller prosjektsted" /></Field>
      {domain === 'KVALITET' ? (
        <>
          <Field label="Leveranse / dokument-ID"><TextIn value={v.deliverableRef} onChangeText={set('deliverableRef')} placeholder="F.eks. tegning A-101 rev C" /></Field>
          <Field label="Påvirkning for kunde"><TextIn value={v.customerImpact} onChangeText={set('customerImpact')} /></Field>
        </>
      ) : null}
      {domain === 'MILJO' ? <Field label="Miljømedium"><Choice small options={['Luft', 'Vann', 'Jord', 'Avfall', 'Annet']} value={v.environmentalMedium} onChange={set('environmentalMedium')} /></Field> : null}
      <Field label="Faktisk konsekvens"><TextIn value={v.actualConsequence} onChangeText={set('actualConsequence')} /></Field>
      <Field label="Mulig konsekvens"><TextIn value={v.potentialConsequence} onChangeText={set('potentialConsequence')} /></Field>
      <Field label="Strakstiltak som er gjort"><TextIn value={v.immediateAction} onChangeText={set('immediateAction')} /></Field>
      <Check label="Skjermet sak (HMS/personopplysninger) – bare særskilt tilgang og involverte ser saken" value={restricted} onChange={set('restricted')} />
      {restricted ? <Field label="Personopplysninger (skjermet)" hint="Bare det som er nødvendig. Vises ikke i lister eller eksport."><TextIn multiline rows={2} value={v.personalDetails} onChangeText={set('personalDetails')} /></Field> : null}
      <Check label="Mulig meldeplikt til myndighet (f.eks. alvorlig personskade eller utslipp)" value={v.authorityNotificationRequired} onChange={set('authorityNotificationRequired')} />
      {v.authorityNotificationRequired || seriousInjury(v.injuryClass) ? (
        <View style={{ gap: 8, padding: 12, borderRadius: radius.card, borderWidth: 2, borderColor: colors.danger }}>
          <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 15 }}>Alvorlig personskade eller dødsfall</Text>
          <Text style={{ color: colors.ink, fontSize: 14 }}>Ring 113 ved behov for ambulanse. Varsle Arbeidstilsynet og politiet straks (aml § 5-2). ProTop melder ikke til myndighetene.</Text>
          <Row>
            <Btn kind="danger" icon="call-outline" label="Ring 113" onPress={() => Linking.openURL('tel:113').catch(() => {})} />
            <Btn icon="call-outline" label="Ring politiet 112" onPress={() => Linking.openURL('tel:112').catch(() => {})} />
          </Row>
        </View>
      ) : null}
      {v.authorityNotificationRequired ? (
        <>
          <Banner tone="warn" text="Intern registrering oppfyller ikke ekstern meldeplikt. Den du velger, får oppgave med frist i dag, og behandler, HMS-leder og øverste ledelse varsles." />
          <Field label="Hvem sørger for varsling" required><PersonPick people={people} value={v.notificationAssignee} onChange={(p) => setV((x) => ({ ...x, notificationAssignee: p.name, notificationAssigneeUid: p.uid || '' }))} /></Field>
        </>
      ) : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </Sheet>
  );
}

const STEPS = ['Registrert', 'Første vurdering', 'Vurdert', 'Tiltak', 'Effekt', 'Lukket'];

function Stepper({ step, closed }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={`Fase ${step + 1} av ${STEPS.length}`}>
      {STEPS.map((s, i) => {
        const done = i < step || closed;
        const now = i === step && !closed;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: now ? colors.brand : colors.line, backgroundColor: done ? colors.successSoft : (now ? colors.brandSoft : colors.card) }}>
            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: now ? '700' : '400' }}>{done ? '✓ ' : ''}{s}</Text>
          </View>
        );
      })}
    </View>
  );
}

function FindingDetail({ ctx, finding, onBack }) {
  const colors = useColors();
  const { state, caps, actor, store, people, wide, go } = ctx;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [audit, setAudit] = useState(null);
  const manage = canManageFinding(caps, finding);
  const closeable = canCloseFinding(caps, finding);
  const blockers = closeBlockers(finding);
  const closed = ['lukket', 'kansellert'].includes(finding.state);
  // Melderens navn vises bare for saksbehandlere og melderen selv.
  const shown = useMemo(() => displayFinding(caps, finding), [caps, finding]);
  // Sanntid: det andre lagrer i saken mens den er åpen, vises med en gang (DRIFT-23).
  const onRemote = ctx.onRemoteFinding;
  useEffect(
    () => watchFinding(ctx.companyId, { id: finding.id, restricted: finding.restricted }, (remote) => onRemote?.(remote)),
    [ctx.companyId, finding.id, finding.restricted], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [remoteBy, setRemoteBy] = useState('');
  const seenRev = useRef(finding.rev);
  useEffect(() => {
    if (finding.rev !== seenRev.current && finding.updatedByUid && finding.updatedByUid !== actor?.uid) {
      const hidden = finding.updatedByUid === finding.reportedByUid && !reporterVisible(caps, finding);
      setRemoteBy(hidden ? HIDDEN_REPORTER : (finding.updatedBy || 'en annen'));
    }
    seenRev.current = finding.rev;
  }, [finding.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feil vises ved knappen som ble trykket der det finnes en egen plass (f.eks. effektkontroll nederst).
  const [errAt, setErrAt] = useState('');
  async function run(label, result, extra = {}) {
    setErr('');
    setErrAt('');
    setMsg('');
    if (!result.ok) { setErr(result.error); setErrAt(label); return result; }
    setBusy(label);
    const saved = await store.commit('findings', 'finding', result, { previous: finding, ...extra });
    setBusy('');
    if (!saved.ok) { setErr(saved.error); setErrAt(label); } else setMsg(`${label} – lagret.`);
    return saved;
  }
  const errHere = (...labels) => (err && labels.includes(errAt) ? <Banner tone="danger" text={err} /> : null);

  // Triage
  const [tri, setTri] = useState({ severity: finding.severity || '', urgent: false, assigneeName: finding.assigneeName, assigneeUid: finding.assigneeUid, immediateAction: finding.immediateAction, notifiable: finding.authorityNotificationRequired, notificationAssignee: finding.notificationAssignee, notificationAssigneeUid: finding.notificationAssigneeUid || '', injuryClass: finding.injuryClass || '', dueAt: finding.dueAt, note: '' });
  // Vurdering
  const [asm, setAsm] = useState({ correctiveRequired: finding.assessment?.correctiveRequired ?? null, rationale: '', correction: '' });
  const [chg, setChg] = useState(() => ({ ...(finding.change || {}) }));
  // Årsak
  const [rc, setRc] = useState({ method: '5whys', whys: ['', '', '', '', ''], systemCause: '', categories: [] });
  // Nytt tiltak
  const [act, setAct] = useState({ title: '', ownerName: '', ownerUid: '', dueAt: '', requiredEvidence: '', type: 'korrigerende' });
  const [actOpen, setActOpen] = useState(false);
  // Utførelse / kontroll
  const [doneNote, setDoneNote] = useState({});
  const [evidenceRef, setEvidenceRef] = useState({});
  const [effect, setEffect] = useState({ outcome: '', method: '', note: '' });
  const [closeNote, setCloseNote] = useState('');
  const [learning, setLearning] = useState('');
  const [notifNote, setNotifNote] = useState('');
  const [reason, setReason] = useState('');
  const [reqOpen, setReqOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dispo, setDispo] = useState({});
  const [selfOk, setSelfOk] = useState({});

  const requirements = useMemo(() => allRequirements(state), [state]);
  const linkedReqs = requirements.filter((r) => (finding.links?.requirementIds || []).includes(r.id));
  const evidenceReqs = useMemo(() => {
    const ev = new Set((state.evidence || []).filter((e) => e.type === 'finding' && e.objectId === finding.id).map((e) => e.id));
    const ids = new Set((state.evidenceLinks || []).filter((l) => ev.has(l.evidenceId) && l.reviewState !== 'fjernet').map((l) => l.requirementId));
    return requirements.filter((r) => ids.has(r.id));
  }, [state.evidence, state.evidenceLinks, finding.id, requirements]);

  async function doClose() {
    const result = closeFinding(finding, { note: closeNote, learning }, { actor, caps, now: new Date() });
    const saved = await run('Saken er lukket', result);
    if (!saved?.ok) return;
    // Evidens i kravmatrisen: én bevispost (saken, låst revisjon) koblet til relevante krav.
    const ids = [...new Set([...(result.finding.links?.requirementIds || []), ...requirementIdsForArea(state, 'nonconformity')])];
    if (ids.length) {
      const att = attachEvidence(state, { type: 'finding', objectId: finding.id, objectRevision: result.finding.rev, label: `${finding.number} ${finding.title} (lukket)`, restricted: finding.restricted }, ids, { actor });
      if (att.ok) await store.commitLists({ evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments: att.assessments }, att.events);
    }
  }

  async function addNewAction() {
    const res = addAction(finding, act, { actor });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await run('Tiltak lagt til', res, {
      effects: [{ type: 'createTask', key: res.action.taskKey, title: `Tiltak ${finding.number}: ${res.action.title}`, assigneeUid: res.action.ownerUid, deadline: res.action.dueAt, description: res.action.requiredEvidence ? `Påkrevd dokumentasjon: ${res.action.requiredEvidence}` : '' }],
    });
    if (saved?.ok) { setAct({ title: '', ownerName: '', ownerUid: '', dueAt: '', requiredEvidence: '', type: 'korrigerende' }); setActOpen(false); }
  }

  return (
    <Page
      wide={wide}
      crumb={['Avvik og forbedring', finding.number]}
      title={finding.title}
      intro={`${findingTypeLabel(finding.type)} · meldt ${prettyDate(finding.reportedAt)} av ${shown.reportedBy}${finding.projectName ? ` · ${finding.projectName}` : ''}`}
      back={{ label: 'Avvik og forbedring', onPress: onBack }}
    >
      <Row>
        <Pill label={findingStateLabel(finding.state)} tone={STATE_TONE[finding.state]} />
        {finding.severity ? <Pill label={`Alvorlighet: ${severityLabel(finding.severity)}`} tone={['hoy', 'kritisk'].includes(finding.severity) ? 'danger' : 'warn'} /> : null}
        {finding.restricted ? <Pill label="Skjermet" icon="lock-closed" tone="warn" /> : null}
        {finding.dueAt ? <Pill label={`Frist ${prettyDate(finding.dueAt)}`} tone={finding.dueAt < todayKey() && !closed ? 'danger' : 'muted'} /> : null}
      </Row>
      <Stepper step={findingStep(finding)} closed={finding.state === 'lukket'} />
      {remoteBy ? <Banner tone="info" text={`Saken ble nettopp oppdatert av ${remoteBy}. Du ser siste versjon.`} /> : null}
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err && !INLINE_ERRORS.includes(errAt) ? <Banner tone="danger" text={err} /> : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ flex: 3, gap: 12, width: wide ? undefined : '100%' }}>
          <Card title="Hendelse">
            <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 21 }}>{finding.description}</Text>
            <KV label="Faktisk konsekvens" value={finding.actualConsequence} />
            <KV label="Mulig konsekvens" value={finding.potentialConsequence} />
            <KV label="Strakstiltak" value={finding.immediateAction} />
            <KV label="Sted" value={finding.location} />
            <KV label="Leveranse" value={finding.deliverableRef} />
            <KV label="Skadeklasse" value={injuryClassLabel(finding.injuryClass)} />
            {(finding.attachments || []).length ? (
              <Row>
                {finding.attachments.map((a) => (
                  <TouchableOpacity key={a.url} onPress={() => Linking.openURL(a.url).catch(() => {})} accessibilityRole="link" accessibilityLabel={`Åpne ${a.label}`}>
                    {a.kind === 'foto'
                      ? <Image source={{ uri: a.url }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: colors.line }} />
                      : <Pill label={a.label} icon="attach-outline" />}
                  </TouchableOpacity>
                ))}
              </Row>
            ) : null}
            {finding.restricted && caps.restrictedView ? <KV label="Personopplysninger (skjermet)" value={finding.personalDetails} /> : null}
          </Card>

          {finding.authorityNotificationRequired ? (
            <Card title="Meldeplikt">
              <Banner tone={finding.notificationDone ? 'ok' : 'warn'} text={finding.notificationDone ? `Bekreftet: ${finding.notificationNote}` : `Mulig meldeplikt. Ansvarlig: ${finding.notificationAssignee || 'ikke satt'}${finding.notificationDue ? `, frist ${prettyDate(finding.notificationDue)}` : ''}. ProTop melder ikke selv til myndigheter.`} />
              {!finding.notificationDone && (manage || (finding.notificationAssigneeUid && finding.notificationAssigneeUid === actor.uid)) ? (
                <>
                  <TextIn value={notifNote} onChangeText={setNotifNote} placeholder="Hvem ble varslet, når og referanse" />
                  <Btn label="Bekreft varsling vurdert/utført" onPress={() => run('Varsling bekreftet', confirmNotification(finding, notifNote, { actor }), { effects: notificationTaskKey(finding) ? [{ type: 'completeTask', key: notificationTaskKey(finding) }] : [] })} />
                </>
              ) : null}
            </Card>
          ) : null}

          {['leveranse', 'kundeklage'].includes(finding.type) ? (
            <Card title="Disposisjon (8.7)" subtitle="Hva er gjort med den avvikende leveransen, og hvem besluttet. Aksept fra kunden krever bevis.">
              {finding.disposition?.id ? (
                <>
                  <KV label="Disposisjon" value={`${dispositionLabel(finding.disposition.id)} · ${finding.disposition.decidedBy} ${prettyDate(finding.disposition.decidedAt)}`} />
                  <KV label="Merknad" value={finding.disposition.note} />
                  {finding.disposition.concessionBy ? <KV label="Godkjent av kunden" value={`${finding.disposition.concessionBy} · ${finding.disposition.concessionRef}`} /> : null}
                  {finding.disposition.id === 'korrigert' ? (
                    finding.disposition.reverified
                      ? <Banner tone="ok" text={`Kontrollert etter retting av ${finding.disposition.reverifiedBy} ${prettyDate(finding.disposition.reverifiedAt)}: ${finding.disposition.reverifyNote}`} />
                      : (manage && !closed ? (
                        <>
                          <TextIn value={dispo.reverify || ''} onChangeText={(x) => setDispo({ ...dispo, reverify: x })} placeholder="Hvordan er leveransen kontrollert etter rettingen?" />
                          <Btn label="Kontrollert etter retting" onPress={() => run('Kontrollert etter retting', confirmReverified(finding, dispo.reverify, { actor }))} />
                        </>
                      ) : <Text style={{ color: colors.warn, fontSize: 13 }}>Venter på kontroll etter retting.</Text>)
                  ) : null}
                </>
              ) : null}
              {manage && !closed && (!finding.disposition?.id || dispo.change) ? (
                <>
                  <Choice options={DISPOSITIONS.map((d) => ({ id: d.id, label: d.label }))} value={dispo.id} onChange={(x) => setDispo({ ...dispo, id: x || '' })} />
                  <Field label="Merknad"><TextIn value={dispo.note || ''} onChangeText={(x) => setDispo({ ...dispo, note: x })} /></Field>
                  {DISPOSITIONS.find((d) => d.id === dispo.id)?.concession ? (
                    <>
                      <Field label="Hvem hos kunden godkjente" required><TextIn value={dispo.concessionBy || ''} onChangeText={(x) => setDispo({ ...dispo, concessionBy: x })} /></Field>
                      <Field label="Bevis (e-post, referat, dokument-ID)" required><TextIn value={dispo.concessionRef || ''} onChangeText={(x) => setDispo({ ...dispo, concessionRef: x })} /></Field>
                    </>
                  ) : null}
                  <Btn kind="primary" label="Lagre disposisjon" onPress={async () => { const saved = await run('Disposisjon', setDisposition(finding, dispo, { actor })); if (saved?.ok) setDispo({}); }} />
                </>
              ) : (manage && !closed ? <Btn small label="Endre disposisjon" onPress={() => setDispo({ ...finding.disposition, change: true })} /> : null)}
            </Card>
          ) : null}

          {finding.type === 'endringsforslag' ? (
            <Card title="Endringsvurdering" subtitle="Vurder konsekvensene før endringen besluttes (ISO 9001 6.3, ISO 45001 8.1.3, ISO 14001 6.1). Tiltak følges opp under Tiltak.">
              {CHANGE_FIELDS.map((f) => (manage && !closed
                ? <Field key={f.key} label={f.label} required={f.key === 'risk'}><TextIn multiline value={chg[f.key] || ''} onChangeText={(x) => setChg({ ...chg, [f.key]: x })} /></Field>
                : <KV key={f.key} label={f.label} value={finding.change?.[f.key] || '–'} />))}
              {manage && !closed ? (
                <>
                  <Field label="Beslutning"><Choice options={['Godkjent', 'Avvist', 'Utsatt']} value={chg.decision || ''} onChange={(x) => setChg({ ...chg, decision: x })} /></Field>
                  <Btn kind="primary" label="Lagre endringsvurdering" busy={busy === 'Endringsvurdering'} onPress={() => run('Endringsvurdering', assessChange(finding, chg, { actor }))} />
                </>
              ) : null}
              {finding.change?.decision ? <Text style={{ color: colors.muted, fontSize: 12 }}>Endringen er {finding.change.decision.toLowerCase()} av {finding.change.decidedBy} {prettyDate(finding.change.decidedAt)}.</Text> : null}
            </Card>
          ) : null}

          {['registrert', 'triage'].includes(finding.state) && manage ? (
            <Card title="1. Første vurdering og klassifisering">
              <Field label="Alvorlighet" required><Choice options={SEVERITIES.map((s) => ({ id: s.id, label: s.label }))} value={tri.severity} onChange={(x) => setTri({ ...tri, severity: x })} /></Field>
              {['hms', 'nestenulykke'].includes(finding.type) ? (
                <Field label="Skadeklasse"><Choice small options={INJURY_CLASSES.map((c) => ({ id: c.id, label: c.label }))} value={tri.injuryClass} onChange={(x) => setTri({ ...tri, injuryClass: x || '', notifiable: seriousInjury(x) ? true : tri.notifiable })} placeholder="Velg" title="Skadeklasse" /></Field>
              ) : null}
              <Check label="Akutt fare eller konsekvens" value={tri.urgent} onChange={(x) => setTri({ ...tri, urgent: x })} />
              {tri.urgent ? <Field label="Strakstiltak" required><TextIn value={tri.immediateAction} onChangeText={(x) => setTri({ ...tri, immediateAction: x })} /></Field> : null}
              <Field label="Ansvarlig for behandling" required><PersonPick people={people} value={tri.assigneeName} onChange={(p) => setTri({ ...tri, assigneeName: p.name, assigneeUid: p.uid })} /></Field>
              <Field label="Frist for saken"><DateIn value={tri.dueAt} onChange={(x) => setTri({ ...tri, dueAt: x })} /></Field>
              <Check label="Mulig meldeplikt til myndighet" value={!!tri.notifiable} onChange={(x) => setTri({ ...tri, notifiable: x })} />
              {tri.notifiable ? <Field label="Hvem varsler" hint="Får oppgave med frist i dag."><PersonPick people={people} value={tri.notificationAssignee} onChange={(p) => setTri({ ...tri, notificationAssignee: p.name, notificationAssigneeUid: p.uid || '' })} /></Field> : null}
              <Field label="Merknad"><TextIn value={tri.note} onChangeText={(x) => setTri({ ...tri, note: x })} /></Field>
              <Btn kind="primary" label="Lagre første vurdering" busy={busy === 'Første vurdering'} onPress={() => {
                const res = triageFinding(finding, tri, { actor });
                // Ny eller endret varslingsansvarlig får egen oppgave (nøkkelen følger personen).
                const notify = res.ok && notificationTaskKey(res.finding) !== notificationTaskKey(finding) ? notificationTaskEffects(res.finding) : [];
                return run('Første vurdering', res, { effects: [
                  ...(tri.assigneeUid && tri.assigneeUid !== finding.assigneeUid ? [{ type: 'createTask', key: `iso_${finding.id}_behandle`, title: `Følg opp ${finding.number}: ${finding.title}`, assigneeUid: tri.assigneeUid, deadline: tri.dueAt || null }] : []),
                  ...notify,
                  { type: 'completeTask', key: `iso_${finding.id}_triage` },
                ] });
              }} />
            </Card>
          ) : null}

          {['triage', 'vurdert'].includes(finding.state) && manage ? (
            <Card title="2. Tiltaksbeslutning">
              <Field label="Trengs korrigerende tiltak?" required>
                <Choice options={[{ id: 'ja', label: 'Ja' }, { id: 'nei', label: 'Nei, begrunnet' }]} value={asm.correctiveRequired === true ? 'ja' : (asm.correctiveRequired === false ? 'nei' : '')} onChange={(x) => setAsm({ ...asm, correctiveRequired: x === 'ja' ? true : (x === 'nei' ? false : null) })} />
              </Field>
              {asm.correctiveRequired === false ? <Field label="Begrunnelse" required hint="Vurderes ved lukking av en godkjenner."><TextIn multiline value={asm.rationale} onChangeText={(x) => setAsm({ ...asm, rationale: x })} /></Field> : null}
              <Field label="Korreksjon (det som rettes umiddelbart)"><TextIn value={asm.correction} onChangeText={(x) => setAsm({ ...asm, correction: x })} /></Field>
              <Btn kind="primary" label="Lagre beslutning" onPress={() => run('Beslutning', assessFinding(finding, asm, { actor }))} />
            </Card>
          ) : null}

          {finding.assessment && (finding.assessment.correctiveRequired || rootCauseRequired(finding)) && !closed && manage ? (
            <Card title="3. Årsaksvurdering" subtitle="5 × hvorfor eller fritekst. Påkrevd for middels og høyere alvorlighet når tiltak er besluttet, og alltid for personskade, nestenulykke og miljøhendelse.">
              {finding.rootCause ? (
                <>
                  {(finding.rootCause.whys || []).map((w, i) => <KV key={i} label={`Hvorfor ${i + 1}`} value={w} />)}
                  <KV label="Systemårsak" value={finding.rootCause.systemCause} />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Registrert av {finding.rootCause.by}</Text>
                </>
              ) : (
                <>
                  {rc.whys.map((w, i) => (
                    <TextIn key={i} value={w} onChangeText={(x) => setRc({ ...rc, whys: rc.whys.map((y, j) => (j === i ? x : y)) })} placeholder={`Hvorfor ${i + 1}?`} />
                  ))}
                  <Field label="Systemårsak" required><TextIn multiline rows={2} value={rc.systemCause} onChangeText={(x) => setRc({ ...rc, systemCause: x })} /></Field>
                  <Field label="Årsakskategori"><Choice small multi options={['Rutine', 'Kompetanse', 'Kommunikasjon', 'Utstyr', 'Materiale', 'Miljø', 'Ledelse', 'Leverandør']} value={rc.categories} onChange={(x) => setRc({ ...rc, categories: x })} /></Field>
                  <Btn label="Lagre årsak" onPress={() => run('Årsak', recordRootCause(finding, rc, { actor }))} />
                </>
              )}
            </Card>
          ) : null}

          <Card title="Tiltak" right={!closed && manage && finding.state !== 'registrert' ? <Btn small icon="add" label="Nytt tiltak" onPress={() => setActOpen(true)} /> : null}>
            {!(finding.actions || []).length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen tiltak registrert.</Text> : null}
            {(finding.actions || []).map((a) => {
              const mine = a.ownerUid && a.ownerUid === actor.uid;
              const open = ['apen', 'pagar', 'returnert'].includes(a.state);
              const task = store.tasks?.[String(a.taskKey || '').replace(/[^A-Za-z0-9_-]/g, '_')];
              const taskDone = !!task?.done;
              return (
                <View key={a.id} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{a.title}</Text>
                    <Pill label={actionStateLabel(a.state)} tone={a.state === 'verifisert' ? 'ok' : (a.dueAt < todayKey() && open ? 'danger' : 'info')} />
                  </Row>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{a.ownerName} · frist {prettyDate(a.dueAt)}{a.requiredEvidence ? ` · krever: ${a.requiredEvidence}` : ''}</Text>
                  {a.completionNote ? <Text style={{ color: colors.ink, fontSize: 13 }}>Utført: {a.completionNote}{(a.evidence || []).length ? ` · bevis: ${a.evidence.map((e) => e.label || e.url).join(', ')}` : ''}</Text> : null}
                  {a.returnNote ? <Text style={{ color: colors.danger, fontSize: 12 }}>Returnert: {a.returnNote}</Text> : null}
                  {a.verifiedBy ? <Text style={{ color: colors.muted, fontSize: 12 }}>Kontrollert av {a.verifiedBy}</Text> : null}
                  {task ? <Pill label={taskDone ? 'Ferdig i Oppgaver' : 'Ligger i Oppgaver'} icon="checkbox-outline" tone={taskDone ? 'ok' : 'info'} /> : null}
                  {open && taskDone ? <Banner tone="info" text="Oppgaven er markert ferdig i Oppgaver. Meld tiltaket utført her, så det kan kontrolleres." /> : null}
                  {open && (mine || manage) ? (
                    <View style={{ gap: 6 }}>
                      <TextIn value={doneNote[a.id] || ''} onChangeText={(x) => setDoneNote({ ...doneNote, [a.id]: x })} placeholder="Hva er gjort?" />
                      <TextIn value={evidenceRef[a.id] || ''} onChangeText={(x) => setEvidenceRef({ ...evidenceRef, [a.id]: x })} placeholder="Bevis (dokument-ID, lenke eller beskrivelse)" />
                      <Btn small label="Meld utført" onPress={() => run('Tiltak meldt utført', completeAction(finding, a.id, { note: doneNote[a.id] || (taskDone ? 'Markert ferdig i Oppgaver' : ''), evidence: evidenceRef[a.id] ? [{ label: evidenceRef[a.id] }] : [] }, { actor }), { effects: [{ type: 'completeTask', key: a.taskKey }] })} />
                    </View>
                  ) : null}
                  {a.state === 'til_verifisering' && manage ? (
                    <>
                      {completedBySelf(a, actor) ? <Check label="Jeg kontrollerer mitt eget tiltak (logges som egenkontroll)" value={!!selfOk[a.id]} onChange={(x) => setSelfOk({ ...selfOk, [a.id]: x })} /> : null}
                      <Row>
                        <Btn small kind="primary" label="Godkjenn gjennomføring" onPress={() => run('Tiltak kontrollert', verifyAction(finding, a.id, { approved: true, allowSelf: !!selfOk[a.id] }, { actor }))} />
                        <Btn small label="Returner" onPress={() => run('Tiltak returnert', verifyAction(finding, a.id, { approved: false, note: reason || 'Ikke tilstrekkelig dokumentert' }, { actor }))} />
                      </Row>
                    </>
                  ) : null}
                  {open && manage ? <Btn small kind="danger" label="Kanseller tiltak" onPress={() => run('Tiltak kansellert', cancelAction(finding, a.id, reason, { actor }))} /> : null}
                </View>
              );
            })}
            {!closed && manage ? <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse ved retur eller kansellering av tiltak" /> : null}
          </Card>

          {(finding.state === 'effektkontroll' || (finding.state === 'vurdert' && finding.effect?.checks?.length)) && manage ? (
            <Card title="4. Effektkontroll" subtitle="Har tiltakene hatt ønsket effekt? «Ikke verifisert» gjenåpner saken.">
              {finding.effect?.outcome === 'verifisert' ? <Banner tone="ok" text={`Effekt verifisert av ${finding.effect.checkedBy}: ${finding.effect.method}`} /> : needsNewActions(finding) ? (
                <Banner tone="warn" text="Effekten ble ikke verifisert ved forrige kontroll. Legg inn nye tiltak under Tiltak. Når de er gjennomført og kontrollert, kan effekten kontrolleres på nytt." />
              ) : (
                <>
                  <Field label="Metode" required><TextIn value={effect.method} onChangeText={(x) => setEffect({ ...effect, method: x })} placeholder="Stikkprøve, måling, oppfølgingssamtale …" /></Field>
                  <Field label="Resultat" required><TextIn multiline rows={2} value={effect.note} onChangeText={(x) => setEffect({ ...effect, note: x })} /></Field>
                  <Choice options={[{ id: 'verifisert', label: 'Effekt verifisert' }, { id: 'ikke_verifisert', label: 'Ikke verifisert' }]} value={effect.outcome} onChange={(x) => setEffect({ ...effect, outcome: x })} />
                  <Btn kind="primary" label="Lagre effektkontroll" onPress={() => run('Effektkontroll', verifyEffect(finding, effect, { actor }))} />
                  {errHere('Effektkontroll')}
                </>
              )}
            </Card>
          ) : null}

          {!closed ? (
            <Card title="5. Lukking">
              {blockers.length ? blockers.map((b) => <Text key={b} style={{ color: colors.warn, fontSize: 13 }}>• {b}</Text>) : <Banner tone="ok" text="Alle krav for lukking er oppfylt." />}
              {closeable ? (
                <>
                  <Field label="Lukkebegrunnelse" required><TextIn value={closeNote} onChangeText={setCloseNote} /></Field>
                  <Field label="Læring / erfaringsoverføring"><TextIn value={learning} onChangeText={setLearning} /></Field>
                  <Btn kind="primary" icon="lock-closed-outline" label="Godkjenn lukking" disabled={!!blockers.length} onPress={doClose} />
                  {errHere('Saken er lukket')}
                  <Divider />
                  <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse for kansellering" />
                  <Btn kind="danger" label="Kanseller saken" onPress={() => run('Saken er kansellert', cancelFinding(finding, reason, { actor, caps }))} />
                  {errHere('Saken er kansellert')}
                </>
              ) : <Text style={{ color: colors.muted, fontSize: 12 }}>Lukking krever en godkjennerrolle i ISO{finding.restricted ? ' og særskilt fullmakt for skjermede saker' : ''}.</Text>}
            </Card>
          ) : (
            <Card title={finding.state === 'lukket' ? 'Lukket' : 'Kansellert'}>
              <KV label="Lukket av" value={finding.closedBy ? `${finding.closedBy} · ${prettyDate(finding.closedAt)}` : ''} />
              <KV label="Begrunnelse" value={finding.closeNote || finding.cancelReason} />
              <KV label="Læring" value={finding.learning} />
              {finding.state === 'lukket' && caps.manage ? (
                <>
                  <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse for gjenåpning" />
                  <Btn label="Gjenåpne" onPress={() => run('Gjenåpnet', reopenFinding(finding, reason, { actor, caps }))} />
                  {errHere('Gjenåpnet')}
                </>
              ) : null}
            </Card>
          )}
        </View>

        <View style={{ flex: 2, gap: 12, width: wide ? undefined : '100%' }}>
          <CaseProcess state={state} finding={finding} wide={wide} />
          <Card title="Koblinger" subtitle="Krav, prosess og revisjon">
            {linkedReqs.length ? linkedReqs.map((r) => <ListRow key={r.id} icon="document-text-outline" title={`${r.standard ? r.standard.replace('ISO', 'ISO ') : r.kind} ${r.clause || ''} ${r.title}`} onPress={() => go('krav', { open: r.id })} />) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen krav koblet. Ved lukking kobles saken til kravet om avvik og korrigerende tiltak.</Text>}
            {manage && !closed ? <Btn small icon="link-outline" label="Koble krav" onPress={() => setReqOpen(true)} /> : null}
            {finding.links?.auditId ? <ListRow icon="search-outline" title="Fra internrevisjon" onPress={() => go('revisjon', { open: finding.links.auditId })} /> : null}
            {finding.links?.equipmentId ? <ListRow icon="construct-outline" title={`Utstyr: ${finding.links.equipmentName || 'utstyr'}`} subtitle="Kontroll og kalibrering i Utstyr" onPress={() => ctx.requestTab?.('utstyr')} /> : null}
            {finding.links?.supplierId ? <ListRow icon="cube-outline" title={`Leverandør: ${finding.links.supplierName || 'leverandør'}`} onPress={() => go('leverandorer', { open: finding.links.supplierId })} /> : null}
            {finding.links?.customerId ? <ListRow icon="people-outline" title={`Kunde: ${finding.links.customerName || 'kunde'}`} onPress={() => ctx.requestTab?.('kunder')} /> : null}
            {finding.projectId ? <ListRow icon="briefcase-outline" title={`Prosjekt: ${finding.projectName || 'prosjekt'}`} onPress={() => go('prosjekt')} /> : null}
            {(finding.links?.employeeIds || []).length && (!finding.restricted || caps.restrictedView) ? <ListRow icon="person-outline" title={`Ansatte: ${(finding.links.employeeNames || []).join(', ') || finding.links.employeeIds.length}`} /> : null}
            {manage && !closed ? <Btn small icon="git-merge-outline" label="Koble til utstyr, leverandør, kunde, prosjekt eller ansatt" onPress={() => setLinkOpen(true)} /> : null}
            {evidenceReqs.length ? (
              <>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Brukt som bevis i kravmatrisen:</Text>
                {evidenceReqs.map((r) => <ListRow key={r.id} icon="checkmark-done-outline" tone="ok" title={`${r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : r.kind} ${r.title}`} onPress={() => go('krav', { open: r.id })} />)}
              </>
            ) : null}
          </Card>
          <Card title="Historikk">
            {(shown.history || []).slice().reverse().map((h, i) => (
              <View key={i} style={{ gap: 2, paddingBottom: 6 }}>
                <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{h.action}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{h.by} · {prettyDate(h.at)} {String(h.at).slice(11, 16)}</Text>
                {h.note ? <Text style={{ color: colors.ink, fontSize: 12 }}>{h.note}</Text> : null}
              </View>
            ))}
            {/* Revisjonssporet har navn på alle som har endret saken, også melderen: bare for saksbehandlere. */}
            {caps.manage ? <Btn small label={audit ? 'Skjul revisjonsspor' : 'Vis revisjonsspor'} onPress={async () => setAudit(audit ? null : await loadAuditFor(ctx.companyId, finding.id, { restricted: !!finding.restricted }))} /> : null}
            {audit ? audit.map((e) => <Text key={e.id} style={{ color: colors.muted, fontSize: 11 }}>{String(e.at).replace('T', ' ').slice(0, 16)} · {e.action} · {e.actorName} · {e.beforeHash || '–'}→{e.afterHash}</Text>) : null}
          </Card>
        </View>
      </View>

      <Sheet visible={actOpen} title="Nytt tiltak" onClose={() => setActOpen(false)} footer={<><Btn label="Avbryt" onPress={() => setActOpen(false)} /><Btn kind="primary" label="Legg til og lag oppgave" onPress={addNewAction} /></>}>
        <Field label="Tiltak" required><TextIn multiline rows={2} value={act.title} onChangeText={(x) => setAct({ ...act, title: x })} /></Field>
        <Field label="Type"><Choice options={[{ id: 'korreksjon', label: 'Korreksjon' }, { id: 'korrigerende', label: 'Korrigerende' }, { id: 'forebyggende', label: 'Forebyggende' }]} value={act.type} onChange={(x) => setAct({ ...act, type: x || 'korrigerende' })} /></Field>
        <Field label="Ansvarlig" required hint="Får oppgave i Oppgaver."><PersonPick people={people} value={act.ownerName} onChange={(p) => setAct({ ...act, ownerName: p.name, ownerUid: p.uid })} /></Field>
        <Field label="Frist" required><DateIn value={act.dueAt} onChange={(x) => setAct({ ...act, dueAt: x })} /></Field>
        <Field label="Påkrevd dokumentasjon"><TextIn value={act.requiredEvidence} onChangeText={(x) => setAct({ ...act, requiredEvidence: x })} placeholder="F.eks. oppdatert prosedyre" /></Field>
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>

      <LinkSheet
        ctx={ctx}
        finding={finding}
        visible={linkOpen}
        onClose={() => setLinkOpen(false)}
        onSave={async (patch) => { setLinkOpen(false); await run('Koblinger', updateFindingLinks(finding, patch, { actor })); }}
      />

      <RequirementPicker
        visible={reqOpen}
        requirements={requirements}
        selected={finding.links?.requirementIds || []}
        onClose={() => setReqOpen(false)}
        onSave={async (ids) => { setReqOpen(false); await run('Koblinger', updateFindingLinks(finding, { requirementIds: ids }, { actor })); }}
      />
    </Page>
  );
}

const P02_ACTIVE = { registrert: ['a', 'b'], triage: ['c', 'f'], vurdert: ['f', 'g', 'l'], tiltak: ['h'], effektkontroll: ['j', 'k'], lukket: [], kansellert: [] };
const P02_DONE = {
  registrert: ['s'], triage: ['s', 'a', 'b'], vurdert: ['s', 'a', 'b', 'c', 'd'], tiltak: ['s', 'a', 'b', 'c', 'f', 'g'],
  effektkontroll: ['s', 'a', 'b', 'c', 'f', 'g', 'h'], lukket: ['s', 'a', 'b', 'c', 'f', 'g', 'h', 'j', 'k', 'e'], kansellert: [],
};

/** Viser saken i den publiserte avviksprosessen (samme flyt, ikke en egen kopi). */
function CaseProcess({ state, finding, wide }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const proc = (state.processes || []).find((p) => p.templateKey === 'P02_avvik' && p.publishedVersion && !p.archived);
  const version = proc ? publishedVersionOf(proc) : null;
  if (!version) return null;
  const diagram = normalizeDiagram(version.diagram);
  const ids = new Set(diagram.nodes.map((n) => n.id));
  const active = (P02_ACTIVE[finding.state] || []).filter((id) => ids.has(id));
  const done = (P02_DONE[finding.state] || []).filter((id) => ids.has(id));
  const view = fitView(diagram, wide ? 520 : 340, 240);
  return (
    <Card title="Prosessen for saken" subtitle={`${proc.title} v${proc.publishedVersion}`} right={<Btn small label={open ? 'Skjul' : 'Vis'} onPress={() => setOpen(!open)} />}>
      {open ? <IsoDiagram diagram={diagram} scale={view.scale} offset={view.offset} active={active} done={done} height={240} /> : (
        <Text style={{ color: colors.muted, fontSize: 12 }}>Nå: {active.map((id) => diagram.nodes.find((n) => n.id === id)?.label).filter(Boolean).join(' / ') || (finding.state === 'lukket' ? 'Lukket' : '–')}</Text>
      )}
    </Card>
  );
}

/** Valgene for koblinger: leverandører i ISO, kunder fra Kunder, utstyr fra Utstyr, prosjekter og ansatte. */
function linkOptions(ctx) {
  const { state, sources = {}, projects = [], people = [] } = ctx;
  return {
    suppliers: (state.records.leverandor || []).filter((r) => r.state !== 'arkivert').map((r) => ({ id: r.id, label: r.title })),
    customers: (sources.customers || []).filter((c) => c?.id && (c.name || c.navn)).map((c) => ({ id: c.id, label: c.name || c.navn })),
    equipment: (sources.equipment || []).filter((e) => e?.id && e.scope !== 'private' && e.status !== 'retired').map((e) => ({ id: e.id, label: e.name || 'Utstyr' })),
    projects: projects.map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() })),
    people: people.filter((p) => p.id).map((p) => ({ id: p.id, label: p.name })),
  };
}

/** Rød tråd (ISO-17): koble saken til utstyr, leverandør, kunde, prosjekt og involverte ansatte. */
function LinkSheet({ ctx, finding, visible, onClose, onSave }) {
  const colors = useColors();
  const opts = useMemo(() => linkOptions(ctx), [ctx.state, ctx.sources, ctx.projects, ctx.people]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = () => ({
    equipmentId: finding.links?.equipmentId || '',
    supplierId: finding.links?.supplierId || '',
    customerId: finding.links?.customerId || '',
    projectId: finding.projectId || '',
    employeeIds: finding.links?.employeeIds || [],
  });
  const [v, setV] = useState(initial);
  useEffect(() => { if (visible) setV(initial()); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (list, id) => list.find((o) => o.id === id)?.label || '';
  const pick = (key, list, title) => (list.length
    ? <Field label={title}><Choice small clearable title={title} options={list} value={v[key]} onChange={(x) => setV({ ...v, [key]: x || '' })} /></Field>
    : null);
  return (
    <Sheet
      visible={visible}
      title="Koblinger"
      onClose={onClose}
      footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Lagre" onPress={() => onSave({
        equipmentId: v.equipmentId, equipmentName: name(opts.equipment, v.equipmentId),
        supplierId: v.supplierId, supplierName: name(opts.suppliers, v.supplierId),
        customerId: v.customerId, customerName: name(opts.customers, v.customerId),
        projectId: v.projectId, projectName: name(opts.projects, v.projectId),
        employeeIds: v.employeeIds, employeeNames: v.employeeIds.map((id) => name(opts.people, id)).filter(Boolean),
      })} /></>}
    >
      <Text style={{ color: colors.muted, fontSize: 13 }}>Saken vises på utstyret, leverandøren og prosjektet, og telles i leverandørevalueringen og ledelsens gjennomgang.</Text>
      {pick('equipmentId', opts.equipment, 'Utstyr')}
      {pick('supplierId', opts.suppliers, 'Leverandør')}
      {pick('customerId', opts.customers, 'Kunde')}
      {pick('projectId', opts.projects, 'Prosjekt')}
      {opts.people.length ? (
        <Field label="Involverte ansatte" hint={finding.restricted ? 'Skjermet sak: vises bare for dem med tilgang.' : 'Personopplysninger om skade hører i en skjermet sak.'}>
          <Choice small multi title="Ansatte" options={opts.people} value={v.employeeIds} onChange={(x) => setV({ ...v, employeeIds: x || [] })} />
        </Field>
      ) : null}
    </Sheet>
  );
}

export function RequirementPicker({ visible, requirements, selected, onClose, onSave }) {
  const colors = useColors();
  const [q, setQ] = useState('');
  const [ids, setIds] = useState(selected || []);
  useEffect(() => { if (visible) setIds(selected || []); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = requirements.filter((r) => !q || `${r.clause} ${r.title} ${r.standard}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return (
    <Sheet visible={visible} title="Koble krav" onClose={onClose} footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label={`Lagre (${ids.length})`} onPress={() => onSave(ids)} /></>}>
      <TextIn value={q} onChangeText={setQ} placeholder="Søk i klausul eller tittel" />
      {list.map((r) => (
        <Check
          key={r.id}
          value={ids.includes(r.id)}
          onChange={(on) => setIds(on ? [...ids, r.id] : ids.filter((x) => x !== r.id))}
          label={`${r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : r.kind} – ${r.title}`}
        />
      ))}
      {!list.length ? <Text style={{ color: colors.muted }}>Ingen treff.</Text> : null}
    </Sheet>
  );
}

export { NewFindingSheet };
