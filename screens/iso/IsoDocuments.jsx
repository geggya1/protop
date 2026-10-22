import { requirementIdsForDocument } from '../../src/iso/integrations';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate, todayKey } from '../../src/iso/core';
import {
  ACCESS_CLASSES, DOC_TYPES, REVISION_STATES, acknowledgeRead, approveAndPublishDocument, archiveDocument, createDocument,
  docTypeLabel, hasAcknowledged, newDocumentRevision, publishedRevisionOf, rejectDocument, revisionOf, saveDocumentDraft,
  submitDocument, workingRevision,
} from '../../src/iso/documents';
import { allRequirements, attachEvidence, markForReassessment } from '../../src/iso/requirements';
import { RequirementPicker } from './IsoFindings';
import {
  Banner, Btn, Card, Check, Choice, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

const REV_TONE = { utkast: 'muted', til_gjennomgang: 'warn', godkjent: 'info', publisert: 'ok', erstattet: 'muted', avvist: 'danger' };

export default function IsoDocuments({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, params, people } = ctx;
  const [openId, setOpenId] = useState(params?.open || '');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [awaiting, setAwaiting] = useState(!!params?.awaiting);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', docType: 'prosedyre', ownerName: '', ownerUid: '', approverName: '', accessClass: 'intern', reviewIntervalMonths: '12', readAckRequired: false });
  const [err, setErr] = useState('');
  useEffect(() => { if (params?.open) setOpenId(params.open); }, [params]);

  const doc = state.documents.find((d) => d.id === openId) || null;
  if (doc) return <DocumentDetail ctx={ctx} doc={doc} onBack={() => setOpenId('')} />;

  const today = todayKey();
  const visible = state.documents.filter((d) => !d.archived)
    .filter((d) => caps.manage || d.publishedRevision)
    .filter((d) => caps.restrictedView || d.accessClass !== 'skjermet')
    .filter((d) => !type || d.docType === type)
    .filter((d) => !awaiting || workingRevision(d)?.state === 'til_gjennomgang')
    .filter((d) => !q || `${d.code} ${d.title} ${(d.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));

  async function create() {
    // Kobles automatisk til kravene dokumenttypen dokumenterer (kan endres i dokumentet).
    const res = createDocument({ ...form, requirementIds: form.requirementIds?.length ? form.requirementIds : requirementIdsForDocument(state, form.docType) }, { actor, existing: state.documents });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('documents', 'document', res);
    if (!saved.ok) { setErr(saved.error); return; }
    setCreating(false);
    setOpenId(res.document.id);
  }

  return (
    <Page
      wide={wide}
      crumb={['Styrende dokumenter']}
      title="Styrende dokumenter"
      intro="Policyer, prosedyrer og instrukser med revisjon, godkjenning og lesebekreftelse. Publisert revisjon kan ikke endres – endring gir ny revisjon."
      actions={caps.manage ? <Btn kind="primary" icon="add" label="Nytt dokument" onPress={() => { setErr(''); setCreating(true); }} /> : null}
    >
      <Card>
        <TextIn value={q} onChangeText={setQ} placeholder="Søk i dokument-ID, tittel og stikkord" />
        <Choice small options={DOC_TYPES} value={type} onChange={setType} />
        {caps.manage ? <Check label="Bare dokumenter til godkjenning" value={awaiting} onChange={setAwaiting} /> : null}
      </Card>
      <Card title={`${visible.length} dokumenter`}>
        {!visible.length ? <Empty icon="document-outline" title={state.documents.length ? 'Ingen treff' : 'Ingen dokumenter ennå'} text={caps.manage ? 'Opprett policy og rutiner, send dem til godkjenning og publiser.' : 'Ingen publiserte dokumenter.'} /> : null}
        {visible.map((d) => {
          const work = workingRevision(d);
          const due = d.nextReview && d.nextReview <= today;
          const ack = d.readAckRequired && d.publishedRevision ? hasAcknowledged(d, actor.uid) : true;
          return (
            <ListRow
              key={d.id}
              icon={d.accessClass === 'skjermet' ? 'lock-closed-outline' : 'document-text-outline'}
              tone={due ? 'warn' : 'muted'}
              title={`${d.code} · ${d.title}`}
              subtitle={[docTypeLabel(d.docType), d.publishedRevision ? `rev. ${d.publishedRevision}` : 'ikke publisert', d.ownerName, d.nextReview ? `gjennomgås ${prettyDate(d.nextReview)}` : '', work && caps.manage ? `rev. ${work.revision} ${REVISION_STATES[work.state].toLowerCase()}` : ''].filter(Boolean).join(' · ')}
              right={!ack ? <Pill label="Les og bekreft" tone="warn" /> : (due ? <Pill label="Forfalt" tone="warn" /> : null)}
              onPress={() => setOpenId(d.id)}
            />
          );
        })}
      </Card>
      <Sheet visible={creating} title="Nytt dokument" onClose={() => setCreating(false)} footer={<><Btn label="Avbryt" onPress={() => setCreating(false)} /><Btn kind="primary" label="Opprett" onPress={create} /></>}>
        <Field label="Tittel" required><TextIn value={form.title} onChangeText={(x) => setForm({ ...form, title: x })} /></Field>
        <Field label="Type" required><Choice options={DOC_TYPES} value={form.docType} onChange={(x) => setForm({ ...form, docType: x || 'prosedyre' })} /></Field>
        <Field label="Eier"><PersonPick people={people} value={form.ownerName} onChange={(p) => setForm({ ...form, ownerName: p.name, ownerUid: p.uid })} /></Field>
        <Field label="Godkjenner"><PersonPick people={people} value={form.approverName} onChange={(p) => setForm({ ...form, approverName: p.name })} /></Field>
        <Field label="Tilgang"><Choice options={ACCESS_CLASSES} value={form.accessClass} onChange={(x) => setForm({ ...form, accessClass: x || 'intern' })} /></Field>
        <Field label="Gjennomgang hver (måneder)"><Choice options={['6', '12', '24', '36']} value={form.reviewIntervalMonths} onChange={(x) => setForm({ ...form, reviewIntervalMonths: x || '12' })} /></Field>
        <Check label="Krever lesebekreftelse fra ansatte" value={form.readAckRequired} onChange={(x) => setForm({ ...form, readAckRequired: x })} />
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>
    </Page>
  );
}

function DocumentDetail({ ctx, doc, onBack }) {
  const colors = useColors();
  const { state, caps, actor, store, wide } = ctx;
  const work = workingRevision(doc);
  const pub = publishedRevisionOf(doc);
  const [showRev, setShowRev] = useState((caps.manage ? work?.revision : null) || pub?.revision || work?.revision);
  const rev = revisionOf(doc, showRev) || pub || work;
  const editable = caps.manage && work && ['utkast', 'avvist'].includes(work.state) && rev?.revision === work.revision;
  const [content, setContent] = useState(rev?.content || '');
  const [reason, setReason] = useState(work?.changeReason || '');
  const [attachment, setAttachment] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reqOpen, setReqOpen] = useState(false);
  useEffect(() => { setContent(rev?.content || ''); }, [showRev, rev?.content]);
  const requirements = useMemo(() => allRequirements(state), [state]);
  const linked = requirements.filter((r) => (doc.requirementIds || []).includes(r.id));

  async function run(label, result) {
    setErr(''); setMsg('');
    if (!result.ok) { setErr(result.error); return null; }
    const saved = await store.commit('documents', 'document', result, { previous: doc });
    if (!saved.ok) { setErr(saved.error); return null; }
    setMsg(label);
    return result.document;
  }

  async function publish() {
    const next = await run('Publisert. Forrige revisjon er bevart som «erstattet».', approveAndPublishDocument(doc, { actor, caps }));
    if (!next) return;
    // Publisert revisjon blir bevis for koblede krav. Ny revisjon flagger kravene for ny vurdering.
    if ((doc.requirementIds || []).length) {
      const att = attachEvidence(state, { type: 'document', objectId: doc.id, objectRevision: next.publishedRevision, label: `${doc.code} ${doc.title} rev. ${next.publishedRevision}` }, doc.requirementIds, { actor });
      if (att.ok) {
        let assessments = att.assessments;
        let events = att.events;
        if (next.publishedRevision > 1) {
          const flagged = markForReassessment({ ...state, assessments }, doc.requirementIds, `Dokument ${doc.code} fikk ny revisjon`, { actor });
          assessments = flagged.assessments;
          events = [...events, ...flagged.events];
        }
        await store.commitLists({ evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments }, events);
      }
    }
  }

  return (
    <Page
      wide={wide}
      crumb={['Dokumenter', doc.code]}
      title={doc.title}
      intro={`${docTypeLabel(doc.docType)} · eier ${doc.ownerName || '–'}${doc.approverName ? ` · godkjenner ${doc.approverName}` : ''} · ${ACCESS_CLASSES.find((c) => c.id === doc.accessClass)?.label}`}
      back={{ label: 'Dokumenter', onPress: onBack }}
    >
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      <Row>
        {(doc.revisions || []).filter((r) => caps.manage || r.state === 'publisert' || r.state === 'erstattet').map((r) => (
          <Btn key={r.revision} small kind={r.revision === rev?.revision ? 'primary' : 'ghost'} label={`Rev. ${r.revision} · ${REVISION_STATES[r.state]}`} onPress={() => setShowRev(r.revision)} />
        ))}
      </Row>
      {rev?.state === 'erstattet' ? <Banner tone="warn" text={`Dette er en historisk revisjon (erstattet ${prettyDate(rev.supersededAt)}). Gjeldende er rev. ${doc.publishedRevision}.`} /> : null}
      {rev?.rejectNote && rev.state === 'avvist' ? <Banner tone="danger" text={`Avvist: ${rev.rejectNote}`} /> : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title={`Innhold – rev. ${rev?.revision || ''}`} style={{ flex: 3, width: wide ? undefined : '100%' }}>
          {editable ? (
            <>
              <TextIn multiline rows={14} value={content} onChangeText={setContent} placeholder="Skriv dokumentet. Overskrifter med # og lister med – fungerer i visning." />
              {rev.revision > 1 ? <Field label="Endringsbeskrivelse" required><TextIn value={reason} onChangeText={setReason} /></Field> : null}
              <Field label="Vedlegg (lenke til PDF/Office)"><Row><View style={{ flex: 1 }}><TextIn value={attachment} onChangeText={setAttachment} placeholder="https://…" /></View><Btn small label="Legg til" onPress={() => { if (!attachment) return; run('Vedlegg lagt til', saveDocumentDraft(doc, { content, changeReason: reason, attachments: [...(work.attachments || []), { label: attachment.split('/').pop(), url: attachment }] }, { actor })); setAttachment(''); }} /></Row></Field>
              <Row>
                <Btn icon="save-outline" label="Lagre utkast" onPress={() => run('Utkast lagret', saveDocumentDraft(doc, { content, changeReason: reason }, { actor }))} />
                <Btn kind="primary" icon="send-outline" label="Send til godkjenning" onPress={async () => {
                  const saved = await run('Lagret', saveDocumentDraft(doc, { content, changeReason: reason }, { actor }));
                  if (!saved) return;
                  const res = submitDocument(saved, { actor, caps });
                  if (!res.ok) { setErr(res.error); return; }
                  const ok = await store.commit('documents', 'document', res, { previous: saved, effects: [{ type: 'requestApproval', key: `isodoc_${doc.id}_r${work.revision}`, title: `Dokument ${doc.code} rev. ${work.revision}`, roleKey: 'top_management', roleLabel: doc.approverName || 'Godkjenner' }] });
                  if (ok.ok) setMsg('Sendt til godkjenning.'); else setErr(ok.error);
                }} />
              </Row>
            </>
          ) : (
            <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 22 }}>{rev?.content || 'Ingen tekst. Se vedlegg.'}</Text>
          )}
          {(rev?.attachments || []).map((a, i) => <ListRow key={i} icon="attach-outline" title={a.label || a.url} onPress={() => a.url && Linking.openURL(a.url).catch(() => {})} />)}
          {rev?.changeReason ? <KV label="Endringsårsak" value={rev.changeReason} /> : null}
          {rev?.publishedAt ? <Text style={{ color: colors.muted, fontSize: 12 }}>Godkjent og publisert {prettyDate(rev.publishedAt)} av {rev.approvedBy} · gyldig fra {prettyDate(rev.effectiveFrom)}</Text> : null}
        </Card>
        <View style={{ flex: 2, gap: 12, width: wide ? undefined : '100%' }}>
          {pub && doc.readAckRequired ? (
            <Card title="Lesebekreftelse">
              {hasAcknowledged(doc, actor.uid) ? <Banner tone="ok" text={`Du har bekreftet rev. ${pub.revision}.`} /> : <Btn kind="primary" icon="checkmark-done-outline" label={`Jeg har lest rev. ${pub.revision}`} onPress={() => run('Lesing bekreftet', acknowledgeRead(doc, { actor }))} />}
              {caps.manage ? <Text style={{ color: colors.muted, fontSize: 12 }}>{(doc.readAcks || []).filter((a) => a.revision === pub.revision).length} har bekreftet gjeldende revisjon.</Text> : null}
            </Card>
          ) : null}
          {caps.admin && work?.state === 'til_gjennomgang' ? (
            <Card title={`Godkjenning – rev. ${work.revision}`} subtitle={`Sendt av ${work.submittedBy}`}>
              <Btn kind="primary" icon="checkmark-done" label="Godkjenn og publiser" onPress={publish} />
              <TextIn value={note} onChangeText={setNote} placeholder="Merknad ved avvisning" />
              <Btn kind="danger" label="Avvis" onPress={() => run('Avvist', rejectDocument(doc, note, { actor, caps }))} />
            </Card>
          ) : null}
          {caps.manage && !work && pub ? (
            <Card title="Endre dokumentet">
              <TextIn value={note} onChangeText={setNote} placeholder="Hvorfor endres dokumentet?" />
              <Btn icon="git-branch-outline" label="Lag ny revisjon" onPress={() => run('Ny revisjon opprettet', newDocumentRevision(doc, note, { actor }))} />
            </Card>
          ) : null}
          <Card title="Kravkoblinger">
            {linked.length ? linked.map((r) => <Text key={r.id} style={{ color: colors.ink, fontSize: 13 }}>• {r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : r.kind} {r.title}</Text>) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen krav koblet.</Text>}
            {caps.manage ? <Btn small icon="link-outline" label="Koble krav" onPress={() => setReqOpen(true)} /> : null}
          </Card>
          <Card title="Metadata">
            <KV label="Dokument-ID" value={doc.code} />
            <KV label="Neste gjennomgang" value={prettyDate(doc.nextReview)} />
            <KV label="Gjennomgangsintervall" value={`${doc.reviewIntervalMonths} måneder`} />
            {(doc.history || []).slice().reverse().slice(0, 15).map((h, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>{prettyDate(h.at)} · {h.action} · {h.by}</Text>)}
            {caps.admin ? (
              <>
                <TextIn value={note} onChangeText={setNote} placeholder="Begrunnelse for arkivering" />
                <Btn small kind="danger" label="Arkiver" onPress={() => run('Arkivert', archiveDocument(doc, note, { actor, caps }))} />
              </>
            ) : null}
          </Card>
        </View>
      </View>
      <RequirementPicker visible={reqOpen} requirements={requirements} selected={doc.requirementIds || []} onClose={() => setReqOpen(false)} onSave={async (ids) => { setReqOpen(false); await run('Koblinger lagret', { ok: true, document: { ...doc, requirementIds: ids, rev: (doc.rev || 0) + 1 }, events: [] }); }} />
    </Page>
  );
}
