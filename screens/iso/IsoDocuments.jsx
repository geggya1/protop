import { requirementIdsForDocument } from '../../src/iso/integrations';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate, todayKey } from '../../src/iso/core';
import {
  ACCESS_CLASSES, DOC_TYPES, REVISION_STATES, acknowledgeRead, approveAndPublishDocument, archiveDocument, createDocument,
  docTypeLabel, folderLabel, hasAcknowledged, newDocumentRevision, nextDocumentCode, normalizeDocStructure, publishedRevisionOf,
  rejectDocument, revisionOf, saveDocumentDraft, submitDocument, workingRevision,
} from '../../src/iso/documents';
import { markdownToPlain, outline } from '../../src/iso/markdown';
import { allRequirements, attachEvidence, markForReassessment } from '../../src/iso/requirements';
import { pickDocument, uploadFile } from '../../src/utils/media';
import { RequirementPicker } from './IsoFindings';
import IsoMarkdown from './IsoMarkdown';
import {
  Banner, Btn, Card, Check, Choice, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

const REV_TONE = { utkast: 'muted', til_gjennomgang: 'warn', godkjent: 'info', publisert: 'ok', erstattet: 'muted', avvist: 'danger' };

/** Tekst som søkes i: kode, tittel, stikkord og innholdet i siste revisjon. */
function searchText(d) {
  const rev = publishedRevisionOf(d) || workingRevision(d) || (d.revisions || []).at(-1);
  return `${d.code} ${d.title} ${(d.tags || []).join(' ')} ${d.source?.originalCode || ''} ${markdownToPlain(rev?.content || '').slice(0, 20000)}`.toLowerCase();
}

function safeName(name) {
  return String(name || 'fil').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}

export default function IsoDocuments({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, params, people } = ctx;
  const [openId, setOpenId] = useState(params?.open || '');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [folder, setFolder] = useState('');
  const [awaiting, setAwaiting] = useState(!!params?.awaiting);
  const [creating, setCreating] = useState(false);
  const blank = { title: '', docType: 'prosedyre', folder: '', code: '', ownerName: '', ownerUid: '', approverName: '', accessClass: 'intern', reviewIntervalMonths: '12', readAckRequired: false };
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (params?.open) setOpenId(params.open);
    if (params?.awaiting) setAwaiting(true);
    if (params?.type) setType(params.type);
    // Fra andre sider: «Skriv nyhet», «Nytt dokument i mappen» … åpner skjemaet ferdig utfylt.
    if (params?.create && caps.manage) { setErr(''); setForm({ ...blank, ...(params.prefill || {}) }); setCreating(true); }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const structure = useMemo(() => normalizeDocStructure(state.system?.docStructure), [state.system?.docStructure]);
  const folders = useMemo(() => structure.flatMap((p) => p.folders.map((f) => ({ ...f, part: p.code }))), [structure]);

  const doc = state.documents.find((d) => d.id === openId) || null;
  if (doc) return <DocumentDetail ctx={ctx} doc={doc} structure={structure} onBack={() => setOpenId('')} onOpen={setOpenId} />;

  const today = todayKey();
  const ql = q.trim().toLowerCase();
  const visible = state.documents.filter((d) => !d.archived)
    .filter((d) => caps.manage || d.publishedRevision)
    .filter((d) => caps.restrictedView || d.accessClass !== 'skjermet')
    .filter((d) => !type || d.docType === type)
    .filter((d) => !folder || d.folder === folder || String(d.folder || '').startsWith(`${folder}-`))
    .filter((d) => !awaiting || workingRevision(d)?.state === 'til_gjennomgang')
    .filter((d) => !ql || searchText(d).includes(ql))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'nb', { numeric: true }));

  async function create() {
    // Kobles automatisk til kravene dokumenttypen dokumenterer (kan endres i dokumentet).
    const res = createDocument({ ...form, requirementIds: form.requirementIds?.length ? form.requirementIds : requirementIdsForDocument(state, form.docType) }, { actor, existing: state.documents });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('documents', 'document', res);
    if (!saved.ok) { setErr(saved.error); return; }
    setCreating(false);
    setForm(blank);
    setOpenId(res.document.id);
  }

  const row = (d) => {
    const work = workingRevision(d);
    const due = d.nextReview && d.nextReview <= today;
    const ack = d.readAckRequired && d.publishedRevision ? hasAcknowledged(d, actor.uid) : true;
    return (
      <ListRow
        key={d.id}
        icon={d.accessClass === 'skjermet' ? 'lock-closed-outline' : (d.docType === 'nyhet' ? 'megaphone-outline' : 'document-text-outline')}
        tone={due ? 'warn' : 'muted'}
        title={`${d.code} · ${d.title}`}
        subtitle={[docTypeLabel(d.docType), d.publishedRevision ? `rev. ${d.publishedRevision}` : 'ikke publisert', d.ownerName, d.nextReview ? `gjennomgås ${prettyDate(d.nextReview)}` : '', work && caps.manage ? `rev. ${work.revision} ${REVISION_STATES[work.state].toLowerCase()}` : ''].filter(Boolean).join(' · ')}
        right={!ack ? <Pill label="Les og bekreft" tone="warn" /> : (due ? <Pill label="Forfalt" tone="warn" /> : (work?.state === 'til_gjennomgang' && caps.approve ? <Pill label="Til godkjenning" tone="warn" /> : null))}
        onPress={() => setOpenId(d.id)}
      />
    );
  };

  // Gruppering: virksomhetens dokumentstruktur (del → mappe), ellers én liste.
  const grouped = structure.length && !type && !ql;
  const known = new Set(folders.map((f) => f.code));
  const loose = visible.filter((d) => !known.has(d.folder));

  return (
    <Page
      wide={wide}
      crumb={['Styrende dokumenter']}
      title="Styrende dokumenter"
      intro="Policyer, prosedyrer, instrukser, håndbøker og maler med revisjon, godkjenning og lesebekreftelse. Publisert revisjon kan ikke endres – endring gir ny revisjon."
      actions={caps.manage ? <Btn kind="primary" icon="add" label="Nytt dokument" onPress={() => { setErr(''); setForm(blank); setCreating(true); }} /> : null}
    >
      <Card>
        <TextIn value={q} onChangeText={setQ} placeholder="Søk i dokument-ID, tittel, stikkord og innhold" />
        {structure.length ? <Choice small options={[{ id: '', label: 'Alle mapper' }, ...structure.map((p) => ({ id: p.code, label: `${p.code} – ${p.title}` }))]} value={folder} onChange={(x) => setFolder(x || '')} /> : null}
        <Choice small options={DOC_TYPES} value={type} onChange={setType} />
        {caps.manage ? <Check label="Bare dokumenter til godkjenning" value={awaiting} onChange={setAwaiting} /> : null}
      </Card>
      {!visible.length ? (
        <Card><Empty icon="document-outline" title={state.documents.length ? 'Ingen treff' : 'Ingen dokumenter ennå'} text={caps.manage ? 'Opprett policy og rutiner, send dem til godkjenning og publiser. Har dere et system fra før, kan det importeres under Innstillinger.' : 'Ingen publiserte dokumenter.'} /></Card>
      ) : null}
      {grouped ? (
        <>
          {structure.map((p) => {
            const inPart = visible.filter((d) => p.folders.some((f) => f.code === d.folder));
            if (!inPart.length) return null;
            return (
              <Card key={p.code} title={`${p.code} – ${p.title}`} subtitle={`${inPart.length} dokumenter${p.description ? ` · ${p.description}` : ''}`}>
                {p.folders.map((f) => {
                  const list = inPart.filter((d) => d.folder === f.code);
                  if (!list.length) return null;
                  return (
                    <View key={f.code} style={{ gap: 2 }}>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 6 }}>{f.code} {f.title.toUpperCase()}</Text>
                      {list.map(row)}
                    </View>
                  );
                })}
              </Card>
            );
          })}
          {loose.length ? <Card title="Uten mappe" subtitle={`${loose.length} dokumenter`}>{loose.map(row)}</Card> : null}
        </>
      ) : (visible.length ? <Card title={`${visible.length} dokumenter`}>{visible.map(row)}</Card> : null)}
      <Sheet visible={creating} title="Nytt dokument" onClose={() => setCreating(false)} footer={<><Btn label="Avbryt" onPress={() => setCreating(false)} /><Btn kind="primary" label="Opprett" onPress={create} /></>}>
        <Field label="Tittel" required><TextIn value={form.title} onChangeText={(x) => setForm({ ...form, title: x })} /></Field>
        <Field label="Type" required><Choice small options={DOC_TYPES} value={form.docType} onChange={(x) => setForm({ ...form, docType: x || 'prosedyre' })} /></Field>
        {folders.length ? (
          <Field label="Mappe" hint="Dokumentet får neste ledige kode i mappen.">
            <Choice small options={folders.map((f) => ({ id: f.code, label: `${f.code} ${f.title}` }))} value={form.folder} onChange={(x) => setForm({ ...form, folder: x || '', code: x ? nextDocumentCode(x, state.documents) : '' })} />
          </Field>
        ) : null}
        <Field label="Dokument-ID" hint="Tomt = neste ledige løpenummer."><TextIn value={form.code} onChangeText={(x) => setForm({ ...form, code: x })} placeholder={form.folder ? nextDocumentCode(form.folder, state.documents) : 'DOK-…'} /></Field>
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

