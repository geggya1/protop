import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate, todayKey } from '../../src/iso/core';
import { DEFAULT_RISK_METHOD, riskLevel } from '../../src/iso/catalog';
import {
  AUDIT_FINDING_CLASSES, REGISTERS, addAuditFinding, addExercise, addMeasurement, addReviewDecision, attachReviewSnapshot,
  competenceMatrix, createRecord, findingInputFromAudit, linkAuditFinding, markDecisionDone, objectiveProgress, overdueRecords,
  registerDef, riskMatrix, riskSummary, setRecordState, updateRecord,
} from '../../src/iso/registers';
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
  Banner, Btn, Card, Check, Choice, DateIn, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

const STATE_LABEL = {
  aktiv: 'Aktiv', arkivert: 'Arkivert', akseptert: 'Akseptert', lukket: 'Lukket', mottatt: 'Mottatt', behandlet: 'Behandlet', tilbakemeldt: 'Tilbakemeldt',
  gyldig: 'Gyldig', planlagt: 'Planlagt', pagar: 'Pågår', rapport: 'Rapport', godkjent: 'Godkjent', oppfolging: 'Oppfølging', avlyst: 'Avlyst',
  gjennomfort: 'Gjennomført', utlopt: 'Utløpt', utkast: 'Utkast', avsluttet: 'Avsluttet', nådd: 'Nådd', ikke_nådd: 'Ikke nådd',
};

