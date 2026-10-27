import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { monthKey, monthLabel, prettyDate, todayKey } from '../../src/iso/core';
import {
  FINDING_GROUPS, FINDING_TYPES, ISO_ROLES, SEVERITIES, actionStateLabel, findingGroup, findingStateLabel, findingTypeLabel, severityLabel,
} from '../../src/iso/catalog';
import {
  CHANGE_FIELDS, actionProgress, addAction, addFindingAttachments, assessChange, assessFinding, cancelAction, cancelFinding, closeBlockers,
  closeFinding, completeAction, confirmNotification, createFinding, defaultRestricted, findingPhase, findingStep, hasOverdueAction,
  isFindingOverdue, isImageAttachment, recordRootCause, removeFindingAttachment, reopenFinding, triageFinding, updateFindingLinks,
  verifyAction, verifyEffect,
} from '../../src/iso/findings';
import { APPROVER_ROLES, canCloseFinding, canManageFinding, visibleFindings } from '../../src/iso/access';
import { findingSummary, findingsByType, findingsPerMonth } from '../../src/iso/analytics';
import { allRequirements, attachEvidence, requirementIdsForArea } from '../../src/iso/requirements';
import { loadAuditFor } from '../../src/iso/storage';
import { autoAssignee, legacyProjectCases, requirementIdsForFinding } from '../../src/iso/integrations';
import { publishedVersionOf, normalizeDiagram } from '../../src/iso/processes';
import { pickDocument, pickImage, uploadFile } from '../../src/utils/media';
import FileDropZone from '../anbud/FileDropZone';
import IsoDiagram, { fitView } from './IsoDiagram';
import { HBars, StackedMonthBars } from './isoCharts';
import {
  Banner, Btn, Card, Check, Choice, Chips, DateIn, Divider, Empty, Field, Initials, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, Tabs,
  TextIn, TimeIn, toneColor, usePhone,
} from './isoUi';

const STATE_TONE = { registrert: 'warn', triage: 'warn', vurdert: 'info', tiltak: 'info', effektkontroll: 'info', lukket: 'ok', kansellert: 'muted' };
const GROUP_TONE = Object.fromEntries(FINDING_GROUPS.map((g) => [g.id, g.tone]));
const CAUSE_CATEGORIES = ['Rutine', 'Planlegging', 'Kompetanse', 'Kommunikasjon', 'Utstyr', 'Materiale', 'Tidspress', 'Miljø', 'Ledelse', 'Leverandør'];
// Bilder og PDF. Bare MIME-typer: filendelser får iOS Safari til å åpne «Filer» i stedet for Bilder/kamera.
const UPLOAD_ACCEPT = 'image/*,application/pdf';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function safeName(name) {
  return String(name || 'fil').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}

const pad = (n) => String(n).padStart(2, '0');

function clockNow() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «04.10.2026 kl. 02:43» – dato og eventuelt klokkeslett for når det skjedde. */
function occurredText(f) {
  const day = prettyDate(f?.occurredAt);
  return day ? `${day}${f.occurredTime ? ` kl. ${f.occurredTime}` : ''}` : '';
}

