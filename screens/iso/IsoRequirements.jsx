import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate } from '../../src/iso/core';
import {
  ASSESSMENT_STATUSES, NORWEGIAN_OBLIGATIONS, REQUIREMENT_KINDS, STANDARDS, assessmentLabel, kindLabel, mayBeNotApplicable,
} from '../../src/iso/catalog';
import {
  assessmentFor, attachEvidence, createCustomRequirement, linksFor, matrixRows, requirementById, reviewEvidenceLink, setAssessment,
} from '../../src/iso/requirements';
import { assessmentStatusFromCompliance, createRecord } from '../../src/iso/registers';
import {
  Banner, Btn, Card, Check, Choice, DateIn, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

const TONE = Object.fromEntries(ASSESSMENT_STATUSES.map((s) => [s.id, s.tone]));
const ICON = Object.fromEntries(ASSESSMENT_STATUSES.map((s) => [s.id, s.icon]));

function downloadCsv(rows, name) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const head = ['Type', 'Standard', 'Klausul', 'Tittel', 'Status', 'Eier', 'Bevis', 'Godkjente bevis', 'Sist vurdert', 'Vurdert av', 'Neste vurdering'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(';'), ...rows.map((r) => [kindLabel(r.kind), r.standard || '', r.clause || '', r.title, assessmentLabel(r.status), r.ownerName, r.evidenceCount, r.approvedEvidence, prettyDate(r.assessedAt), r.assessedBy, prettyDate(r.nextReview)].map(esc).join(';'))];
  const blob = new Blob([`﻿${lines.join('\n')}\nEksportert ${new Date().toISOString()} · interne vurderinger, ikke sertifisering\n`], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function IsoRequirements({ ctx, legal = false }) {
  const colors = useColors();
  const { state, caps, wide, params, actor, store } = ctx;
  const [standard, setStandard] = useState('');
  const [kind, setKind] = useState(legal ? 'lov' : '');
  const [status, setStatus] = useState(params?.status || '');
  const [q, setQ] = useState('');
  const [noEvidence, setNoEvidence] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [openId, setOpenId] = useState(params?.open || '');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (params?.status) setStatus(params.status); if (params?.open) setOpenId(params.open); }, [params]);
  const rows = useMemo(() => matrixRows(state, { standard, kind, status, search: q, onlyNoEvidence: noEvidence, onlyOverdue: overdue }), [state, standard, kind, status, q, noEvidence, overdue]);
  const active = STANDARDS.filter((s) => state.system.standards.includes(s.code));
  const existingKeys = new Set(state.requirements.map((r) => r.templateKey).filter(Boolean));

  async function addNorwegian(o) {
    const res = createCustomRequirement({ kind: 'lov', title: o.title, summary: o.summary, source: o.source, authority: o.authority, areaKeys: o.areaKeys }, { actor });
    if (!res.ok) return;
    await store.commit('requirements', 'requirement', { ...res, requirement: { ...res.requirement, templateKey: o.key } });
  }

  return (
    <Page
      wide={wide}
      crumb={[legal ? 'Lov- og kontraktskrav' : 'Krav og etterlevelse']}
      title={legal ? 'Lov- og kontraktskrav' : 'ISO-kravmatrise'}
      intro={legal
        ? 'Norske lovkrav, kontraktskrav og andre samsvarsforpliktelser. Ansvarlig må vurdere relevans og etterlevelse – ingenting blir automatisk «oppfylt».'
        : 'Kravområder per standard og klausul med intern vurdering og bevis. Kravtekstene er egne sammendrag; normativ ordlyd må kontrolleres mot lisensierte standarder.'}
      actions={(
        <>
          {caps.manage ? <Btn kind="primary" icon="add" label={legal ? 'Nytt krav' : 'Eget krav'} onPress={() => setCreating(true)} /> : null}
          {Platform.OS === 'web' ? <Btn icon="download-outline" label="Eksporter" onPress={() => downloadCsv(rows, `kravmatrise-${new Date().toISOString().slice(0, 10)}.csv`)} /> : null}
        </>
      )}
    >
      {!legal && !active.length ? <Banner tone="warn" text="Ingen standarder er aktivert. Velg standarder under Innstillinger." /> : null}
      <Card>
        <TextIn value={q} onChangeText={setQ} placeholder="Søk i klausul, tittel eller kilde" />
        {!legal ? <Choice small options={active.map((s) => ({ id: s.code, label: s.label }))} value={standard} onChange={setStandard} /> : null}
        <Choice small options={REQUIREMENT_KINDS} value={kind} onChange={setKind} />
        <Choice small options={ASSESSMENT_STATUSES.map((s) => ({ id: s.id, label: s.label }))} value={status} onChange={setStatus} />
        <Row>
          <Check label="Uten bevis" value={noEvidence} onChange={setNoEvidence} />
          <Check label="Forfalt vurdering" value={overdue} onChange={setOverdue} />
        </Row>
      </Card>

      {legal && caps.manage ? (
        <Card title="Norsk regelverkslag" subtitle="Redaktørstyrte startmaler. Legg til de som kan være relevante, og vurder dem.">
          {NORWEGIAN_OBLIGATIONS.map((o) => (
            <ListRow key={o.key} icon="library-outline" title={o.title} subtitle={o.summary} right={existingKeys.has(o.key) ? <Pill label="Lagt til" tone="ok" /> : <Btn small label="Legg til" onPress={() => addNorwegian(o)} />} />
          ))}
        </Card>
      ) : null}

      <Card title={`${rows.length} kravposter`}>
        {!rows.length ? <Empty icon="list-outline" title="Ingen krav" text={legal ? 'Legg til lovkrav fra regelverkslaget eller registrer egne.' : 'Endre filter.'} /> : null}
        {wide && rows.length ? (
          <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line }}>
            {['Krav', 'Status', 'Eier', 'Bevis', 'Sist vurdert', 'Neste'].map((h, i) => <Text key={h} style={{ flex: i === 0 ? 4 : 1.3, color: colors.muted, fontSize: 12, fontWeight: '600' }}>{h}</Text>)}
          </View>
        ) : null}
        {rows.map((r) => (wide ? (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }}>
            <Text testID="iso-row" style={{ flex: 4, color: colors.ink, fontSize: 13 }} onPress={() => setOpenId(r.id)} accessibilityRole="button">
              <Text style={{ fontWeight: '700' }}>{r.standard ? `${r.standard.replace('ISO', '')} ${r.clause}` : kindLabel(r.kind)}</Text>  {r.title}
            </Text>
            <View style={{ flex: 1.3 }}><Pill label={assessmentLabel(r.status)} tone={TONE[r.status]} icon={ICON[r.status]} /></View>
            <Text style={{ flex: 1.3, color: colors.ink, fontSize: 12 }}>{r.ownerName || '–'}</Text>
            <Text style={{ flex: 1.3, color: colors.ink, fontSize: 12 }}>{r.evidenceCount ? `${r.approvedEvidence}/${r.evidenceCount} godkj.` : '–'}</Text>
            <Text style={{ flex: 1.3, color: colors.ink, fontSize: 12 }}>{prettyDate(r.assessedAt) || '–'}</Text>
            <Text style={{ flex: 1.3, color: r.overdue ? colors.danger : colors.ink, fontSize: 12 }}>{prettyDate(r.nextReview) || '–'}</Text>
          </View>
        ) : (
          <ListRow
            key={r.id}
            icon={ICON[r.status]}
            tone={TONE[r.status]}
            title={`${r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : kindLabel(r.kind)} · ${r.title}`}
            subtitle={`${assessmentLabel(r.status)} · ${r.evidenceCount} bevis${r.ownerName ? ` · ${r.ownerName}` : ''}`}
            onPress={() => setOpenId(r.id)}
          />
        )))}
      </Card>

      {legal ? <ComplianceEvaluations ctx={ctx} /> : null}
      <RequirementSheet ctx={ctx} requirementId={openId} onClose={() => setOpenId('')} />
      <NewRequirementSheet ctx={ctx} visible={creating} legal={legal} onClose={() => setCreating(false)} />
    </Page>
  );
}

