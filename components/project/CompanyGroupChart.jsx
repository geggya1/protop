import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buildGroupChart, stakesFromInvestments } from '../../src/project/groupChart';
import { loadEntityFigures, loadGroupSources, mapPool } from '../../src/project/groupChartData';
import { digitsOrgnr } from '../../src/project/companyRegistry';
import { departmentsOf } from '../../src/project/companyUnits';

function openUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return;
  Linking.openURL(raw).catch(() => {});
}

function Mark({ name, colors, iconColor }) {
  return (
    <View style={[styles.mark, { backgroundColor: colors.brandSoft }]}>
      <Ionicons name={name} size={18} color={iconColor || colors.brand} />
    </View>
  );
}

function Delta({ change, colors }) {
  if (!change) return <View style={styles.deltaSlot} />;
  const tint = change.direction === 'up'
    ? colors.success
    : change.direction === 'down'
      ? colors.danger
      : colors.muted;
  const icon = change.direction === 'down' ? 'arrow-down' : change.direction === 'up' ? 'arrow-up' : 'remove';
  return (
    <View style={styles.delta}>
      {change.direction === 'flat' ? null : <Ionicons name={icon} size={11} color={tint} />}
      <Text style={[styles.deltaText, { color: tint }]}>{change.text}</Text>
    </View>
  );
}

function Metric({ icon, iconColor, label, value, delta, colors }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabel}>
        <Ionicons name={icon} size={13} color={iconColor} />
        <Text style={[styles.metricName, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: colors.ink }]} numberOfLines={1}>{value}</Text>
      <Delta change={delta} colors={colors} />
    </View>
  );
}

function millionsLabel(value, fallback) {
  if (fallback === '…' || fallback === '–') return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  const sign = amount < 0 ? '−' : '';
  const formatted = new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(amount) / 1_000_000);
  return `${sign}${formatted}\u00a0MNOK`;
}

function Metrics({ node, colors, compact = false, tight = false }) {
  const revenue = compact ? millionsLabel(node.revenue, node.revenueLabel) : node.revenueLabel;
  const result = compact ? millionsLabel(node.result, node.resultLabel) : node.resultLabel;
  return (
    <View style={[styles.metrics, tight && styles.metricsTight]}>
      <Metric icon="stats-chart" iconColor={colors.brand} label="Inntekt" value={revenue} delta={node.revenueDelta} colors={colors} />
      {tight ? null : <View style={[styles.metricRule, { backgroundColor: colors.line }]} />}
      <Metric icon="people" iconColor={colors.success} label="Ansatte" value={node.employeesLabel} delta={null} colors={colors} />
      {tight ? null : <View style={[styles.metricRule, { backgroundColor: colors.line }]} />}
      <Metric icon="cash" iconColor={colors.brand} label="Resultat" value={result} delta={node.resultDelta} colors={colors} />
    </View>
  );
}

function connectorColor(colors) {
  const line = String(colors?.line || '').toLowerCase();
  if (line.startsWith('#e') || line.startsWith('#f')) return '#6f849c';
  return colors?.muted || '#8e8e93';
}

function Stem({ color, height = 22 }) {
  return <View style={[styles.stem, { height, backgroundColor: color, pointerEvents: 'none' }]} />;
}

function OwnershipPill({ label, colors }) {
  if (!label) return null;
  return (
    <View style={[styles.pill, { backgroundColor: colors.card, borderColor: connectorColor(colors) }]}>
      <Text style={[styles.pillText, { color: colors.ink }]}>{label}</Text>
    </View>
  );
}

