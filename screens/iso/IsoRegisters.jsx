import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate, todayKey } from '../../src/iso/core';
import { DEFAULT_RISK_METHOD, RISK_GUIDANCE, aspectSignificance, riskLevel } from '../../src/iso/catalog';
import {
  AUDIT_FINDING_CLASSES, REGISTERS, SUPPLIER_CLASSES, SUPPLIER_CRITERIA, addAuditFinding, addSupplierEvaluation, addExercise, addMeasurement, addReviewDecision, attachReviewSnapshot,
  competenceGaps, competenceMatrix, createRecord, unassignedRequirements, findingInputFromAudit, linkAuditFinding, markDecisionDone, objectiveProgress, overdueRecords,
  cleanContacts, contactsLabel, personsLabel, registerDef, riskMatrix, riskSummary, setRecordState, updateRecord,
} from '../../src/iso/registers';
import { normalizeSubUnits } from '../../src/project/companyUnits';
import { createFinding } from '../../src/iso/findings';
import { managementReviewSnapshot } from '../../src/iso/analytics';
import { allRequirements, attachEvidence, requirementIdsForArea } from '../../src/iso/requirements';
import { visibleFindings } from '../../src/iso/access';
import { templateIdFor, usableForms } from '../../src/iso/forms';
import {
  aspectSuggestions, contractReviewStatus, equipmentStatus, hazardSuggestions, hrComplianceForIso, mileageSeries,
  projectQuality, qualityPlanDraft, sickLeaveSeries, stakeholderSuggestions, supplierSuggestions, wasteSummary,
} from '../../src/iso/integrations';
import { CompetenceHeatmap, HBars, MonthBars, ObjectiveSpark, RiskMatrix } from './isoCharts';
import { FormFillSheet } from './IsoForms';
import {
  Banner, Btn, Card, Check, Choice, ContactsEdit, DateIn, Empty, Field, KV, ListRow, Page, PersonPick, PersonsPick, Pill, Row, Sheet, TextIn, toneColor,
} from './isoUi';

export const STATE_LABEL = {
  aktiv: 'Aktiv', arkivert: 'Arkivert', akseptert: 'Akseptert', lukket: 'Lukket', mottatt: 'Mottatt', behandlet: 'Behandlet', tilbakemeldt: 'Tilbakemeldt',
  gyldig: 'Gyldig', planlagt: 'Planlagt', pagar: 'Pågår', rapport: 'Rapport', godkjent: 'Godkjent', oppfolging: 'Oppfølging', avlyst: 'Avlyst',
  gjennomfort: 'Gjennomført', utlopt: 'Utløpt', utkast: 'Utkast', avsluttet: 'Avsluttet', nådd: 'Nådd', ikke_nådd: 'Ikke nådd',
};

/** Knappetekst for statusskifte. «Arkivert» som knapp så ut som en merkelapp, ikke en handling. */
function stateAction(next, current, first) {
  if (next === 'arkivert') return { label: 'Arkiver', icon: 'archive-outline' };
  if (current === 'arkivert' && next === first) return { label: 'Gjenopprett', icon: 'arrow-undo-outline' };
  return { label: STATE_LABEL[next] || next };
}

