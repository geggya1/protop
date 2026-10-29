/**
 * Skjema og sjekklister i ISO bygger på ProTops Skjemabygger.
 * Ingen egen skjemabygger: skjema lages og endres i Skjemabygger. ISO godkjenner
 * versjoner (styrte skjema), fyller ut med låste registreringer og viser hvilke
 * maler som håndteres i egne ISO-registre.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate } from '../../src/iso/core';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { normalizeFormTemplates, saveFormTemplate } from '../../src/anbud/bidLibrary';
import {
  FORM_TEMPLATES, NATIVE_FORMS, approveTemplate, builderTemplateFromIso, controlledVersion, driftStatus, recommendedFormKeys,
  releaseControl, submitControlled, templateIdFor,
} from '../../src/iso/forms';
import { isDocControlledTemplate } from '../../src/iso/docControlLink';
import {
  Banner, Btn, Card, Check, Choice, DateIn, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

const DRIFT = { ok: { label: 'Styrt', tone: 'ok' }, endret: { label: 'Endret – må godkjennes', tone: 'warn' }, slettet: { label: 'Slettet i Skjemabygger', tone: 'danger' } };

export default function IsoForms({ ctx }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, params, sources, go, requestTab, companyId } = ctx;
  const [fillId, setFillId] = useState(params?.fill || '');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => { if (params?.fill) setFillId(params.fill); }, [params]);

  const templates = sources.formTemplates || [];
  const controls = (state.forms || []).filter((f) => !f.archived);
  const controlByTemplate = new Map(controls.map((c) => [c.templateId, c]));
  const recommended = recommendedFormKeys(state.system.standards);
  const missingRecommended = recommended.filter((k) => !templates.some((t) => t.id === templateIdFor(k)));
  const list = templates.filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));
  const controlled = list.filter((t) => controlByTemplate.has(t.id));
  const others = list.filter((t) => !controlByTemplate.has(t.id));
  const orphans = controls.filter((c) => !c.external && !templates.some((t) => t.id === c.templateId));

  async function install(keys) {
    setErr(''); setMsg(''); setBusy('install');
    let anbud = await loadAnbudState(companyId);
    let changed = false;
    for (const key of keys) {
      const iso = FORM_TEMPLATES.find((t) => t.key === key);
      if (!iso || normalizeFormTemplates(anbud.formTemplates).some((t) => t.id === templateIdFor(key))) continue;
      const res = saveFormTemplate(anbud, builderTemplateFromIso(iso));
      if (res.ok) { anbud = res.state; changed = true; } else setErr(res.error);
    }
    if (changed) anbud = await saveAnbudState(anbud, companyId);
    const fresh = normalizeFormTemplates(anbud.formTemplates);
    let n = 0;
    for (const key of keys) {
      const tpl = fresh.find((t) => t.id === templateIdFor(key));
      const control = store.current().forms.find((f) => f.templateId === tpl?.id && !f.archived) || null;
      if (!tpl || control?.publishedVersion) continue;
      const res = approveTemplate(control, tpl, { actor, caps, templateKey: key, note: 'Installert fra ISO-malbiblioteket' });
      if (res.ok && (await store.commit('forms', 'form', res, { previous: control })).ok) n += 1;
    }
    sources.reloadAnbud();
    setBusy('');
    setMsg(`${n} skjema lagt i Skjemabygger og godkjent som styrte skjema.`);
  }

  async function approve(template) {
    setErr('');
    const control = controlByTemplate.get(template.id) || null;
    const key = FORM_TEMPLATES.find((t) => templateIdFor(t.key) === template.id)?.key || '';
    const res = approveTemplate(control, template, { actor, caps, templateKey: key });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('forms', 'form', res, { previous: control });
    if (saved.ok) setMsg(`«${template.title}» er godkjent som v${res.form.publishedVersion}.`); else setErr(saved.error);
  }

  const fillControl = controls.find((c) => c.templateId === fillId || c.id === fillId) || null;

  return (
    <Page
      wide={wide}
      title="Skjema og sjekklister"
      intro="Skjemaene lages og endres i Skjemabygger. Her godkjennes de som styrte skjema, fylles ut som låste registreringer og brukes i prosessene."
      actions={requestTab ? <Btn icon="create-outline" label="Åpne Skjemabygger" onPress={() => requestTab('skjema')} /> : null}
    >
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {caps.approve && missingRecommended.length ? (
        <Card title="Anbefalte skjema" subtitle={`${missingRecommended.length} ISO-maler passer for standardene dere har valgt. De legges i Skjemabygger og godkjennes her.`}>
          <Text style={{ color: colors.ink, fontSize: 13 }}>{missingRecommended.map((k) => FORM_TEMPLATES.find((t) => t.key === k)?.title).filter(Boolean).join(' · ')}</Text>
          <Btn kind="primary" icon="download-outline" label="Legg til alle" busy={busy === 'install'} onPress={() => install(missingRecommended)} />
        </Card>
      ) : null}
      <TextIn value={q} onChangeText={setQ} placeholder="Søk i skjema" />
      <Card title={`Styrte skjema (${controlled.length})`} subtitle="Godkjent versjon brukes ved utfylling og i prosesstrinn.">
        {!controlled.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen skjema er godkjent for ISO ennå.</Text> : null}
        {controlled.map((t) => {
          const c = controlByTemplate.get(t.id);
          const drift = driftStatus(c, t);
          const regs = state.submissions.filter((s) => s.formId === c.id).length;
          return (
            <ListRow
              key={t.id}
              icon="shield-checkmark-outline"
              tone={drift === 'ok' ? 'ok' : 'warn'}
              title={t.title}
              subtitle={`v${c.publishedVersion} godkjent ${prettyDate(controlledVersion(c)?.approvedAt)} av ${controlledVersion(c)?.approvedBy} · ${regs} registreringer${(t.responses || []).length ? ` · ${t.responses.length} svar i Skjemabygger` : ''}`}
              right={(
                <Row wrap={false}>
                  {c.external ? <Pill label="Styres i Dokumentstyring" icon="shield-checkmark-outline" tone="info" /> : <Pill label={DRIFT[drift].label} tone={DRIFT[drift].tone} />}
                  {!c.external && drift === 'endret' && caps.approve ? <Btn small label="Godkjenn" onPress={() => approve(t)} /> : null}
                  <Btn small kind="primary" label="Fyll ut" onPress={() => setFillId(t.id)} />
                </Row>
              )}
            />
          );
        })}
      </Card>
      {caps.manage ? (
        <Card title={`Andre skjema i Skjemabygger (${others.length})`} subtitle="Godkjenn et skjema for å bruke det som styrt skjema i ISO.">
          {others.map((t) => (
            <ListRow
              key={t.id}
              icon="document-text-outline"
              title={t.title}
              subtitle={`${(t.fields || []).length} felt${t.intro ? ` · ${t.intro}` : ''}${isDocControlledTemplate(t.id) ? ' · godkjennes i Skjemabygger → Dokumentstyring' : ''}`}
              right={isDocControlledTemplate(t.id)
                ? (requestTab ? <Btn small label="Åpne Dokumentstyring" onPress={() => requestTab('skjema')} /> : null)
                : (caps.approve ? <Btn small label="Godkjenn for ISO" onPress={() => approve(t)} /> : null)}
            />
          ))}
          {!others.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen.</Text> : null}
        </Card>
      ) : null}
      {orphans.length && caps.approve ? (
        <Card title="Styrte skjema som er slettet i Skjemabygger">
          {orphans.map((c) => (
            <View key={c.id} style={{ gap: 6 }}>
              <Text style={{ color: colors.ink }}>{c.title} – godkjent v{c.publishedVersion} kan fortsatt leses i registreringene.</Text>
              <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse" />
              <Btn small kind="danger" label="Fjern styring" onPress={async () => { const r = releaseControl(c, reason, { actor, caps }); if (!r.ok) { setErr(r.error); return; } await store.commit('forms', 'form', r, { previous: c }); }} />
            </View>
          ))}
        </Card>
      ) : null}
      <Card title="Håndteres i ISO-registrene" subtitle="Disse malene fylles ut direkte i registeret, så det ikke blir dobbel registrering.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(NATIVE_FORMS).map(([key, n]) => (
            <Btn key={key} small label={`${key.split('_')[0]} → ${n.label}`} onPress={() => go(n.page)} />
          ))}
        </View>
      </Card>
      <Card title="Siste registreringer">
        {!state.submissions.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen registreringer.</Text> : null}
        {state.submissions.slice().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))).slice(0, 20).map((s) => (
          <SubmissionRow key={s.id} submission={s} control={controls.find((c) => c.id === s.formId) || (state.forms || []).find((c) => c.id === s.formId)} projects={ctx.projects} />
        ))}
      </Card>
      <FormFillSheet ctx={ctx} control={fillControl} visible={!!fillId} onClose={() => setFillId('')} onSubmitted={() => setFillId('')} />
      {!templates.length ? <Empty icon="document-text-outline" title="Ingen skjema i Skjemabygger" text="Legg til de anbefalte ISO-malene, eller lag skjema i Skjemabygger." /> : null}
    </Page>
  );
}

function SubmissionRow({ submission, control, projects }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const version = control?.versions?.find((v) => v.version === submission.formVersion);
  const project = projects.find((p) => p.id === submission.subjectRef?.projectId);
  return (
    <View>
      <ListRow icon="lock-closed-outline" title={`${submission.formTitle} · v${submission.formVersion}`} subtitle={`${submission.submittedBy} · ${prettyDate(submission.submittedAt)}${project ? ` · ${project.number || ''} ${project.name}` : ''}${submission.corrections?.length ? ' · rettet' : ''}`} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={{ gap: 6, paddingVertical: 8 }}>
          {(version?.fields || []).filter((f) => submission.answers[f.id] !== undefined).map((f) => (
            <KV key={f.id} label={f.label} value={Array.isArray(submission.answers[f.id]) ? submission.answers[f.id].join(', ') : (typeof submission.answers[f.id] === 'boolean' ? (submission.answers[f.id] ? 'Ja' : 'Nei') : String(submission.answers[f.id]))} />
          ))}
          <Text style={{ color: colors.muted, fontSize: 11 }}>Låst registrering · sjekksum {submission.hash}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Utfylling av et styrt skjema (godkjent versjon). Brukes fra listen, prosesstrinn og prosjektsiden. */