function CompanyCard({ node, colors, onPress, compact = false, tight = false }) {
  const meta = [node.organisasjonsnummer, node.role, ...(node.flags || [])].filter(Boolean).join(' · ');
  return (
    <Pressable
      nativeID={`group-company-${node.organisasjonsnummer || 'ukjent'}`}
      accessibilityRole="button"
      accessibilityLabel={`Åpne ${node.navn}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        tight && styles.cardTight,
        { backgroundColor: colors.card, borderColor: colors.line, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View style={styles.cardHead}>
        {tight ? null : <Mark name="business" colors={colors} />}
        <View style={styles.cardTitle}>
          <Text style={[styles.name, compact && styles.nameCompact, tight && styles.nameTight, { color: colors.ink }]} numberOfLines={2}>{node.navn}</Text>
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={2}>{meta}</Text>
        </View>
        {tight ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
      </View>
      <View style={[styles.rule, { backgroundColor: colors.line }]} />
      <Metrics node={node} colors={colors} compact={compact} tight={tight} />
    </Pressable>
  );
}

function Fork({ children, colors, tight = false }) {
  const count = children.length;
  const stroke = connectorColor(colors);
  if (!count) return null;
  if (count === 1) {
    return (
      <View nativeID="company-group-fork" style={styles.singleFork}>
        <Stem color={stroke} />
        {children[0].pill}
        <Stem color={stroke} height={16} />
        <View style={styles.singleCard}>{children[0].card}</View>
      </View>
    );
  }
  const inset = `${50 / count}%`;
  return (
    <View nativeID="company-group-fork" style={styles.fork}>
      <Stem color={stroke} />
      <View style={styles.forkRow}>
        <View style={[styles.bar, { backgroundColor: stroke, left: inset, right: inset }]} />
        {children.map((child) => (
          <View key={child.key} style={styles.forkCol}>
            <View style={[styles.armJoint, { backgroundColor: stroke }]} />
            {child.pill}
            <Stem color={stroke} height={16} />
            <View style={[styles.forkCard, tight && styles.forkCardTight]}>{child.card}</View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Rail({ children, colors }) {
  const stroke = connectorColor(colors);
  return (
    <View nativeID="company-group-fork" style={styles.rail}>
      <Stem color={stroke} />
      {children.map((child, index) => (
        <View key={child.key} style={styles.railRow}>
          <View style={styles.railTrack}>
            <View style={[styles.railSpine, {
              backgroundColor: stroke,
              bottom: index === children.length - 1 ? undefined : 0,
              height: index === children.length - 1 ? 16 : undefined,
            }]} />
            <View style={[styles.railBranch, { backgroundColor: stroke }]} />
          </View>
          <View style={styles.railBody}>
            {child.pill}
            {child.card}
          </View>
        </View>
      ))}
    </View>
  );
}

export function GroupYearButton({
  years = [],
  year = null,
  open = false,
  colors,
  onToggle,
  onSelect,
}) {
  if (!years.length) return null;
  const current = years.find((row) => row.year === year) || years[0];
  return (
    <View style={styles.yearControl}>
      <Pressable
        nativeID="company-group-year"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Velg regnskapsår"
        onPress={onToggle}
        style={[styles.yearButton, { backgroundColor: colors.brand }]}
      >
        <Ionicons name="calendar-outline" size={16} color="#fff" />
        <Text style={styles.yearButtonText} numberOfLines={1}>{current?.label || 'Regnskapsår'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#fff" />
      </Pressable>
      {open ? (
        <View style={[styles.yearMenu, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {years.map((row) => (
            <Pressable
              key={row.year}
              accessibilityRole="button"
              onPress={() => onSelect?.(row.year)}
              style={[styles.yearOption, { borderTopColor: colors.line }]}
            >
              <Text style={{ color: row.year === (year ?? years[0]?.year) ? colors.brand : colors.ink, fontSize: 14, fontWeight: '600' }}>
                {row.menu}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function CompanyGroupChart({
  company,
  settings,
  colors,
  companyIdFor,
  onOpenCompany,
  year = null,
  onYearChange,
  onYears,
}) {
  const { width } = useWindowDimensions();
  const orgnr = digitsOrgnr(company?.organisasjonsnummer);
  const [sources, setSources] = useState(null);
  const [bundles, setBundles] = useState({});
  const [loading, setLoading] = useState(false);
  const inflight = useRef(new Set());
  const done = useRef(new Set());

  useEffect(() => {
    inflight.current = new Set();
    done.current = new Set();
    setBundles({});
    onYearChange?.(null);
    if (orgnr.length !== 9) {
      setSources(null);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    loadGroupSources(orgnr, { signal: controller.signal })
      .then((data) => {
        if (alive) setSources(data);
      })
      .catch((err) => {
        if (!alive || err?.name === 'AbortError') return;
        setSources({
          orgnr,
          entity: null,
          unitPayload: null,
          accountPayload: null,
          investmentRows: null,
          investorRows: null,
          sharesByYear: null,
          warnings: ['Offentlige registre kunne ikke hentes.'],
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [orgnr]);

  useEffect(() => {
    if (!Array.isArray(sources?.investmentRows) || sources.orgnr !== orgnr || orgnr.length !== 9) return undefined;
    const wanted = stakesFromInvestments(sources.investmentRows, { ownerOrgnr: orgnr })
      .filter((row) => row.percent >= 1)
      .slice(0, 12)
      .filter((row) => !done.current.has(row.organisasjonsnummer) && !inflight.current.has(row.organisasjonsnummer));
    if (!wanted.length) return undefined;
    let alive = true;
    wanted.forEach((row) => inflight.current.add(row.organisasjonsnummer));
    mapPool(wanted, 4, (row) => loadEntityFigures(row.organisasjonsnummer).catch(() => null))
      .then((loaded) => {
        if (!alive) return;
        wanted.forEach((row) => done.current.add(row.organisasjonsnummer));
        setBundles((prev) => {
          const next = { ...prev };
          loaded.forEach((row) => {
            if (row?.organisasjonsnummer) next[row.organisasjonsnummer] = row;
          });
          return next;
        });
      })
      .finally(() => {
        wanted.forEach((row) => inflight.current.delete(row.organisasjonsnummer));
      });
    return () => {
      alive = false;
    };
  }, [sources, orgnr]);

  const model = useMemo(() => buildGroupChart({
    fallbackName: company?.navn,
    fallbackOrgnr: orgnr,
    entity: sources?.entity,
    unitPayload: sources?.unitPayload,
    accountPayload: sources?.accountPayload,
    investmentRows: sources ? sources.investmentRows : null,
    investorRows: sources?.investorRows,
    sharesByYear: sources?.sharesByYear,
    childBundles: Object.values(bundles),
    year,
    settings: { ...settings, showUnits: false },
  }), [company?.navn, orgnr, sources, bundles, year, settings]);

  useEffect(() => {
    onYears?.(model.years);
  }, [model.years, onYears]);

  function openNode(node) {
    const linked = companyIdFor?.(node.organisasjonsnummer);
    if (linked && onOpenCompany) {
      onOpenCompany(linked);
      return;
    }
    openUrl(node.brregUrl);
  }

  const tight = width < 760;
  const useFork = model.children.length > 0 && model.children.length <= 3;
  const departmentCount = departmentsOf(company?.subUnits).length;
  const warnings = sources?.warnings || [];

  const nodes = model.children.map((child) => ({
    key: child.organisasjonsnummer,
    pill: <OwnershipPill label={child.ownershipLabel} colors={colors} />,
    card: <CompanyCard node={child} colors={colors} compact tight={tight && useFork && model.children.length > 1} onPress={() => openNode(child)} />,
  }));

  return (
    <View nativeID="company-group-chart" style={styles.block}>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.brand} />
          <Text style={[styles.note, { color: colors.muted }]}>Henter nøkkeltall fra offentlige registre…</Text>
        </View>
      ) : null}
      {warnings.map((line) => (
        <Text key={line} style={[styles.note, { color: colors.danger }]}>{line}</Text>
      ))}
      {model.owner ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Eid av ${model.owner.navn}`}
          onPress={() => openUrl(`https://virksomhet.brreg.no/nb/oppslag/enheter/${model.owner.organisasjonsnummer}`)}
          style={[styles.owner, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <Ionicons name="git-network-outline" size={16} color={colors.brand} />
          <Text style={[styles.ownerText, { color: colors.ink }]}>
            Eid {model.owner.ownershipLabel} av {model.owner.navn}
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.muted} />
        </Pressable>
      ) : null}

      <View nativeID="company-group-totals" style={styles.summary}>
        <Text accessibilityRole="header" style={[styles.summaryName, { color: colors.ink }]}>
          {model.totals.label}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>{model.totals.countLabel}</Text>
        <Text style={[styles.sourceInline, { color: colors.muted }]}>{model.totals.source}</Text>
        <Metrics node={model.totals} colors={colors} />
      </View>

      <View style={styles.tree}>
        <CompanyCard node={model.parent} colors={colors} onPress={() => openNode(model.parent)} />
        {useFork ? <Fork colors={colors} tight={tight}>{nodes}</Fork> : null}
        {!useFork && model.children.length ? <Rail colors={colors}>{nodes}</Rail> : null}
      </View>

      {!loading && model.emptyOwnership ? (
        <Text style={[styles.note, { color: colors.muted }]}>{model.emptyOwnership}</Text>
      ) : null}
      {!model.ownershipKnown && !loading && orgnr.length === 9 ? (
        <Text style={[styles.note, { color: colors.muted }]}>
          Eierandeler fra Aksjonærregisteret kunne ikke hentes nå.
        </Text>
      ) : null}

      {departmentCount ? (
        <Text style={[styles.note, { color: colors.muted }]}>
          {departmentCount === 1
            ? '1 avdeling administreres under tannhjulet.'
            : `${departmentCount} avdelinger administreres under tannhjulet.`}
        </Text>
      ) : null}
      <Text style={[styles.sources, { color: colors.muted }]}>
        Inntekt og resultat er fra Regnskapsregisteret. Ansatte er fra Enhetsregisteret.
        Eierandeler er fra Aksjonærregisteret per 31. desember. Ansatte har ikke årstall i registeret og vises som dagens tall.
      </Text>
    </View>
  );
}