/** «A», «A og B», «A, B og C» – flere enn tre blir et antall. */
function nameList(names, noun = 'forslag') {
  if (names.length > 3) return `${names.length} ${noun}`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]}` : (names[0] || '');
}

/* ───────── Generisk skjema for registerpost ───────── */

/** Valg for felt som peker til andre poster: krav, prosesser eller poster i et annet register. */
export function refOptions(state, f) {
  if (f.ref === 'requirement') {
    return allRequirements(state).filter((r) => r.kind === 'lov' || r.kind === 'kontrakt').map((r) => ({ id: r.id, label: r.title }));
  }
  if (f.ref === 'process') {
    return (state.processes || []).filter((p) => !p.archived).map((p) => ({ id: p.id, label: `${p.code ? `${p.code} ` : ''}${p.title}` }));
  }
  return (state.records[f.ref] || []).filter((r) => r.state !== 'arkivert').map((r) => ({ id: r.id, label: `${r.title}${r.role ? ` (${r.role})` : ''}` }));
}

/** Visningstekst for en verdi som peker til andre poster. */
export function refLabel(state, f, value) {
  const ids = Array.isArray(value) ? value : [value];
  const opts = refOptions(state, f);
  const all = f.ref === 'process'
    ? (state.processes || []).map((p) => ({ id: p.id, label: `${p.code ? `${p.code} ` : ''}${p.title}` }))
    : opts;
  return ids.filter(Boolean).map((id) => all.find((o) => o.id === id)?.label || (state.records[f.ref] || []).find((r) => r.id === id)?.title || allRequirements(state).find((r) => r.id === id)?.title || id).join(', ');
}

export function RecordSheet({ ctx, registerKey, record, visible, onClose, onSaved, preset = {} }) {
  const colors = useColors();
  const { state, actor, store, people, projects } = ctx;
  const def = registerDef(registerKey);
  const [v, setV] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setV(record ? { ...record } : { ...preset }); setErr(''); } }, [visible, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return null;
  const set = (k) => (x) => setV((cur) => ({ ...cur, [k]: x }));

  async function save() {
    setBusy(true);
    const res = record
      ? updateRecord(record, v, { actor })
      : createRecord(registerKey, v, { actor, existing: state.records[registerKey], riskMethod: state.system.riskMethod || DEFAULT_RISK_METHOD });
    if (!res.ok) { setErr(res.error); setBusy(false); return; }
    const saved = await store.commit('records', 'record', res, { previous: record || null });
    setBusy(false);
    if (!saved.ok) { setErr(saved.error); return; }
    onSaved?.(res.record);
    onClose();
  }

  function input(f) {
    const value = v[f.key];
    switch (f.type) {
      case 'long': return <TextIn multiline value={value} onChangeText={set(f.key)} />;
      case 'date': return <DateIn value={value} onChange={set(f.key)} />;
      case 'number': return <TextIn keyboardType="numeric" value={value == null ? '' : String(value)} onChangeText={set(f.key)} />;
      case 'scale': return <Choice options={['1', '2', '3', '4', '5']} value={value == null ? '' : String(value)} onChange={(x) => set(f.key)(x ? Number(x) : null)} />;
      case 'select': return <Choice options={f.options} value={value} onChange={set(f.key)} />;
      case 'multi': return <Choice multi options={f.options} value={value || []} onChange={set(f.key)} />;
      case 'check': return <Check label={f.label} value={!!value} onChange={set(f.key)} />;
      case 'person': return (
        <PersonPick
          people={people}
          value={value}
          onChange={(p) => setV((cur) => ({ ...cur, [f.key]: p.name, [f.key === 'personName' ? 'personUid' : (f.key === 'auditorName' ? 'auditorUid' : 'ownerUid')]: p.uid }))}
        />
      );
      case 'project': return projects.length
        ? <Choice small options={projects.slice(0, 40).map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() }))} value={value} onChange={(x) => { const p = projects.find((y) => y.id === x); setV((cur) => ({ ...cur, projectId: x, projectName: p ? `${p.number || ''} ${p.name || ''}`.trim() : '' })); }} />
        : <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen prosjekter registrert i Prosjekt.</Text>;
      case 'persons': return <PersonsPick people={people} value={Array.isArray(value) ? value : (value ? String(value).split(/[,;]+/).map((n) => ({ name: n.trim() })).filter((x) => x.name) : [])} onChange={set(f.key)} />;
      case 'contacts': return <ContactsEdit people={people} value={value || []} onChange={set(f.key)} />;
      case 'department': {
        // Avdelinger og underenheter fra Selskap; uten registrerte enheter skrives navnet fritt.
        const units = normalizeSubUnits(ctx.sources?.company?.subUnits).map((u) => u.name || u.navn).filter(Boolean);
        return units.length
          ? <Choice small options={units.map((u) => ({ id: u, label: u }))} value={value} onChange={set(f.key)} />
          : <TextIn value={value} onChangeText={set(f.key)} placeholder="Avdeling (registrer avdelinger under Selskap → Underenheter)" />;
      }
      case 'ref':
      case 'refmulti': {
        const opts = refOptions(state, f);
        if (!opts.length) return <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen å velge mellom ennå.</Text>;
        return f.type === 'refmulti'
          ? <Choice small multi options={opts} value={value || []} onChange={set(f.key)} />
          : <Choice small options={opts} value={value} onChange={set(f.key)} />;
      }
      default: return <TextIn value={value} onChangeText={set(f.key)} />;
    }
  }

  const level = (registerKey === 'risiko' || registerKey === 'fare') ? riskSummary(v, state.system.riskMethod) : null;
  const aspect = registerKey === 'miljoaspekt' ? aspectSignificance(v, state.system.riskMethod) : null;
  return (
    <Sheet visible={visible} title={record ? `${record.number} · ${def.title}` : `Ny – ${def.title}`} onClose={onClose} wide={ctx.wide} footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Lagre" busy={busy} onPress={save} /></>}>
      {def.fields.map((f) => {
        if (f.showIf && !Object.entries(f.showIf).every(([k, x]) => v[k] === x)) return null;
        return <Field key={f.key} label={f.type === 'check' ? '' : f.label} required={f.required}>{input(f)}</Field>;
      })}
      {level ? (
        <Row>
          <Pill label={`Iboende: ${level.inherent.label}${level.inherent.score ? ` (${level.inherent.score})` : ''}`} tone={level.inherent.id === 'kritisk' || level.inherent.id === 'hoy' ? 'danger' : 'warn'} />
          <Pill label={`Rest: ${level.residual.label}${level.residual.score ? ` (${level.residual.score})` : ''}`} tone={level.residual.id === 'kritisk' || level.residual.id === 'hoy' ? 'danger' : 'ok'} />
          <Text style={{ color: colors.muted, fontSize: 11 }}>Metode {state.system.riskMethod?.name} v{state.system.riskMethod?.version}</Text>
        </Row>
      ) : null}
      {level?.inherent?.id && level.inherent.id !== 'ukjent' ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`${RISK_GUIDANCE.acceptance[(level.residual.score ? level.residual : level.inherent).id]?.label || ''}: ${RISK_GUIDANCE.acceptance[(level.residual.score ? level.residual : level.inherent).id]?.text || ''} Aksepteres av ${String(RISK_GUIDANCE.acceptance[(level.residual.score ? level.residual : level.inherent).id]?.who || '').toLowerCase()}.`}
        </Text>
      ) : null}
      {aspect?.level?.score ? (
        <Banner
          tone={aspect.significant ? 'warn' : 'info'}
          text={aspect.significant
            ? `Forslag etter kriteriene: vesentlig (${aspect.reasons.join(', ')}). ${v.significant !== 'Ja' ? 'Velg «Ja» under Vesentlig, eller begrunn hvorfor ikke.' : ''}`
            : `Forslag etter kriteriene: ikke vesentlig (score ${aspect.level.score}, ${aspect.level.label.toLowerCase()}). Vesentlig ved score ≥ ${state.system.riskMethod?.thresholds?.high || 10}, eller ≥ ${state.system.riskMethod?.thresholds?.medium || 5} med samsvarsforpliktelse eller nødsituasjon.`}
        />
      ) : null}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
    </Sheet>
  );
}

/** Skalaer og akseptkriterier for risikomatrisen (samme matrise for risiko, farer og miljøaspekter). */
function RiskCriteria({ method }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const t = method?.thresholds || DEFAULT_RISK_METHOD.thresholds;
  const levels = [
    { id: 'lav', range: `1–${t.medium - 1}`, tone: 'ok' },
    { id: 'middels', range: `${t.medium}–${t.high - 1}`, tone: 'warn' },
    { id: 'hoy', range: `${t.high}–${t.critical - 1}`, tone: 'danger' },
    { id: 'kritisk', range: `${t.critical}–25`, tone: 'danger' },
  ];
  return (
    <Card title="Kriterier og akseptgrenser" subtitle={RISK_GUIDANCE.sources} right={<Btn small icon={open ? 'chevron-up' : 'chevron-down'} label={open ? 'Skjul skalaer' : 'Vis skalaer'} onPress={() => setOpen(!open)} />}>
      {levels.map((l) => {
        const a = RISK_GUIDANCE.acceptance[l.id];
        return <ListRow key={l.id} icon="ellipse" tone={l.tone} title={`${a.label} · score ${l.range}`} subtitle={`${a.text} Aksepteres av ${a.who.toLowerCase()}.`} />;
      })}
      <Text style={{ color: colors.muted, fontSize: 12 }}>{RISK_GUIDANCE.measures}</Text>
      {open ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Sannsynlighet</Text>
          {(method?.likelihood || DEFAULT_RISK_METHOD.likelihood).map((x, i) => <Text key={x} style={{ color: colors.ink, fontSize: 12 }}>{i + 1} {x}: {RISK_GUIDANCE.likelihood[i]}</Text>)}
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Konsekvens (verst realistiske utfall)</Text>
          {(method?.consequence || DEFAULT_RISK_METHOD.consequence).map((x, i) => (
            <Text key={x} style={{ color: colors.ink, fontSize: 12 }}>{i + 1} {x}: {RISK_GUIDANCE.dimensions.map((d, j) => `${d}: ${RISK_GUIDANCE.consequence[i][j]}`).join(' · ')}</Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function RecordList({ ctx, registerKey, rows, subtitle, onOpen, right }) {
  const colors = useColors();
  const today = todayKey();
  if (!rows.length) return <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen poster.</Text>;
  return rows.map((r) => {
    const overdue = (r.nextReview && r.nextReview < today && !['arkivert', 'lukket'].includes(r.state));
    return (
      <ListRow
        key={r.id}
        icon={overdue ? 'time-outline' : 'ellipse-outline'}
        tone={overdue ? 'warn' : 'muted'}
        title={`${r.number} · ${r.title || r.activity || ''}`}
        subtitle={[subtitle ? subtitle(r) : '', r.ownerName, overdue ? `revurdering forfalt ${prettyDate(r.nextReview)}` : ''].filter(Boolean).join(' · ')}
        right={right ? right(r) : (r.needsReview ? <Pill label="Må gjennomgås" tone="warn" /> : <Pill label={STATE_LABEL[r.state] || r.state} />)}
        onPress={() => onOpen(r)}
      />
    );
  });
}

function RecordDetail({ ctx, record, onClose, children }) {
  const colors = useColors();
  const { caps, actor, store } = ctx;
  const def = registerDef(record?.register);
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  if (!record || !def) return null;
  async function state(next) {
    const res = setRecordState(record, next, { actor, caps, note });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('records', 'record', res, { previous: record });
    if (!saved.ok) setErr(saved.error);
  }
  return (
    <>
      <Sheet visible={!edit} title={`${record.number} · ${record.title || record.activity}`} onClose={onClose} wide={ctx.wide}>
        <Row><Pill label={STATE_LABEL[record.state] || record.state} tone="info" />{record.locked ? <Pill label="Låst" icon="lock-closed" /> : null}{record.needsReview ? <Pill label="Må gjennomgås" icon="alert-circle-outline" tone="warn" /> : null}</Row>
        {record.needsReview ? (
          <Banner tone="warn" text={`Må gjennomgås: ${record.reviewNote || 'Kontroller innholdet før posten regnes som gjeldende.'}`} />
        ) : null}
        {record.origin?.system ? <Text style={{ color: colors.muted, fontSize: 12 }}>Opphav: {record.origin.system}{record.origin.ref ? ` · ${record.origin.ref}` : ''}</Text> : null}
        {def.fields.map((f) => {
          let value = record[f.key];
          if (Array.isArray(value) && !['persons', 'contacts'].includes(f.type)) value = value.join(', ');
          if (typeof value === 'boolean') value = value ? 'Ja' : 'Nei';
          if (f.type === 'date') value = prettyDate(value);
          if (f.type === 'ref' || f.type === 'refmulti') value = refLabel(ctx.state, f, record[f.key]);
          if (f.type === 'persons') value = personsLabel(record[f.key]);
          if (f.type === 'contacts') value = contactsLabel(record[f.key]);
          if (f.type === 'project') value = record.projectName || value;
          return <KV key={f.key} label={f.label} value={value} />;
        })}
        {children}
        {caps.manage && !record.locked ? (
          <>
            <Row>
              <Btn icon="create-outline" label="Rediger" onPress={() => setEdit(true)} />
              {record.needsReview ? (
                <Btn
                  small
                  icon="checkmark-done-outline"
                  label="Marker som gjennomgått"
                  onPress={async () => {
                    const res = updateRecord(record, { needsReview: false, reviewNote: '' }, { actor, note: note || 'Gjennomgått' });
                    if (!res.ok) { setErr(res.error); return; }
                    const saved = await store.commit('records', 'record', res, { previous: record });
                    if (!saved.ok) setErr(saved.error);
                  }}
                />
              ) : null}
              {def.states.filter((s) => s !== record.state).map((s) => {
                const a = stateAction(s, record.state, def.states[0]);
                return <Btn key={s} small icon={a.icon} label={a.label} onPress={() => state(s)} />;
              })}
            </Row>
            <TextIn value={note} onChangeText={setNote} placeholder="Merknad til statusendring" />
            {def.states.includes('arkivert') ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {record.state === 'arkivert'
                  ? '«Gjenopprett» setter posten tilbake i listen.'
                  : '«Arkiver» tar posten ut av listen uten å slette den. Arkiverte poster finner du under «Vis arkiverte» nederst i registeret.'}
              </Text>
            ) : null}
          </>
        ) : null}
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Historikk</Text>
        {(record.history || []).slice().reverse().slice(0, 20).map((h, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>{prettyDate(h.at)} · {h.action} · {h.by}{h.note ? ` · ${h.note}` : ''}</Text>)}
      </Sheet>
      <RecordSheet ctx={ctx} registerKey={record.register} record={record} visible={edit} onClose={() => setEdit(false)} />
    </>
  );
}

function useRegister(ctx, key) {
  const [creating, setCreating] = useState(!!ctx.params?.create);
  const [openId, setOpenId] = useState(ctx.params?.open || '');
  useEffect(() => { if (ctx.params?.open) setOpenId(ctx.params.open); if (ctx.params?.create) setCreating(true); }, [ctx.params]);
  const rows = ctx.state.records[key] || [];
  const open = rows.find((r) => r.id === openId) || null;
  return { creating, setCreating, openId, setOpenId, rows, open };
}

/**
 * Register med liste, ny post, detalj og arkiv. view({ rows, open }) erstatter listen
 * (tabell, matrise, månedsrutenett …); arkiverte poster vises fortsatt som liste.
 */
export function SimpleRegister({ ctx, registerKey, subtitle, children, detail, filter, right, view, title, cardSubtitle }) {
  const { caps } = ctx;
  const def = REGISTERS[registerKey];
  const reg = useRegister(ctx, registerKey);
  const [showArchived, setShowArchived] = useState(false);
  const all = filter ? reg.rows.filter(filter) : reg.rows;
  const rows = all.filter((r) => r.state !== 'arkivert');
  // Arkiverte poster skjules i listen, men må kunne finnes og gjenopprettes.
  const archived = all.filter((r) => r.state === 'arkivert');
  return (
    <Card title={title || def.title} subtitle={cardSubtitle} right={caps.manage ? <Btn small icon="add" label="Ny" onPress={() => reg.setCreating(true)} /> : null}>
      {children}
      {view
        ? view({ rows, open: (r) => reg.setOpenId(r.id) })
        : <RecordList ctx={ctx} registerKey={registerKey} rows={rows} subtitle={subtitle} right={right} onOpen={(r) => reg.setOpenId(r.id)} />}
      {archived.length ? (
        <Btn
          small
          icon={showArchived ? 'chevron-up' : 'archive-outline'}
          label={showArchived ? 'Skjul arkiverte' : `Vis arkiverte (${archived.length})`}
          onPress={() => setShowArchived(!showArchived)}
        />
      ) : null}
      {showArchived && archived.length ? <RecordList ctx={ctx} registerKey={registerKey} rows={archived} subtitle={subtitle} onOpen={(r) => reg.setOpenId(r.id)} /> : null}
      <RecordSheet ctx={ctx} registerKey={registerKey} visible={reg.creating} onClose={() => reg.setCreating(false)} />
      {reg.open ? <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')}>{detail ? detail(reg.open) : null}</RecordDetail> : null}
    </Card>
  );
}

/**
 * Forslag hentet fra andre moduler. «Legg til» lagrer direkte når forslaget har alt som kreves;
 * ellers åpnes skjemaet ferdig utfylt så brukeren bare vurderer og lagrer.
 */
function Suggestions({ ctx, registerKey, rows, title, subtitle, describe, direct, limit = 6, addedTo, onAdded }) {
  const colors = useColors();
  const { caps, actor, store, state } = ctx;
  const [preset, setPreset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const [added, setAdded] = useState([]);
  const [err, setErr] = useState('');
  const visible = rows.filter((r) => !dismissed.includes(r.title));
  const hidden = rows.length - visible.length;
  // Kortet blir stående etter «Legg til», så brukeren ser hvor forslagene ble av.
  if (!caps.manage || (!visible.length && !hidden && !added.length && !err)) return null;
  const target = addedTo || `${registerDef(registerKey)?.title || 'registeret'} nedenfor`;

  async function addAll(list) {
    setBusy(true);
    setErr('');
    let existing = store.current().records[registerKey] || [];
    const done = [];
    const failed = [];
    for (const r of list) {
      const { source, ...input } = r;
      const res = createRecord(registerKey, input, { actor, existing, riskMethod: state.system.riskMethod || DEFAULT_RISK_METHOD });
      const saved = res.ok ? await store.commit('records', 'record', res) : res;
      if (saved.ok) {
        existing = [...existing, res.record];
        done.push(res.record);
      } else {
        failed.push(`${r.title} (${saved.error})`);
      }
    }
    setBusy(false);
    if (done.length) {
      setAdded((cur) => [...cur, ...done.map((x) => x.title)]);
      onAdded?.(done);
    }
    if (failed.length) setErr(`Ble ikke lagt til: ${failed.join(', ')}.`);
  }

  return (
    <Card title={title} subtitle={subtitle} right={<Pill label="Forslag" icon="sparkles-outline" tone="info" />}>
      {added.length ? (
        <Banner
          tone="ok"
          text={`${nameList(added)} er lagt til i ${target}.${direct ? ` Trykk på ${added.length === 1 ? 'den' : 'dem'} der for å fylle ut resten.` : ''}`}
        />
      ) : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {!visible.length && !hidden ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen flere forslag.</Text> : null}
      {visible.slice(0, limit).map((r) => (
        <ListRow
          key={r.title}
          icon="sparkles-outline"
          tone="info"
          title={r.title}
          subtitle={[describe ? describe(r) : '', r.source ? `Kilde: ${r.source}` : ''].filter(Boolean).join(' · ')}
          right={(
            <Row gap={6} wrap={false}>
              <Btn small label={direct ? 'Legg til' : 'Bruk'} busy={busy} onPress={() => (direct ? addAll([r]) : setPreset(r))} />
              <Btn small icon="close" accessibilityLabel={`Skjul forslag ${r.title}`} onPress={() => setDismissed([...dismissed, r.title])} />
            </Row>
          )}
        />
      ))}
      {direct && visible.length > 1 ? <Btn small icon="add-circle-outline" label={`Legg til alle ${Math.min(visible.length, limit)}`} busy={busy} onPress={() => addAll(visible.slice(0, limit))} /> : null}
      {hidden ? (
        <Row>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{hidden === 1 ? 'Ett forslag er skjult.' : `${hidden} forslag er skjult.`}</Text>
          <Btn small icon="eye-outline" label="Vis igjen" onPress={() => setDismissed([])} />
        </Row>
      ) : null}
      {visible.length ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {direct
            ? `«Legg til» lagrer forslaget i ${target}. × skjuler forslaget.`
            : '«Bruk» åpner registreringen ferdig utfylt. Du vurderer og lagrer.'}
        </Text>
      ) : null}
      <RecordSheet
        ctx={ctx}
        registerKey={registerKey}
        visible={!!preset}
        preset={preset ? (({ source, ...x }) => x)(preset) : {}}
        onClose={() => setPreset(null)}
        onSaved={(rec) => { setAdded((cur) => [...cur, rec.title || rec.activity]); onAdded?.([rec]); }}
      />
    </Card>
  );
}

/** Nøkkeltall-flis i samme stil som resten av ISO. */
export function Stat({ label, value, hint, tone }) {
  const colors = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: 150, gap: 4, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: tone === 'warn' ? colors.warn : colors.ink, fontSize: 24, fontWeight: '700' }}>{value}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 11 }}>{hint}</Text> : null}
    </View>
  );
}

/** Styrte skjema (godkjent fra Skjemabygger) for en side. */
function useControlledForms(state, keys) {
  return useMemo(() => {
    const ids = new Set(keys.map(templateIdFor));
    return usableForms(state.forms).filter((f) => ids.has(f.templateId) || keys.includes(f.templateKey));
  }, [state.forms, keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ───────── Sider ───────── */

const SWOT = [
  { id: 'Styrke', label: 'Styrker', hint: 'Interne', tone: 'ok' },
  { id: 'Svakhet', label: 'Svakheter', hint: 'Interne', tone: 'warn' },
  { id: 'Mulighet', label: 'Muligheter', hint: 'Eksterne', tone: 'info' },
  { id: 'Trussel', label: 'Trusler', hint: 'Eksterne', tone: 'danger' },
];

/** Kontekst: SWOT i rutenett når typene er satt, resten gruppert internt/eksternt. */
function ContextView({ ctx, rows, onOpen }) {
  const colors = useColors();
  const swotIds = SWOT.map((x) => x.id);
  const swot = rows.filter((r) => swotIds.includes(r.factorType));
  const rest = rows.filter((r) => !swotIds.includes(r.factorType));
  if (!rows.length) return <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen forhold ennå. «Ny» legger til et internt eller eksternt forhold.</Text>;
  return (
    <>
      {swot.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SWOT.map((q) => {
            const items = swot.filter((r) => r.factorType === q.id);
            return (
              <View key={q.id} style={{ flexGrow: 1, flexBasis: ctx.wide ? '46%' : '100%', padding: 10, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: toneColor(colors, q.tone), backgroundColor: colors.card }}>
                <Text style={{ color: colors.ink, fontWeight: '800' }}>{q.label} <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 12 }}>· {q.hint.toLowerCase()} · {items.length}</Text></Text>
                {items.length ? items.map((r) => (
                  <Pressable key={r.id} onPress={() => onOpen(r)} accessibilityRole="button" accessibilityLabel={`Åpne ${r.title}`} style={({ pressed }) => ({ paddingVertical: 3, backgroundColor: pressed ? colors.brandSoft : 'transparent', borderRadius: 6 })}>
                    <Text style={{ color: colors.ink, fontSize: 13 }}>• {r.title}{r.area ? <Text style={{ color: colors.muted, fontSize: 12 }}> ({r.area})</Text> : null}{r.needsReview ? <Text style={{ color: colors.warn, fontSize: 12 }}> · må gjennomgås</Text> : null}</Text>
                  </Pressable>
                )) : <Text style={{ color: colors.muted, fontSize: 12 }}>–</Text>}
              </View>
            );
          })}
        </View>
      ) : null}
      {['Internt', 'Eksternt', ''].map((scope) => {
        const list = rest.filter((r) => (scope ? r.scope === scope : !['Internt', 'Eksternt'].includes(r.scope)));
        if (!list.length) return null;
        return (
          <View key={scope || 'annet'} style={{ gap: 2 }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 6 }}>{`${scope ? `${scope}e forhold` : 'Andre forhold'} (${list.length})`.toUpperCase()}</Text>
            <RecordList ctx={ctx} registerKey="kontekst" rows={list} subtitle={(r) => [r.factorType, r.area, r.climate === 'Ja' ? 'klimarelevant' : ''].filter(Boolean).join(' · ')} onOpen={onOpen} />
          </View>
        );
      })}
    </>
  );
}

export function ContextPage({ ctx }) {
  const { state, sources } = ctx;
  // Interessenter lagt til fra forslagene i denne økten, så de er lette å kjenne igjen i listen.
  const [fresh, setFresh] = useState([]);
  const suggestions = useMemo(() => stakeholderSuggestions({
    customers: sources?.customers, contracts: sources?.contracts, requirements: allRequirements(state), existing: state.records.interessent,
  }), [sources?.customers, sources?.contracts, state]);
  return (
    <Page wide={ctx.wide} title="Kontekst og interessenter" intro="Interne og eksterne forhold og interessenter som påvirker ledelsessystemet. Endringer kan utløse ny risikovurdering.">
      <SimpleRegister
        ctx={ctx}
        registerKey="kontekst"
        cardSubtitle="Forhold, utfordringer og SWOT. Muligheter og trusler bør følges opp i Risiko (6.1)."
        view={({ rows, open }) => <ContextView ctx={ctx} rows={rows} onOpen={open} />}
      />
      <Suggestions
        ctx={ctx}
        registerKey="interessent"
        rows={suggestions}
        direct
        title="Foreslåtte interessenter"
        subtitle="Fra kontraktene, kunderegisteret, ansatte og myndighetene i lovkravene."
        describe={(r) => r.category}
        addedTo="Interessenter nederst på siden"
        onAdded={(recs) => setFresh((cur) => [...cur, ...recs.map((r) => r.id)])}
      />
      <SimpleRegister
        ctx={ctx}
        registerKey="interessent"
        subtitle={(r) => `${r.category || ''}${r.binding === 'Ja' ? ' · bindende forpliktelse' : ''}`}
        right={(r) => (fresh.includes(r.id) ? <Pill label="Nettopp lagt til" icon="checkmark" tone="ok" /> : <Pill label={STATE_LABEL[r.state] || r.state} />)}
      />
    </Page>
  );
}

export function RiskPage({ ctx }) {
  const { state, wide, params, go, caps } = ctx;
  const [which, setWhich] = useState('inherent');
  const reg = useRegister(ctx, 'risiko');
  const [kind, setKind] = useState('');
  const ids = params?.ids || null;
  const risks = reg.rows.filter((r) => r.state !== 'arkivert' && (!ids || ids.includes(r.id)) && (!kind || r.kind === kind));
  const cells = riskMatrix(reg.rows.filter((r) => r.kind !== 'Mulighet'), which);
  return (
    <Page wide={wide} title="Risiko og muligheter" intro="Strategiske, kvalitets-, miljø-, arbeidsmiljø-, prosjekt- og leverandørrisikoer. Iboende og rest-risiko vurderes hver for seg etter dokumentert metode." actions={caps.manage ? <Btn kind="primary" icon="add" label="Ny vurdering" onPress={() => reg.setCreating(true)} /> : null}>
      {ids ? <Banner tone="info" text={`Viser utvalg: ${params?.label || ''}`} /> : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title="Risikomatrise" style={{ flex: 1, width: wide ? undefined : '100%' }} right={<Choice small options={[{ id: 'inherent', label: 'Iboende' }, { id: 'residual', label: 'Rest' }]} value={which} onChange={(x) => setWhich(x || 'inherent')} />}>
          <RiskMatrix cells={cells} method={`${state.system.riskMethod?.name} v${state.system.riskMethod?.version}. Terskler: middels ≥ ${state.system.riskMethod?.thresholds?.medium}, høy ≥ ${state.system.riskMethod?.thresholds?.high}, kritisk ≥ ${state.system.riskMethod?.thresholds?.critical}.`} onPick={(p) => go('risiko', { ids: p.ids, label: p.label })} />
        </Card>
        <Card title="Register" style={{ flex: 1, width: wide ? undefined : '100%' }}>
          <Choice small options={['Risiko', 'Mulighet']} value={kind} onChange={setKind} />
          <RecordList
            ctx={ctx}
            registerKey="risiko"
            rows={risks}
            subtitle={(r) => {
              const s = riskSummary(r, state.system.riskMethod);
              return r.kind === 'Mulighet' ? 'Mulighet' : `iboende ${s.inherent.label}${s.residual.score ? ` → rest ${s.residual.label}` : ''}`;
            }}
            right={(r) => {
              const s = riskSummary(r, state.system.riskMethod);
              const lv = s.residual.score ? s.residual : s.inherent;
              return r.kind === 'Mulighet' ? <Pill label="Mulighet" tone="ok" /> : <Pill label={lv.score ? `${lv.label} ${lv.score}` : 'Ikke vurdert'} tone={lv.id === 'kritisk' || lv.id === 'hoy' ? 'danger' : (lv.id === 'middels' ? 'warn' : 'ok')} />;
            }}
            onOpen={(r) => reg.setOpenId(r.id)}
          />
        </Card>
      </View>
      <RiskCriteria method={state.system.riskMethod} />
      <RecordSheet ctx={ctx} registerKey="risiko" visible={reg.creating} onClose={() => { reg.setCreating(false); if (params?.create) go('risiko', {}); }} preset={{ kind: 'Risiko' }} />
      {reg.open ? <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')} /> : null}
    </Page>
  );
}

export function EnvironmentPage({ ctx }) {
  const colors = useColors();
  const { state, wide, caps } = ctx;
  const data = state.records.miljodata || [];
  const byPoint = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      const key = `${r.title} (${r.unit})`;
      const row = map.get(key) || { label: key, value: 0, ids: [], quality: new Set() };
      row.value += Number(r.value) || 0;
      row.ids.push(r.id);
      row.quality.add(r.quality);
      map.set(key, row);
    }
    return [...map.values()].map((r) => ({ ...r, label: `${r.label}${r.quality.has('Estimert') || r.quality.has('Ukjent') ? ' · inneholder estimat' : ''}` }));
  }, [data]);
  const significant = (state.records.miljoaspekt || []).filter((a) => a.significant === 'Ja' && a.state !== 'arkivert');
  const src = ctx.sources || {};
  const km = useMemo(() => mileageSeries(src.trips), [src.trips]);
  const waste = useMemo(() => wasteSummary(src.waste, src.projects), [src.waste, src.projects]);
  const aspects = useMemo(() => aspectSuggestions({ trips: src.trips, waste: src.waste, equipment: src.equipment, existing: state.records.miljoaspekt }), [src.trips, src.waste, src.equipment, state.records.miljoaspekt]);
  const [adopt, setAdopt] = useState(null);
  return (
    <Page wide={wide} title="Miljøstyring" intro="Miljøaspekter i livsløpsperspektiv, vesentlighet etter dokumenterte kriterier, og miljødata med enhet, metode og datakvalitet. Kjørebok og avfall hentes direkte fra Prosjekt.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Vesentlige aspekter" value={significant.length} />
        <Stat label="Kjørt siste 12 mnd" value={`${km.totalKm.toLocaleString('nb-NO')} km`} hint={km.electricShare == null ? 'Kjørebok' : `${km.electricShare} % elbil · Kjørebok`} />
        <Stat label="Avfall registrert" value={`${waste.totalKg.toLocaleString('nb-NO')} kg`} hint={waste.sortingRate == null ? 'Prosjekt' : `${waste.sortingRate} % sortert · ${waste.projects} prosjekter`} />
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title="Kjøring per måned" subtitle="Direkte fra Kjørebok. Målt, ikke estimert." style={{ flex: 1, width: wide ? undefined : '100%' }}
          right={caps.manage && km.totalKm ? <Btn small icon="download-outline" label="Bruk som miljødata" onPress={() => setAdopt({ title: 'Kjøring i tjeneste', unit: 'km', quality: 'Målt', method: 'Kjørebok i ProTop', period: km.rows[km.rows.length - 2]?.key, value: km.rows[km.rows.length - 2]?.total })} /> : null}>
          <MonthBars rows={km.rows} parts={[{ key: 'fossil', label: 'Fossil' }, { key: 'electric', label: 'Elbil', color: colors.success }]} unit=" km" empty="Ingen turer i Kjørebok siste 12 måneder." />
          {ctx.requestTab ? <Btn small icon="open-outline" label="Åpne Kjørebok" onPress={() => ctx.requestTab('okonomi', 'kjorebok')} /> : null}
        </Card>
        <Card title="Avfall per fraksjon" subtitle="Fra avfallsregistreringene i prosjektene." style={{ flex: 1, width: wide ? undefined : '100%' }}>
          <HBars rows={waste.rows} unit=" kg" empty="Ingen avfall registrert på prosjekter." onPick={ctx.requestTab ? () => ctx.requestTab('projects') : undefined} />
        </Card>
      </View>
      <Suggestions ctx={ctx} registerKey="miljoaspekt" rows={aspects} title="Foreslåtte miljøaspekter" subtitle="Ut fra kjørebok, avfall, kjøretøy og typisk drift. Vesentlighet og begrunnelse settes av deg." describe={(r) => `${r.lifecycle} · ${r.impact}`} />
      <SimpleRegister
        ctx={ctx}
        registerKey="miljoaspekt"
        cardSubtitle="Vesentlighet etter samme matrise som risiko: omfang × alvorlighet. Vesentlig ved høy score, eller middels score med samsvarsforpliktelse eller nødsituasjon."
        subtitle={(r) => {
          const a = aspectSignificance(r, state.system.riskMethod);
          return [r.lifecycle, r.significant === 'Ja' ? 'vesentlig' : 'ikke vesentlig', a.level.score ? `score ${a.level.score} (${a.level.label.toLowerCase()})` : '', r.control ? r.control.toLowerCase() : ''].filter(Boolean).join(' · ');
        }}
        right={(r) => {
          const a = aspectSignificance(r, state.system.riskMethod);
          // Avviker vurderingen fra kriteriene, vises det, så det blir begrunnet eller rettet.
          if (a.significant != null && a.significant !== (r.significant === 'Ja')) return <Pill label={a.significant ? 'Kriteriene: vesentlig' : 'Kriteriene: ikke vesentlig'} tone="warn" />;
          return r.needsReview ? <Pill label="Må gjennomgås" tone="warn" /> : <Pill label={r.significant === 'Ja' ? 'Vesentlig' : 'Ikke vesentlig'} tone={r.significant === 'Ja' ? 'danger' : 'muted'} />;
        }}
      />
      <Card title="Miljødata – sum per målepunkt">
        <HBars rows={byPoint} empty="Ingen miljødata registrert. Grafen vises bare når det finnes reelle målinger." />
        <Text style={{ color: colors.muted, fontSize: 12 }}>CO₂e beregnes ikke automatisk. Bruk dokumentert metode og faktor med kilde og år.</Text>
      </Card>
      <SimpleRegister ctx={ctx} registerKey="miljodata" subtitle={(r) => `${r.period} · ${r.value} ${r.unit} · ${r.quality}`} />
      <RecordSheet ctx={ctx} registerKey="miljodata" visible={!!adopt} preset={adopt || {}} onClose={() => setAdopt(null)} />
    </Page>
  );
}

export function HmsPage({ ctx }) {
  const colors = useColors();
  const { state, caps, wide, go } = ctx;
  const [fill, setFill] = useState(null);
  const hmsFindings = visibleFindings(caps, state.findings).filter((f) => ['hms', 'nestenulykke'].includes(f.type));
  const forms = useControlledForms(state, ['SF12_SJA', 'SF13_VERNERUNDE']);
  const src = ctx.sources || {};
  const sick = useMemo(() => sickLeaveSeries(src.absences), [src.absences]);
  const hazards = useMemo(() => hazardSuggestions({ projects: src.projects, trips: src.trips, existing: state.records.fare }), [src.projects, src.trips, state.records.fare]);
  const subs = state.submissions || [];
  const lastRound = subs.filter((x) => x.templateId === templateIdFor('SF13_VERNERUNDE')).sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0];
  return (
    <Page wide={wide} title="Arbeidsmiljø og HMS" intro="Farekartlegging med medvirkning og tiltakshierarki, vernerunder, SJA og arbeidstakermedvirkning. SJA aktiveres etter arbeidsoppgave og risiko, ikke som generelt ISO-krav." actions={<Btn kind="primary" icon="medkit-outline" label="Meld HMS-hendelse" onPress={() => go('avvik', { create: true, prefill: { type: 'hms' } })} />}>
      <Banner tone="info" text="Personskader og helseopplysninger registreres som skjermede saker. Varslingssaker og personalsaker hører ikke hjemme her." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Åpne HMS-saker" value={hmsFindings.filter((f) => !['lukket', 'kansellert'].includes(f.state)).length} />
        <Stat label="Kartlagte farer" value={(state.records.fare || []).filter((r) => r.state !== 'arkivert').length} />
        <Stat label="Siste vernerunde" value={lastRound ? prettyDate(lastRound.submittedAt) : '–'} hint={lastRound ? lastRound.submittedBy : 'Ingen registrert'} />
        {caps.manage ? <Stat label="Sykefravær siste 12 mnd" value={sick.hasData ? `${sick.totalDays} dagsverk` : '–'} hint="Fra Fravær, uten navn" /> : null}
      </View>
      <Card title="Skjema for HMS-arbeid" subtitle="Styrte skjema fra Skjemabygger. Innsendt blir låst bevis.">
        {!forms.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>SJA, vernerunde og medvirkning er ikke godkjent for ISO ennå. Godkjenn dem under Skjemaer.</Text> : null}
        <Row>{forms.map((f) => <Btn key={f.id} icon="clipboard-outline" label={f.title} onPress={() => setFill(f)} />)}</Row>
        {!forms.length && caps.approve ? <Btn small label="Gå til Skjemaer" onPress={() => go('skjema')} /> : null}
      </Card>
      {caps.manage && sick.hasData ? (
        <Card title="Sykefravær per måned" subtitle={sick.method}>
          <MonthBars rows={sick.rows} parts={[{ key: 'days', label: 'Dagsverk' }]} unit=" d" />
          {ctx.requestTab ? <Btn small icon="open-outline" label="Åpne Fraværsoversikt" onPress={() => ctx.requestTab('arbeid', 'fravaer')} /> : null}
        </Card>
      ) : null}
      <Suggestions ctx={ctx} registerKey="fare" rows={hazards} title="Foreslåtte farer" subtitle="Ut fra prosjektene og kjøreboken. Medvirkning og ansvarlig fylles inn av deg." describe={(r) => `${r.activity} · ${r.hazardCategory}`} />
      <SimpleRegister ctx={ctx} registerKey="fare" subtitle={(r) => { const s = riskSummary(r, state.system.riskMethod); return `${r.hazardCategory || ''} · ${s.inherent.label}${s.residual.score ? ` → ${s.residual.label}` : ''}`; }} />
      <SimpleRegister ctx={ctx} registerKey="medvirkning" subtitle={(r) => `${r.channel || ''}${r.feedback === 'Ja' ? ' · tilbakemeldt' : ''}`} />
      <Card title="HMS-hendelser og nestenulykker">
        {!hmsFindings.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen saker du har tilgang til.</Text> : null}
        {hmsFindings.slice(0, 20).map((f) => <ListRow key={f.id} icon={f.restricted ? 'lock-closed-outline' : 'medkit-outline'} title={`${f.number} · ${f.title}`} subtitle={`${prettyDate(f.occurredAt)} · ${f.state}`} onPress={() => go('avvik', { open: f.id })} />)}
      </Card>
      <FormFillSheet ctx={ctx} control={fill} visible={!!fill} onClose={() => setFill(null)} onSubmitted={() => setFill(null)} />
    </Page>
  );
}

/**
 * Kontaktene på et beredskapskort, store og med ringeknapp. Navn og telefon hentes fra Ansatte når kontakten
 * er valgt blant de ansatte, så kortet aldri viser et gammelt nummer.
 */
function EmergencyContacts({ contacts, people }) {
  const colors = useColors();
  const rows = cleanContacts(contacts).map((c) => {
    const p = (people || []).find((x) => (c.employeeId && x.id === c.employeeId) || (c.uid && x.uid === c.uid)) || null;
    return { ...c, name: p?.name || c.name, phone: p?.phone || c.phone };
  });
  if (!rows.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Kontakter</Text>
      {rows.map((c, i) => (
        <View key={`${c.role}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ color: colors.ink, fontSize: 18 }}>{[c.role, c.name].filter(Boolean).join(': ')}</Text>
            {c.note ? <Text style={{ color: colors.muted, fontSize: 13 }}>{c.note}</Text> : null}
          </View>
          {c.phone ? <Btn icon="call-outline" label={c.phone} accessibilityLabel={`Ring ${c.name || c.role} ${c.phone}`} onPress={() => Linking.openURL(`tel:${String(c.phone).replace(/[^\d+]/g, '')}`).catch(() => {})} /> : null}
        </View>
      ))}
    </View>
  );
}

