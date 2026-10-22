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
import { RiskMatrix, StatusDonut, TrendBars, HBars } from './isoCharts';
import { Banner, Btn, Card, Choice, Empty, ListRow, Page, Pill, Row } from './isoUi';

export default function IsoDashboard({ ctx }) {
  const colors = useColors();
  const { state, caps, people, wide, go, actor } = ctx;
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

  const standards = STANDARDS.filter((s) => state.system.standards.includes(s.code));

  return (
    <Page
      wide={wide}
      crumb={['Oversikt']}
      title="ISO / K-HMS"
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