function NewRequirementSheet({ ctx, visible, legal, onClose }) {
  const colors = useColors();
  const { actor, store } = ctx;
  const [v, setV] = useState({ kind: legal ? 'lov' : 'intern', title: '', clause: '', summary: '', source: '', authority: '', customerName: '' });
  const [err, setErr] = useState('');
  async function save() {
    const res = createCustomRequirement(v, { actor });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('requirements', 'requirement', res);
    if (!saved.ok) setErr(saved.error); else onClose();
  }
  return (
    <Sheet visible={visible} title="Nytt krav" onClose={onClose} footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Lagre" onPress={save} /></>}>
      <Field label="Type" required><Choice options={REQUIREMENT_KINDS.filter((k) => k.id !== 'iso')} value={v.kind} onChange={(x) => setV({ ...v, kind: x || 'intern' })} /></Field>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{REQUIREMENT_KINDS.find((k) => k.id === v.kind)?.hint}</Text>
      <Field label="Tittel" required><TextIn value={v.title} onChangeText={(x) => setV({ ...v, title: x })} /></Field>
      <Field label="Paragraf / punkt"><TextIn value={v.clause} onChangeText={(x) => setV({ ...v, clause: x })} /></Field>
      <Field label="Tolket plikt for virksomheten"><TextIn multiline value={v.summary} onChangeText={(x) => setV({ ...v, summary: x })} /></Field>
      <Field label="Kilde" required={v.kind === 'lov'}><TextIn value={v.source} onChangeText={(x) => setV({ ...v, source: x })} placeholder="Lov/forskrift, lenke eller kontrakt" /></Field>
      {v.kind === 'kontrakt' ? <Field label="Kunde"><TextIn value={v.customerName} onChangeText={(x) => setV({ ...v, customerName: x })} /></Field> : <Field label="Myndighet"><TextIn value={v.authority} onChangeText={(x) => setV({ ...v, authority: x })} /></Field>}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
    </Sheet>
  );
}