/** Tidsstempel (lagret i UTC) vist i lokal tid. */
function localStamp(iso, short = false) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return short ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} kl. ${time}`;
}

/** Laster opp valgte eller sluppede filer til saken. Returnerer vedleggene som gikk, og første feil. */
async function uploadAttachments(files, folder) {
  const added = [];
  const errors = [];
  for (const picked of files || []) {
    const name = picked?.name || `bilde-${Date.now()}.jpg`;
    const size = Number(picked?.size || picked?.blob?.size || 0);
    const type = picked?.mimeType || picked?.type || (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg');
    if (size > MAX_UPLOAD_BYTES) { errors.push(`${name} er for stor (maks 25 MB).`); continue; }
    const path = `${folder}/${Date.now()}-${safeName(name)}`;
    try {
      const url = await uploadFile(path, picked, type);
      if (url) added.push({ label: name, url, path, contentType: type, size, kind: 'fil' });
      else errors.push(`${name}: opplastingen ga ingen lenke.`);
    } catch (e) {
      errors.push(`${name}: ${e?.message || 'kunne ikke lastes opp.'}`);
    }
  }
  return { added, error: errors[0] || '' };
}

export default function IsoFindings({ ctx }) {
  const colors = useColors();
  const { state, caps, params, go, wide, store } = ctx;
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(params?.overdue ? 'forfalt' : (params?.open === true ? 'apne' : 'alle'));
  const [typeFilter, setTypeFilter] = useState('');
  const [assignee, setAssignee] = useState('');
  const [month, setMonth] = useState('');
  const [creating, setCreating] = useState(!!params?.create);
  const [openId, setOpenId] = useState(typeof params?.open === 'string' ? params.open : '');
  const [listWidth, setListWidth] = useState(0);
  const drillIds = params?.ids || null;

  useEffect(() => {
    if (params?.create) setCreating(true);
    // open er enten en sak (id) eller «bare åpne saker» fra oversikten.
    if (typeof params?.open === 'string') setOpenId(params.open);
    else if (params?.open === true) setTab('apne');
    if (params?.overdue) setTab('forfalt');
  }, [params]);

  const visible = useMemo(() => visibleFindings(caps, state.findings), [caps, state.findings]);
  const today = todayKey();
  const summary = useMemo(() => findingSummary(visible), [visible]);
  const perMonth = useMemo(() => findingsPerMonth(visible, { months: 12 }), [visible]);
  const byType = useMemo(() => findingsByType(visible), [visible]);
  const assignees = useMemo(() => [...new Set(visible.map((f) => f.assigneeName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')), [visible]);

  // Alle filtre unntatt fanen: tellerne på fanene viser hva hver fane inneholder med de andre filtrene.
  const base = useMemo(() => visible
    .filter((f) => !drillIds || drillIds.includes(f.id))
    .filter((f) => !typeFilter || f.type === typeFilter)
    .filter((f) => !assignee || (assignee === '__none' ? !f.assigneeName : f.assigneeName === assignee))
    .filter((f) => !month || monthKey(f.occurredAt || f.reportedAt) === month)
    .filter((f) => !query || `${f.number} ${f.title} ${f.description} ${f.projectName} ${f.location} ${f.assigneeName}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => String(b.reportedAt || '').localeCompare(String(a.reportedAt || '')) || String(b.number).localeCompare(String(a.number))), [visible, drillIds, typeFilter, assignee, month, query]);

  const inTab = useMemo(() => ({
    alle: () => true,
    apne: (f) => findingPhase(f) !== 'avsluttet',
    nye: (f) => findingPhase(f) === 'ny',
    behandling: (f) => findingPhase(f) === 'behandling',
    avsluttet: (f) => findingPhase(f) === 'avsluttet',
    forfalt: (f) => hasOverdueAction(f),
  }), []);
  const count = (id) => base.filter(inTab[id]).length;
  const rows = base.filter(inTab[tab] || inTab.alle);
  const overdueCount = count('forfalt');
  const tabs = [
    { id: 'alle', label: 'Alle', count: base.length },
    ...(tab === 'apne' ? [{ id: 'apne', label: 'Åpne', count: count('apne') }] : []),
    { id: 'nye', label: 'Nye', count: count('nye') },
    { id: 'behandling', label: 'Under behandling', count: count('behandling') },
    { id: 'avsluttet', label: 'Avsluttet', count: count('avsluttet') },
    ...(overdueCount || tab === 'forfalt' ? [{ id: 'forfalt', label: 'Forfalte tiltak', count: overdueCount, tone: overdueCount ? 'danger' : undefined }] : []),
  ];

  const legacy = useMemo(() => (caps.manage ? legacyProjectCases(ctx.sources?.projectState, state.findings) : []), [caps.manage, ctx.sources?.projectState, state.findings]);

  async function adopt(cases) {
    let existing = store.current().findings;
    for (const c of cases) {
      const who = autoAssignee(state.system, c.type);
      const res = createFinding({
        type: c.type, title: c.title, description: c.description || c.title, projectId: c.projectId, projectName: c.projectName,
        severity: c.severity, sourceRef: { module: c.module, id: c.id }, assigneeName: who?.name, assigneeUid: who?.uid,
        requirementIds: requirementIdsForFinding(state, c.type),
      }, { actor: ctx.actor, existing });
      if (!res.ok) continue;
      const saved = await store.commit('findings', 'finding', res);
      if (saved.ok) existing = [...existing, res.finding];
    }
  }

  const selected = visible.find((f) => f.id === openId) || null;
  if (selected) return <FindingDetail ctx={ctx} finding={selected} onBack={() => setOpenId('')} />;

  const parts = FINDING_GROUPS
    .filter((g) => perMonth.some((r) => r[g.id]))
    .map((g) => ({ key: g.id, label: g.label, color: toneColor(colors, g.tone) }));
  const table = wide && listWidth >= 860;
  const filtered = !!(typeFilter || assignee || month || query);

  return (
    <Page
      wide={wide}
      crumb={['Avvik og forbedring']}
      title="Avvik og forbedring"
      intro="Avvik, hendelser, kundeklager og forbedringsforslag. Saken følges gjennom vurdering, tiltak og effektkontroll før den lukkes."
      actions={<Btn kind="primary" icon="add" label="Meld avvik" onPress={() => setCreating(true)} />}
    >
      {drillIds ? (
        <View style={{ gap: 6 }}>
          <Banner tone="info" text={`Viser utvalg fra oversikten: ${params?.label || ''} (${base.length})`} />
          <Btn small icon="close" label="Vis alle saker" onPress={() => go('avvik', {})} />
        </View>
      ) : null}

      {visible.length ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Kpi
              wide={wide}
              label="Nye"
              value={summary.nye.ids.length}
              tone={summary.nye.ids.length ? 'warn' : undefined}
              sub={summary.nye.late ? `${summary.nye.late} over fristen for vurdering` : 'Behandling ikke startet'}
              badge={summary.nye.late || null}
              active={tab === 'nye'}
              onPress={() => setTab('nye')}
            />
            <Kpi
              wide={wide}
              label="Under behandling"
              value={summary.behandling.ids.length}
              sub={summary.behandling.late ? `${summary.behandling.late} med passert frist` : 'Ingen med passert frist'}
              badge={summary.behandling.late || null}
              active={tab === 'behandling'}
              onPress={() => setTab('behandling')}
            />
            <Kpi
              wide={wide}
              label="Lukket siste 12 mnd"
              value={summary.closed.ids.length}
              tone={summary.closed.ids.length ? 'ok' : undefined}
              sub={summary.closed.avgDays == null ? 'Ingen lukket ennå' : `Snitt ${summary.closed.avgDays} ${summary.closed.avgDays === 1 ? 'dag' : 'dager'} behandlingstid`}
              active={tab === 'avsluttet'}
              onPress={() => setTab('avsluttet')}
            />
            <Kpi
              wide={wide}
              label="Åpne tiltak"
              value={summary.actions.count}
              sub={summary.actions.late ? `${summary.actions.late} med passert frist` : 'Ingen forfalte tiltak'}
              badge={summary.actions.late || null}
              active={tab === 'forfalt'}
              onPress={() => setTab(summary.actions.late ? 'forfalt' : 'behandling')}
            />
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'stretch' }}>
            <Card
              style={wide ? { flex: 2 } : undefined}
              title="Saker per måned"
              subtitle={`Etter når det skjedde · ${monthLabel(perMonth[0]?.key)} – ${monthLabel(perMonth[perMonth.length - 1]?.key)}`}
            >
              <StackedMonthBars rows={perMonth} parts={parts.length ? parts : FINDING_GROUPS.map((g) => ({ key: g.id, label: g.label, color: toneColor(colors, g.tone) }))} onPick={(m) => setMonth(m.key === month ? '' : m.key)} empty="Ingen saker siste 12 måneder." />
            </Card>
            <Card style={wide ? { flex: 1 } : undefined} title="Etter type" subtitle="Trykk for å filtrere">
              <HBars
                rows={byType.slice(0, 6).map((r) => ({ ...r, color: toneColor(colors, GROUP_TONE[r.group]) }))}
                onPick={(r) => setTypeFilter(r.id === typeFilter ? '' : r.id)}
              />
              {byType.length > 6 ? <Text style={{ color: colors.muted, fontSize: 12 }}>{restText(byType.slice(6))}</Text> : null}
            </Card>
          </View>
        </>
      ) : null}

      {legacy.length && caps.manage ? (
        <Card title={`Fra Prosjekt-modulen (${legacy.length})`} subtitle="Avvik og RUH registrert i prosjektene som ikke er behandlet i ISO. Ta dem inn, så følger de samme flyt – uten å registreres på nytt.">
          {legacy.slice(0, 8).map((c) => (
            <ListRow key={c.id} icon="briefcase-outline" title={c.title} subtitle={`${c.label}${c.projectName ? ` · ${c.projectName}` : ''}`} right={<Btn small label="Ta inn" onPress={() => adopt([c])} />} />
          ))}
          {legacy.length > 1 ? <Btn small icon="download-outline" label={`Ta inn alle ${legacy.length}`} onPress={() => adopt(legacy)} /> : null}
        </Card>
      ) : null}

      <View onLayout={(e) => setListWidth(Math.round(e.nativeEvent.layout.width))}>
        <Card>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 8, alignItems: wide ? 'center' : 'stretch', flexWrap: 'wrap' }}>
            <View style={{ flexGrow: 1 }}><Tabs tabs={tabs} value={tab} onChange={setTab} /></View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexGrow: 1, flexBasis: wide ? 520 : undefined }}>
              <View style={{ flex: 1, minWidth: 150 }}>
                <Choice small options={FINDING_TYPES.map((t) => ({ id: t.id, label: t.label }))} value={typeFilter} onChange={setTypeFilter} placeholder="Alle typer" title="Type" chipLimit={0} />
              </View>
              <View style={{ flex: 1, minWidth: 150 }}>
                <Choice small options={[...assignees.map((n) => ({ id: n, label: n })), { id: '__none', label: 'Ingen saksbehandler' }]} value={assignee} onChange={setAssignee} placeholder="Alle saksbehandlere" title="Saksbehandler" chipLimit={0} />
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <TextIn value={query} onChangeText={setQuery} placeholder="Søk …" accessibilityLabel="Søk i saksnummer, tittel, prosjekt og sted" />
              </View>
            </View>
          </View>
          {month || filtered ? (
            <Row>
              {month ? <Btn small icon="close" label={`Skjedde ${monthLabel(month)}`} onPress={() => setMonth('')} /> : null}
              {filtered ? <Btn small icon="refresh" label="Nullstill filtre" onPress={() => { setTypeFilter(''); setAssignee(''); setMonth(''); setQuery(''); }} /> : null}
            </Row>
          ) : null}
          {!rows.length ? (
            <Empty
              icon="flag-outline"
              title={visible.length ? 'Ingen treff' : 'Ingen saker ennå'}
              text={visible.length ? 'Velg en annen fane, eller endre filter eller søk.' : 'Når noen melder et avvik, vises det her.'}
            />
          ) : table ? (
            <FindingTable rows={rows} today={today} onOpen={setOpenId} />
          ) : rows.map((f) => <FindingRow key={f.id} finding={f} today={today} onOpen={setOpenId} />)}
        </Card>
      </View>
      <NewFindingSheet ctx={ctx} visible={creating} onClose={() => { setCreating(false); if (params?.create) go('avvik', {}); }} onCreated={(f) => { setCreating(false); setOpenId(f.id); }} />
    </Page>
  );
}

/** «+ 3 saker i 2 andre typer» under typefordelingen. */
function restText(rest) {
  const n = rest.reduce((sum, r) => sum + r.value, 0);
  return `+ ${n} ${n === 1 ? 'sak' : 'saker'} i ${rest.length} ${rest.length === 1 ? 'annen type' : 'andre typer'}`;
}

function Kpi({ label, value, sub, tone, badge, active, onPress, wide }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={`${label}: ${value}. ${sub}`}
      style={{ flexGrow: 1, flexBasis: wide ? 200 : 150, borderWidth: 1, borderColor: active ? colors.brand : colors.line, backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 4 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 1 }} numberOfLines={2}>{label}</Text>
        {badge ? (
          <View style={{ minWidth: 22, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: `${colors.danger}1c`, alignItems: 'center' }}>
            <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: tone ? toneColor(colors, tone) : colors.ink, fontSize: 26, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{sub}</Text>
    </TouchableOpacity>
  );
}

function TypeDot({ type, label = true }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor(colors, GROUP_TONE[findingGroup(type)]) }} />
      {label ? <Text style={{ color: colors.ink, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{findingTypeLabel(type)}</Text> : null}
    </View>
  );
}