const cardShadow = Platform.OS === 'web'
  ? { boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' }
  : {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  };

const styles = StyleSheet.create({
  block: { gap: 12, width: '100%' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { fontSize: 13, lineHeight: 18 },
  sources: { fontSize: 12, lineHeight: 17 },
  owner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...cardShadow,
  },
  ownerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    ...cardShadow,
  },
  cardCompact: { padding: 12, gap: 10 },
  cardTight: { padding: 10, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, minWidth: 0, gap: 2 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2 },
  nameCompact: { fontSize: 14 },
  nameTight: { fontSize: 13 },
  unitName: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 16 },
  rule: { height: 1, marginHorizontal: -2 },
  metrics: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metricsTight: { flexDirection: 'column', gap: 8 },
  metric: { flex: 1, minWidth: 0, gap: 2 },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricName: { fontSize: 11, flexShrink: 1 },
  metricValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : null),
  },
  metricRule: { width: 1, alignSelf: 'stretch' },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 14 },
  deltaSlot: { minHeight: 14 },
  deltaText: { fontSize: 11, fontWeight: '600' },
  tree: { width: '100%', gap: 0 },
  fork: { alignItems: 'center', width: '100%' },
  forkRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%', position: 'relative' },
  forkCol: { flex: 1, minWidth: 0, alignItems: 'center', zIndex: 1 },
  bar: { position: 'absolute', top: 0, height: 2, zIndex: 0 },
  armJoint: { width: 2, height: 20 },
  stem: { width: 2, height: 22, alignSelf: 'center' },
  rail: { width: '100%' },
  railRow: { flexDirection: 'row', alignItems: 'stretch' },
  railTrack: { width: 28, position: 'relative' },
  railSpine: { position: 'absolute', top: 0, left: 13, width: 2 },
  railBranch: { position: 'absolute', top: 16, left: 13, right: 0, height: 2 },
  railBody: { flex: 1, minWidth: 0, gap: 6, paddingBottom: 12, alignItems: 'flex-start' },
  forkCard: { width: '100%', paddingHorizontal: 8 },
  forkCardTight: { paddingHorizontal: 4 },
  singleFork: { alignItems: 'center', width: '100%' },
  singleCard: { width: '100%', maxWidth: 460 },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: -8,
    zIndex: 1,
    alignSelf: 'center',
  },
  pillText: { fontSize: 12, fontWeight: '500' },
  stack: { width: '100%', gap: 0 },
  stackItem: { width: '100%', alignItems: 'stretch' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '100%', gap: 6, alignItems: 'center' },
  gridItemWide: { width: '31%', flexGrow: 1, minWidth: 220 },
  units: { width: '100%', alignItems: 'center' },
  unitWrap: { width: '100%', alignItems: 'center' },
  unit: {
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...cardShadow,
  },
  unitSide: { fontSize: 12, maxWidth: 110, textAlign: 'right' },
  summary: { width: '100%', gap: 4 },
  summaryName: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  yearControl: { position: 'relative', zIndex: 4, maxWidth: 220 },
  yearButton: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yearButtonText: { color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  yearMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 180,
  },
  yearInline: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalsCard: { flex: 1, minWidth: 0 },
  yearCard: { width: 148, padding: 0, overflow: 'hidden' },
  yearBtn: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearLabel: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 17 },
  yearOption: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  sourceInline: { fontSize: 11, lineHeight: 15 },
});
