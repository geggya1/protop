import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate } from '../../src/iso/core';
import {
  FIELD_TYPES, FORM_TEMPLATES, calculatedValue, createFormDefinition, fieldRequired, fieldVisible, formDraft, formPublished,
  makeField, newFormVersion, publishForm, saveFormDraft, submitForm, validateDefinition,
} from '../../src/iso/forms';
import { createFinding } from '../../src/iso/findings';
import { allRequirements } from '../../src/iso/requirements';
import {
  Banner, Btn, Card, Check, Choice, DateIn, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

export default function IsoForms({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, params } = ctx;
  const [openId, setOpenId] = useState('');
  const [fillKey, setFillKey] = useState(params?.fill || '');
  const [tplOpen, setTplOpen] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { if (params?.fill) setFillKey(params.fill); }, [params]);
  const form = state.forms.find((f) => f.id === openId) || null;
  if (form) return <FormBuilder ctx={ctx} form={form} onBack={() => setOpenId('')} />;

  const published = state.forms.filter((f) => f.publishedVersion);
  const list = state.forms.filter((f) => (caps.manage || f.publishedVersion) && (!q || f.title.toLowerCase().includes(q.toLowerCase())));
  const installed = new Set(state.forms.map((f) => f.templateKey || f.key));

  async function fromTemplate(t) {
    setErr('');
    const res = createFormDefinition({ ...t, templateKey: t.key }, { actor });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('forms', 'form', res);
    if (!saved.ok) { setErr(saved.error); return; }
    setTplOpen(false);
    setOpenId(res.form.id);
  }

  async function blank() {
    const res = createFormDefinition({ title: 'Nytt skjema', fields: [{ type: 'short_text', key: 'tittel', label: 'Tittel', required: true }] }, { actor });
    const saved = await store.commit('forms', 'form', res);
    if (saved.ok) { setTplOpen(false); setOpenId(res.form.id); } else setErr(saved.error);
  }

  return (
    <Page
      wide={wide}
      crumb={['Skjemaer og sjekklister']}
      title="Skjemaer og sjekklister"
      intro="Styrte skjema er versjonert. En innsendt registrering låses og beholder skjemaversjonen den ble fylt ut på."
      actions={caps.manage ? <Btn kind="primary" icon="add" label="Nytt skjema" onPress={() => setTplOpen(true)} /> : null}
    >
      {err ? <Banner tone="danger" text={err} /> : null}
      <TextIn value={q} onChangeText={setQ} placeholder="Søk i skjema" />
      <Card title="Skjema">
        {!list.length ? <Empty icon="document-text-outline" title="Ingen skjema" text={caps.manage ? 'Velg fra malbiblioteket (SF01–SF30) eller lag et eget.' : 'Ingen publiserte skjema ennå.'} /> : null}
        {list.map((f) => (
          <ListRow
            key={f.id}
            icon="document-text-outline"
            title={f.title}
            subtitle={[f.key, f.publishedVersion ? `v${f.publishedVersion} publisert` : 'Ikke publisert', formDraft(f) && caps.manage ? 'utkast' : '', `${state.submissions.filter((s) => s.formId === f.id).length} registreringer`].filter(Boolean).join(' · ')}
            right={f.publishedVersion ? <Btn small label="Fyll ut" onPress={() => setFillKey(f.key)} /> : null}
            onPress={caps.manage ? () => setOpenId(f.id) : (f.publishedVersion ? () => setFillKey(f.key) : undefined)}
          />
        ))}
      </Card>
      <Card title="Siste registreringer">
        {!state.submissions.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen registreringer.</Text> : null}
        {state.submissions.slice().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))).slice(0, 15).map((s) => (
          <SubmissionRow key={s.id} submission={s} form={state.forms.find((f) => f.id === s.formId)} />
        ))}
      </Card>

      <Sheet visible={tplOpen} title="Nytt skjema" onClose={() => setTplOpen(false)} wide={wide}>
        <Btn icon="add" label="Tomt skjema" onPress={blank} />
        {FORM_TEMPLATES.map((t) => (
          <ListRow key={t.key} icon="copy-outline" title={`${t.key.split('_')[0]} – ${t.title}`} subtitle={`${t.category} · ${t.fields.length} felt${installed.has(t.key) ? ' · allerede i bruk' : ''}`} onPress={() => fromTemplate(t)} />
        ))}
      </Sheet>
      <FormFillSheet ctx={ctx} formKey={fillKey} visible={!!fillKey} onClose={() => setFillKey('')} onSubmitted={() => setFillKey('')} />
      {published.length === 0 && !caps.manage ? <Banner tone="info" text="Når skjema publiseres, kan du fylle dem ut her og fra prosesstrinn." /> : null}
    </Page>
  );
}