function dueOf(f) {
  // Nye saker har frist for vurdering (triage); senere gjelder saksfristen.
  return f.state === 'registrert' ? (f.dueAt || f.triageDue || '') : (f.dueAt || '');
}

function FindingTable({ rows, today, onOpen }) {
  const colors = useColors();
  const W = { nr: 112, type: 156, date: 92, who: 168, due: 92, act: 56, status: 132 };
  const head = (label, width, align) => <Text style={{ width, flex: width ? undefined : 1, color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textAlign: align }}>{label}</Text>;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.sunken }}>
        {head('NR', W.nr)}
        {head('TITTEL')}
        {head('TYPE', W.type)}
        {head('SKJEDDE', W.date)}
        {head('SAKSBEHANDLER', W.who)}
        {head('FRIST', W.due)}
        {head('TILTAK', W.act, 'right')}
        {head('STATUS', W.status)}
      </View>
      {rows.map((f) => {
        const due = dueOf(f);
        const late = due && due < today && findingPhase(f) !== 'avsluttet';
        const prog = actionProgress(f);
        return (
          <TouchableOpacity
            key={f.id}
            onPress={() => onOpen(f.id)}
            testID="iso-row"
            accessibilityRole="button"
            accessibilityLabel={`${f.number} ${f.title}, ${findingStateLabel(f.state)}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: 1, borderColor: colors.line, minHeight: 48 }}
          >
            <View style={{ width: W.nr, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {f.restricted ? <Ionicons name="lock-closed" size={12} color={colors.warn} /> : null}
              <Text style={{ color: colors.muted, fontSize: 12, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }} numberOfLines={1}>{f.number}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{f.title}</Text>
              {f.projectName || f.location ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{[f.projectName, f.location].filter(Boolean).join(' · ')}</Text> : null}
            </View>
            <View style={{ width: W.type }}><TypeDot type={f.type} /></View>
            <Text style={{ width: W.date, color: colors.ink, fontSize: 13 }}>{prettyDate(f.occurredAt)}</Text>
            <View style={{ width: W.who, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {f.assigneeName ? <Initials name={f.assigneeName} size={24} /> : null}
              <Text style={{ color: f.assigneeName ? colors.ink : colors.muted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{f.assigneeName || '–'}</Text>
            </View>
            <Text style={{ width: W.due, color: late ? colors.danger : colors.muted, fontWeight: late ? '700' : '400', fontSize: 13 }}>{due ? prettyDate(due) : '–'}</Text>
            <Text style={{ width: W.act, textAlign: 'right', color: hasOverdueAction(f) ? colors.danger : colors.ink, fontSize: 13 }}>{prog.total ? `${prog.done}/${prog.total}` : '–'}</Text>
            <View style={{ width: W.status }}><Pill label={findingStateLabel(f.state)} tone={STATE_TONE[f.state]} /></View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FindingRow({ finding: f, today, onOpen }) {
  const colors = useColors();
  const due = dueOf(f);
  const late = due && due < today && findingPhase(f) !== 'avsluttet';
  const prog = actionProgress(f);
  return (
    <TouchableOpacity
      onPress={() => onOpen(f.id)}
      testID="iso-row"
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, minHeight: 52 }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {f.restricted ? <Ionicons name="lock-closed" size={12} color={colors.warn} /> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>{f.number}</Text>
          <TypeDot type={f.type} />
        </View>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }} numberOfLines={2}>{f.title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
          {[prettyDate(f.occurredAt), f.assigneeName || 'Ingen saksbehandler', prog.total ? `tiltak ${prog.done}/${prog.total}` : ''].filter(Boolean).join(' · ')}
          {due ? <Text style={{ color: late ? colors.danger : colors.muted, fontWeight: late ? '700' : '400' }}>{` · frist ${prettyDate(due)}`}</Text> : null}
        </Text>
      </View>
      <Pill label={findingStateLabel(f.state)} tone={STATE_TONE[f.state]} />
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

/** Bilder som miniatyrer, andre filer som rader. onRemove(indeks) gir fjern-knapp. */
function Attachments({ items, onRemove }) {
  const colors = useColors();
  const list = (items || []).map((a, i) => ({ a, i }));
  if (!list.length) return null;
  const open = (a) => { if (a.url) Linking.openURL(a.url).catch(() => {}); };
  const images = list.filter(({ a }) => isImageAttachment(a));
  const files = list.filter(({ a }) => !isImageAttachment(a));
  return (
    <View style={{ gap: 8 }}>
      {images.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {images.map(({ a, i }) => (
            <View key={`${a.url}-${i}`}>
              <TouchableOpacity onPress={() => open(a)} accessibilityRole="link" accessibilityLabel={`Åpne bildet ${a.label}`}>
                <Image source={{ uri: a.url }} resizeMode="cover" style={{ width: 104, height: 104, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sunken }} />
              </TouchableOpacity>
              {onRemove ? (
                <TouchableOpacity
                  onPress={() => onRemove(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Fjern ${a.label}`}
                  style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {files.map(({ a, i }) => (
        <ListRow
          key={`${a.url}-${i}`}
          icon="document-attach-outline"
          title={a.label || a.url}
          subtitle={a.size ? `${Math.max(1, Math.round(a.size / 1024))} kB` : 'Vedlegg'}
          onPress={() => open(a)}
          right={onRemove ? <Btn small icon="close" accessibilityLabel={`Fjern ${a.label}`} onPress={() => onRemove(i)} /> : null}
        />
      ))}
    </View>
  );
}

/** Legg til bilder og filer: dra og slipp (web), last opp, og ta bilde (mobilapp). onFiles(filer, feil). */
function AttachmentAdd({ busy, onFiles }) {
  const colors = useColors();
  // Dra og slipp gir bare mening med mus. På telefon åpner «Last opp» kamera og bilder.
  const drop = Platform.OS === 'web' && !usePhone();
  async function pickFiles() {
    try {
      const picked = await pickDocument({ multiple: true, accept: UPLOAD_ACCEPT });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      if (list.length) onFiles(list);
    } catch (e) {
      onFiles([], e?.message === 'library-denied' ? 'Gi ProTop tilgang til bildene i innstillingene på telefonen.' : 'Kunne ikke åpne filvelgeren.');
    }
  }
  async function takePhoto() {
    try {
      const picked = await pickImage({ camera: true, edit: false });
      if (picked) onFiles([picked]);
    } catch (e) {
      onFiles([], e?.message === 'camera-denied' ? 'Gi ProTop tilgang til kameraet i innstillingene på telefonen.' : 'Kunne ikke ta bilde.');
    }
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
      {drop ? (
        <FileDropZone
          colors={colors}
          disabled={busy}
          nativeID="iso-finding-drop"
          onFiles={(files) => onFiles(files)}
          style={{ flexGrow: 1, minWidth: 180, minHeight: 40, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingLeft: 12, paddingRight: 12 }}
        >
          <Text style={{ color: colors.muted, fontSize: 13 }}>{busy ? 'Laster opp …' : 'Dra og slipp filer her'}</Text>
        </FileDropZone>
      ) : null}
      {Platform.OS !== 'web' ? <Btn small icon="camera-outline" label="Ta bilde" disabled={busy} onPress={takePhoto} /> : null}
      <Btn small icon="attach-outline" label={Platform.OS === 'web' ? 'Last opp' : 'Velg bilder eller filer'} busy={busy} onPress={pickFiles} />
    </View>
  );
}

/** Typevalg som kort med kort forklaring. Sjeldne typer ligger i «Andre typer». */
function TypeCards({ value, onChange, wide }) {
  const colors = useColors();
  const quick = FINDING_TYPES.filter((t) => t.quick);
  const other = FINDING_TYPES.filter((t) => !t.quick);
  const otherPicked = other.some((t) => t.id === value);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {quick.map((t) => {
          const on = value === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => onChange(t.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t.label}. ${t.hint}`}
              style={{ width: wide ? '31.5%' : '48%', flexGrow: 0, padding: 10, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor(colors, GROUP_TONE[t.group]) }} />
                {/* Usynlig bruddpunkt etter «/», så «Produkt-/leveranseavvik» kan deles på smal skjerm. */}
                <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13, flexShrink: 1 }}>{t.label.replace('/', '/\u200b')}</Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 16 }}>{t.hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Choice
        small
        options={other.map((t) => ({ id: t.id, label: t.label, hint: t.hint }))}
        value={otherPicked ? value : ''}
        onChange={(x) => onChange(x || '')}
        placeholder="Andre typer …"
        title="Andre typer"
        clearable
      />
    </View>
  );
}

function newDraftKey() {
  return `utkast-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function NewFindingSheet({ ctx, visible, onClose, onCreated }) {
  const colors = useColors();
  const { state, actor, projects, people, store, wide, prefill, companyId } = ctx;
  const blank = () => ({ type: '', title: '', description: '', occurredAt: todayKey(), occurredTime: clockNow(), projectId: '', location: '', actualConsequence: '', potentialConsequence: '', immediateAction: '', restricted: null, personalDetails: '', authorityNotificationRequired: false, notificationAssignee: '', deliverableRef: '', environmentalMedium: '', customerImpact: '', attachments: [] });
  const [v, setV] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [more, setMore] = useState(false);
  const [draftKey, setDraftKey] = useState(newDraftKey);
  useEffect(() => {
    if (!visible) return;
    const next = { ...blank(), ...(prefill || {}) };
    setV(next);
    setError('');
    setDraftKey(newDraftKey());
    setMore(!!(next.actualConsequence || next.potentialConsequence || next.deliverableRef || next.customerImpact || next.environmentalMedium));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }));
  const domain = FINDING_TYPES.find((t) => t.id === v.type)?.domain;
  const restricted = v.restricted == null ? defaultRestricted(v.type) : v.restricted;
  const who = v.type ? autoAssignee(state.system, v.type) : null;
  const ready = !!v.type && !!v.title.trim() && !!v.description.trim() && (!v.authorityNotificationRequired || !!v.notificationAssignee);

  async function addFiles(files, pickError) {
    if (pickError) { setError(pickError); return; }
    if (!files?.length) return;
    setError('');
    setUploading(true);
    const res = await uploadAttachments(files, `families/${companyId}/iso/findings/${draftKey}`);
    setUploading(false);
    if (res.added.length) setV((x) => ({ ...x, attachments: [...(x.attachments || []), ...res.added].slice(0, 20) }));
    if (res.error) setError(res.error);
  }

  async function save() {
    setBusy(true);
    const project = projects.find((p) => p.id === v.projectId);
    const res = createFinding({
      ...v,
      restricted,
      assigneeName: who?.name || '',
      assigneeUid: who?.uid || '',
      requirementIds: requirementIdsForFinding(state, v.type),
      projectName: project ? `${project.number || ''} ${project.name || ''}`.trim() : '',
    }, { actor, existing: state.findings, now: new Date() });
    if (!res.ok) { setError(res.error); setBusy(false); return; }
    // Behandler får oppgave i Oppgaver med en gang (fast nøkkel → én oppgave).
    const effects = who?.uid ? [{ type: 'createTask', key: `iso_${res.finding.id}_triage`, title: `Behandle ${res.finding.number}: ${res.finding.title}`, assigneeUid: who.uid, deadline: res.finding.triageDue }] : [];
    const saved = await store.commit('findings', 'finding', res, { effects });
    setBusy(false);
    if (!saved.ok) { setError(saved.error); return; }
    onCreated(res.finding);
  }

  const extras = [
    domain === 'KVALITET' ? 'leveranse og kunde' : '',
    domain === 'MILJO' ? 'miljømedium' : '',
    'konsekvens',
  ].filter(Boolean).join(', ');

  return (
    <Sheet
      visible={visible}
      wide={wide}
      title="Meld avvik"
      onClose={onClose}
      footer={<><Btn label="Avbryt" onPress={onClose} /><Btn kind="primary" label="Send inn" busy={busy} disabled={!ready || uploading} onPress={save} /></>}
    >
      <Field label="Hva slags sak" required>
        <TypeCards value={v.type} onChange={(x) => set('type')(x)} wide={wide} />
      </Field>
      {who ? <Text style={{ color: colors.muted, fontSize: 12 }}>Saken går til {who.name}, som får en oppgave i Oppgaver. Den kobles til relevante krav.</Text> : null}
      <Field label="Tittel" required><TextIn value={v.title} onChangeText={set('title')} placeholder="Kort om hva som skjedde" /></Field>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Field label="Når skjedde det">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 3 }}><DateIn value={v.occurredAt} onChange={set('occurredAt')} /></View>
              <View style={{ flex: 2 }}><TimeIn value={v.occurredTime} onChange={set('occurredTime')} /></View>
            </View>
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Hvor"><TextIn value={v.location} onChangeText={set('location')} placeholder="F.eks. plan 2, trappeløp B" /></Field>
        </View>
      </View>
      {projects.length ? (
        <Field label="Prosjekt"><Choice small title="Prosjekt" options={projects.map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() }))} value={v.projectId} onChange={set('projectId')} /></Field>
      ) : null}
      <Field label="Hva skjedde" required hint="Beskriv fakta. Ikke legg inn helseopplysninger her."><TextIn multiline rows={3} value={v.description} onChangeText={set('description')} placeholder="Beskriv hendelsen med egne ord." /></Field>
      <Field label="Strakstiltak"><TextIn value={v.immediateAction} onChangeText={set('immediateAction')} placeholder="Hva ble gjort med en gang?" /></Field>
      <Field label="Bilder og vedlegg" hint={restricted ? 'Skjermet sak: ta bilde av forholdet, ikke av personer.' : undefined}>
        <Attachments items={v.attachments} onRemove={(i) => set('attachments')(v.attachments.filter((_, j) => j !== i))} />
        <AttachmentAdd busy={uploading} onFiles={addFiles} />
      </Field>
      <TouchableOpacity onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 }}>
        <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.brand} />
        <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>Flere detaljer ({extras})</Text>
      </TouchableOpacity>
      {more ? (
        <>
          {domain === 'KVALITET' ? (
            <>
              <Field label="Leveranse / dokument-ID"><TextIn value={v.deliverableRef} onChangeText={set('deliverableRef')} placeholder="F.eks. tegning A-101 rev C" /></Field>
              <Field label="Påvirkning for kunde"><TextIn value={v.customerImpact} onChangeText={set('customerImpact')} /></Field>
            </>
          ) : null}
          {domain === 'MILJO' ? <Field label="Miljømedium"><Choice small options={['Luft', 'Vann', 'Jord', 'Avfall', 'Annet']} value={v.environmentalMedium} onChange={set('environmentalMedium')} /></Field> : null}
          <Field label="Faktisk konsekvens"><TextIn value={v.actualConsequence} onChangeText={set('actualConsequence')} placeholder="Hva ble resultatet?" /></Field>
          <Field label="Mulig konsekvens"><TextIn value={v.potentialConsequence} onChangeText={set('potentialConsequence')} placeholder="Hva kunne det blitt?" /></Field>
        </>
      ) : null}
      <Check label="Skjermet sak (HMS/personopplysninger) – bare særskilt tilgang og involverte ser saken" value={restricted} onChange={set('restricted')} />
      {restricted ? <Field label="Personopplysninger (skjermet)" hint="Bare det som er nødvendig. Vises ikke i lister eller eksport."><TextIn multiline rows={2} value={v.personalDetails} onChangeText={set('personalDetails')} /></Field> : null}
      <Check label="Mulig meldeplikt til myndighet (f.eks. alvorlig personskade eller utslipp)" value={v.authorityNotificationRequired} onChange={set('authorityNotificationRequired')} />
      {v.authorityNotificationRequired ? (
        <>
          <Banner tone="warn" text="ProTop melder ikke til myndighetene. Intern registrering oppfyller ikke ekstern meldeplikt. Alvorlige arbeidsulykker meldes til Arbeidstilsynet og politiet." />
          <Field label="Hvem sørger for varsling" required><PersonPick people={people} value={v.notificationAssignee} onChange={(p) => set('notificationAssignee')(p.name)} /></Field>
        </>
      ) : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </Sheet>
  );
}

