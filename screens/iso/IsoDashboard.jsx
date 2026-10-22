import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { prettyDate } from '../../src/iso/core';
import { STANDARDS } from '../../src/iso/catalog';
import { visibleFindings } from '../../src/iso/access';
import {
  closedWithinDeadline, findingFunnel, findingTrend, kpis, requirementStatusDistribution, riskMatrixData, upcomingActivities,
} from '../../src/iso/analytics';
import { openActions } from '../../src/iso/findings';
import {
  actionsDoneInTasks, contractReviewStatus, hrComplianceForIso, legacyProjectCases, mileageSeries, projectQuality, readinessChecklist, sickLeaveSeries,
} from '../../src/iso/integrations';
import { RiskMatrix, StatusDonut, TrendBars, HBars } from './isoCharts';
import { Banner, Btn, Card, Choice, Empty, ListRow, Page, Pill, Row } from './isoUi';

export default function IsoDashboard({ ctx }) {
  const colors = useColors();
  const { state, caps, people, wide, go, actor, sources = {}, store } = ctx;
  const [months, setMonths] = useState('6');
  const [riskView, setRiskView] = useState('inherent');
  const [info, setInfo] = useState('');
  const findings = useMemo(() => visibleFindings(caps, state.findings), [caps, state.findings]);
  const cards = useMemo(() => kpis(state, caps, { people }), [state, caps, people]);
  const trend = useMemo(() => findingTrend(findings, { months: Number(months) }), [findings, months]);
  const dist = useMemo(() => requirementStatusDistribution(state), [state]);
  const risk = useMemo(() => riskMatrixData(state, riskView), [state, riskView]);
  const funnel = useMemo(() => findingFunnel(findings), [findings]);
  const onTime = useMemo(() => closedWithinDeadline(findings), [findings]);
  const upcoming = useMemo(() => upcomingActivities(state, caps), [state, caps]);
  const mine = useMemo(() => openActions(findings).filter((a) => a.ownerUid && a.ownerUid === actor.uid), [findings, actor.uid]);
  const active = (state.instances || []).filter((i) => i.state === 'aktiv');
  const ready = useMemo(() => readinessChecklist(state, { people }), [state, people]);
  const insights = useMemo(() => {
    if (!caps.manage) return [];
    const out = [];
    const doneInTasks = actionsDoneInTasks(findings, store?.tasks);
    if (doneInTasks.length) out.push({ key: 'tasks', icon: 'checkmark-done-outline', tone: 'info', title: `${doneInTasks.length} tiltak er ferdig i Oppgaver`, text: 'Kontroller og meld dem utført i saken.', page: 'avvik', params: { ids: doneInTasks.map((a) => a.findingId), label: 'Ferdig i Oppgaver' } });
    const legacy = legacyProjectCases(sources.projectState, state.findings);
    if (legacy.length) out.push({ key: 'legacy', icon: 'briefcase-outline', tone: 'warn', title: `${legacy.length} avvik/RUH i Prosjekt er ikke behandlet i ISO`, text: 'Ta dem inn med ett trykk – uten ny registrering.', page: 'avvik' });
    const pq = projectQuality(sources.projects, state, findings).filter((r) => !r.plan);
    if (pq.length) out.push({ key: 'plans', icon: 'document-attach-outline', tone: 'warn', title: `${pq.length} aktive prosjekter mangler kvalitetsplan`, text: 'Planen fylles ut fra prosjekt og kontrakt.', page: 'prosjekt' });
    const cr = contractReviewStatus(sources.contracts, state.submissions).missing;
    if (cr.length) out.push({ key: 'contracts', icon: 'reader-outline', tone: 'warn', title: `${cr.length} kontrakter uten kontraktsgjennomgang`, text: 'Fra Kontrakt / avtale (krav 8.2).', page: 'prosjekt' });
    const hr = sources.hrOverview ? hrComplianceForIso(sources.hrOverview, people) : null;
    if (hr?.awarenessGaps.length) out.push({ key: 'hr', icon: 'school-outline', tone: 'warn', title: `${hr.awarenessGaps.length} ansatte mangler HMS-introduksjon eller avviksrutine`, text: 'Fra HR-sjekklisten (krav 7.3).', page: 'kompetanse' });
    const km = mileageSeries(sources.trips);
    if (km.totalKm) out.push({ key: 'km', icon: 'car-outline', tone: 'muted', title: `${km.totalKm.toLocaleString('nb-NO')} km kjørt siste 12 mnd`, text: km.electricShare == null ? 'Fra Kjørebok.' : `${km.electricShare} % med elbil. Fra Kjørebok.`, page: 'miljo' });
    const sick = sickLeaveSeries(sources.absences);
    if (sick.hasData) out.push({ key: 'sick', icon: 'pulse-outline', tone: 'muted', title: `${sick.totalDays} dagsverk sykefravær siste 12 mnd`, text: 'Fra Fravær, uten navn.', page: 'hms' });
    return out;
  }, [caps.manage, findings, store?.tasks, sources, state, people]);

  const standards = STANDARDS.filter((s) => state.system.standards.includes(s.code));

  return (
    <Page
      wide={wide}
      title="Oversikt"
      intro={`${state.system.name || 'Ledelsessystem'} · ${standards.map((s) => s.label).join(' · ') || 'Ingen standarder aktivert'}`}
      actions={(
        <>
          <Btn kind="primary" icon="add" label="Meld avvik" onPress={() => go('avvik', { create: true })} />
          {caps.manage ? <Btn icon="git-network-outline" label="Prosessbygger" onPress={() => go('prosesser')} /> : null}
          {caps.manage ? <Btn icon="warning-outline" label="Ny risikovurdering" onPress={() => go('risiko', { create: true })} /> : null}
        </>
      )}
    >
      <Banner tone="info" text="Statusene her er interne vurderinger av eget ledelsessystem. De er ikke en sertifisering eller bekreftet lovetterlevelse." />

      {caps.manage && ready.done < ready.total ? (
        <Card title={`Neste steg · ${ready.done} av ${ready.total} på plass`} subtitle={ready.method}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.sunken }}>
            <View style={{ width: `${Math.round((ready.done / ready.total) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: colors.brand }} />
          </View>
          {ready.items.filter((i) => !i.done).slice(0, 4).map((i) => (
            <ListRow key={i.key} icon="ellipse-outline" title={i.label} onPress={() => go(i.page)} right={<Ionicons name="chevron-forward" size={16} color={colors.muted} />} />
          ))}
        </Card>
      ) : null}

      {insights.length ? (
        <Card title="Fra resten av ProTop" subtitle="Hentet fra Prosjekt, Kontrakt, HR, Kjørebok, Fravær og Oppgaver. Eies fortsatt av modulene.">
          {insights.map((x) => <ListRow key={x.key} icon={x.icon} tone={x.tone} title={x.title} subtitle={x.text} onPress={() => go(x.page, x.params || {})} />)}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {cards.map((k) => (
          <TouchableOpacity
            key={k.key}
            onPress={() => go(k.target.page, k.target.filter || {})}
            onLongPress={() => setInfo(k.key === info ? '' : k.key)}
            accessibilityRole="button"
            accessibilityLabel={`${k.label}: ${k.value ?? 'ingen datagrunnlag'}`}
            style={{ flexGrow: 1, flexBasis: wide ? 180 : 150, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6 }}
          >
            <Text style={{ color: colors.muted, fontSize: 13 }}>{k.label}</Text>
            <Text style={{ color: k.tone === 'danger' && k.value ? colors.danger : colors.ink, fontSize: 28, fontWeight: '700' }}>{k.value == null ? '–' : k.value}</Text>
            <TouchableOpacity onPress={() => setInfo(k.key === info ? '' : k.key)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="information-circle-outline" size={13} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 11 }}>Grunnlag</Text>
            </TouchableOpacity>
            {info === k.key ? <Text style={{ color: colors.muted, fontSize: 12 }}>{k.method}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <Card style={{ flex: 3 }} title="Nye og lukkede avvik" right={<Choice small options={[{ id: '6', label: '6 mnd' }, { id: '12', label: '12 mnd' }]} value={months} onChange={(v) => setMonths(v || '6')} />}>
          <TrendBars rows={trend} onPick={(p) => go('avvik', { ids: p.ids, label: p.label })} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Lukket innen frist: {onTime.pct == null ? 'ingen datagrunnlag' : `${onTime.pct} % (${onTime.numerator}/${onTime.denominator})`}{onTime.excluded ? ` · ${onTime.excluded} uten frist er holdt utenfor` : ''}
          </Text>
        </Card>
        <Card style={{ flex: 2 }} title="Intern vurderingsstatus – krav">
          <StatusDonut data={dist} onPick={(s) => go('krav', { status: s.id })} />
        </Card>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <Card style={{ flex: 3 }} title="Risikobilde" right={<Choice small options={[{ id: 'inherent', label: 'Iboende' }, { id: 'residual', label: 'Rest' }]} value={riskView} onChange={(v) => setRiskView(v || 'inherent')} />}>
          <RiskMatrix cells={risk} method={`Metode: ${state.system.riskMethod?.name || ''} v${state.system.riskMethod?.version || ''}.`} onPick={(p) => go('risiko', { ids: p.ids, label: p.label })} />
        </Card>
        <Card style={{ flex: 2 }} title="Avvik etter fase">
          <HBars rows={funnel} onPick={(r) => go('avvik', { ids: r.ids, label: r.label })} empty="Ingen åpne saker." />
        </Card>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <Card style={{ flex: 1 }} title="Mine oppgaver" subtitle="Tiltak og aktive prosesstrinn">
          {!mine.length && !active.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen åpne oppgaver på deg.</Text> : null}
          {mine.slice(0, 6).map((a) => (
            <ListRow key={a.id} icon="checkbox-outline" title={a.title} subtitle={`${a.findingNumber} · frist ${prettyDate(a.dueAt)}`} onPress={() => go('avvik', { open: a.findingId })} />
          ))}
          {active.slice(0, 6).map((i) => (
            <ListRow key={i.id} icon="git-network-outline" title={i.title} subtitle={`${i.processTitle} v${i.version} · ${i.active.length} aktive trinn`} onPress={() => go('prosesser', { instance: i.id })} />
          ))}
        </Card>
        <Card style={{ flex: 1 }} title="Kommende aktiviteter">
          {!upcoming.length ? <Empty icon="calendar-outline" title="Ingen planlagte aktiviteter" text="Planlegg internrevisjoner, dokumentgjennomganger og øvelser, så vises de her." /> : null}
          {upcoming.map((u) => (
            <ListRow key={`${u.page}${u.id}${u.date}`} icon="calendar-outline" title={u.label} subtitle={prettyDate(u.date)} onPress={() => go(u.page, { open: u.id })} />
          ))}
        </Card>
      </View>

      {!standards.length ? (
        <Empty
          icon="shield-checkmark-outline"
          title="Ledelsessystemet er ikke satt opp"
          text="Velg standarder, omfang og roller under Innstillinger. Det legges ikke inn eksempeldata."
          action={caps.admin ? <Btn kind="primary" label="Sett opp" onPress={() => go('innstillinger')} /> : null}
        />
      ) : (
        <Row>
          {standards.map((s) => <Pill key={s.code} label={s.label} tone="info" icon="ribbon-outline" />)}
        </Row>
      )}
    </Page>
  );
}