function RequirementSheet({ ctx, requirementId, onClose }) {
  const colors = useColors();
  const { state, caps, actor, store, people, wide } = ctx;
  const req = requirementId ? requirementById(state, requirementId) : null;
  const a = req ? assessmentFor(state, req.id) : null;
  const links = req ? linksFor(state, req.id) : [];
  const [v, setV] = useState({ status: '', rationale: '', ownerName: '', ownerUid: '', nextReview: '' });
  const [ev, setEv] = useState({ label: '', url: '' });
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (req) { setV({ status: a?.status || 'ikke_vurdert', rationale: '', ownerName: a?.ownerName || '', ownerUid: a?.ownerUid || '', nextReview: a?.nextReview || '' }); setErr(''); setMsg(''); } }, [requirementId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!req) return null;

  async function saveAssessment() {
    const res = setAssessment(state, req.id, v, { actor, caps });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commitLists({ assessments: res.assessments }, res.events);
    if (saved.ok) setMsg('Vurdering lagret.'); else setErr(saved.error);
  }

  async function addEvidence() {
    if (!ev.label) { setErr('Beskriv beviset.'); return; }
    const res = attachEvidence(state, { type: 'manuell', objectId: `man_${Date.now().toString(36)}`, label: ev.label, note: ev.url }, [req.id], { actor });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commitLists({ evidence: res.evidence, evidenceLinks: res.evidenceLinks, assessments: res.assessments }, res.events);
    if (saved.ok) { setEv({ label: '', url: '' }); setMsg('Bevis koblet.'); } else setErr(saved.error);
  }

  async function review(link, decision) {
    const res = reviewEvidenceLink(state, link.id, { decision, note }, { actor, caps });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commitLists({ evidenceLinks: res.evidenceLinks }, res.events);
    if (!saved.ok) setErr(saved.error);
  }

  const evidenceById = new Map(state.evidence.map((e) => [e.id, e]));
  const statusOptions = ASSESSMENT_STATUSES.filter((s) => s.id !== 'ikke_relevant' || mayBeNotApplicable(req));

  return (
    <Sheet visible title={`${req.standard ? `${req.standard.replace('ISO', 'ISO ')} ${req.clause}` : kindLabel(req.kind)} – ${req.title}`} onClose={onClose} wide={wide}>
      <Row>
        <Pill label={kindLabel(req.kind)} tone="info" />
        <Pill label={assessmentLabel(a?.status || 'ikke_vurdert')} tone={TONE[a?.status || 'ikke_vurdert']} />
        {req.reviewStatus === 'ikke_faglig_validert' ? <Pill label="Kobling ikke faglig validert" tone="warn" /> : null}
        {req.reviewStatus === 'krever_juridisk_vurdering' ? <Pill label="Krever juridisk/ansvarlig vurdering" tone="warn" /> : null}
      </Row>
      <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 21 }}>{req.summary}</Text>
      <KV label="Kilde" value={req.source} />
      <KV label="Siste vurdering" value={a?.assessedAt ? `${assessmentLabel(a.status)} · ${a.assessedBy} · ${prettyDate(a.assessedAt)}` : ''} />
      <KV label="Begrunnelse" value={a?.rationale} />

      <Text style={{ color: colors.ink, fontWeight: '700' }}>Bevis ({links.length})</Text>
      {!links.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen bevis koblet. Et vedlegg alene betyr ikke at kravet er oppfylt.</Text> : null}
      {links.map((l) => {
        const e = evidenceById.get(l.evidenceId);
        return (
          <View key={l.id} style={{ gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line }}>
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{e?.label || l.evidenceId}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{e?.type} {e?.objectRevision ? `· revisjon ${e.objectRevision}` : ''} · koblet {prettyDate(l.createdAt)} av {l.createdBy} · {l.reviewState === 'godkjent' ? `godkjent av ${l.reviewedBy}` : (l.reviewState === 'avvist' ? `avvist: ${l.reviewNote}` : 'til vurdering')}</Text>
            {caps.manage && l.reviewState === 'til_vurdering' ? (
              <Row>
                <Btn small kind="primary" label="Godta som bevis" onPress={() => review(l, 'godkjent')} />
                <Btn small label="Avvis" onPress={() => review(l, 'avvist')} />
              </Row>
            ) : null}
          </View>
        );
      })}
      {caps.manage ? (
        <>
          <TextIn value={note} onChangeText={setNote} placeholder="Merknad ved avvisning av bevis" />
          <Field label="Koble annet bevis"><TextIn value={ev.label} onChangeText={(x) => setEv({ ...ev, label: x })} placeholder="Beskrivelse (dokument, registrering, møtereferat …)" /><TextIn value={ev.url} onChangeText={(x) => setEv({ ...ev, url: x })} placeholder="Lenke eller referanse" /></Field>
          <Btn small icon="link-outline" label="Koble bevis" onPress={addEvidence} />
          <Text style={{ color: colors.ink, fontWeight: '700', marginTop: 8 }}>Vurdering</Text>
          <Choice small options={statusOptions.map((s) => ({ id: s.id, label: s.label }))} value={v.status} onChange={(x) => setV({ ...v, status: x || 'ikke_vurdert' })} />
          {v.status === 'internt_verifisert' ? <Banner tone="info" text="Internt verifisert krever minst ett godkjent bevis og en begrunnelse som viser hva som er kontrollert." /> : null}
          <Field label="Begrunnelse"><TextIn multiline rows={3} value={v.rationale} onChangeText={(x) => setV({ ...v, rationale: x })} /></Field>
          <Field label="Kravansvarlig"><PersonPick people={people} value={v.ownerName} onChange={(p) => setV({ ...v, ownerName: p.name, ownerUid: p.uid })} /></Field>
          <Field label="Neste vurdering"><DateIn value={v.nextReview} onChange={(x) => setV({ ...v, nextReview: x })} /></Field>
          <Btn kind="primary" label="Lagre vurdering" onPress={saveAssessment} />
        </>
      ) : null}
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {(a?.history || []).slice().reverse().slice(0, 10).map((h, i) => <Text key={i} style={{ color: colors.muted, fontSize: 11 }}>{prettyDate(h.at)} · {h.action} · {h.by}{h.note ? ` · ${h.note}` : ''}</Text>)}
    </Sheet>
  );
}