function SubmissionRow({ submission, form }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const version = form?.versions?.find((v) => v.version === submission.formVersion);
  return (
    <View>
      <ListRow icon="lock-closed-outline" title={`${submission.formTitle} · v${submission.formVersion}`} subtitle={`${submission.submittedBy} · ${prettyDate(submission.submittedAt)}${submission.corrections?.length ? ' · rettet' : ''}`} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={{ gap: 6, paddingVertical: 8 }}>
          {(version?.fields || []).filter((f) => submission.answers[f.key] !== undefined).map((f) => (
            <KV key={f.key} label={f.label} value={f.sensitive && submission.sensitive ? '(skjermet)' : (Array.isArray(submission.answers[f.key]) ? JSON.stringify(submission.answers[f.key]) : String(submission.answers[f.key]))} />
          ))}
          <Text style={{ color: colors.muted, fontSize: 11 }}>Sjekksum {submission.hash}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Utfylling av publisert skjema. Brukes fra skjemalisten og fra prosesstrinn. */
export function FormFillSheet({ ctx, formKey, visible, onClose, onSubmitted, subjectRef = null, idempotencyKey = '' }) {
  const colors = useColors();
  const { state, actor, store, people, projects, wide } = ctx;
  const form = state.forms.find((f) => f.key === formKey) || null;
  const version = form ? formPublished(form) : null;
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useMemo(() => idempotencyKey || `${formKey}_${Date.now().toString(36)}`, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (visible) { setAnswers({}); setErrors({}); setErr(''); } }, [visible]);
  const requirements = useMemo(() => (visible ? allRequirements(state) : []), [visible, state]);

  if (!visible) return null;
  if (!form || !version) {
    return (
      <Sheet visible title="Skjema" onClose={onClose}>
        <Empty title="Skjemaet er ikke publisert" text={`Fant ingen publisert versjon av ${formKey}. Opprett og publiser skjemaet under Skjemaer.`} />
      </Sheet>
    );
  }
  const set = (k) => (v) => setAnswers((a) => ({ ...a, [k]: v }));

  async function send() {
    setBusy(true);
    setErr('');
    const res = submitForm(form, answers, { actor, subjectRef, idempotencyKey: key, existing: state.submissions });
    if (!res.ok) { setErrors(res.errors || {}); setErr(res.error); setBusy(false); return; }
    if (res.duplicate) { setBusy(false); onSubmitted?.(res.submission); return; }
    const saved = await store.commit('submissions', 'submission', res);
    if (!saved.ok) { setErr(saved.error); setBusy(false); return; }
    // Avviksskjema oppretter sak i avviksregisteret (samme data registreres én gang).
    if (form.createsFinding || form.templateKey === 'SF16_AVVIK') {
      const typeMap = { HMS: 'hms', MILJO: 'miljo', KVALITET: 'prosess' };
      const project = projects.find((p) => p.id === answers.prosjekt);
      const f = createFinding({
        type: typeMap[answers.kategori] || 'prosess',
        title: answers.tittel,
        description: answers.beskrivelse,
        occurredAt: answers.dato,
        projectId: project?.id,
        projectName: project ? `${project.number || ''} ${project.name || ''}`.trim() : '',
        location: answers.sted,
        actualConsequence: answers.konsekvens,
        potentialConsequence: answers.mulig,
        immediateAction: answers.midlertidig,
        deliverableRef: answers.leveranse,
        environmentalMedium: answers.medium,
        authorityNotificationRequired: answers.varsling === 'Ja',
        notificationAssignee: answers.varsler,
      }, { actor, existing: state.findings });
      if (f.ok) await store.commit('findings', 'finding', f);
    }
    setBusy(false);
    onSubmitted?.(res.submission);
  }

  return (
    <Sheet visible title={form.title} onClose={onClose} wide={wide} footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Send inn" busy={busy} onPress={send} /></>}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{form.key} · versjon {version.version}. Innsendt registrering låses.</Text>
      {version.fields.map((f) => {
        if (!fieldVisible(f, answers)) return null;
        return (
          <FieldInput key={f.id} field={f} value={answers[f.key]} answers={answers} onChange={set(f.key)} onReason={set(`${f.key}__begrunnelse`)} error={errors[f.key]} required={fieldRequired(f, answers)} people={people} projects={projects} requirements={requirements} />
        );
      })}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
    </Sheet>
  );
}

export function FieldInput({ field, value, answers, onChange, onReason, error, required, people, projects, requirements }) {
  const colors = useColors();
  const f = field;
  if (f.type === 'heading') return <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{f.label}</Text>;
  if (f.type === 'help_text') return <Banner tone="info" text={f.label} />;
  if (f.type === 'calculated') {
    const v = calculatedValue(f, answers);
    return <KV label={f.label} value={v == null ? '–' : String(v)} />;
  }
  let input = null;
  switch (f.type) {
    case 'long_text': input = <TextIn accessibilityLabel={f.label} multiline value={value} onChangeText={onChange} />; break;
    case 'integer': case 'decimal': case 'percentage':
      input = <TextIn accessibilityLabel={f.label} keyboardType="numeric" value={value} onChangeText={onChange} placeholder={f.unit || ''} />; break;
    case 'date': input = <DateIn value={value} onChange={onChange} />; break;
    case 'time': input = <TextIn accessibilityLabel={f.label} value={value} onChangeText={onChange} placeholder="tt:mm" />; break;
    case 'single_select': input = <Choice options={f.options} value={value} onChange={onChange} />; break;
    case 'multi_select': input = <Choice multi options={f.options} value={value || []} onChange={onChange} />; break;
    case 'checkbox': case 'signature_ack': input = <Check label={f.type === 'signature_ack' ? `Jeg bekrefter: ${f.label}` : f.label} value={!!value} onChange={onChange} />; break;
    case 'yes_no_na':
      input = (
        <>
          <Choice options={['Ja', 'Nei', 'Ikke aktuelt']} value={value} onChange={onChange} />
          {value === 'Ikke aktuelt' ? <TextIn accessibilityLabel={f.label} value={answers[`${f.key}__begrunnelse`]} onChangeText={onReason} placeholder="Begrunnelse" /> : null}
        </>
      ); break;
    case 'rating': case 'likelihood': case 'consequence':
      input = <Choice options={['1', '2', '3', '4', '5']} value={value == null ? '' : String(value)} onChange={(x) => onChange(x ? Number(x) : '')} />; break;
    case 'user_ref': input = <PersonPick people={people} value={value} onChange={(p) => onChange(p.name)} />; break;
    case 'project_ref': input = projects.length ? <Choice small options={projects.slice(0, 40).map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() }))} value={value} onChange={onChange} /> : <TextIn accessibilityLabel={f.label} value={value} onChangeText={onChange} placeholder="Prosjekt" />; break;
    case 'requirement_ref': input = <Choice small options={requirements.filter((r) => r.kind !== 'iso').slice(0, 40).map((r) => ({ id: r.id, label: r.title }))} value={value} onChange={onChange} />; break;
    case 'table_repeatable': input = <TableInput columns={f.columns} value={value || []} onChange={onChange} />; break;
    case 'file': input = <TextIn accessibilityLabel={f.label} value={value} onChangeText={onChange} placeholder="Lenke eller dokument-ID" />; break;
    default: input = <TextIn accessibilityLabel={f.label} value={value} onChangeText={onChange} />;
  }
  return <Field label={f.type === 'checkbox' || f.type === 'signature_ack' ? '' : f.label} hint={f.help} error={error} required={required}>{input}</Field>;
}

