import React, { useState } from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { absencePickerTypes } from '../../src/arbeid/absenceCatalog.js';
import { absenceCategory } from '../../src/arbeid/absenceDashboard.js';
import { useLayout } from '../../src/theme';

const ui = {
  page: '#F4F7FB',
  card: '#FFFFFF',
  ink: '#152033',
  muted: '#8B95A6',
  faint: '#A0A8B8',
  line: '#E6EBF2',
  blue: '#2F6BDB',
  blueSoft: '#E7EEF8',
  track: '#E7EEF6',
  sunken: '#F3F6FA',
  peach: '#FFF4E4',
  danger: '#B42318',
};

const BARS = {
  ferie: '#2F6BDB',
  sykdom: '#E15D6A',
  annet: '#F0A04B',
};

const CHIPS = [
  { id: 'ferie', label: 'Ferie', icon: 'calendar-outline' },
  { id: 'sykdom', label: 'Sykdom', icon: 'heart-outline' },
  { id: 'permisjon', label: 'Permisjon', icon: 'time-outline' },
];

const PRIMARY = new Set(['ferie', 'sykdom', 'permisjon']);

function formatCount(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

function formatPercent(value, total) {
  if (!(Number(total) > 0)) return '0%';
  return `${Math.round(((Number(value) || 0) / Number(total)) * 100)}%`;
}

function moreTypes() {
  const covered = new Set(['ferie']);
  return [
    { id: 'annet', label: 'Annet fravær' },
    ...absencePickerTypes().filter((row) => {
      if (covered.has(row.id)) return false;
      const category = absenceCategory(row.id);
      return category !== 'ferie' && category !== 'sykdom' && category !== 'permisjon';
    }).map((row) => ({ id: row.id, label: row.label })),
  ];
}

function categoryIcon(category) {
  if (category === 'sykdom') return { kind: 'ion', name: 'heart' };
  if (category === 'permisjon') return { kind: 'ion', name: 'time' };
  if (category === 'annet') return { kind: 'ion', name: 'hourglass' };
  if (category && !PRIMARY.has(category)) return { kind: 'ion', name: 'ellipse' };
  return { kind: 'palm' };
}

function usedIcon(category) {
  if (category === 'sykdom') return 'medkit-outline';
  if (category === 'permisjon') return 'people-outline';
  if (category === 'annet') return 'time-outline';
  if (category && !PRIMARY.has(category)) return 'remove-circle-outline';
  return 'airplane-outline';
}

export function CompanyAbsenceView({
  companyName = '',
  companies = [],
  companyId = '',
  onSelectCompany,
  employees = [],
  employeeId = '',
  canChooseEmployee = false,
  onSelectEmployee,
  category = 'ferie',
  onSelectCategory,
  dashboard,
  error = '',
}) {
  const { width } = useLayout();
  const wide = width >= 980;
  const [menu, setMenu] = useState('');
  const [chartWidth, setChartWidth] = useState(150);
  const employeeName = employees.find((row) => row.id === employeeId)?.name || '';
  const focus = dashboard?.focusTitle || 'Ferie';
  const year = dashboard?.year || '';
  const usageTitle = category === 'ferie' ? `Feriebruk ${year}` : `${focus} ${year}`;
  const moreOn = !PRIMARY.has(category);
  const summary = dashboard?.summary || {};
  const allowance = Number(dashboard?.allowance) || 0;
  const hasQuota = !!dashboard?.hasQuota;
  const quota = hasQuota ? allowance : 0;
  const used = Number(summary.used) || 0;
  const remainingVisual = Math.max(0, Math.round((quota - used) * 100) / 100);

  const detailRows = [
    { key: 'earned', label: 'Startsaldo og justeringer', icon: 'calendar-outline' },
    { key: 'used', label: 'Brukte dager totalt', icon: usedIcon(category) },
    { key: 'remaining', label: 'Dager til gode', icon: 'hourglass-outline' },
    { key: 'planned', label: 'Planlagte fraværsdager', icon: 'calendar-outline' },
    { key: 'unplanned', label: 'Dager som ikke er planlagt', icon: 'document-text-outline' },
  ];

  function pickCategory(id) {
    setMenu('');
    onSelectCategory?.(id);
  }

  return (
    <ScrollView
      nativeID="selskap-fravaer"
      style={styles.page}
      contentContainerStyle={styles.pageInner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.frame, wide && styles.frameWide]}>
        <View style={styles.banner}>
          <View style={[styles.bannerCopy, wide && styles.bannerCopyWide]}>
            <View style={styles.bedriftRow}>
              <Text style={styles.bedrift}>Bedrift</Text>
              <TouchableOpacity
                style={styles.pill}
                onPress={() => setMenu(menu === 'company' ? '' : 'company')}
                accessibilityRole="button"
                accessibilityLabel="Velg selskap"
                nativeID="selskap-velger"
              >
                <Text style={styles.pillText} numberOfLines={1}>{companyName.toUpperCase()}</Text>
                <Ionicons name="chevron-down" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text accessibilityRole="header" style={styles.title}>Fraværsoversikt</Text>
            <Text style={styles.lead}>Full oversikt over ferie, fravær og permisjoner for dine ansatte.</Text>
          </View>
          <View style={[styles.blueprint, wide && styles.blueprintWide]} pointerEvents="none">
            <BlueprintMark />
          </View>
        </View>

        {menu === 'company' ? (
          <ChoiceList
            options={companies.map((row) => ({ id: row.id, label: row.name }))}
            selected={companyId}
            onPick={(id) => { setMenu(''); onSelectCompany?.(id); }}
          />
        ) : null}

        <View style={[styles.filterBar, wide && styles.filterBarWide]}>
          <TouchableOpacity
            style={styles.employeeChip}
            onPress={canChooseEmployee ? () => setMenu(menu === 'employee' ? '' : 'employee') : undefined}
            disabled={!canChooseEmployee}
            accessibilityRole="button"
            accessibilityLabel={`Ansatte: ${employeeId ? employeeName : 'Alle ansatte'}`}
            nativeID="ansatt-filter"
          >
            <Ionicons name="people" size={15} color={ui.blue} />
            <Text style={styles.employeeText} numberOfLines={1}>
              {employeeId ? employeeName : 'Alle ansatte'}
            </Text>
            {canChooseEmployee ? <Ionicons name="chevron-down" size={14} color={ui.ink} /> : null}
          </TouchableOpacity>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            style={[styles.chipScroll, !wide && styles.chipScrollPhone]}
          >
            {CHIPS.map((chip) => {
              const on = category === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  onPress={() => pickCategory(chip.id)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  nativeID={`chip-${chip.id}`}
                >
                  <Ionicons name={chip.icon} size={14} color={on ? ui.ink : ui.muted} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => setMenu(menu === 'more' ? '' : 'more')}
              style={[styles.chip, styles.moreChip, moreOn && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel="Flere fraværstyper"
              nativeID="chip-mer"
            >
              <Text style={[styles.chipText, moreOn && styles.chipTextOn]}>{moreOn ? focus : '…'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {menu === 'employee' ? (
          <ChoiceList
            options={[{ id: '', label: 'Alle ansatte' }, ...employees.map((row) => ({ id: row.id, label: row.name }))]}
            selected={employeeId}
            onPick={(id) => { setMenu(''); onSelectEmployee?.(id); }}
          />
        ) : null}
        {menu === 'more' ? (
          <ChoiceList
            options={moreTypes()}
            selected={category}
            onPick={pickCategory}
          />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.kpis, wide && styles.kpisWide]}>
          <Kpi wide={wide} icon="person" tint={ui.blue} bg="#E8F0FE" value={dashboard?.headcount || 0} label="Ansatte" />
          <Kpi wide={wide} icon="calendar" tint="#1F9D55" bg="#E7F8EF" value={dashboard?.onVacation || 0} label="På ferie nå" />
          <Kpi
            wide={wide}
            icon="heart"
            tint="#E15B73"
            bg="#FDECEF"
            value={dashboard?.sickNow || 0}
            label="Sykemeldte nå"
            actionLabel="Se detaljer"
            onAction={() => pickCategory('sykdom')}
            actionId="kpi-sykemeldte"
          />
          <Kpi
            wide={wide}
            icon="time"
            tint="#E09A3E"
            bg="#FFF4E5"
            value={dashboard?.otherNow || 0}
            label="Annet fravær nå"
            actionLabel="Se detaljer"
            onAction={() => pickCategory('annet')}
            actionId="kpi-annet"
          />
        </View>

        <View style={styles.split}>
          <View style={[styles.card, styles.splitCard]}>
            <CardHead icon={categoryIcon(category)} title={usageTitle} />
            <View style={[styles.donutRow, !wide && styles.donutStack]}>
              <QuotaDonut used={used} total={quota} hasQuota={hasQuota} size={wide ? 124 : 112} />
              <View style={[styles.legend, !wide && styles.legendStack]}>
                <LegendRow color={ui.blue} label="Brukte dager" value={formatCount(used)} />
                {hasQuota ? <LegendRow color="#D5DEEA" label="Gjenstående" value={formatCount(remainingVisual)} /> : null}
                {hasQuota ? <LegendRow label="Totalt" value={formatCount(quota)} /> : null}
              </View>
            </View>
          </View>

          <View
            style={[styles.card, styles.splitCard]}
            onLayout={(event) => setChartWidth(Math.max(120, event.nativeEvent.layout.width - 28))}
          >
            <CardHead ion="bar-chart" title="Fravær siste 6 måneder" />
            <MonthChart months={dashboard?.recentMonths || []} width={chartWidth} />
            <View style={styles.chartLegend}>
              <ChartKey color={BARS.ferie} label="Ferie" />
              <ChartKey color={BARS.sykdom} label="Sykdom" />
              <ChartKey color={BARS.annet} label="Annet" />
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.detailCard]} nativeID="fravaer-detalj">
          <CardHead icon={categoryIcon(category)} title={focus} large />
          {detailRows.map((row) => {
            const raw = Number(summary[row.key]) || 0;
            const value = !hasQuota && (row.key === 'remaining' || row.key === 'unplanned')
              ? Math.max(0, raw)
              : raw;
            const peak = Math.max(1, ...detailRows.map((item) => Math.abs(Number(summary[item.key]) || 0)));
            const ratio = quota > 0
              ? Math.min(1, Math.max(0, value / quota))
              : Math.min(1, Math.abs(value) / peak);
            const percentLabel = hasQuota ? formatPercent(value, quota) : (value ? '–' : '0%');
            return (
              <View key={row.key} style={styles.detailRow}>
                <Ionicons name={row.icon} size={16} color="#7E8BA0" />
                <Text style={styles.detailLabel} numberOfLines={2}>{row.label}</Text>
                <Text style={styles.detailValue}>{formatCount(value)}</Text>
                <View style={styles.miniTrack}>
                  <View style={[styles.miniFill, { width: `${ratio * 100}%` }]} />
                </View>
                <Text style={styles.detailPct}>{percentLabel}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function CardHead({ title, icon, ion, large = false }) {
  return (
    <View style={styles.cardHead}>
      {icon?.kind === 'palm' ? (
        <View style={[styles.headIcon, { backgroundColor: ui.peach }]}>
          <MaterialCommunityIcons name="palm-tree" size={large ? 18 : 15} color="#C4A36A" />
        </View>
      ) : (
        <View style={[styles.headIcon, { backgroundColor: ui.blueSoft }]}>
          <Ionicons name={icon?.name || ion || 'bar-chart'} size={large ? 16 : 14} color={ui.blue} />
        </View>
      )}
      <Text style={[styles.cardTitle, large && styles.cardTitleLarge]} numberOfLines={large ? 1 : 2}>{title}</Text>
      <Ionicons name="chevron-forward" size={16} color="#C5CEDA" />
    </View>
  );
}

function QuotaDonut({ used, total, hasQuota, size }) {
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const ratio = hasQuota && total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const dash = c * ratio;
  const center = size / 2;
  const percent = hasQuota && total > 0 ? Math.round((used / total) * 100) : 0;
  return (
    <View style={{ width: size, height: size }} nativeID="feriebruk-donut">
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={ui.track} strokeWidth={stroke} fill="none" />
        {dash > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={ui.blue}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={[styles.donutValue, { fontSize: size < 110 ? 18 : 26 }]}>
          {hasQuota ? `${percent}%` : formatCount(used)}
        </Text>
        <Text style={styles.donutCaption}>
          {hasQuota ? `${formatCount(used)} av ${formatCount(total)}` : 'dager'}
        </Text>
        <Text style={styles.donutCaption}>{hasQuota ? 'dager brukt' : 'registrert'}</Text>
      </View>
    </View>
  );
}

function MonthChart({ months, width }) {
  const plotH = 92;
  const gap = 6;
  const count = Math.max(1, months.length);
  const barW = Math.max(8, (width - 22 - gap * (count - 1)) / count);
  const max = Math.max(1, ...months.map((month) => month.ferie + month.sykdom + month.annet));
  const mid = max > 1 ? Math.round((max / 2) * 10) / 10 : null;
  const ticks = [max, mid, 0].filter((tick, index, list) => tick != null && list.indexOf(tick) === index);
  return (
    <View nativeID="fravaer-maneder">
      <View style={styles.chartPlot}>
        <View style={[styles.yAxis, { height: plotH }]}>
          {ticks.map((tick, index) => (
            <Text key={`${index}-${tick}`} style={styles.yTick}>{formatCount(tick)}</Text>
          ))}
        </View>
        <Svg width={Math.max(40, width - 22)} height={plotH}>
          {months.map((month, index) => {
            const x = index * (barW + gap);
            const parts = [
              ['ferie', month.ferie],
              ['sykdom', month.sykdom],
              ['annet', month.annet],
            ].filter((part) => part[1] > 0);
            let y = plotH;
            return parts.map(([key, value], partIndex) => {
              const h = Math.max(2, (value / max) * (plotH - 4));
              y -= h;
              const top = partIndex === parts.length - 1;
              return (
                <Rect
                  key={`${month.key}-${key}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={h + (top ? 0 : 0.5)}
                  rx={top ? 2 : 0}
                  fill={BARS[key]}
                />
              );
            });
          })}
        </Svg>
      </View>
      <View style={[styles.monthLabels, { marginLeft: 22 }]}>
        {months.map((month) => (
          <Text key={month.key} style={[styles.monthLabel, { width: barW + gap }]}>{month.label}</Text>
        ))}
      </View>
    </View>
  );
}

function LegendRow({ color, label, value }) {
  return (
    <View style={styles.legendRow}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : <View style={styles.dotSpacer} />}
      <Text style={styles.legendLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function ChartKey({ color, label }) {
  return (
    <View style={styles.chartKey}>
      <View style={[styles.keySwatch, { backgroundColor: color }]} />
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
}

function Kpi({ icon, tint, bg, value, label, actionLabel, onAction, actionId, wide = false }) {
  return (
    <View style={[styles.kpi, wide && styles.kpiWide]}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.kpiValue}>{formatCount(value)}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" nativeID={actionId} style={styles.kpiAction}>
          <Text style={styles.kpiActionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={12} color={ui.blue} />
        </TouchableOpacity>
      ) : <View style={styles.kpiActionSpacer} />}
    </View>
  );
}

function ChoiceList({ options, selected, onPick }) {
  return (
    <ScrollView style={styles.choices} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {options.map((option) => (
        <TouchableOpacity key={option.id || 'all'} onPress={() => onPick(option.id)} style={styles.choice}>
          <Text style={[styles.choiceText, option.id === selected && styles.choiceOn]}>{option.label}</Text>
          {option.id === selected ? <Ionicons name="checkmark" size={16} color={ui.blue} /> : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function BlueprintMark() {
  const stroke = 'rgba(255,255,255,0.82)';
  const faint = 'rgba(255,255,255,0.45)';
  return (
    <Svg width="100%" height="100%" viewBox="0 0 230 170">
        <Circle cx="28" cy="24" r="1.4" fill={faint} />
        <Circle cx="54" cy="14" r="1.2" fill={faint} />
        <Circle cx="18" cy="48" r="1.1" fill={faint} />
        <Circle cx="70" cy="36" r="1.3" fill={faint} />
        <Line x1="22" y1="22" x2="52" y2="14" stroke={faint} strokeWidth="0.6" />
        <Line x1="18" y1="46" x2="28" y2="26" stroke={faint} strokeWidth="0.6" />
        <Rect x="36" y="78" width="52" height="78" stroke={stroke} strokeWidth="1.2" fill="none" />
        <Rect x="96" y="46" width="58" height="110" stroke={stroke} strokeWidth="1.3" fill="none" />
        <Rect x="162" y="64" width="40" height="92" stroke={stroke} strokeWidth="1.2" fill="none" />
        {[0, 1, 2, 3].map((col) => [0, 1, 2, 3, 4].map((row) => (
          <Rect
            key={`a-${col}-${row}`}
            x={44 + col * 11}
            y={88 + row * 12}
            width="6"
            height="7"
            stroke={faint}
            strokeWidth="0.7"
            fill="none"
          />
        )))}
        {[0, 1, 2].map((col) => [0, 1, 2, 3, 4, 5].map((row) => (
          <Rect
            key={`b-${col}-${row}`}
            x={106 + col * 14}
            y={56 + row * 14}
            width="8"
            height="8"
            stroke={faint}
            strokeWidth="0.7"
            fill="none"
          />
        )))}
        <Line x1="188" y1="150" x2="188" y2="28" stroke={stroke} strokeWidth="1.4" />
        <Line x1="188" y1="34" x2="228" y2="34" stroke={stroke} strokeWidth="1.4" />
        <Line x1="188" y1="34" x2="168" y2="48" stroke={stroke} strokeWidth="1.1" />
        <Line x1="214" y1="34" x2="214" y2="58" stroke={faint} strokeWidth="0.8" />
        <Line x1="210" y1="58" x2="218" y2="58" stroke={stroke} strokeWidth="1.1" />
        <Rect x="176" y="18" width="10" height="12" stroke={stroke} strokeWidth="1" fill="none" />
    </Svg>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: '0 8px 24px rgba(20, 36, 64, 0.06)' },
  default: {
    shadowColor: '#142840',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.page },
  pageInner: { paddingBottom: 28 },
  frame: { width: '100%', maxWidth: 1080, alignSelf: 'center', gap: 12 },
  frameWide: { paddingBottom: 8 },
  banner: {
    backgroundColor: '#0C3F78',
    backgroundImage: 'linear-gradient(105deg, #0A3568 0%, #124E8C 58%, #1B6AAB 100%)',
    minHeight: 168,
    paddingTop: 16,
    paddingBottom: 36,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  bannerCopy: { width: '100%', paddingRight: 108, gap: 8, zIndex: 1 },
  bannerCopyWide: { maxWidth: 640, paddingRight: 240 },
  bedriftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bedrift: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 180,
    backgroundColor: 'rgba(8, 28, 58, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  title: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6 },
  lead: { color: 'rgba(255,255,255,0.88)', fontSize: 13.5, lineHeight: 18 },
  blueprint: { position: 'absolute', right: -4, bottom: 6, width: 168, height: 132 },
  blueprintWide: { width: 250, height: 168, right: 12, bottom: 0 },
  filterBar: {
    ...cardShadow,
    marginTop: -28,
    marginHorizontal: 12,
    backgroundColor: ui.card,
    borderRadius: 18,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 4,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 2,
    zIndex: 2,
  },
  filterBarWide: { flexDirection: 'row', alignItems: 'center' },
  employeeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  employeeText: { color: ui.ink, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  chipScroll: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  chipScrollPhone: { flexGrow: 0 },
  chipRow: { alignItems: 'center', gap: 2, paddingRight: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 999,
  },
  chipOn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E6EDF5',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(20, 36, 64, 0.08)' } : null),
  },
  chipText: { color: ui.muted, fontSize: 12.5, fontWeight: '600' },
  chipTextOn: { color: ui.ink, fontWeight: '700' },
  moreChip: { paddingHorizontal: 12 },
  choices: {
    ...cardShadow,
    marginHorizontal: 12,
    backgroundColor: ui.card,
    borderRadius: 16,
    maxHeight: 280,
    paddingVertical: 4,
  },
  choice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  choiceText: { color: ui.ink, fontSize: 14, flex: 1 },
  choiceOn: { color: ui.blue, fontWeight: '700' },
  error: { color: ui.danger, fontSize: 13, paddingHorizontal: 16 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12 },
  kpisWide: { flexWrap: 'nowrap' },
  kpi: {
    ...cardShadow,
    backgroundColor: ui.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '46%',
    minWidth: 140,
    gap: 2,
  },
  kpiWide: { flexBasis: 0, minWidth: 0 },
  kpiIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  kpiValue: { color: ui.ink, fontSize: 28, lineHeight: 32, fontWeight: '800' },
  kpiLabel: { color: ui.muted, fontSize: 13 },
  kpiAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  kpiActionText: { color: ui.blue, fontSize: 12.5, fontWeight: '700' },
  kpiActionSpacer: { height: 18 },
  split: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, alignItems: 'stretch' },
  splitCard: { flex: 1, minWidth: 0, gap: 8 },
  card: { ...cardShadow, backgroundColor: ui.card, borderRadius: 18, padding: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, color: ui.ink, fontSize: 13, lineHeight: 16, fontWeight: '800' },
  cardTitleLarge: { fontSize: 18 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  donutStack: { flexDirection: 'column', alignItems: 'center' },
  legendStack: { width: '100%', marginTop: 4 },
  donutCenter: {
    position: 'absolute', left: 8, right: 8, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  donutValue: { color: ui.ink, fontWeight: '800', lineHeight: 24 },
  donutCaption: { color: ui.muted, fontSize: 9, lineHeight: 12, textAlign: 'center' },
  legend: { flex: 1, gap: 6, minWidth: 0 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotSpacer: { width: 8 },
  legendLabel: { flex: 1, color: ui.muted, fontSize: 11 },
  legendValue: { color: ui.ink, fontSize: 12, fontWeight: '800' },
  chartPlot: { flexDirection: 'row', alignItems: 'flex-end' },
  yAxis: { width: 22, justifyContent: 'space-between' },
  yTick: { color: ui.faint, fontSize: 9 },
  monthLabels: { flexDirection: 'row', marginTop: 4 },
  monthLabel: { color: ui.muted, fontSize: 10 },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 },
  chartKey: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  keySwatch: { width: 8, height: 8, borderRadius: 2 },
  keyText: { color: ui.ink, fontSize: 11 },
  detailCard: { marginHorizontal: 12, paddingBottom: 6, gap: 2 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: ui.line,
  },
  detailLabel: { flex: 1, color: '#5E6B80', fontSize: 13, lineHeight: 17 },
  detailValue: { color: ui.ink, fontWeight: '800', fontSize: 14, minWidth: 28, textAlign: 'right' },
  miniTrack: { width: 64, height: 6, borderRadius: 99, backgroundColor: ui.track, overflow: 'hidden' },
  miniFill: { height: 6, borderRadius: 99, backgroundColor: ui.blue },
  detailPct: { width: 40, textAlign: 'right', color: ui.muted, fontSize: 12, fontWeight: '700' },
});