/* ───────── Generisk skjema for registerpost ───────── */

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
      case 'ref': {
        const opts = f.ref === 'requirement'
          ? allRequirements(state).filter((r) => r.kind === 'lov' || r.kind === 'kontrakt').map((r) => ({ id: r.id, label: r.title }))
          : (state.records[f.ref] || []).filter((r) => r.state !== 'arkivert').map((r) => ({ id: r.id, label: `${r.title}${r.role ? ` (${r.role})` : ''}` }));
        return opts.length ? <Choice small options={opts} value={value} onChange={set(f.key)} /> : <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen å velge mellom ennå.</Text>;
      }
      default: return <TextIn value={value} onChangeText={set(f.key)} />;
    }
  }

  const level = (registerKey === 'risiko' || registerKey === 'fare') ? riskSummary(v, state.system.riskMethod) : null;
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
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
    </Sheet>
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
        right={right ? right(r) : <Pill label={STATE_LABEL[r.state] || r.state} />}
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
        <Row><Pill label={STATE_LABEL[record.state] || record.state} tone="info" />{record.locked ? <Pill label="Låst" icon="lock-closed" /> : null}</Row>
        {def.fields.map((f) => {
          let value = record[f.key];
          if (Array.isArray(value)) value = value.join(', ');
          if (typeof value === 'boolean') value = value ? 'Ja' : 'Nei';
          if (f.type === 'date') value = prettyDate(value);
          if (f.type === 'ref') value = (ctx.state.records[f.ref] || []).find((r) => r.id === value)?.title || allRequirements(ctx.state).find((r) => r.id === value)?.title || value;
          if (f.type === 'project') value = record.projectName || value;
          return <KV key={f.key} label={f.label} value={value} />;
        })}
        {children}
        {caps.manage && !record.locked ? (
          <>
            <Row>
              <Btn icon="create-outline" label="Rediger" onPress={() => setEdit(true)} />
              {def.states.filter((s) => s !== record.state).map((s) => <Btn key={s} small label={STATE_LABEL[s] || s} onPress={() => state(s)} />)}
            </Row>
            <TextIn value={note} onChangeText={setNote} placeholder="Merknad til statusendring" />
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

function SimpleRegister({ ctx, registerKey, subtitle, children, detail, filter }) {
  const { caps } = ctx;
  const def = REGISTERS[registerKey];
  const reg = useRegister(ctx, registerKey);
  const rows = (filter ? reg.rows.filter(filter) : reg.rows).filter((r) => r.state !== 'arkivert');
  return (
    <Card title={def.title} right={caps.manage ? <Btn small icon="add" label="Ny" onPress={() => reg.setCreating(true)} /> : null}>
      {children}
      <RecordList ctx={ctx} registerKey={registerKey} rows={rows} subtitle={subtitle} onOpen={(r) => reg.setOpenId(r.id)} />
      <RecordSheet ctx={ctx} registerKey={registerKey} visible={reg.creating} onClose={() => reg.setCreating(false)} />
      {reg.open ? <RecordDetail ctx={ctx} record={reg.open} onClose={() => reg.setOpenId('')}>{detail ? detail(reg.open) : null}</RecordDetail> : null}
    </Card>
  );
}

/**
 * Forslag hentet fra andre moduler. «Legg til» lagrer direkte når forslaget har alt som kreves;
 * ellers åpnes skjemaet ferdig utfylt så brukeren bare vurderer og lagrer.
 */
function Suggestions({ ctx, registerKey, rows, title, subtitle, describe, direct, limit = 6 }) {
  const colors = useColors();
  const { caps, actor, store, state } = ctx;
  const [preset, setPreset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const visible = rows.filter((r) => !dismissed.includes(r.title));
  if (!caps.manage || !visible.length) return null;

  async function addAll(list) {
    setBusy(true);
    let existing = store.current().records[registerKey] || [];
    for (const r of list) {
      const { source, ...input } = r;
      const res = createRecord(registerKey, input, { actor, existing, riskMethod: state.system.riskMethod || DEFAULT_RISK_METHOD });
      if (!res.ok) continue;
      const saved = await store.commit('records', 'record', res);
      if (saved.ok) existing = [...existing, res.record];
    }
    setBusy(false);
  }

  return (
    <Card title={title} subtitle={subtitle} right={<Pill label="Forslag" icon="sparkles-outline" tone="info" />}>
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
      {!direct ? <Text style={{ color: colors.muted, fontSize: 12 }}>«Bruk» åpner registreringen ferdig utfylt. Du vurderer og lagrer.</Text> : null}
      <RecordSheet ctx={ctx} registerKey={registerKey} visible={!!preset} preset={preset ? (({ source, ...x }) => x)(preset) : {}} onClose={() => setPreset(null)} />
    </Card>
  );
}

/** Nøkkeltall-flis i samme stil som resten av ISO. */
function Stat({ label, value, hint, tone }) {
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

export function ContextPage({ ctx }) {
  const { state, sources } = ctx;
  const suggestions = useMemo(() => stakeholderSuggestions({
    customers: sources?.customers, contracts: sources?.contracts, requirements: allRequirements(state), existing: state.records.interessent,
  }), [sources?.customers, sources?.contracts, state]);
  return (
    <Page wide={ctx.wide} title="Kontekst og interessenter" intro="Interne og eksterne forhold og interessenter som påvirker ledelsessystemet. Endringer kan utløse ny risikovurdering.">
      <SimpleRegister ctx={ctx} registerKey="kontekst" subtitle={(r) => `${r.scope}${r.climate === 'Ja' ? ' · klimarelevant' : ''}`} />
      <Suggestions ctx={ctx} registerKey="interessent" rows={suggestions} direct title="Foreslåtte interessenter" subtitle="Fra kontraktene, kunderegisteret, ansatte og myndighetene i lovkravene." describe={(r) => r.category} />
      <SimpleRegister ctx={ctx} registerKey="interessent" subtitle={(r) => `${r.category || ''}${r.binding === 'Ja' ? ' · bindende forpliktelse' : ''}`} />
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
      <SimpleRegister ctx={ctx} registerKey="miljoaspekt" subtitle={(r) => `${r.lifecycle || ''} · ${r.significant === 'Ja' ? 'vesentlig' : 'ikke vesentlig'}${r.control ? ` · ${r.control.toLowerCase()}` : ''}`} />
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
  const forms = useControlledForms(state, ['SF12_SJA', 'SF13_VERNERUNDE', 'SF14_MEDVIRKNING']);
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
        {!forms.length && caps.admin ? <Btn small label="Gå til Skjemaer" onPress={() => go('skjema')} /> : null}
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

export function CompetencePage({ ctx }) {
  const colors = useColors();
  const { state, wide, people } = ctx;
  const matrix = useMemo(() => competenceMatrix(people, state.records.kompetansekrav, state.records.kompetanse), [people, state.records]);
  const [pick, setPick] = useState(null);
  const [create, setCreate] = useState(null);
  const hr = useMemo(() => (ctx.sources?.hrOverview ? hrComplianceForIso(ctx.sources.hrOverview, ctx.sources.people) : null), [ctx.sources?.hrOverview, ctx.sources?.people]);
  const eq = useMemo(() => equipmentStatus(ctx.sources?.equipment), [ctx.sources?.equipment]);
  const gaps = matrix.reduce((n, row) => n + row.cells.filter((c) => c.status !== 'ok').length, 0);
  return (
    <Page wide={wide} title="Kompetanse og ressurser" intro="Kompetansekrav per rolle og dokumentert kompetanse for ansatte i ProTop. HR-sjekklisten og utstyret vises her, men eies av HR og Utstyr.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Ansatte" value={people.length} hint="Fra Ansatte" />
        <Stat label="Kompetansegap" value={gaps} tone={gaps ? 'warn' : undefined} />
        {hr ? <Stat label="Mangler i HR-sjekklisten" value={hr.withGaps.length} hint="HR – lov & ISO" tone={hr.withGaps.length ? 'warn' : undefined} /> : null}
        <Stat label="Utstyr i drift" value={eq.total} hint={eq.inService.length ? `${eq.inService.length} på service` : 'Fra Utstyr'} />
      </View>
      <Card title="Kompetansematrise" subtitle="Trykk en celle for å registrere bevis.">
        <CompetenceHeatmap matrix={matrix} onPick={(person, cell) => setPick({ person, cell })} />
      </Card>
      <SimpleRegister ctx={ctx} registerKey="kompetansekrav" subtitle={(r) => `${r.role}${r.validityMonths ? ` · gyldig ${r.validityMonths} mnd` : ''}`} />
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
        {pick?.cell.record ? <KV label="Bevis" value={`${pick.cell.record.title} · ${pick.cell.record.validTo ? `gyldig til ${prettyDate(pick.cell.record.validTo)}` : 'varig'}`} /> : <Text style={{ color: colors.muted }}>Ingen dokumentert kompetanse.</Text>}
        <Btn kind="primary" icon="add" label="Registrer bevis" onPress={() => { setCreate({ personName: pick.person.name, personUid: pick.person.uid, requirementId: pick.cell.requirement.id }); setPick(null); }} />
      </Sheet>
      <RecordSheet ctx={ctx} registerKey="kompetanse" visible={!!create} preset={create || {}} onClose={() => setCreate(null)} />
    </Page>
  );
}

export function SupplierPage({ ctx }) {
  const { state, wide } = ctx;
  const due = overdueRecords(state.records.leverandor, 'nextReview');
  const suggestions = useMemo(() => supplierSuggestions(ctx.sources?.expenses, state.records.leverandor)
    .map((r) => ({ title: r.title, criticality: 'Middels', approval: 'Ikke vurdert', category: '', source: `Utlegg (${r.count} bilag)` })), [ctx.sources?.expenses, state.records.leverandor]);
  return (
    <Page wide={wide} title="Leverandørkontroll" intro="Kvalifisering, evaluering og oppfølging etter kritikalitet. Leverandører foreslås fra utleggene, og evaluering blir oppgave når den forfaller.">
      {due.length ? <Banner tone="warn" text={`${due.length} leverandører har forfalt evaluering.`} /> : null}
      <Suggestions ctx={ctx} registerKey="leverandor" rows={suggestions} direct title="Leverandører fra utleggene" subtitle="Mest brukte leverandører som ikke er vurdert. Legges inn som «Ikke vurdert» med middels kritikalitet." describe={() => 'Ikke vurdert'} limit={8} />
      <SimpleRegister ctx={ctx} registerKey="leverandor" subtitle={(r) => `${r.criticality} kritikalitet · ${r.approval}${r.score ? ` · score ${r.score}` : ''}`} />
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
              {caps.admin ? <Btn icon="checkmark-done" label="Godkjenn rapport (låser)" onPress={approveReport} /> : null}
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
              {caps.admin ? <Btn kind="primary" icon="lock-closed-outline" label="Godkjenn referat (låser grunnlag)" onPress={approve} /> : null}
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
  const forms = useControlledForms(state, ['SF19_KONTRAKT', 'SF20_KVALITETSPLAN', 'SF21_FAGKONTROLL', 'SF28_TILFREDSHET']);
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