export function FormFillSheet({ ctx, control: controlProp, templateId, visible, onClose, onSubmitted, subjectRef = null, idempotencyKey = '', prefill = null }) {
  const colors = useColors();
  const { state, actor, store, people, projects, wide } = ctx;
  const control = controlProp || (state.forms || []).find((f) => !f.archived && f.templateId === templateId) || null;
  const version = control ? controlledVersion(control) : null;
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState('');
  const key = useMemo(() => idempotencyKey || `${control?.id || ''}_${Date.now().toString(36)}`, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (visible) { setAnswers(prefill || {}); setErrors({}); setErr(''); setProjectId(subjectRef?.projectId || ''); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  if (!control || !version) {
    return (
      <Sheet visible title="Skjema" onClose={onClose}>
        <Empty title="Skjemaet er ikke godkjent for ISO" text="Godkjenn skjemaet under ISO → Skjemaer før det brukes her." />
      </Sheet>
    );
  }
  const set = (k) => (val) => setAnswers((a) => ({ ...a, [k]: val }));

  async function send() {
    setBusy(true);
    setErr('');
    const ref = { ...(subjectRef || {}), ...(projectId ? { projectId } : {}) };
    const res = submitControlled(control, answers, { actor, subjectRef: Object.keys(ref).length ? ref : null, idempotencyKey: key, existing: state.submissions });
    if (!res.ok) { setErrors(res.errors || {}); setErr(res.error); setBusy(false); return; }
    if (!res.duplicate) {
      const saved = await store.commit('submissions', 'submission', res);
      if (!saved.ok) { setErr(saved.error); setBusy(false); return; }
    }
    setBusy(false);
    onSubmitted?.(res.submission);
  }

  return (
    <Sheet visible title={version.title} onClose={onClose} wide={wide} footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Send inn" busy={busy} onPress={send} /></>}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Styrt versjon {version.version}. Innsendt registrering låses og brukes som bevis.</Text>
      {!subjectRef?.projectId && projects.length ? (
        <Field label="Prosjekt (valgfritt)"><Choice small title="Prosjekt" options={projects.map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() }))} value={projectId} onChange={setProjectId} /></Field>
      ) : null}
      {version.fields.map((f) => (
        <BuilderField key={f.id} field={f} value={answers[f.id]} onChange={set(f.id)} error={errors[f.id]} people={people} />
      ))}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
    </Sheet>
  );
}