const STEPS = ['Registrert', 'Triage', 'Vurdert', 'Tiltak', 'Effekt', 'Lukket'];

function Stepper({ step, closed }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={`Fase ${step + 1} av ${STEPS.length}`}>
      {STEPS.map((s, i) => {
        const done = i < step || closed;
        const now = i === step && !closed;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: now ? colors.brand : colors.line, backgroundColor: done ? colors.successSoft : (now ? colors.brandSoft : colors.card) }}>
            <Text style={{ color: colors.ink, fontSize: 12, fontWeight: now ? '700' : '400' }}>{done ? '✓ ' : ''}{s}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Rad i «Behandling»: etikett til venstre, verdi til høyre. */
function Line({ label, children }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 28 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        {typeof children === 'string' || typeof children === 'number' ? <Text style={{ color: colors.ink, fontSize: 13, textAlign: 'right' }}>{children}</Text> : children}
      </View>
    </View>
  );
}

const BLANK_ACTION = { title: '', ownerName: '', ownerUid: '', dueAt: '', requiredEvidence: '', type: 'korrigerende' };
const padWhys = (list) => [...(list || []), '', '', '', '', ''].slice(0, 5);

function FindingDetail({ ctx, finding, onBack }) {
  const colors = useColors();
  const { state, caps, actor, store, people, wide, go, companyId } = ctx;
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [audit, setAudit] = useState(null);
  const [sheet, setSheet] = useState('');
  const [uploading, setUploading] = useState(false);
  const manage = canManageFinding(caps, finding);
  const closeable = canCloseFinding(caps, finding);
  const blockers = closeBlockers(finding);
  const closed = ['lukket', 'kansellert'].includes(finding.state);
  const today = todayKey();

  const [tri, setTri] = useState({});
  const [asm, setAsm] = useState({});
  const [rc, setRc] = useState({ whys: padWhys(), systemCause: '', categories: [], showWhys: false });
  const [chg, setChg] = useState(() => ({ ...(finding.change || {}) }));
  const [act, setAct] = useState(BLANK_ACTION);
  // Utførelse / kontroll
  const [doneNote, setDoneNote] = useState({});
  const [evidenceRef, setEvidenceRef] = useState({});
  const [effect, setEffect] = useState({ outcome: '', method: '', note: '' });
  const [closeNote, setCloseNote] = useState('');
  const [learning, setLearning] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [notifNote, setNotifNote] = useState('');
  const [reason, setReason] = useState('');
  const [selfOk, setSelfOk] = useState({});

  const requirements = useMemo(() => allRequirements(state), [state]);
  const linkedReqs = requirements.filter((r) => (finding.links?.requirementIds || []).includes(r.id));
  const evidenceReqs = useMemo(() => {
    const ev = new Set((state.evidence || []).filter((e) => e.type === 'finding' && e.objectId === finding.id).map((e) => e.id));
    const ids = new Set((state.evidenceLinks || []).filter((l) => ev.has(l.evidenceId) && l.reviewState !== 'fjernet').map((l) => l.requirementId));
    return requirements.filter((r) => ids.has(r.id));
  }, [state.evidence, state.evidenceLinks, finding.id, requirements]);

  async function run(label, result, extra = {}) {
    setErr('');
    setMsg('');
    if (!result.ok) { setErr(result.error); return result; }
    setBusy(label);
    const saved = await store.commit('findings', 'finding', result, { previous: finding, ...extra });
    setBusy('');
    if (!saved.ok) setErr(saved.error); else setMsg(`${label} – lagret.`);
    return saved;
  }

  /** Lagrer fra en dialog og lukker den når det gikk. */
  async function save(label, result, extra) {
    const saved = await run(label, result, extra);
    if (saved?.ok) setSheet('');
    return saved;
  }

  function openSheet(name) {
    setErr('');
    setMsg('');
    if (name === 'triage') {
      // Den som starter behandlingen blir saksbehandler, med mindre saken allerede er tildelt.
      setTri({
        severity: finding.severity || '', urgent: !!finding.triage?.urgent,
        assigneeName: finding.assigneeName || actor.name, assigneeUid: finding.assigneeName ? finding.assigneeUid : actor.uid,
        immediateAction: finding.immediateAction, notifiable: finding.authorityNotificationRequired, notificationAssignee: finding.notificationAssignee,
        dueAt: finding.dueAt, note: '',
      });
    }
    if (name === 'assess') {
      setAsm({ correctiveRequired: finding.assessment?.correctiveRequired ?? null, rationale: finding.assessment?.rationale || '', correction: finding.assessment?.correction || '' });
      const whys = finding.rootCause?.whys || [];
      setRc({ whys: padWhys(whys), systemCause: finding.rootCause?.systemCause || '', categories: finding.rootCause?.categories || [], showWhys: whys.length > 0 });
    }
    if (name === 'effect') setEffect({ outcome: '', method: '', note: '' });
    if (name === 'close') { setCloseNote(''); setLearning(''); setCancelReason(''); }
    if (name === 'action') setAct(BLANK_ACTION);
    setSheet(name);
  }

  async function doClose() {
    const result = closeFinding(finding, { note: closeNote, learning }, { actor, caps, now: new Date() });
    const saved = await save('Saken er lukket', result);
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
    await save('Tiltak lagt til', res, {
      effects: [{ type: 'createTask', key: res.action.taskKey, title: `Tiltak ${finding.number}: ${res.action.title}`, assigneeUid: res.action.ownerUid, deadline: res.action.dueAt, description: res.action.requiredEvidence ? `Påkrevd dokumentasjon: ${res.action.requiredEvidence}` : '' }],
    });
  }

  function saveTriage() {
    return save(finding.state === 'registrert' ? 'Behandlingen er startet' : 'Triage', triageFinding(finding, tri, { actor }), { effects: [
      ...(tri.assigneeUid && tri.assigneeUid !== finding.assigneeUid ? [{ type: 'createTask', key: `iso_${finding.id}_behandle`, title: `Følg opp ${finding.number}: ${finding.title}`, assigneeUid: tri.assigneeUid, deadline: tri.dueAt || null }] : []),
      { type: 'completeTask', key: `iso_${finding.id}_triage` },
    ] });
  }

  const canDecide = ['triage', 'vurdert'].includes(finding.state);

  /** Tiltaksbeslutning og årsak i én lagring. Bare det som er endret, logges. */
  function saveAssessment() {
    const events = [];
    let current = finding;
    const prev = finding.assessment;
    const decisionChanged = canDecide && asm.correctiveRequired != null && (
      !prev || prev.correctiveRequired !== asm.correctiveRequired || (prev.rationale || '') !== asm.rationale.trim() || (prev.correction || '') !== asm.correction.trim()
    );
    if (canDecide && asm.correctiveRequired == null) return setErr('Velg om korrigerende tiltak er nødvendig.');
    if (decisionChanged) {
      const res = assessFinding(current, asm, { actor });
      if (!res.ok) return setErr(res.error);
      current = res.finding;
      events.push(...res.events);
    }
    const whys = rc.showWhys ? rc.whys.map((w) => w.trim()).filter(Boolean) : (finding.rootCause?.whys || []);
    const filled = rc.systemCause.trim() || whys.length || rc.categories.length;
    const old = finding.rootCause;
    const causeChanged = filled && (
      !old || (old.systemCause || '') !== rc.systemCause.trim() || JSON.stringify(old.whys || []) !== JSON.stringify(whys) || JSON.stringify(old.categories || []) !== JSON.stringify(rc.categories)
    );
    if (causeChanged) {
      const res = recordRootCause(current, { method: whys.length ? '5whys' : 'fritekst', whys, systemCause: rc.systemCause, categories: rc.categories }, { actor });
      if (!res.ok) return setErr(res.error);
      current = res.finding;
      events.push(...res.events);
    }
    if (!events.length) { setSheet(''); return null; }
    return save('Vurdering og årsak', { ok: true, finding: current, events });
  }

  async function addFiles(files, pickError) {
    if (pickError) { setErr(pickError); return; }
    if (!files?.length) return;
    setErr('');
    setUploading(true);
    const res = await uploadAttachments(files, `families/${companyId}/iso/findings/${finding.id}`);
    setUploading(false);
    if (res.added.length) await run(res.added.length === 1 ? 'Vedlegg lagt til' : `${res.added.length} vedlegg lagt til`, addFindingAttachments(finding, res.added, { actor }));
    if (res.error) setErr(res.error);
  }

  const prog = actionProgress(finding);
  const effectReady = (finding.state === 'effektkontroll' && finding.effect?.outcome !== 'verifisert')
    || (finding.state === 'vurdert' && prog.total > 0 && prog.done === prog.total);
  const showEffect = finding.effect?.required || finding.state === 'effektkontroll' || (finding.effect?.checks || []).length > 0;

  // Neste steg i flyten som én tydelig knapp øverst.
  let next = null;
  if (!closed && manage) {
    if (finding.state === 'registrert') next = { sheet: 'triage', label: 'Start behandling', icon: 'play-outline' };
    else if (finding.state === 'triage') next = { sheet: 'assess', label: 'Vurder', icon: 'create-outline' };
    else if (closeable && !blockers.length) next = { sheet: 'close', label: 'Lukk saken', icon: 'checkmark-done-outline' };
    else if (effectReady) next = { sheet: 'effect', label: 'Kontroller effekt', icon: 'analytics-outline' };
    else if (finding.assessment?.correctiveRequired && !prog.total) next = { sheet: 'action', label: 'Nytt tiltak', icon: 'add' };
  }
  const showClose = !closed && closeable && next?.sheet !== 'close';

  const overdue = isFindingOverdue(finding);
  const due = dueOf(finding);
  const approvers = useMemo(() => {
    const roleMap = state.system?.roleMap || {};
    return APPROVER_ROLES
      .map((id) => ({ role: ISO_ROLES.find((r) => r.id === id)?.label || id, name: roleMap[id]?.name }))
      .filter((r) => r.name)
      .filter((r, i, all) => all.findIndex((x) => x.name === r.name) === i);
  }, [state.system?.roleMap]);

  return (
    <Page
      wide={wide}
      crumb={['Avvik og forbedring', finding.number]}
      title={finding.title}
      intro={[finding.number, findingTypeLabel(finding.type), occurredText(finding) ? `Skjedde ${occurredText(finding)}` : '', finding.projectName].filter(Boolean).join(' · ')}
      back={{ label: 'Avvik og forbedring', onPress: onBack }}
      actions={next || showClose ? (
        <>
          {showClose ? <Btn icon="checkmark-done-outline" label="Lukk saken" onPress={() => openSheet('close')} /> : null}
          {next ? <Btn kind="primary" icon={next.icon} label={next.label} onPress={() => openSheet(next.sheet)} /> : null}
        </>
      ) : null}
    >
      <Row>
        <Pill label={findingStateLabel(finding.state)} tone={STATE_TONE[finding.state]} />
        {finding.restricted ? <Pill label="Skjermet" icon="lock-closed" tone="warn" /> : null}
        {overdue ? <Pill label={`Frist passert ${prettyDate(finding.dueAt)}`} icon="alarm-outline" tone="danger" /> : null}
      </Row>
      <Stepper step={findingStep(finding)} closed={finding.state === 'lukket'} />
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err && !sheet ? <Banner tone="danger" text={err} /> : null}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ flex: wide ? 3 : undefined, gap: 12, width: wide ? undefined : '100%' }}>
          <Card title="Hendelsen">
            {finding.links?.auditId ? (
              <TouchableOpacity onPress={() => go('revisjon', { open: finding.links.auditId })} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="search-outline" size={14} color={colors.brand} />
                <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>Fra internrevisjon</Text>
              </TouchableOpacity>
            ) : null}
            <KV label="Hva skjedde" value={finding.description} />
            <KV label="Hvor" value={finding.location} />
            <KV label="Strakstiltak" value={finding.immediateAction || '–'} />
            <KV label="Faktisk konsekvens" value={finding.actualConsequence} />
            <KV label="Mulig konsekvens" value={finding.potentialConsequence} />
            <KV label="Leveranse" value={finding.deliverableRef} />
            <KV label="Påvirkning for kunde" value={finding.customerImpact} />
            <KV label="Miljømedium" value={finding.environmentalMedium} />
            {finding.restricted && caps.restrictedView ? <KV label="Personopplysninger (skjermet)" value={finding.personalDetails} /> : null}
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Bilder og vedlegg</Text>
              <Attachments
                items={finding.attachments}
                onRemove={manage && !closed ? (i) => run('Vedlegg fjernet', removeFindingAttachment(finding, i, { actor })) : undefined}
              />
              {!(finding.attachments || []).length && !(manage && !closed) ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen vedlegg.</Text> : null}
              {manage && !closed ? <AttachmentAdd busy={uploading} onFiles={addFiles} /> : null}
            </View>
          </Card>

          {finding.authorityNotificationRequired ? (
            <Card title="Meldeplikt">
              <Banner tone={finding.notificationDone ? 'ok' : 'warn'} text={finding.notificationDone ? `Bekreftet: ${finding.notificationNote}` : `Mulig meldeplikt. Ansvarlig: ${finding.notificationAssignee || 'ikke satt'}. ProTop melder ikke selv til myndigheter.`} />
              {!finding.notificationDone && manage ? (
                <>
                  <TextIn value={notifNote} onChangeText={setNotifNote} placeholder="Hvem ble varslet, når og referanse" />
                  <Btn label="Bekreft varsling vurdert/utført" onPress={() => run('Varsling bekreftet', confirmNotification(finding, notifNote, { actor }))} />
                </>
              ) : null}
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

          <Card
            title="Vurdering og årsak"
            right={manage && !closed ? (
              finding.state === 'registrert'
                ? null
                : <Btn small icon="create-outline" label={finding.assessment || finding.rootCause ? 'Endre' : 'Vurder'} onPress={() => openSheet('assess')} />
            ) : null}
          >
            {finding.triage ? (
              <Row>
                {finding.severity ? <Pill label={`Alvorlighet: ${severityLabel(finding.severity)}`} tone={['hoy', 'kritisk'].includes(finding.severity) ? 'danger' : 'warn'} /> : null}
                {finding.triage.urgent ? <Pill label="Akutt fare" icon="warning-outline" tone="danger" /> : null}
                {manage && finding.state === 'triage' ? <Btn small label="Endre triage" onPress={() => openSheet('triage')} /> : null}
              </Row>
            ) : null}
            <KV label="Merknad fra triage" value={finding.triage?.note} />
            {finding.assessment ? (
              <KV
                label="Korrigerende tiltak"
                value={finding.assessment.correctiveRequired ? 'Ja, trengs' : `Nei – ${finding.assessment.rationale}`}
              />
            ) : null}
            <KV label="Korreksjon (rettet umiddelbart)" value={finding.assessment?.correction} />
            {finding.rootCause ? (
              <>
                {(finding.rootCause.categories || []).length ? <Row gap={6}>{finding.rootCause.categories.map((c) => <Pill key={c} label={c} tone="info" />)}</Row> : null}
                <KV label="Hvorfor skjedde det" value={finding.rootCause.systemCause} />
                {(finding.rootCause.whys || []).map((w, i) => <KV key={i} label={`Hvorfor ${i + 1}`} value={w} />)}
                <Text style={{ color: colors.muted, fontSize: 12 }}>Årsak registrert av {finding.rootCause.by}</Text>
              </>
            ) : null}
            {!finding.triage && !finding.assessment && !finding.rootCause ? (
              <Text style={{ color: colors.muted, fontSize: 13 }}>{finding.state === 'registrert' ? 'Ikke vurdert ennå. Behandlingen starter med «Start behandling».' : 'Ikke vurdert ennå.'}</Text>
            ) : null}
            {finding.triage && !finding.assessment && manage && !closed ? <Text style={{ color: colors.muted, fontSize: 13 }}>Neste: bestem om korrigerende tiltak trengs, og hvorfor det skjedde.</Text> : null}
          </Card>

          <Card
            title="Tiltak"
            subtitle={prog.total ? `${prog.done} av ${prog.total} kontrollert` : undefined}
            right={!closed && manage && finding.state !== 'registrert' ? <Btn small icon="add" label="Nytt tiltak" onPress={() => openSheet('action')} /> : null}
          >
            {!(finding.actions || []).length ? <Text style={{ color: colors.muted, fontSize: 13 }}>{finding.state === 'registrert' ? 'Tiltak legges til når behandlingen er startet.' : 'Ingen tiltak ennå.'}</Text> : null}
            {(finding.actions || []).map((a) => {
              const mine = a.ownerUid && a.ownerUid === actor.uid;
              const open = ['apen', 'pagar', 'returnert'].includes(a.state);
              const task = store.tasks?.[String(a.taskKey || '').replace(/[^A-Za-z0-9_-]/g, '_')];
              const taskDone = !!task?.done;
              return (
                <View key={a.id} style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{a.title}</Text>
                    <Pill label={actionStateLabel(a.state)} tone={a.state === 'verifisert' ? 'ok' : (a.dueAt < today && open ? 'danger' : 'info')} />
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
                      {a.completedBy === actor.name ? <Check label="Jeg kontrollerer mitt eget tiltak (logges som egenkontroll)" value={!!selfOk[a.id]} onChange={(x) => setSelfOk({ ...selfOk, [a.id]: x })} /> : null}
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
            {!closed && manage && (finding.actions || []).some((a) => ['apen', 'pagar', 'returnert', 'til_verifisering'].includes(a.state)) ? <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse ved retur/kansellering" /> : null}
          </Card>

          {showEffect ? (
            <Card
              title="Effektkontroll"
              subtitle="Har tiltakene hatt ønsket effekt? «Ikke verifisert» gjenåpner saken."
              right={effectReady && manage ? <Btn small icon="analytics-outline" label="Kontroller effekt" onPress={() => openSheet('effect')} /> : null}
            >
              {finding.effect?.outcome === 'verifisert'
                ? <Banner tone="ok" text={`Effekt verifisert av ${finding.effect.checkedBy}: ${finding.effect.method}`} />
                : null}
              {finding.effect?.outcome !== 'verifisert' && (finding.effect?.checks || []).length ? (
                <Text style={{ color: colors.warn, fontSize: 13 }}>Forrige kontroll: ikke verifisert ({finding.effect.checks[finding.effect.checks.length - 1].note}).</Text>
              ) : null}
              {finding.effect?.outcome !== 'verifisert' && !(finding.effect?.checks || []).length ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>{effectReady ? 'Alle tiltak er kontrollert. Nå kan effekten kontrolleres.' : 'Gjøres når alle tiltak er kontrollert.'}</Text>
              ) : null}
            </Card>
          ) : null}

          {closed ? (
            <Card title={finding.state === 'lukket' ? 'Lukket' : 'Kansellert'}>
              <KV label="Lukket av" value={finding.closedBy ? `${finding.closedBy} · ${prettyDate(finding.closedAt)}` : ''} />
              <KV label="Begrunnelse" value={finding.closeNote || finding.cancelReason} />
              <KV label="Læring" value={finding.learning} />
              {finding.state === 'lukket' && caps.manage ? (
                <>
                  <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse for gjenåpning" />
                  <Btn label="Gjenåpne" onPress={() => run('Gjenåpnet', reopenFinding(finding, reason, { actor, caps }))} />
                </>
              ) : null}
            </Card>
          ) : null}
        </View>

        <View style={{ flex: wide ? 2 : undefined, gap: 12, width: wide ? undefined : '100%' }}>
          <Card title="Behandling">
            <Line label="Saksbehandler">
              {finding.assigneeName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Initials name={finding.assigneeName} size={24} />
                  <Text style={{ color: colors.ink, fontSize: 13 }}>{finding.assigneeName}</Text>
                </View>
              ) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ikke satt</Text>}
            </Line>
            <Line label={finding.state === 'registrert' ? 'Frist for vurdering' : 'Frist'}>
              <Text style={{ color: due && due < today && !closed ? colors.danger : colors.ink, fontWeight: due && due < today && !closed ? '700' : '400', fontSize: 13 }}>{due ? prettyDate(due) : '–'}</Text>
            </Line>
            <Line label="Alvorlighet">{finding.severity ? severityLabel(finding.severity) : 'Ikke vurdert'}</Line>
            <Line label="Skjedde">{occurredText(finding) || '–'}</Line>
            <Line label="Registrert">{localStamp(finding.reportedAt) || '–'}</Line>
            <Line label="Registrert av">{finding.reportedBy || '–'}</Line>
            {finding.projectName ? <Line label="Prosjekt">{finding.projectName}</Line> : null}
            {!closed ? (
              <>
                <Divider />
                <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>Før saken kan lukkes</Text>
                {blockers.length
                  ? blockers.map((b) => <Text key={b} style={{ color: colors.warn, fontSize: 12 }}>• {b}</Text>)
                  : <Text style={{ color: colors.success, fontSize: 12 }}>Alle krav for lukking er oppfylt.</Text>}
              </>
            ) : null}
            <Divider />
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
              Saken behandles av dem med Begrenset redigering i ISO. Lukking krever i tillegg en ledende ISO-rolle
              {approvers.length ? ` (${approvers.map((r) => `${r.role}: ${r.name}`).join(', ')})` : ''}.
              {finding.restricted ? ' Skjermet sak: bare personer med særskilt tilgang kan behandle og lukke den.' : ''}
            </Text>
          </Card>
          <CaseProcess state={state} finding={finding} wide={wide} />
          <Card title="Koblinger" subtitle="Krav, prosess og revisjon">
            {linkedReqs.length ? linkedReqs.map((r) => <ListRow key={r.id} icon="document-text-outline" title={`${r.standard ? r.standard.replace('ISO', 'ISO ') : r.kind} ${r.clause || ''} ${r.title}`} onPress={() => go('krav', { open: r.id })} />) : <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen krav koblet. Ved lukking kobles saken til kravet om avvik og korrigerende tiltak.</Text>}
            {manage && !closed ? <Btn small icon="link-outline" label="Koble krav" onPress={() => openSheet('reqs')} /> : null}
            {finding.links?.auditId ? <ListRow icon="search-outline" title="Fra internrevisjon" onPress={() => go('revisjon', { open: finding.links.auditId })} /> : null}
            {evidenceReqs.length ? (
              <>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Brukt som bevis i kravmatrisen:</Text>
                {evidenceReqs.map((r) => <ListRow key={r.id} icon="checkmark-done-outline" tone="ok" title={`${r.standard ? `${r.standard.replace('ISO', 'ISO ')} ${r.clause}` : r.kind} ${r.title}`} onPress={() => go('krav', { open: r.id })} />)}
              </>
            ) : null}
          </Card>
          <Card title="Historikk">
            {(finding.history || []).slice().reverse().map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 6 }}>
                <Text style={{ width: 74, color: colors.muted, fontSize: 12 }}>{localStamp(h.at, true)}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontSize: 13 }}><Text style={{ fontWeight: '600' }}>{h.action}</Text>{h.by ? ` · ${h.by}` : ''}</Text>
                  {h.note ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={4}>{h.note}</Text> : null}
                </View>
              </View>
            ))}
            <Btn small label={audit ? 'Skjul revisjonsspor' : 'Vis revisjonsspor'} onPress={async () => setAudit(audit ? null : await loadAuditFor(ctx.companyId, finding.id, { restricted: !!finding.restricted }))} />
            {audit ? audit.map((e) => <Text key={e.id} style={{ color: colors.muted, fontSize: 11 }}>{String(e.at).replace('T', ' ').slice(0, 16)} · {e.action} · {e.actorName} · {e.beforeHash || '–'}→{e.afterHash}</Text>) : null}
          </Card>
        </View>
      </View>

      <Sheet
        visible={sheet === 'triage'}
        wide={wide}
        title={finding.state === 'registrert' ? 'Start behandling' : 'Triage og klassifisering'}
        onClose={() => setSheet('')}
        footer={<><Btn label="Avbryt" onPress={() => setSheet('')} /><Btn kind="primary" label={finding.state === 'registrert' ? 'Start behandling' : 'Lagre triage'} busy={!!busy} disabled={!tri.severity || !tri.assigneeName} onPress={saveTriage} /></>}
      >
        <Text style={{ color: colors.muted, fontSize: 12 }}>{finding.number} · {finding.title}</Text>
        <Field label="Alvorlighet" required><Choice options={SEVERITIES.map((s) => ({ id: s.id, label: s.label }))} value={tri.severity} onChange={(x) => setTri({ ...tri, severity: x })} /></Field>
        <Field label="Saksbehandler" required hint="Får saken som oppgave i Oppgaver."><PersonPick people={people} value={tri.assigneeName} onChange={(p) => setTri({ ...tri, assigneeName: p.name, assigneeUid: p.uid })} /></Field>
        <Field label="Frist for saken" hint="Tom frist gir 30 dager (7 dager ved kritisk)."><DateIn value={tri.dueAt} onChange={(x) => setTri({ ...tri, dueAt: x })} /></Field>
        <Check label="Akutt fare eller konsekvens" value={!!tri.urgent} onChange={(x) => setTri({ ...tri, urgent: x })} />
        {tri.urgent ? <Field label="Strakstiltak" required><TextIn value={tri.immediateAction} onChangeText={(x) => setTri({ ...tri, immediateAction: x })} /></Field> : null}
        <Check label="Mulig meldeplikt til myndighet" value={!!tri.notifiable} onChange={(x) => setTri({ ...tri, notifiable: x })} />
        {tri.notifiable ? <Field label="Hvem varsler" required><PersonPick people={people} value={tri.notificationAssignee} onChange={(p) => setTri({ ...tri, notificationAssignee: p.name })} /></Field> : null}
        <Field label="Merknad"><TextIn value={tri.note} onChangeText={(x) => setTri({ ...tri, note: x })} /></Field>
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>

      <Sheet
        visible={sheet === 'assess'}
        wide={wide}
        title="Vurdering og årsak"
        onClose={() => setSheet('')}
        footer={<><Btn label="Avbryt" onPress={() => setSheet('')} /><Btn kind="primary" label="Lagre" busy={!!busy} onPress={saveAssessment} /></>}
      >
        <Text style={{ color: colors.muted, fontSize: 12 }}>{finding.number} · {finding.title}{finding.severity ? ` · alvorlighet ${severityLabel(finding.severity).toLowerCase()}` : ''}</Text>
        {canDecide ? (
          <>
            <Field label="Trengs korrigerende tiltak?" required>
              <Chips
                multi={false}
                options={[{ id: 'ja', label: 'Ja' }, { id: 'nei', label: 'Nei, begrunnet' }]}
                value={asm.correctiveRequired === true ? 'ja' : (asm.correctiveRequired === false ? 'nei' : '')}
                onChange={(x) => setAsm({ ...asm, correctiveRequired: x === 'ja' ? true : (x === 'nei' ? false : null) })}
              />
            </Field>
            {asm.correctiveRequired === false ? <Field label="Begrunnelse" required hint="Godkjennes av den som lukker saken."><TextIn multiline rows={2} value={asm.rationale} onChangeText={(x) => setAsm({ ...asm, rationale: x })} /></Field> : null}
            <Field label="Korreksjon (det som rettes umiddelbart)"><TextIn value={asm.correction} onChangeText={(x) => setAsm({ ...asm, correction: x })} /></Field>
          </>
        ) : finding.assessment ? (
          <KV label="Korrigerende tiltak" value={finding.assessment.correctiveRequired ? 'Ja, trengs' : `Nei – ${finding.assessment.rationale}`} />
        ) : null}
        <Divider />
        <Field label="Bakenforliggende årsaker"><Chips options={CAUSE_CATEGORIES} value={rc.categories} onChange={(x) => setRc({ ...rc, categories: x })} /></Field>
        <Field
          label="Hvorfor skjedde det"
          required={(asm.correctiveRequired ?? finding.assessment?.correctiveRequired) === true && ['middels', 'hoy', 'kritisk'].includes(finding.severity)}
          hint="Direkte og bakenforliggende årsak, med egne ord. Påkrevd før lukking når tiltak trengs og alvorligheten er middels eller høyere."
        >
          <TextIn multiline rows={3} value={rc.systemCause} onChangeText={(x) => setRc({ ...rc, systemCause: x })} placeholder="Hva i rutiner, planlegging, utstyr eller opplæring gjorde at det skjedde?" />
        </Field>
        <Check label="Bruk 5 × hvorfor" value={rc.showWhys} onChange={(x) => setRc({ ...rc, showWhys: x })} />
        {rc.showWhys ? rc.whys.map((w, i) => (
          <TextIn key={i} value={w} onChangeText={(x) => setRc({ ...rc, whys: rc.whys.map((y, j) => (j === i ? x : y)) })} placeholder={`Hvorfor ${i + 1}?`} />
        )) : null}
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>

      <Sheet
        visible={sheet === 'action'}
        wide={wide}
        title="Nytt tiltak"
        onClose={() => setSheet('')}
        footer={<><Btn label="Avbryt" onPress={() => setSheet('')} /><Btn kind="primary" label="Legg til og lag oppgave" busy={!!busy} disabled={!act.title.trim() || !act.ownerName || !act.dueAt} onPress={addNewAction} /></>}
      >
        <Field label="Tiltak" required><TextIn multiline rows={2} value={act.title} onChangeText={(x) => setAct({ ...act, title: x })} placeholder="Hva skal gjøres?" /></Field>
        <Field label="Type"><Choice options={[{ id: 'korreksjon', label: 'Korreksjon' }, { id: 'korrigerende', label: 'Korrigerende' }, { id: 'forebyggende', label: 'Forebyggende' }]} value={act.type} onChange={(x) => setAct({ ...act, type: x || 'korrigerende' })} /></Field>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
          <View style={{ flex: 1 }}><Field label="Ansvarlig" required hint="Får oppgave i Oppgaver."><PersonPick people={people} value={act.ownerName} onChange={(p) => setAct({ ...act, ownerName: p.name, ownerUid: p.uid })} /></Field></View>
          <View style={{ flex: 1 }}><Field label="Frist" required><DateIn value={act.dueAt} onChange={(x) => setAct({ ...act, dueAt: x })} /></Field></View>
        </View>
        <Field label="Påkrevd dokumentasjon"><TextIn value={act.requiredEvidence} onChangeText={(x) => setAct({ ...act, requiredEvidence: x })} placeholder="F.eks. oppdatert prosedyre" /></Field>
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>

      <Sheet
        visible={sheet === 'effect'}
        wide={wide}
        title="Effektkontroll"
        onClose={() => setSheet('')}
        footer={<><Btn label="Avbryt" onPress={() => setSheet('')} /><Btn kind="primary" label="Lagre effektkontroll" busy={!!busy} disabled={!effect.outcome} onPress={() => save('Effektkontroll', verifyEffect(finding, effect, { actor }))} /></>}
      >
        <Text style={{ color: colors.muted, fontSize: 12 }}>Har tiltakene hatt ønsket effekt? «Ikke verifisert» gjenåpner saken for nye tiltak.</Text>
        <Field label="Metode" required><TextIn value={effect.method} onChangeText={(x) => setEffect({ ...effect, method: x })} placeholder="Stikkprøve, måling, oppfølgingssamtale …" /></Field>
        <Field label="Resultat" required><TextIn multiline rows={2} value={effect.note} onChangeText={(x) => setEffect({ ...effect, note: x })} /></Field>
        <Field label="Utfall" required>
          <Chips multi={false} options={[{ id: 'verifisert', label: 'Effekt verifisert' }, { id: 'ikke_verifisert', label: 'Ikke verifisert' }]} value={effect.outcome} onChange={(x) => setEffect({ ...effect, outcome: x })} />
        </Field>
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>

      <Sheet
        visible={sheet === 'close'}
        wide={wide}
        title="Lukk saken"
        onClose={() => setSheet('')}
        footer={<><Btn label="Avbryt" onPress={() => setSheet('')} /><Btn kind="primary" icon="lock-closed-outline" label="Godkjenn lukking" busy={!!busy} disabled={!!blockers.length || !closeNote.trim()} onPress={doClose} /></>}
      >
        <Text style={{ color: colors.muted, fontSize: 12 }}>{finding.number} · {finding.title}</Text>
        {blockers.length
          ? <View style={{ gap: 4 }}>{blockers.map((b) => <Text key={b} style={{ color: colors.warn, fontSize: 13 }}>• {b}</Text>)}</View>
          : <Banner tone="ok" text="Alle krav for lukking er oppfylt." />}
        <Field label="Lukkebegrunnelse" required><TextIn value={closeNote} onChangeText={setCloseNote} placeholder="Hva ble gjort, og hvorfor er saken ferdig?" /></Field>
        <Field label="Læring / erfaringsoverføring"><TextIn multiline rows={2} value={learning} onChangeText={setLearning} placeholder="Hva tar vi med oss videre?" /></Field>
        <Divider />
        <Text style={{ color: colors.muted, fontSize: 12 }}>Er saken feilregistrert eller en dublett? Kanseller den i stedet.</Text>
        <TextIn value={cancelReason} onChangeText={setCancelReason} placeholder="Begrunnelse for kansellering" />
        <Btn small kind="danger" label="Kanseller saken" disabled={cancelReason.trim().length < 5} onPress={() => save('Saken er kansellert', cancelFinding(finding, cancelReason, { actor, caps }))} />
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>

      <RequirementPicker
        visible={sheet === 'reqs'}
        requirements={requirements}
        selected={finding.links?.requirementIds || []}
        onClose={() => setSheet('')}
        onSave={async (ids) => { setSheet(''); await run('Koblinger', updateFindingLinks(finding, { requirementIds: ids }, { actor })); }}
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