/** Samsvarsvurderinger (SF26). Resultat oppdaterer kravstatus, men aldri til «internt verifisert». */
function ComplianceEvaluations({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store } = ctx;
  const legalReqs = matrixRows(state, { kind: 'lov' }).concat(matrixRows(state, { kind: 'kontrakt' }));
  const [v, setV] = useState({ requirementId: '', title: '', method: '', result: '', evidence: '', nextReview: '' });
  const [err, setErr] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  async function save() {
    setErr('');
    const res = createRecord('samsvar', v, { actor, existing: state.records.samsvar });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('records', 'record', res);
    if (!saved.ok) { setErr(saved.error); return; }
    const status = assessmentStatusFromCompliance(v.result);
    const as = setAssessment(state, v.requirementId, { status, rationale: `Samsvarsvurdering ${res.record.number}: ${v.result}. ${v.method}`, nextReview: v.nextReview }, { actor, caps });
    if (as.ok) {
      const att = attachEvidence({ ...state, assessments: as.assessments }, { type: 'samsvar', objectId: res.record.id, objectRevision: res.record.rev, label: `${res.record.number} ${v.title}` }, [v.requirementId], { actor });
      await store.commitLists({ assessments: att.ok ? att.assessments : as.assessments, ...(att.ok ? { evidence: att.evidence, evidenceLinks: att.evidenceLinks } : {}) }, [...as.events, ...(att.events || [])]);
    }
    setV({ requirementId: '', title: '', method: '', result: '', evidence: '', nextReview: '' });
  }
  return (
    <Card title="Samsvarsvurderinger" subtitle="Planlagt og dokumentert vurdering av etterlevelse.">
      {(state.records.samsvar || []).slice().reverse().map((r) => (
        <ListRow key={r.id} icon="checkmark-circle-outline" tone={r.nextReview && r.nextReview < today ? 'warn' : 'muted'} title={`${r.number} · ${r.title}`} subtitle={`${r.result} · neste ${prettyDate(r.nextReview)}${r.nextReview && r.nextReview < today ? ' · FORFALT – må revurderes' : ''}`} />
      ))}
      {caps.manage ? (
        <>
          <Field label="Krav" required><Choice small options={legalReqs.map((r) => ({ id: r.id, label: r.title }))} value={v.requirementId} onChange={(x) => setV({ ...v, requirementId: x, title: v.title || `Vurdering: ${legalReqs.find((r) => r.id === x)?.title || ''}` })} /></Field>
          {!legalReqs.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Legg til lov- eller kontraktskrav først.</Text> : null}
          <Field label="Tittel" required><TextIn value={v.title} onChangeText={(x) => setV({ ...v, title: x })} /></Field>
          <Field label="Vurderingsmetode" required><TextIn multiline rows={2} value={v.method} onChangeText={(x) => setV({ ...v, method: x })} placeholder="Hva er kontrollert, og hvordan?" /></Field>
          <Field label="Resultat" required><Choice small options={['Etterleves', 'Delvis', 'Etterleves ikke', 'Krever juridisk vurdering']} value={v.result} onChange={(x) => setV({ ...v, result: x })} /></Field>
          <Field label="Bevis"><TextIn value={v.evidence} onChangeText={(x) => setV({ ...v, evidence: x })} /></Field>
          <Field label="Neste vurdering" required><DateIn value={v.nextReview} onChange={(x) => setV({ ...v, nextReview: x })} /></Field>
          <Btn kind="primary" label="Registrer vurdering" onPress={save} />
          {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        </>
      ) : null}
    </Card>
  );
}