/** Ett felt i Skjemabygger-format (title, note, text, long, choice, checks, dropdown, scale, date, time, number, check, file). */
export function BuilderField({ field: f, value, onChange, error, people }) {
  const colors = useColors();
  if (f.kind === 'title') return <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 16 }}>{f.label}</Text>;
  if (f.kind === 'note') return <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{f.label}</Text>;
  const opts = (f.options || []).map((o) => o.label);
  let input;
  switch (f.kind) {
    case 'long': input = <TextIn accessibilityLabel={f.label} multiline value={value} onChangeText={onChange} placeholder={f.placeholder || ''} />; break;
    case 'number': input = <TextIn accessibilityLabel={f.label} keyboardType="numeric" value={value} onChangeText={onChange} />; break;
    case 'date': input = <DateIn value={value} onChange={onChange} clearable={!f.required} />; break;
    case 'time': input = <TextIn accessibilityLabel={f.label} value={value} onChangeText={onChange} placeholder="tt:mm" />; break;
    case 'choice': case 'dropdown': input = <Choice options={opts} value={value} onChange={onChange} />; break;
    case 'checks': input = <Choice multi options={opts} value={value || []} onChange={onChange} />; break;
    case 'scale': input = <Choice options={Array.from({ length: f.scaleMax || 5 }, (_, i) => String(i + 1))} value={value == null ? '' : String(value)} onChange={(x) => onChange(x ? Number(x) : '')} />; break;
    case 'check': input = <Check label={f.label} value={!!value} onChange={onChange} />; break;
    case 'file': case 'image': input = <TextIn accessibilityLabel={f.label} value={value?.name || value} onChangeText={onChange} placeholder="Lenke eller dokument-ID" />; break;
    default:
      input = /person|ansvarlig|kontrollør|godkjent av|revisor|eier/i.test(f.label) && people?.length
        ? <PersonPick people={people} value={value} onChange={(p) => onChange(p.name)} />
        : <TextIn accessibilityLabel={f.label} value={value} onChangeText={onChange} placeholder={f.placeholder || ''} />;
  }
  return <Field label={f.kind === 'check' ? '' : f.label} hint={f.help} error={error} required={f.required}>{input}</Field>;
}