function DocumentDetail({ ctx, doc, structure, onBack }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, go, companyId } = ctx;
  const work = workingRevision(doc);
  const pub = publishedRevisionOf(doc);
  const [showRev, setShowRev] = useState((caps.manage ? work?.revision : null) || pub?.revision || work?.revision);
  const rev = revisionOf(doc, showRev) || pub || work;
  const editable = caps.manage && work && ['utkast', 'avvist'].includes(work.state) && rev?.revision === work.revision;
  const [content, setContent] = useState(rev?.content || '');
  const [preview, setPreview] = useState(false);
  const [reason, setReason] = useState(work?.changeReason || '');
  const [link, setLink] = useState({ label: '', url: '' });
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [reqOpen, setReqOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  useEffect(() => { setContent(rev?.content || ''); }, [showRev, rev?.content]);
  const requirements = useMemo(() => allRequirements(state), [state]);
  const linked = requirements.filter((r) => (doc.requirementIds || []).includes(r.id));
  const processes = (state.processes || []).filter((p) => !p.archived && ((doc.processIds || []).includes(p.id) || (p.documentIds || []).includes(doc.id)));
  const toc = useMemo(() => outline(rev?.content || ''), [rev?.content]);

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

  async function addAttachments(list) {
    await run(list.length === 1 ? 'Vedlegg lagt til' : `${list.length} vedlegg lagt til`, saveDocumentDraft(doc, { content, changeReason: reason, attachments: [...(work.attachments || []), ...list] }, { actor }));
  }

  async function upload() {
    setErr('');
    try {
      const picked = await pickDocument({ multiple: false, accept: '*/*' });
      if (!picked) return;
      setUploading(true);
      const path = `families/${companyId}/iso/documents/${doc.id}/${Date.now()}-${safeName(picked.name)}`;
      const url = await uploadFile(path, picked);
      setUploading(false);
      if (!url) { setErr('Opplastingen ga ingen lenke.'); return; }
      await addAttachments([{ label: picked.name || 'Vedlegg', url, path, contentType: picked.mimeType || '', size: picked.size || 0, kind: 'fil' }]);
    } catch (e) {
      setUploading(false);
      setErr(e?.message || 'Kunne ikke laste opp filen.');
    }
  }

  return (
    <Page
      wide={wide}
      crumb={['Dokumenter', doc.code]}
      title={doc.title}
      intro={`${doc.code} · ${docTypeLabel(doc.docType)}${doc.folder ? ` · ${folderLabel(structure, doc.folder)}` : ''} · eier ${doc.ownerName || '–'}${doc.approverName ? ` · godkjenner ${doc.approverName}` : ''} · ${ACCESS_CLASSES.find((c) => c.id === doc.accessClass)?.label}`}
      back={{ label: 'Dokumenter', onPress: onBack }}
      actions={<Btn icon="bulb-outline" label="Meld feil eller forbedring" onPress={() => go('avvik', { create: true, prefill: { type: 'forbedring', title: `Forbedring i ${doc.code} ${doc.title}`.slice(0, 200), documentIds: [doc.id] } })} />}
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
      {!pub && rev?.state === 'til_gjennomgang' ? <Banner tone="warn" text="Venter på godkjenning. Dokumentet er ikke synlig for ansatte før det er publisert." /> : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title={`Innhold – rev. ${rev?.revision || ''}`} style={{ flex: 3, width: wide ? undefined : '100%' }} right={editable ? <Btn small icon={preview ? 'create-outline' : 'eye-outline'} label={preview ? 'Rediger' : 'Forhåndsvis'} onPress={() => setPreview(!preview)} /> : null}>
          {toc.length >= 4 && !(editable && !preview) ? (
            <View style={{ gap: 2, padding: 10, borderRadius: 10, backgroundColor: colors.sunken }}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>INNHOLD</Text>
              {toc.map((h, i) => <Text key={i} style={{ color: colors.ink, fontSize: 12, paddingLeft: (h.level - 1) * 12 }}>{h.text}</Text>)}
            </View>
          ) : null}
          {editable && !preview ? (
            <>
              <TextIn multiline rows={16} value={content} onChangeText={setContent} placeholder="Skriv dokumentet. # Overskrift, - punkt, 1. nummerert, | a | b | tabell, **fet**, [lenke](https://…)." />
              {rev.revision > 1 ? <Field label="Endringsbeskrivelse" required><TextIn value={reason} onChangeText={setReason} /></Field> : null}
            </>
          ) : (
            rev?.content ? <IsoMarkdown text={editable ? content : rev.content} /> : <Text style={{ color: colors.muted }}>Ingen tekst. Se vedlegg.</Text>
          )}
          {(rev?.attachments || []).map((a, i) => (
            <ListRow
              key={i}
              icon={a.kind === 'original' ? 'archive-outline' : (a.kind === 'fil' ? 'document-attach-outline' : 'link-outline')}
              title={a.label || a.url}
              subtitle={[a.kind === 'original' ? 'Original fra tidligere system' : (a.kind === 'fil' ? 'Fil i ProTop' : 'Lenke'), a.size ? `${Math.max(1, Math.round(a.size / 1024))} kB` : ''].filter(Boolean).join(' · ')}
              onPress={() => a.url && Linking.openURL(a.url).catch(() => {})}
              right={editable ? <Btn small icon="close" accessibilityLabel={`Fjern vedlegg ${a.label}`} onPress={() => run('Vedlegg fjernet', saveDocumentDraft(doc, { content, changeReason: reason, attachments: (work.attachments || []).filter((_, j) => j !== i) }, { actor }))} /> : null}
            />
          ))}
          {editable ? (
            <Field label="Vedlegg">
              <Row>
                <Btn small icon="cloud-upload-outline" label="Last opp fil" busy={uploading} onPress={upload} />
              </Row>
              <Row>
                <View style={{ flex: 1, minWidth: 140 }}><TextIn value={link.label} onChangeText={(x) => setLink({ ...link, label: x })} placeholder="Navn på lenken" /></View>
                <View style={{ flex: 2, minWidth: 180 }}><TextIn value={link.url} onChangeText={(x) => setLink({ ...link, url: x })} placeholder="https://…" /></View>
                <Btn small label="Legg til lenke" onPress={() => { if (!link.url) return; addAttachments([{ label: link.label || link.url.split('/').pop(), url: link.url, kind: 'lenke' }]); setLink({ label: '', url: '' }); }} />
              </Row>
            </Field>
          ) : null}
          {editable ? (
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
          ) : null}
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
          {caps.approve && work?.state === 'til_gjennomgang' ? (
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
          <Card title="Prosesser" subtitle="Prosesser dokumentet styrer eller brukes i.">
            {processes.length ? processes.map((p) => (
              <ListRow key={p.id} icon="git-network-outline" title={`${p.code ? `${p.code} ` : ''}${p.title}`} subtitle={p.publishedVersion ? `v${p.publishedVersion} publisert` : 'Ikke publisert'} onPress={() => go('prosesser', { open: p.id })} />
            )) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ikke koblet til en prosess.</Text>}
          </Card>
          <Card title="Kravkoblinger">
            {linked.length ? linked.map((r) => <Text key={r.id} style={{ color: colors.ink, fontSize: 13 }}>• {r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : r.kind} {r.title}</Text>) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen krav koblet.</Text>}
            {caps.manage ? <Btn small icon="link-outline" label="Koble krav" onPress={() => setReqOpen(true)} /> : null}
          </Card>
          <Card title="Metadata" right={editable ? <Btn small icon="create-outline" label="Endre" onPress={() => setMetaOpen(true)} /> : null}>
            <KV label="Dokument-ID" value={doc.code} />
            {doc.folder ? <KV label="Mappe" value={folderLabel(structure, doc.folder)} /> : null}
            <KV label="Neste gjennomgang" value={prettyDate(doc.nextReview)} />
            <KV label="Gjennomgangsintervall" value={`${doc.reviewIntervalMonths} måneder`} />
            {(doc.tags || []).length ? <KV label="Stikkord" value={doc.tags.join(', ')} /> : null}
            {doc.source ? (
              <>
                <KV label="Kilde" value={[doc.source.system, doc.source.originalCode ? `tidl. ID ${doc.source.originalCode}` : '', doc.source.originalVersion ? `versjon ${doc.source.originalVersion}` : '', doc.source.originalCreated ? `opprettet ${doc.source.originalCreated}` : ''].filter(Boolean).join(' · ')} />
                {doc.source.path ? <Text style={{ color: colors.muted, fontSize: 12 }}>{doc.source.path}</Text> : null}
                {doc.source.note ? <Text style={{ color: colors.muted, fontSize: 12 }}>{doc.source.note}</Text> : null}
              </>
            ) : null}
            {(doc.legacyRevisions || []).length ? (
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, marginTop: 6 }}>Revisjonshistorikk fra tidligere system</Text>
                {doc.legacyRevisions.map((r, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>Rev. {r.rev} · {r.date ? (prettyDate(r.date) || r.date) : '–'} · {r.reason}{r.by ? ` · ${r.by}` : ''}</Text>)}
              </View>
            ) : null}
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, marginTop: 6 }}>Historikk i ProTop</Text>
            {(doc.history || []).slice().reverse().slice(0, 15).map((h, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>{prettyDate(h.at)} · {h.action} · {h.by}</Text>)}
            {caps.approve ? (
              <>
                <TextIn value={note} onChangeText={setNote} placeholder="Begrunnelse for arkivering" />
                <Btn small kind="danger" label="Arkiver" onPress={() => run('Arkivert', archiveDocument(doc, note, { actor, caps }))} />
              </>
            ) : null}
          </Card>
        </View>
      </View>
      <RequirementPicker visible={reqOpen} requirements={requirements} selected={doc.requirementIds || []} onClose={() => setReqOpen(false)} onSave={async (ids) => { setReqOpen(false); await run('Koblinger lagret', { ok: true, document: { ...doc, requirementIds: ids, rev: (doc.rev || 0) + 1 }, events: [] }); }} />
      <MetaSheet ctx={ctx} doc={doc} structure={structure} visible={metaOpen} onClose={() => setMetaOpen(false)} onSave={async (patch) => { const ok = await run('Metadata lagret', saveDocumentDraft(doc, { ...patch, content, changeReason: reason }, { actor, existing: state.documents })); if (ok) setMetaOpen(false); }} />
    </Page>
  );
}

/** Dokument-ID, mappe, type, stikkord og prosesser (bare i utkast). */
function MetaSheet({ ctx, doc, structure, visible, onClose, onSave }) {
  const { state } = ctx;
  const [v, setV] = useState({});
  useEffect(() => {
    if (visible) setV({ code: doc.code, folder: doc.folder || '', docType: doc.docType, tags: (doc.tags || []).join(', '), processIds: doc.processIds || [] });
  }, [visible, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const folders = structure.flatMap((p) => p.folders);
  return (
    <Sheet visible={visible} title="Metadata" onClose={onClose} footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Lagre" onPress={() => onSave({ code: v.code, folder: v.folder, docType: v.docType, tags: String(v.tags || '').split(',').map((t) => t.trim()).filter(Boolean), processIds: v.processIds })} /></>}>
      <Field label="Dokument-ID"><TextIn value={v.code} onChangeText={(x) => setV({ ...v, code: x })} /></Field>
      {folders.length ? <Field label="Mappe"><Choice small options={folders.map((f) => ({ id: f.code, label: `${f.code} ${f.title}` }))} value={v.folder} onChange={(x) => setV({ ...v, folder: x || '' })} /></Field> : null}
      <Field label="Type"><Choice small options={DOC_TYPES} value={v.docType} onChange={(x) => setV({ ...v, docType: x || doc.docType })} /></Field>
      <Field label="Stikkord" hint="Skill med komma."><TextIn value={v.tags} onChangeText={(x) => setV({ ...v, tags: x })} /></Field>
      {(state.processes || []).length ? (
        <Field label="Prosesser">
          <Choice small multi options={(state.processes || []).filter((p) => !p.archived).map((p) => ({ id: p.id, label: `${p.code ? `${p.code} ` : ''}${p.title}` }))} value={v.processIds || []} onChange={(x) => setV({ ...v, processIds: x })} />
        </Field>
      ) : null}
    </Sheet>
  );
}