function TableInput({ columns, value, onChange }) {
  const colors = useColors();
  const cols = columns.length ? columns : ['Verdi'];
  const rows = Array.isArray(value) ? value : [];
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ gap: 4, padding: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }}>
          {cols.map((c) => <TextIn key={c} value={r[c]} onChangeText={(x) => onChange(rows.map((row, j) => (j === i ? { ...row, [c]: x } : row)))} placeholder={c} />)}
          <Btn small kind="danger" label="Fjern rad" onPress={() => onChange(rows.filter((_, j) => j !== i))} />
        </View>
      ))}
      <Btn small icon="add" label="Legg til rad" onPress={() => onChange([...rows, {}])} />
    </View>
  );
}

function FormBuilder({ ctx, form, onBack }) {
  const colors = useColors();
  const { caps, actor, store, wide, people, projects, state } = ctx;
  const draft = formDraft(form);
  const pub = formPublished(form);
  const [fields, setFields] = useState(() => (draft || pub)?.fields || []);
  const [title, setTitle] = useState(form.title);
  const [sel, setSel] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState({});
  const editable = !!draft && caps.manage;
  const field = fields.find((f) => f.id === sel) || null;
  const check = validateDefinition({ fields });
  const usedBy = state.processes.filter((p) => (p.versions || []).some((v) => (v.diagram?.nodes || []).some((n) => n.formKey === form.key)));

  const patch = (id, p) => setFields((list) => list.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (id, dir) => setFields((list) => {
    const i = list.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  async function save() {
    const res = saveFormDraft(form, fields, { actor, meta: { title } });
    if (!res.ok) { setErr(res.error); return null; }
    const saved = await store.commit('forms', 'form', res, { previous: form });
    if (!saved.ok) { setErr(saved.error); return null; }
    setMsg('Utkastet er lagret.');
    return res.form;
  }

  return (
    <Page
      wide={wide}
      crumb={['Skjemaer', form.key]}
      title={form.title}
      intro={`${draft ? `Utkast v${draft.version}` : 'Publisert – låst'}${pub ? ` · publisert v${pub.version}` : ''}${usedBy.length ? ` · brukes i ${usedBy.map((p) => p.title).join(', ')}` : ''}`}
      actions={(
        <>
          <Btn icon="arrow-back" label="Tilbake" onPress={onBack} />
          {editable ? <Btn icon="save-outline" label="Lagre" onPress={save} /> : null}
          {editable && caps.admin ? <Btn kind="primary" icon="cloud-upload-outline" label="Publiser" disabled={!check.ok} onPress={async () => {
            const current = await save();
            if (!current) return;
            const res = publishForm(current, { actor, caps });
            if (!res.ok) { setErr(res.error); return; }
            const saved = await store.commit('forms', 'form', res, { previous: current });
            if (saved.ok) setMsg('Publisert. Nye registreringer bruker denne versjonen.'); else setErr(saved.error);
          }} /> : null}
          {!draft && caps.manage ? <Btn label="Ny versjon" onPress={async () => {
            const res = newFormVersion(form, { actor });
            if (!res.ok) { setErr(res.error); return; }
            const saved = await store.commit('forms', 'form', res, { previous: form });
            if (saved.ok) setFields(formDraft(res.form).fields); else setErr(saved.error);
          }} /> : null}
        </>
      )}
    >
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {!check.ok ? <Banner tone="warn" text={check.errors.join(' ')} /> : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title="Feltpalett" style={{ width: wide ? 220 : '100%' }}>
          <View style={{ flexDirection: wide ? 'column' : 'row', flexWrap: 'wrap', gap: 6 }}>
            {FIELD_TYPES.map((t) => (
              <Btn key={t.id} small label={t.label} disabled={!editable} onPress={() => {
                const f = makeField(t.id, { label: t.label, key: `${t.id.split('_')[0]}_${fields.length + 1}` });
                setFields([...fields, f]);
                setSel(f.id);
              }} />
            ))}
          </View>
        </Card>
        <Card title="Felt" style={{ flex: 1, width: wide ? undefined : '100%' }}>
          {editable ? <Field label="Skjemanavn"><TextIn value={title} onChangeText={setTitle} /></Field> : null}
          {fields.map((f, i) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: f.id === sel ? colors.brandSoft : 'transparent' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }} onPress={() => setSel(f.id)}>{f.label}{f.required ? ' *' : ''}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{FIELD_TYPES.find((t) => t.id === f.type)?.label} · {f.key}{f.showIf ? ` · vises når ${f.showIf.field} = ${f.showIf.equals}` : ''}{f.sensitive ? ' · skjermet' : ''}</Text>
              </View>
              {editable ? (
                <>
                  <Btn small icon="chevron-up" accessibilityLabel="Flytt opp" disabled={i === 0} onPress={() => move(f.id, -1)} />
                  <Btn small icon="chevron-down" accessibilityLabel="Flytt ned" disabled={i === fields.length - 1} onPress={() => move(f.id, 1)} />
                  <Btn small icon="create-outline" accessibilityLabel="Rediger felt" onPress={() => setSel(f.id)} />
                </>
              ) : null}
            </View>
          ))}
        </Card>
        <Card title={field ? 'Feltegenskaper' : 'Forhåndsvisning'} style={{ width: wide ? 360 : '100%' }}>
          {field && editable ? (
            <>
              <Field label="Etikett"><TextIn value={field.label} onChangeText={(x) => patch(field.id, { label: x })} /></Field>
              <Field label="Nøkkel" hint="Stabil, brukes i regler og eksport."><TextIn value={field.key} onChangeText={(x) => patch(field.id, { key: x.replace(/\s+/g, '_') })} /></Field>
              <Field label="Hjelpetekst"><TextIn value={field.help} onChangeText={(x) => patch(field.id, { help: x })} /></Field>
              <Check label="Obligatorisk" value={field.required} onChange={(x) => patch(field.id, { required: x })} />
              <Check label="Skjermet felt (sensitivt)" value={field.sensitive} onChange={(x) => patch(field.id, { sensitive: x })} />
              {['single_select', 'multi_select'].includes(field.type) ? <Field label="Valg (ett per linje)"><TextIn multiline value={field.options.join('\n')} onChangeText={(x) => patch(field.id, { options: x.split('\n') })} /></Field> : null}
              {field.type === 'table_repeatable' ? <Field label="Kolonner (en per linje)"><TextIn multiline value={field.columns.join('\n')} onChangeText={(x) => patch(field.id, { columns: x.split('\n') })} /></Field> : null}
              {field.type === 'calculated' ? (
                <Field label="Beregning">
                  <Choice small options={[{ id: 'sum', label: 'Sum' }, { id: 'product', label: 'Produkt' }]} value={field.calc?.op || 'sum'} onChange={(x) => patch(field.id, { calc: { op: x || 'sum', fields: field.calc?.fields || [] } })} />
                  <Choice small multi options={fields.filter((x) => x.id !== field.id).map((x) => ({ id: x.key, label: x.label }))} value={field.calc?.fields || []} onChange={(x) => patch(field.id, { calc: { op: field.calc?.op || 'sum', fields: x } })} />
                </Field>
              ) : null}
              <Field label="Vis bare når">
                <Choice small options={fields.filter((x) => x.id !== field.id && ['single_select', 'yes_no_na', 'checkbox'].includes(x.type)).map((x) => ({ id: x.key, label: x.label }))} value={field.showIf?.field || ''} onChange={(x) => patch(field.id, { showIf: x ? { field: x, equals: field.showIf?.equals || '' } : null })} />
                {field.showIf ? <TextIn value={field.showIf.equals} onChangeText={(x) => patch(field.id, { showIf: { ...field.showIf, equals: x } })} placeholder="… har verdien" /> : null}
              </Field>
              <Btn small kind="danger" label="Fjern felt" onPress={() => { setFields(fields.filter((x) => x.id !== field.id)); setSel(''); }} />
              <Btn small label="Ferdig" onPress={() => setSel('')} />
            </>
          ) : (
            <>
              {fields.map((f) => (fieldVisible(f, preview) ? <FieldInput key={f.id} field={f} value={preview[f.key]} answers={preview} onChange={(v) => setPreview({ ...preview, [f.key]: v })} onReason={(v) => setPreview({ ...preview, [`${f.key}__begrunnelse`]: v })} required={fieldRequired(f, preview)} people={people} projects={projects} requirements={[]} /> : null))}
              <Text style={{ color: colors.muted, fontSize: 12 }}>Test som ansatt: forhåndsvisningen lagres ikke.</Text>
            </>
          )}
        </Card>
      </View>
      <Card title="Versjoner">
        {form.versions.map((v) => <Row key={v.version}><Pill label={`v${v.version}`} /><Text style={{ color: colors.muted, fontSize: 12 }}>{v.state} · {v.fields.length} felt · {prettyDate(v.publishedAt || v.createdAt)}</Text></Row>)}
      </Card>
    </Page>
  );
}