export function EmergencyPage({ ctx }) {
  const colors = useColors();
  const { state, wide, actor, store, caps } = ctx;
  const reg = useRegister(ctx, 'beredskap');
  const [emergency, setEmergency] = useState('');
  const [ex, setEx] = useState({ date: todayKey(), participants: '', evaluation: '', improvement: false });
  const [err, setErr] = useState('');
  const scen = reg.rows.filter((r) => r.state !== 'arkivert');
  const shown = scen.find((s) => s.id === emergency);
  return (
    <Page wide={wide} title="Beredskap" intro="Scenarioer, varsling, roller og instrukser. Øvelser registreres, evalueres og kobles til tiltak." actions={caps.manage ? <Btn kind="primary" icon="add" label="Nytt scenario" onPress={() => reg.setCreating(true)} /> : null}>
      <Card title="Nødvisning" subtitle="Kritisk informasjon per scenario – vises stort og enkelt.">
        <Row>{scen.map((s) => <Btn key={s.id} kind={emergency === s.id ? 'primary' : 'ghost'} icon="alert-circle-outline" label={s.title} onPress={() => setEmergency(emergency === s.id ? '' : s.id)} />)}</Row>
        {!scen.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen beredskapsscenarioer.</Text> : null}
        {shown ? (
          <View style={{ gap: 10, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.danger }}>
            <Text style={{ color: colors.danger, fontSize: 20, fontWeight: '800' }}>{shown.title}</Text>
            <Text style={{ color: colors.ink, fontSize: 18, lineHeight: 26 }}>{shown.instructions}</Text>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Varsling</Text>
            <Text style={{ color: colors.ink, fontSize: 18, lineHeight: 26 }}>{shown.alarm}</Text>
            <EmergencyContacts contacts={shown.contacts} people={ctx.people} />
            {shown.roles ? <Text style={{ color: colors.ink, fontSize: 15 }}>{shown.roles}</Text> : null}
            {shown.equipment ? <Text style={{ color: colors.muted, fontSize: 14 }}>Utstyr: {shown.equipment}</Text> : null}
          </View>
        ) : null}
      </Card>
      <Card title="Scenarioer og øvelser">
        <RecordList ctx={ctx} registerKey="beredskap" rows={scen} subtitle={(r) => `${r.domain || ''} · ${(r.exercises || []).length} øvelser${r.nextExercise ? ` · neste ${prettyDate(r.nextExercise)}` : ''}`} onOpen={(r) => reg.setOpenId(r.id)} />
      </Card>
      <RecordSheet ctx={ctx} registerKey="beredskap" visible={reg.creating} onClose={() => reg.setCreating(false)} />
      {reg.open ? (
        <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Øvelser</Text>
          {(reg.open.exercises || []).map((e) => <Text key={e.id} style={{ color: colors.ink, fontSize: 13 }}>{prettyDate(e.date)} · {e.evaluation}{e.improvement ? ' · forbedring nødvendig' : ''}</Text>)}
          {caps.manage ? (
            <>
              <Field label="Dato"><DateIn value={ex.date} onChange={(x) => setEx({ ...ex, date: x })} /></Field>
              <Field label="Deltakere"><TextIn value={ex.participants} onChangeText={(x) => setEx({ ...ex, participants: x })} /></Field>
              <Field label="Evaluering" required><TextIn multiline value={ex.evaluation} onChangeText={(x) => setEx({ ...ex, evaluation: x })} /></Field>
              <Check label="Behov for forbedring (oppretter avvikssak)" value={ex.improvement} onChange={(x) => setEx({ ...ex, improvement: x })} />
              <Btn kind="primary" label="Registrer øvelse" onPress={async () => {
                const res = addExercise(reg.open, ex, { actor });
                if (!res.ok) { setErr(res.error); return; }
                const saved = await store.commit('records', 'record', res, { previous: reg.open });
                if (!saved.ok) { setErr(saved.error); return; }
                if (ex.improvement) {
                  const f = createFinding({ type: 'forbedring', title: `Forbedring etter øvelse: ${reg.open.title}`, description: ex.evaluation, requirementIds: requirementIdsForArea(state, 'emergency') }, { actor, existing: state.findings });
                  if (f.ok) await store.commit('findings', 'finding', f);
                }
                setEx({ date: todayKey(), participants: '', evaluation: '', improvement: false });
              }} />
              {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
            </>
          ) : null}
        </RecordDetail>
      ) : null}
    </Page>
  );
}

/** Søkbar kompetanseoversikt: CV-en (Ansatte) og ISO-bevis per ansatt. */
function CompetenceProfiles({ ctx, people, matrix, q }) {
  const colors = useColors();
  const [openId, setOpenId] = useState('');
  const ql = q.trim().toLowerCase();
  const rows = people.map((p) => {
    const cv = p.cv || {};
    const lines = [
      ...(cv.education || []).map((e) => ({ kind: 'Utdanning', text: [e.program, e.school, [e.from, e.to].filter(Boolean).join('–')].filter(Boolean).join(' · ') })),
      ...(cv.certifications || []).map((c) => ({ kind: 'Sertifisering', text: c.title })),
      ...(cv.courses || []).map((c) => ({ kind: 'Kurs', text: [c.title, c.date].filter(Boolean).join(' · ') })),
    ];
    const evidence = (ctx.state.records.kompetanse || []).filter((r) => r.state !== 'arkivert' && ((p.uid && r.personUid === p.uid) || r.personName === p.name));
    const row = matrix.find((m) => m.person === p);
    const gaps = row ? row.cells.filter((c) => !['gyldig', 'na'].includes(c.status)).length : 0;
    const hay = [p.name, p.title, ...lines.map((l) => l.text), ...evidence.map((e) => e.title)].join(' ').toLowerCase();
    return { p, lines, evidence, gaps, hay };
  }).filter((r) => !ql || r.hay.includes(ql));
  if (!rows.length) return <Text style={{ color: colors.muted, fontSize: 13 }}>{ql ? 'Ingen treff.' : 'Ingen ansatte i Ansatte ennå.'}</Text>;
  return rows.map(({ p, lines, evidence, gaps }) => (
    <View key={p.id || p.name} style={{ gap: 4 }}>
      <ListRow
        icon="person-outline"
        tone={gaps ? 'warn' : 'muted'}
        title={p.name}
        subtitle={[p.title, `${lines.length} i CV`, evidence.length ? `${evidence.length} bevis` : '', gaps ? `${gaps} mangler` : ''].filter(Boolean).join(' · ')}
        right={<Pill label={openId === (p.id || p.name) ? 'Skjul' : 'Vis'} />}
        onPress={() => setOpenId(openId === (p.id || p.name) ? '' : (p.id || p.name))}
      />
      {openId === (p.id || p.name) ? (
        <View style={{ marginLeft: 28, gap: 2 }}>
          {lines.map((l, i) => <Text key={i} style={{ color: colors.ink, fontSize: 12 }}><Text style={{ color: colors.muted }}>{l.kind}: </Text>{l.text}</Text>)}
          {evidence.map((e) => <Text key={e.id} style={{ color: colors.ink, fontSize: 12 }}><Text style={{ color: colors.muted }}>Bevis: </Text>{e.title}{e.validTo ? ` · gyldig til ${prettyDate(e.validTo)}` : ''}</Text>)}
          {!lines.length && !evidence.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen utdanning, kurs eller sertifiseringer registrert.</Text> : null}
          <Row><Btn small icon="create-outline" label="Rediger CV i Ansatte" onPress={() => ctx.requestTab?.('ansatte')} /></Row>
        </View>
      ) : null}
    </View>
  ));
}

export function CompetencePage({ ctx }) {
  const colors = useColors();
  const { state, wide, people } = ctx;
  const [q, setQ] = useState('');
  const fullMatrix = useMemo(() => competenceMatrix(people, state.records.kompetansekrav, state.records.kompetanse, new Date(), { roles: state.records.rolle }), [people, state.records]);
  const ql = q.trim().toLowerCase();
  // Søk filtrerer både ansatte (navn, stilling, CV) og krav (tittel, rolle).
  const matrix = useMemo(() => {
    if (!ql) return fullMatrix;
    const reqHit = (r) => `${r.title} ${r.role || ''}`.toLowerCase().includes(ql);
    const anyReq = fullMatrix[0]?.cells.some((c) => reqHit(c.requirement));
    if (anyReq) return fullMatrix.map((row) => ({ ...row, cells: row.cells.filter((c) => reqHit(c.requirement)) }));
    return fullMatrix.filter((row) => `${row.person.name} ${row.person.title || ''} ${JSON.stringify(row.person.cv || {})}`.toLowerCase().includes(ql));
  }, [fullMatrix, ql]);
  const [pick, setPick] = useState(null);
  const [create, setCreate] = useState(null);
  const hr = useMemo(() => (ctx.sources?.hrOverview ? hrComplianceForIso(ctx.sources.hrOverview, ctx.sources.people) : null), [ctx.sources?.hrOverview, ctx.sources?.people]);
  const eq = useMemo(() => equipmentStatus(ctx.sources?.equipment), [ctx.sources?.equipment]);
  const gaps = competenceGaps(fullMatrix);
  const unassigned = useMemo(() => unassignedRequirements(state.records.kompetansekrav, state.records.rolle), [state.records]);
  return (
    <Page wide={wide} title="Kompetanse og ressurser" intro="Kompetansekrav per rolle, CV-en til hver ansatt og dokumentert kompetanse med gyldighet (ISO 7.2). CV-en eies av Ansatte, HR-sjekklisten av HR og utstyret av Utstyr.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Ansatte" value={people.length} hint="Fra Ansatte" />
        <Stat label="Kompetansegap" value={gaps} tone={gaps ? 'warn' : undefined} hint="Krav som mangler, er utløpt eller mangler gyldighet" />
        {hr ? <Stat label="Mangler i HR-sjekklisten" value={hr.withGaps.length} hint="HR – lov & ISO" tone={hr.withGaps.length ? 'warn' : undefined} /> : null}
        <Stat label="Utstyr i drift" value={eq.total} hint={eq.inService.length ? `${eq.inService.length} på service` : 'Fra Utstyr'} />
      </View>
      <TextIn value={q} onChangeText={setQ} placeholder="Søk i ansatte, CV, kurs, sertifiseringer og krav" accessibilityLabel="Søk i kompetanse" />
      {unassigned.length ? (
        <Card title={`Krav uten innehaver (${unassigned.length})`} subtitle="Rollen har ingen innehavere ennå, så kravet gjelder ingen. Velg innehavere i Organisasjon og roller, eller velg ansatte under «Gjelder også for» på kravet.">
          {unassigned.slice(0, 8).map(({ requirement: r, role }) => (
            <ListRow key={r.id} icon="person-add-outline" tone="warn" title={r.title} subtitle={role ? `Rollen «${role.title}» har ingen innehavere` : `Fant ingen rolle som heter «${r.role}»`} />
          ))}
          {unassigned.length > 8 ? <Text style={{ color: colors.muted, fontSize: 12 }}>… og {unassigned.length - 8} til.</Text> : null}
          <Row><Btn icon="people-circle-outline" label="Organisasjon og roller" onPress={() => ctx.go('organisasjon')} /></Row>
        </Card>
      ) : null}
      <Card title="Kompetansematrise" subtitle="Krav til en rolle gjelder dem som har rollen i Organisasjon og roller, og dem som er valgt på kravet. «I CV» = står i CV-en, men mangler gyldighet eller bevis. Trykk en celle for å registrere bevis.">
        <CompetenceHeatmap matrix={matrix} onPick={(person, cell) => setPick({ person, cell })} />
      </Card>
      <Card title="Kompetanse per ansatt" subtitle="Utdanning, sertifiseringer og kurs fra CV-en, og bevis registrert i ISO.">
        <CompetenceProfiles ctx={ctx} people={people} matrix={fullMatrix} q={q} />
      </Card>
      <SimpleRegister ctx={ctx} registerKey="kompetansekrav" subtitle={(r) => `${r.role}${(r.persons || []).length ? ` + ${r.persons.length} valgt` : ''}${r.validityMonths ? ` · gyldig ${r.validityMonths} mnd` : ''}`} />
      <SimpleRegister ctx={ctx} registerKey="kompetanse" subtitle={(r) => `${r.personName} · ${r.validTo ? `til ${prettyDate(r.validTo)}` : 'varig'}`} />
      {hr && hr.withGaps.length ? (
        <Card title="Bevissthet og opplæring fra HR" subtitle="Punkter som mangler i HR-modulens lov- og ISO-sjekkliste (HMS-introduksjon, avviksrutine, kompetanse). Rettes i HR.">
          {hr.withGaps.slice(0, 10).map((r) => <ListRow key={r.employeeId} icon="person-outline" tone="warn" title={r.name || 'Ansatt'} subtitle={r.gaps.slice(0, 3).join(' · ')} right={<Pill label={`${r.pct ?? 0} %`} />} onPress={() => ctx.requestTab?.('hr')} />)}
        </Card>
      ) : null}
      {eq.total ? (
        <Card title="Utstyr og infrastruktur (7.1)" subtitle="Fra Utstyr. Service og garanti følges opp der.">
          {eq.inService.slice(0, 5).map((e) => <ListRow key={e.id} icon="construct-outline" tone="warn" title={e.name || e.title || 'Utstyr'} subtitle="På service" />)}
          {eq.warrantySoon.slice(0, 5).map((e) => <ListRow key={e.id} icon="time-outline" title={e.name || e.title || 'Utstyr'} subtitle={`Garanti til ${prettyDate(e.warrantyUntil)}`} />)}
          {!eq.inService.length && !eq.warrantySoon.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>{eq.total} enheter i drift, ingen på service eller med garanti som snart går ut.</Text> : null}
        </Card>
      ) : null}
      <Sheet visible={!!pick} title={pick ? `${pick.person.name} – ${pick.cell.requirement.title}` : ''} onClose={() => setPick(null)}>
        {pick?.cell.record ? <KV label="Bevis" value={`${pick.cell.record.title} · ${pick.cell.record.validTo ? `gyldig til ${prettyDate(pick.cell.record.validTo)}` : 'varig'}`} /> : null}
        {!pick?.cell.record && pick?.cell.cv ? <KV label={`I CV-en (${pick.cell.cv.kind.toLowerCase()})`} value={`${pick.cell.cv.title}${pick.cell.cv.date ? ` · ${pick.cell.cv.date}` : ''}`} /> : null}
        {!pick?.cell.record && !pick?.cell.cv ? <Text style={{ color: colors.muted }}>Ingen dokumentert kompetanse.</Text> : null}
        <Btn kind="primary" icon="add" label="Registrer bevis" onPress={() => { setCreate({ personName: pick.person.name, personUid: pick.person.uid, requirementId: pick.cell.requirement.id, title: pick.cell.cv?.title || '' }); setPick(null); }} />
      </Sheet>
      <RecordSheet ctx={ctx} registerKey="kompetanse" visible={!!create} preset={create || {}} onClose={() => setCreate(null)} />
    </Page>
  );
}

/** Evaluering av en leverandør i detaljvisningen: kriterier, beslutning og historikk. */
function SupplierEvaluation({ ctx, record }) {
  const colors = useColors();
  const { caps, actor, store } = ctx;
  const blank = { quality: '', hse: '', environment: '', delivery: '', decision: '', comment: '', date: todayKey() };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (record.evaluations || []).slice().reverse();
  async function save() {
    setBusy(true);
    const res = addSupplierEvaluation(record, v, { actor });
    if (!res.ok) { setErr(res.error); setBusy(false); return; }
    const saved = await store.commit('records', 'record', res, { previous: record });
    setBusy(false);
    if (!saved.ok) { setErr(saved.error); return; }
    setV(blank);
    setErr('');
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '700', marginTop: 6 }}>Evalueringer</Text>
      {list.length ? list.map((e) => (
        <Text key={e.id} style={{ color: colors.ink, fontSize: 12 }}>{prettyDate(e.date)} · {e.decision} · snitt {e.total} ({SUPPLIER_CRITERIA.map((c) => `${c.label.toLowerCase()} ${e[c.key]}`).join(', ')}){e.comment ? ` · ${e.comment}` : ''} · {e.by}</Text>
      )) : <Text style={{ color: colors.muted, fontSize: 12 }}>Ikke evaluert ennå.</Text>}
      {caps.manage ? (
        <View style={{ gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Evaluer leverandør</Text>
          {SUPPLIER_CRITERIA.map((c) => (
            <Field key={c.key} label={`${c.label} (1–5)`}><Choice options={['1', '2', '3', '4', '5']} value={String(v[c.key] || '')} onChange={(x) => setV({ ...v, [c.key]: x })} /></Field>
          ))}
          <Field label="Beslutning" required><Choice options={['Godkjent', 'Betinget godkjent', 'Ikke godkjent']} value={v.decision} onChange={(x) => setV({ ...v, decision: x })} /></Field>
          <Field label="Kommentar"><TextIn multiline value={v.comment} onChangeText={(x) => setV({ ...v, comment: x })} placeholder="Avvik, leveranser, sertifikater, oppfølging" /></Field>
          <Field label="Dato"><DateIn value={v.date} onChange={(x) => setV({ ...v, date: x })} /></Field>
          {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
          <Btn kind="primary" icon="checkmark" label="Lagre evaluering" busy={busy} onPress={save} />
          <Text style={{ color: colors.muted, fontSize: 11 }}>Neste evaluering settes ut fra leverandørklassen. Score og status oppdateres på leverandøren.</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SupplierPage({ ctx }) {
  const colors = useColors();
  const { state, wide } = ctx;
  const due = overdueRecords(state.records.leverandor, 'nextReview');
  const suggestions = useMemo(() => supplierSuggestions(ctx.sources?.expenses, state.records.leverandor)
    .map((r) => ({ title: r.title, criticality: 'Middels', approval: 'Ikke vurdert', category: '', source: `Utlegg (${r.count} bilag)` })), [ctx.sources?.expenses, state.records.leverandor]);
  return (
    <Page wide={wide} title="Leverandørkontroll" intro="Kvalifisering, evaluering og oppfølging etter kritikalitet. Leverandører foreslås fra utleggene, og evaluering blir oppgave når den forfaller.">
      {due.length ? <Banner tone="warn" text={`${due.length} leverandører har forfalt evaluering.`} /> : null}
      <Suggestions ctx={ctx} registerKey="leverandor" rows={suggestions} direct title="Leverandører fra utleggene" subtitle="Mest brukte leverandører som ikke er vurdert. Legges inn som «Ikke vurdert» med middels kritikalitet." describe={() => 'Ikke vurdert'} limit={8} />
      <SimpleRegister ctx={ctx} registerKey="leverandor" subtitle={(r) => [r.supplierClass || `${r.criticality} kritikalitet`, r.approval, r.score ? `score ${r.score}` : '', r.services].filter(Boolean).join(' · ')} detail={(r) => <SupplierEvaluation ctx={ctx} record={r} />} />
      <Card title="Leverandørklasser" subtitle="Klassen gir kritikalitet og hvor ofte leverandøren evalueres.">
        {SUPPLIER_CLASSES.map((c) => {
          const n = (state.records.leverandor || []).filter((r) => r.state !== 'arkivert' && r.supplierClass === c.id).length;
          return <ListRow key={c.id} icon="cube-outline" title={`${c.id} (${n})`} subtitle={`${c.hint} Kritikalitet ${c.criticality.toLowerCase()}.`} />;
        })}
        {(state.records.leverandor || []).some((r) => r.state !== 'arkivert' && !r.supplierClass)
          ? <Text style={{ color: colors.muted, fontSize: 12 }}>{(state.records.leverandor || []).filter((r) => r.state !== 'arkivert' && !r.supplierClass).length} leverandører har ingen klasse ennå.</Text>
          : null}
      </Card>
    </Page>
  );
}

export function ObjectivesPage({ ctx }) {
  const colors = useColors();
  const { state, wide, actor, store, caps } = ctx;
  const reg = useRegister(ctx, 'mal');
  const [m, setM] = useState({ period: todayKey().slice(0, 7), value: '', quality: 'Målt', source: '' });
  const [err, setErr] = useState('');
  return (
    <Page wide={wide} title="Mål og KPI" intro="Kvalitets-, miljø- og arbeidsmiljømål med baseline, måltall, målemetode og målinger. Uten målinger vises «ingen datagrunnlag»." actions={caps.manage ? <Btn kind="primary" icon="add" label="Nytt mål" onPress={() => reg.setCreating(true)} /> : null}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {reg.rows.filter((r) => r.state !== 'arkivert').map((r) => {
          const p = objectiveProgress(r);
          return (
            <Card key={r.id} style={{ flexGrow: 1, flexBasis: wide ? 300 : 260 }} title={r.title} subtitle={`${r.domain} · ${r.direction} til ${r.target} ${r.unit}${r.deadline ? ` innen ${prettyDate(r.deadline)}` : ''}`} onPress={() => reg.setOpenId(r.id)}>
              <Row>
                <Pill label={p.label} tone={p.status === 'naadd' ? 'ok' : (p.status === 'ingen_data' ? 'muted' : 'info')} />
                {p.value != null ? <Text style={{ color: colors.ink, fontWeight: '700' }}>{p.value} {r.unit} ({p.period}{p.quality !== 'Målt' ? `, ${p.quality.toLowerCase()}` : ''})</Text> : null}
                {p.pct != null ? <Text style={{ color: colors.muted, fontSize: 12 }}>{p.pct} % av veien fra baseline</Text> : null}
              </Row>
              <ObjectiveSpark record={r} />
            </Card>
          );
        })}
      </View>
      {!reg.rows.length ? <Empty icon="flag-outline" title="Ingen mål" text="Legg inn mål med målemetode og datakilde." /> : null}
      <RecordSheet ctx={ctx} registerKey="mal" visible={reg.creating} onClose={() => reg.setCreating(false)} />
      {reg.open ? (
        <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Målinger</Text>
          {(reg.open.measurements || []).map((x) => <Text key={x.period} style={{ color: colors.ink, fontSize: 13 }}>{x.period}: {x.value} {reg.open.unit} · {x.quality}{x.source ? ` · ${x.source}` : ''} · {x.by}</Text>)}
          {caps.manage ? (
            <>
              <Row>
                <View style={{ flex: 1, minWidth: 110 }}><TextIn value={m.period} onChangeText={(x) => setM({ ...m, period: x })} placeholder="ÅÅÅÅ-MM" /></View>
                <View style={{ flex: 1, minWidth: 110 }}><TextIn keyboardType="numeric" value={m.value} onChangeText={(x) => setM({ ...m, value: x })} placeholder="Verdi" /></View>
              </Row>
              <Choice small options={['Målt', 'Estimert', 'Ukjent']} value={m.quality} onChange={(x) => setM({ ...m, quality: x || 'Målt' })} />
              <TextIn value={m.source} onChangeText={(x) => setM({ ...m, source: x })} placeholder="Datakilde" />
              <Btn kind="primary" label="Registrer måling" onPress={async () => {
                const res = addMeasurement(reg.open, m, { actor });
                if (!res.ok) { setErr(res.error); return; }
                const saved = await store.commit('records', 'record', res, { previous: reg.open });
                if (!saved.ok) setErr(saved.error); else setM({ ...m, value: '' });
              }} />
              {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
            </>
          ) : null}
        </RecordDetail>
      ) : null}
    </Page>
  );
}

export function AuditPage({ ctx }) {
  const colors = useColors();
  const { state, wide, actor, store, caps, go, legacyAudits } = ctx;
  const reg = useRegister(ctx, 'revisjon');
  const [af, setAf] = useState({ classification: 'avvik', description: '', evidence: '', requirementIds: [] });
  const [err, setErr] = useState('');
  const requirements = useMemo(() => allRequirements(state), [state]);
  const today = todayKey();
  const program = reg.rows.slice().sort((a, b) => String(a.plannedDate).localeCompare(String(b.plannedDate)));

  async function addFinding() {
    setErr('');
    const res = addAuditFinding(reg.open, af, { actor });
    if (!res.ok) { setErr(res.error); return; }
    let record = res.record;
    if (af.classification === 'avvik' || af.classification === 'forbedring') {
      const input = findingInputFromAudit(record, res.auditFinding);
      const f = createFinding(input, { actor, existing: state.findings });
      if (f.ok) {
        const ok = await store.commit('findings', 'finding', f);
        if (ok.ok) record = linkAuditFinding(record, res.auditFinding.id, f.finding.id);
      }
    }
    const saved = await store.commit('records', 'record', { ...res, record }, { previous: reg.open });
    if (!saved.ok) { setErr(saved.error); return; }
    setAf({ classification: 'avvik', description: '', evidence: '', requirementIds: [] });
  }

  async function approveReport() {
    const res = setRecordState(reg.open, 'godkjent', { actor, caps, note: 'Rapport godkjent' });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('records', 'record', res, { previous: reg.open });
    if (!saved.ok) { setErr(saved.error); return; }
    const ids = [...new Set([...(reg.open.findings || []).flatMap((f) => f.requirementIds || []), ...requirementIdsForArea(state, 'internalAudit')])];
    const att = attachEvidence(state, { type: 'revisjon', objectId: reg.open.id, objectRevision: res.record.rev, label: `${reg.open.number} ${reg.open.title} (godkjent rapport)` }, ids, { actor });
    if (att.ok) await store.commitLists({ evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments: att.assessments }, att.events);
  }

  return (
    <Page wide={wide} title="Internrevisjon" intro="Risikobasert revisjonsprogram. Revisor skal ikke revidere eget arbeid. Funn klassifiseres, avvik blir saker med tiltak og kobles til krav." actions={caps.manage ? <Btn kind="primary" icon="add" label="Planlegg revisjon" onPress={() => reg.setCreating(true)} /> : null}>
      <Card title="Revisjonsprogram">
        {!program.length ? <Empty icon="search-outline" title="Ingen revisjoner planlagt" text="Frekvens fastsettes i et risikobasert program, ikke automatisk." /> : null}
        {program.map((a) => {
          const late = a.state === 'planlagt' && a.plannedDate && a.plannedDate < today;
          return <ListRow key={a.id} icon="search-outline" tone={late ? 'danger' : 'muted'} title={`${a.number} · ${a.title}`} subtitle={`${prettyDate(a.plannedDate)} · ${a.auditorName}${late ? ' · forsinket' : ''} · ${(a.findings || []).length} funn`} right={<Pill label={STATE_LABEL[a.state]} tone={a.state === 'godkjent' || a.state === 'lukket' ? 'ok' : (late ? 'danger' : 'info')} />} onPress={() => reg.setOpenId(a.id)} />;
        })}
      </Card>
      {legacyAudits?.length ? (
        <Card title="Tidligere registrerte revisjoner (prosjekt)" subtitle="Fra den gamle ISO-siden. Beholdes uendret.">
          {legacyAudits.map((a) => <Text key={a.id} style={{ color: colors.ink, fontSize: 13 }}>{a.standard}: {a.findings} {a.projectName ? `· ${a.projectName}` : ''}</Text>)}
        </Card>
      ) : null}
      <RecordSheet ctx={ctx} registerKey="revisjon" visible={reg.creating} onClose={() => reg.setCreating(false)} />
      {reg.open ? (
        <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Funn ({(reg.open.findings || []).length})</Text>
          {(reg.open.findings || []).map((f) => (
            <View key={f.id} style={{ gap: 2, paddingVertical: 4 }}>
              <Text style={{ color: colors.ink, fontSize: 13 }}><Text style={{ fontWeight: '700' }}>{AUDIT_FINDING_CLASSES.find((c) => c.id === f.classification)?.label}:</Text> {f.description}</Text>
              {f.evidence ? <Text style={{ color: colors.muted, fontSize: 12 }}>Bevis: {f.evidence}</Text> : null}
              {f.findingId ? <Btn small label="Åpne avvikssak" onPress={() => go('avvik', { open: f.findingId })} /> : null}
            </View>
          ))}
          {caps.manage && !['godkjent', 'lukket', 'avlyst'].includes(reg.open.state) ? (
            <>
              <Field label="Klassifisering"><Choice options={AUDIT_FINDING_CLASSES} value={af.classification} onChange={(x) => setAf({ ...af, classification: x || 'avvik' })} /></Field>
              <Field label="Funn" required><TextIn multiline value={af.description} onChangeText={(x) => setAf({ ...af, description: x })} /></Field>
              <Field label="Objektivt bevis" required={af.classification !== 'samsvar'}><TextIn multiline rows={2} value={af.evidence} onChangeText={(x) => setAf({ ...af, evidence: x })} /></Field>
              <Field label="Krav"><Choice small multi options={requirements.filter((r) => r.kind === 'iso').slice(0, 60).map((r) => ({ id: r.id, label: `${r.standard.replace('ISO', '')} ${r.clause}` }))} value={af.requirementIds} onChange={(x) => setAf({ ...af, requirementIds: x })} /></Field>
              <Btn kind="primary" label={af.classification === 'samsvar' ? 'Registrer funn' : 'Registrer funn og opprett sak'} onPress={addFinding} />
              {caps.approve ? <Btn icon="checkmark-done" label="Godkjenn rapport (låser)" onPress={approveReport} /> : null}
            </>
          ) : null}
          {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        </RecordDetail>
      ) : null}
    </Page>
  );
}

export function ReviewPage({ ctx }) {
  const colors = useColors();
  const { state, wide, actor, store, caps, people, runEffectsFor } = ctx;
  const reg = useRegister(ctx, 'ledelse');
  const [d, setD] = useState({ decision: '', kind: 'forbedring', ownerName: '', ownerUid: '', dueAt: '' });
  const [err, setErr] = useState('');

  async function snapshot() {
    const snap = managementReviewSnapshot(state, caps, { people });
    const res = attachReviewSnapshot(reg.open, snap, { actor });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('records', 'record', res, { previous: reg.open });
    if (!saved.ok) setErr(saved.error);
  }
  async function decision() {
    const res = addReviewDecision(reg.open, d, { actor });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('records', 'record', res, { previous: reg.open, effects: [{ type: 'createTask', key: res.decision.taskKey, title: `Vedtak ${reg.open.number}: ${res.decision.decision}`, assigneeUid: res.decision.ownerUid, deadline: res.decision.dueAt }] });
    if (!saved.ok) setErr(saved.error); else setD({ decision: '', kind: 'forbedring', ownerName: '', ownerUid: '', dueAt: '' });
  }
  async function approve() {
    if (!reg.open.snapshot) { setErr('Hent grunnlaget før referatet godkjennes.'); return; }
    const res = setRecordState(reg.open, 'godkjent', { actor, caps, note: 'Referat godkjent' });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('records', 'record', res, { previous: reg.open });
    if (!saved.ok) { setErr(saved.error); return; }
    const att = attachEvidence(state, { type: 'ledelse', objectId: reg.open.id, objectRevision: res.record.rev, label: `${reg.open.number} ${reg.open.title} (godkjent referat)` }, requirementIdsForArea(state, 'review'), { actor });
    if (att.ok) await store.commitLists({ evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments: att.assessments }, att.events);
  }
  const s = reg.open?.snapshot;
  return (
    <Page wide={wide} title="Ledelsens gjennomgang" intro="Grunnlaget hentes automatisk fra registrene og låses når referatet godkjennes. Vedtak blir oppgaver med ansvar og frist." actions={caps.manage ? <Btn kind="primary" icon="add" label="Ny gjennomgang" onPress={() => reg.setCreating(true)} /> : null}>
      <Card title="Gjennomganger">
        <RecordList ctx={ctx} registerKey="ledelse" rows={reg.rows} subtitle={(r) => `${prettyDate(r.meetingDate)} · ${(r.decisions || []).length} vedtak`} onOpen={(r) => reg.setOpenId(r.id)} />
      </Card>
      <RecordSheet ctx={ctx} registerKey="ledelse" visible={reg.creating} onClose={() => reg.setCreating(false)} />
      {reg.open ? (
        <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Grunnlag</Text>
          {s ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Hentet {prettyDate(s.takenAt)} av {s.takenBy}</Text>
              {s.kpis.map((k) => <Text key={k.key} style={{ color: colors.ink, fontSize: 13 }}>{k.label}: {k.value ?? '–'}</Text>)}
              <Text style={{ color: colors.ink, fontSize: 13 }}>Avvik: {s.findings.open} åpne, {s.findings.closed} lukket · lukket innen frist: {s.findings.closedWithinDeadline.pct == null ? 'ingen datagrunnlag' : `${s.findings.closedWithinDeadline.pct} %`}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Krav: {s.requirements.segments.map((x) => `${x.label} ${x.value}`).join(', ') || '–'}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Revisjoner: {s.audits.map((a) => `${a.number} (${a.nonconformities} avvik)`).join(', ') || '–'}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Mål: {s.objectives.map((o) => `${o.title} ${o.last ?? '–'}/${o.target} ${o.unit}`).join('; ') || '–'}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Samsvarsvurderinger: {s.compliance.map((c) => `${c.title}: ${c.result}`).join('; ') || '–'}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Tidligere vedtak: {s.previousDecisions.filter((x) => !x.done).length} åpne av {s.previousDecisions.length}</Text>
            </View>
          ) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ikke hentet.</Text>}
          {caps.manage && !reg.open.locked ? <Btn icon="download-outline" label={s ? 'Hent grunnlag på nytt' : 'Hent grunnlag'} onPress={snapshot} /> : null}
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Vedtak</Text>
          {(reg.open.decisions || []).map((x) => (
            <Row key={x.id}>
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>{x.done ? '✓ ' : ''}{x.decision} · {x.ownerName} · {prettyDate(x.dueAt)}</Text>
              {!x.done && caps.manage ? <Btn small label="Utført" onPress={async () => { const r = markDecisionDone(reg.open, x.id, { actor }); await store.commit('records', 'record', r, { previous: reg.open }); }} /> : null}
            </Row>
          ))}
          {caps.manage && !reg.open.locked ? (
            <>
              <Field label="Vedtak" required><TextIn multiline rows={2} value={d.decision} onChangeText={(x) => setD({ ...d, decision: x })} /></Field>
              <Choice small options={[{ id: 'forbedring', label: 'Forbedring' }, { id: 'ressurs', label: 'Ressurs' }, { id: 'endring', label: 'Endring' }, { id: 'annet', label: 'Annet' }]} value={d.kind} onChange={(x) => setD({ ...d, kind: x || 'forbedring' })} />
              <Field label="Ansvarlig" required><PersonPick people={people} value={d.ownerName} onChange={(p) => setD({ ...d, ownerName: p.name, ownerUid: p.uid })} /></Field>
              <Field label="Frist" required><DateIn value={d.dueAt} onChange={(x) => setD({ ...d, dueAt: x })} /></Field>
              <Btn label="Legg til vedtak og lag oppgave" onPress={decision} />
              {caps.approve ? <Btn kind="primary" icon="lock-closed-outline" label="Godkjenn referat (låser grunnlag)" onPress={approve} /> : null}
            </>
          ) : null}
          {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
        </RecordDetail>
      ) : null}
    </Page>
  );
}

export function ProjectQualityPage({ ctx }) {
  const colors = useColors();
  const { state, wide, projects, caps, go, sources } = ctx;
  const [fill, setFill] = useState(null);
  const [plan, setPlan] = useState(null);
  const forms = useControlledForms(state, ['SF19_KONTRAKT', 'SF21_FAGKONTROLL', 'SF28_TILFREDSHET']);
  const formFor = (key) => forms.find((f) => f.templateId === templateIdFor(key) || f.templateKey === key) || null;
  const findings = visibleFindings(caps, state.findings);
  const rows = useMemo(() => projectQuality(projects, state, findings), [projects, state, findings]);
  const contracts = useMemo(() => contractReviewStatus(sources?.contracts, state.submissions), [sources?.contracts, state.submissions]);
  const withoutPlan = rows.filter((r) => !r.plan);
  const contractForm = formFor('SF19_KONTRAKT');
  const controlForm = formFor('SF21_FAGKONTROLL');

  async function submitted(sub) {
    setFill(null);
    // Kontrollen gjenbrukes som bevis i kravmatrisen (8.2 / 8.3 / 9.1.2).
    const key = forms.find((f) => f.id === sub.formId)?.templateKey || '';
    const area = key.startsWith('SF21') ? 'design' : (key.startsWith('SF19') ? 'requirements' : (key.startsWith('SF28') ? 'satisfaction' : 'operation'));
    const ids = requirementIdsForArea(ctx.store.current(), area);
    if (ids.length) {
      const att = attachEvidence(ctx.store.current(), { type: 'skjema', objectId: sub.id, objectRevision: sub.formVersion, label: `${sub.formTitle} ${prettyDate(sub.submittedAt)}` }, ids, { actor: ctx.actor });
      if (att.ok) await ctx.store.commitLists({ evidence: att.evidence, evidenceLinks: att.evidenceLinks, assessments: att.assessments }, att.events);
    }
  }

  return (
    <Page wide={wide} title="Prosjektkvalitet og prosjekteringskontroll" intro="Kvalitetsplan, kontraktsgjennomgang og fag-/sidemannskontroll per prosjekt i ProTop. Prosjekter og kontrakter hentes fra Prosjekt og Kontrakt – ingenting registreres på nytt.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Aktive prosjekter" value={rows.length} hint="Fra Prosjekt" />
        <Stat label="Uten kvalitetsplan" value={withoutPlan.length} tone={withoutPlan.length ? 'warn' : undefined} />
        <Stat label="Kontrakter uten gjennomgang" value={contracts.missing.length} hint="Fra Kontrakt" tone={contracts.missing.length ? 'warn' : undefined} />
        <Stat label="Kontroller registrert" value={(state.submissions || []).filter((x) => x.subjectRef?.projectId).length} />
      </View>
      {!forms.length ? <Banner tone="info" text="Kontraktsgjennomgang (SF19), kvalitetsplan (SF20), prosjekteringskontroll (SF21) og kundetilfredshet (SF28) er ikke godkjent for ISO ennå. Godkjenn dem under Skjemaer." /> : null}
      <Card title="Prosjekter" subtitle="Status per aktivt prosjekt. Kvalitetsplanen fylles ut automatisk fra prosjekt og kontrakt.">
        {!rows.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen aktive prosjekter i Prosjekt.</Text> : null}
        {rows.slice(0, 30).map((r) => {
          const name = `${r.project.number || ''} ${r.project.name || ''}`.trim();
          return (
            <ListRow
              key={r.project.id}
              icon={r.plan ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              tone={r.plan ? 'ok' : 'warn'}
              title={name}
              subtitle={`${r.plan ? 'Kvalitetsplan' : 'Mangler kvalitetsplan'} · ${r.controls} kontroller · ${r.risks} risikoer · ${r.open} åpne avvik`}
              right={caps.manage ? (
                <Row gap={6} wrap={false}>
                  {!r.plan ? <Btn small icon="sparkles-outline" label="Lag plan" onPress={() => setPlan(qualityPlanDraft(r.project, { contracts: sources?.contracts, roleMap: state.system.roleMap }))} /> : null}
                  {controlForm && (wide || r.plan) ? <Btn small label="Kontroll" onPress={() => setFill({ control: controlForm, subjectRef: { projectId: r.project.id } })} /> : null}
                </Row>
              ) : null}
              onPress={r.open ? () => go('avvik', { ids: findings.filter((f) => f.projectId === r.project.id).map((f) => f.id), label: name }) : undefined}
            />
          );
        })}
        {caps.manage && withoutPlan.length > 1 ? <Text style={{ color: colors.muted, fontSize: 12 }}>«Lag plan» henter krav fra kontrakten, roller fra innstillingene og standard kontrollplan med faseporter.</Text> : null}
      </Card>
      {contracts.rows.length ? (
        <Card title="Kontraktsgjennomgang (8.2)" subtitle="Kontrakter fra Kontrakt / avtale. Gjennomgangen lagres som låst bevis.">
          {contracts.rows.slice(0, 20).map((c) => (
            <ListRow
              key={c.id}
              icon={c.reviewed ? 'checkmark-circle-outline' : 'document-text-outline'}
              tone={c.reviewed ? 'ok' : 'warn'}
              title={c.title || 'Kontrakt'}
              subtitle={[c.buyer, c.start ? `fra ${prettyDate(c.start)}` : '', c.reviewed ? 'Gjennomgått' : 'Ikke gjennomgått'].filter(Boolean).join(' · ')}
              right={!c.reviewed && contractForm && caps.manage ? <Btn small label="Gjennomgå" onPress={() => setFill({ control: contractForm, subjectRef: { contractId: c.id, ...(c.projectId ? { projectId: c.projectId } : {}) }, prefill: null })} /> : null}
            />
          ))}
        </Card>
      ) : null}
      {forms.length ? (
        <Card title="Andre skjema">
          <Row>{forms.map((f) => <Btn key={f.id} icon="clipboard-outline" label={f.title} onPress={() => setFill({ control: f })} />)}</Row>
        </Card>
      ) : null}
      <SimpleRegister ctx={ctx} registerKey="kvalitetsplan" subtitle={(r) => `${r.projectName || ''}`} />
      <RecordSheet ctx={ctx} registerKey="kvalitetsplan" visible={!!plan} preset={plan || {}} onClose={() => setPlan(null)} />
      <FormFillSheet ctx={ctx} control={fill?.control} subjectRef={fill?.subjectRef || null} prefill={fill?.prefill || null} visible={!!fill} onClose={() => setFill(null)} onSubmitted={submitted} />
    </Page>
  );
}

export function CertificationPage({ ctx }) {
  const colors = useColors();
  const { state, wide, caps } = ctx;
  const [selected, setSelected] = useState([]);
  const requirements = useMemo(() => allRequirements(state), [state]);
  const evidence = new Map(state.evidence.map((e) => [e.id, e]));

  function exportPackage() {
    if (Platform.OS !== 'web') return;
    const ids = selected.length ? selected : requirements.map((r) => r.id);
    const rows = ids.map((id) => {
      const r = requirements.find((x) => x.id === id);
      const links = state.evidenceLinks.filter((l) => l.requirementId === id && l.reviewState === 'godkjent');
      const a = state.assessments.find((x) => x.requirementId === id);
      return { r, a, ev: links.map((l) => evidence.get(l.evidenceId)).filter((e) => e && e.classification !== 'skjermet') };
    }).filter((x) => x.r);
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bevispakke</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#0f172a}td,th{border:1px solid #cbd5e1;padding:6px;font-size:12px;vertical-align:top}table{border-collapse:collapse;width:100%}h1{font-size:20px}.m{color:#475569;font-size:12px}</style></head><body>
<h1>Bevispakke – ${esc(state.system.name || 'Ledelsessystem')}</h1>
<p class="m">Eksportert ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. Omfang: ${esc(state.system.scopeText)}. Interne vurderinger – ikke sertifisering. Skjermede HMS-/personopplysninger er utelatt.</p>
<table><tr><th>Krav</th><th>Intern status</th><th>Vurdert</th><th>Godkjente bevis (revisjon)</th></tr>
${rows.map(({ r, a, ev }) => `<tr><td>${esc(r.standard ? `${r.standard} ${r.clause}` : r.kind)} ${esc(r.title)}</td><td>${esc(a?.status || 'ikke_vurdert')}</td><td>${esc(a?.assessedBy || '')} ${esc(String(a?.assessedAt || '').slice(0, 10))}</td><td>${ev.map((e) => `${esc(e.label)}${e.objectRevision ? ` (rev ${esc(e.objectRevision)})` : ''} [${esc(e.hash)}]`).join('<br>') || '–'}</td></tr>`).join('')}
</table><script>setTimeout(function(){window.print()},300)</script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <Page wide={wide} title="Sertifisering og revisjonsrom" intro="Sertifikater, eksterne revisjoner og bevispakker. ProTop utsteder ikke sertifikat – det gjør et akkreditert sertifiseringsorgan etter uavhengig revisjon.">
      <Banner tone="warn" text="Bruk ikke ISO-logoen som sertifiseringsmerke. «Klar for ekstern revisjon» er en intern indikator med synlig mangelliste." />
      <SimpleRegister ctx={ctx} registerKey="sertifikat" subtitle={(r) => `${r.certBody}${r.validTo ? ` · gyldig til ${prettyDate(r.validTo)}` : ''}${r.nextAudit ? ` · neste revisjon ${prettyDate(r.nextAudit)}` : ''}`} />
      <Card title="Bevispakke til revisor" subtitle="Velg krav (tomt utvalg = alle). Bare godkjente bevis tas med, og skjermede saker utelates.">
        <Choice small multi options={requirements.slice(0, 120).map((r) => ({ id: r.id, label: r.standard ? `${r.standard.replace('ISO', '')} ${r.clause}` : r.title }))} value={selected} onChange={setSelected} />
        {Platform.OS === 'web' ? <Btn kind="primary" icon="print-outline" label="Lag bevispakke (PDF)" onPress={exportPackage} /> : <Text style={{ color: colors.muted }}>Eksport er tilgjengelig i nettleseren.</Text>}
        <Text style={{ color: colors.muted, fontSize: 12 }}>Tidsstyrt lesetilgang for ekstern revisor i appen krever egen revisorrolle og er ikke aktivert ennå. Del bevispakken i stedet.</Text>
        {!caps.manage ? null : null}
      </Card>
    </Page>
  );
}
