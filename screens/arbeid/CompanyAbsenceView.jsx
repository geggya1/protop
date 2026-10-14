import React, { useMemo, useRef, useState } from 'react';
import {
  Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { absencePickerTypes } from '../../src/arbeid/absenceCatalog.js';
import { absenceCategory } from '../../src/arbeid/absenceDashboard.js';
import { useShellPageHero } from '../../src/hooks/useShellPageHero.js';
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
  navy: '#0C3F78',
  pill: '#102848',
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

function rosterKey(rows) {
  return rows.map((row) => `${row.id}\t${row.name}`).join('\n');
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
  const { width, isDesktop } = useLayout();
  const wide = width >= 980;
  const [menu, setMenu] = useState('');
  const [chartWidth, setChartWidth] = useState(150);
  const actions = useRef({});
  actions.current = { onSelectCompany, onSelectEmployee, onSelectCategory, setMenu };

  const employeeName = employees.find((row) => row.id === employeeId)?.name || '';
  const focus = dashboard?.focusTitle || 'Ferie';
  const year = dashboard?.year || '';
  const usageTitle = category === 'ferie' ? `Feriebruk ${year}` : `${focus} ${year}`;
  const inChrome = !isDesktop;
  const companyKey = rosterKey(companies);
  const employeeKey = rosterKey(employees);

  const heading = useMemo(() => (
    <AbsenceHeading
      chrome={inChrome}
      wide={wide}
      companyName={companyName}
      companies={companies}
      companyId={companyId}
      employees={employees}
      employeeId={employeeId}
      employeeName={employeeName}
      canChooseEmployee={canChooseEmployee}
      category={category}
      menu={menu}
      error={error}
      focus={focus}
      onToggle={(name) => {
        actions.current.setMenu((current) => (current === name ? '' : name));
      }}
      onPickCompany={(id) => {
        actions.current.setMenu('');
        actions.current.onSelectCompany?.(id);
      }}
      onPickEmployee={(id) => {
        actions.current.setMenu('');
        actions.current.onSelectEmployee?.(id);
      }}
      onPickCategory={(id) => {
        actions.current.setMenu('');
        actions.current.onSelectCategory?.(id);
      }}
    />
  ), [
    inChrome, wide, companyName, companyKey, companyId, employeeKey, employeeId,
    employeeName, canChooseEmployee, category, menu, error, focus,
  ]);

  useShellPageHero(inChrome ? heading : null, { active: inChrome });

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
      {inChrome ? null : heading}
      <View style={[styles.frame, wide && styles.frameWide]}>
        <View style={styles.kpis}>
          <Kpi icon="person" tint={ui.blue} bg="#E8F0FE" value={dashboard?.headcount || 0} label="Ansatte" wide={wide} />
          <Kpi icon="calendar" tint="#1F9D55" bg="#E7F8EF" value={dashboard?.onVacation || 0} label="På ferie nå" wide={wide} />
          <Kpi
            icon="heart"
            tint="#E15B73"
            bg="#FDECEF"
            value={dashboard?.sickNow || 0}
            label="Sykemeldte nå"
            actionLabel="Se detaljer"
            onAction={() => pickCategory('sykdom')}
            actionId="kpi-sykemeldte"
            wide={wide}
          />
          <Kpi
            icon="time"
            tint="#E09A3E"
            bg="#FFF4E5"
            value={dashboard?.otherNow || 0}
            label="Annet fravær nå"
            actionLabel="Se detaljer"
            onAction={() => pickCategory('annet')}
            actionId="kpi-annet"
            wide={wide}
          />
        </View>

        <View style={styles.split}>
          <View style={[styles.card, styles.splitCard]}>
            <CardHead icon={categoryIcon(category)} title={usageTitle} />
            <View style={styles.donutRow}>
              <QuotaDonut used={used} total={quota} hasQuota={hasQuota} size={wide ? 112 : 74} />
              <View style={styles.legend}>
                <LegendRow color={ui.blue} label="Brukte dager" value={formatCount(used)} />
                {hasQuota ? <LegendRow color="#D5DEEA" label="Gjenstående" value={formatCount(remainingVisual)} /> : null}
                {hasQuota ? <LegendRow label="Totalt" value={formatCount(quota)} /> : null}
              </View>
            </View>
          </View>

          <View
            style={[styles.card, styles.splitCard]}
            onLayout={(event) => setChartWidth(Math.max(80, event.nativeEvent.layout.width - 20))}
          >
            <CardHead ion="bar-chart" title="Fravær siste 6 måneder" />
            <MonthChart months={dashboard?.recentMonths || []} width={chartWidth} plotH={wide ? 96 : 68} />
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
                <Ionicons name={row.icon} size={15} color="#7E8BA0" />
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

function AbsenceHeading({
  chrome,
  wide,
  companyName,
  companies,
  companyId,
  employees,
  employeeId,
  employeeName,
  canChooseEmployee,
  category,
  menu,
  error,
  focus,
  onToggle,
  onPickCompany,
  onPickEmployee,
  onPickCategory,
}) {
  const moreOn = !PRIMARY.has(category);
  return (
    <View nativeID="fravaer-heading" style={chrome ? styles.headingChrome : styles.headingPage}>
      <View style={[styles.banner, wide && styles.bannerWide]} nativeID="fravaer-banner">
        <View style={[styles.bannerArt, wide && styles.bannerArtWide]} pointerEvents="none">
          <BlueprintArt width={wide ? 460 : 148} height={wide ? 120 : 100} />
        </View>
        <View style={[styles.bannerCopy, wide && styles.bannerCopyWide]}>
          <View style={styles.bedriftRow}>
            <Text style={styles.bedrift}>Bedrift</Text>
            <TouchableOpacity
              style={styles.pill}
              onPress={() => onToggle('company')}
              accessibilityRole="button"
              accessibilityLabel="Velg selskap"
              nativeID="selskap-velger"
            >
              <Text style={styles.pillText} numberOfLines={1}>{companyName.toUpperCase()}</Text>
              <Ionicons name="chevron-down" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text accessibilityRole="header" style={[styles.title, wide && styles.titleWide]} numberOfLines={1}>
            Fraværsoversikt
          </Text>
          <Text style={styles.lead} numberOfLines={2}>
            Full oversikt over ferie, fravær og permisjoner for dine ansatte.
          </Text>
        </View>
      </View>

      {menu === 'company' ? (
        <ChoiceList
          options={companies.map((row) => ({ id: row.id, label: row.name }))}
          selected={companyId}
          onPick={onPickCompany}
        />
      ) : null}

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.employeeChip}
          onPress={canChooseEmployee ? () => onToggle('employee') : undefined}
          disabled={!canChooseEmployee}
          accessibilityRole="button"
          accessibilityLabel={`Ansatte: ${employeeId ? employeeName : 'Alle ansatte'}`}
          nativeID="ansatt-filter"
        >
          <Ionicons name="people" size={13} color="#fff" />
          <Text style={styles.employeeText} numberOfLines={1}>
            {employeeId ? employeeName : 'Alle ansatte'}
          </Text>
          {canChooseEmployee ? <Ionicons name="chevron-down" size={12} color="#fff" /> : null}
        </TouchableOpacity>
        <View style={styles.chipRow}>
          {CHIPS.map((chip) => {
            const on = category === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() => onPickCategory(chip.id)}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                nativeID={`chip-${chip.id}`}
              >
                <Ionicons name={chip.icon} size={13} color={on ? ui.ink : ui.muted} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => onToggle('more')}
            style={[styles.chip, styles.moreChip, moreOn && styles.chipOn]}
            accessibilityRole="button"
            accessibilityLabel="Flere fraværstyper"
            nativeID="chip-mer"
          >
            <Text style={[styles.chipText, moreOn && styles.chipTextOn]} numberOfLines={1}>
              {moreOn ? focus : '…'}
            </Text>
            </TouchableOpacity>
        </View>
        </View>

      {menu === 'employee' ? (
        <ChoiceList
          options={[{ id: '', label: 'Alle ansatte' }, ...employees.map((row) => ({ id: row.id, label: row.name }))]}
          selected={employeeId}
          onPick={onPickEmployee}
        />
      ) : null}
      {menu === 'more' ? (
        <ChoiceList
          options={moreTypes()}
          selected={category}
          onPick={onPickCategory}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function BlueprintArt({ width, height }) {
  const ink = 'rgba(255,255,255,0.92)';
  const dim = 'rgba(255,255,255,0.5)';
  const gold = '#E4B15C';
  return (
    <Svg width={width} height={height} viewBox="0 0 200 120">
      <Line x1="52" y1="16" x2="52" y2="112" stroke={ink} strokeWidth="1.6" />
      <Line x1="58" y1="20" x2="58" y2="112" stroke={dim} strokeWidth="1" />
      <Line x1="16" y1="18" x2="158" y2="10" stroke={ink} strokeWidth="1.6" />
      <Line x1="24" y1="24" x2="150" y2="16" stroke={gold} strokeWidth="1.3" />
      <Line x1="52" y1="16" x2="28" y2="24" stroke={dim} strokeWidth="1" />
      <Line x1="55" y1="14" x2="124" y2="12" stroke={dim} strokeWidth="1" />
      <Rect x="12" y="20" width="16" height="8" fill="none" stroke={ink} strokeWidth="1.1" />
      <Line x1="122" y1="13" x2="122" y2="44" stroke={ink} strokeWidth="1.1" />
      <Circle cx="122" cy="48" r="2.6" fill="none" stroke={gold} strokeWidth="1.3" />
      <Rect x="88" y="42" width="78" height="70" fill="none" stroke={ink} strokeWidth="1.3" />
      <Line x1="82" y1="42" x2="172" y2="42" stroke={gold} strokeWidth="1.5" />
      <Line x1="166" y1="42" x2="186" y2="32" stroke={ink} strokeWidth="1.2" />
      <Line x1="186" y1="32" x2="186" y2="102" stroke={ink} strokeWidth="1.2" />
      <Line x1="166" y1="112" x2="186" y2="102" stroke={ink} strokeWidth="1.2" />
      <Line x1="114" y1="42" x2="114" y2="112" stroke={dim} strokeWidth="1" />
      <Line x1="140" y1="42" x2="140" y2="112" stroke={dim} strokeWidth="1" />
      <Line x1="88" y1="66" x2="166" y2="66" stroke={dim} strokeWidth="1" />
      <Line x1="88" y1="90" x2="166" y2="90" stroke={dim} strokeWidth="1" />
      <Line x1="166" y1="66" x2="186" y2="56" stroke={dim} strokeWidth="1" />
      <Line x1="166" y1="90" x2="186" y2="80" stroke={dim} strokeWidth="1" />
      <Line x1="88" y1="42" x2="114" y2="66" stroke={gold} strokeWidth="1.1" />
      <Line x1="140" y1="66" x2="166" y2="90" stroke={dim} strokeWidth="1" />
      <Line x1="70" y1="112" x2="192" y2="112" stroke={dim} strokeWidth="1" />
    </Svg>
  );
}

function CardHead({ title, icon, ion, large = false }) {
  return (
    <View style={styles.cardHead}>
      {icon?.kind === 'palm' ? (
        <View style={[styles.headIcon, { backgroundColor: ui.peach }]}>
          <MaterialCommunityIcons name="palm-tree" size={large ? 16 : 13} color="#C4A36A" />
        </View>
      ) : (
        <View style={[styles.headIcon, { backgroundColor: ui.blueSoft }]}>
          <Ionicons name={icon?.name || ion || 'bar-chart'} size={large ? 15 : 13} color={ui.blue} />
        </View>
      )}
      <Text style={[styles.cardTitle, large && styles.cardTitleLarge]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{title}</Text>
      <Ionicons name="chevron-forward" size={14} color="#C5CEDA" />
    </View>
  );
}

function QuotaDonut({ used, total, hasQuota, size }) {
  const stroke = size < 90 ? 8 : 11;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const ratio = hasQuota && total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const dash = c * ratio;
  const center = size / 2;
  const percent = hasQuota && total > 0 ? Math.round((used / total) * 100) : 0;
  const valueSize = size < 90 ? 15 : 24;
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
        <Text style={[styles.donutValue, { fontSize: valueSize, lineHeight: valueSize + 2 }]}>
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

function MonthChart({ months, width, plotH }) {
  const gap = 4;
  const count = Math.max(1, months.length);
  const barW = Math.max(6, (width - 18 - gap * (count - 1)) / count);
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
        <Svg width={Math.max(40, width - 18)} height={plotH}>
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
                  height={h + (top ? 0 : 0.4)}
                  rx={top ? 2 : 0}
                  fill={BARS[key]}
                />
              );
            });
          })}
        </Svg>
      </View>
      <View style={[styles.monthLabels, { marginLeft: 18 }]}>
        {months.map((month) => (
          <Text key={month.key} style={[styles.monthLabel, { width: barW + gap }]} numberOfLines={1}>{month.label}</Text>
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
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={wide ? 15 : 13} color={tint} />
      </View>
      <Text style={[styles.kpiValue, wide && styles.kpiValueWide]}>{formatCount(value)}</Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>{label}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" nativeID={actionId} style={styles.kpiAction}>
          <Text style={styles.kpiActionText} numberOfLines={1}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={11} color={ui.blue} />
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

const cardShadow = Platform.select({
  web: { boxShadow: '0 6px 16px rgba(20, 36, 64, 0.06)' },
  default: {
    shadowColor: '#142840',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.page },
  pageInner: { paddingBottom: 20 },
  frame: { width: '100%', maxWidth: 1080, alignSelf: 'center', gap: 8, paddingTop: 8 },
  frameWide: { paddingBottom: 8 },
  headingChrome: { width: '100%' },
  headingPage: { width: '100%', maxWidth: 1080, alignSelf: 'center' },
  banner: {
    backgroundColor: ui.navy,
    backgroundImage: 'linear-gradient(105deg, #0A3568 0%, #124E8C 58%, #1B6AAB 100%)',
    minHeight: 108,
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 14,
    overflow: 'hidden',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bannerWide: { minHeight: 132, paddingTop: 14, paddingBottom: 22, paddingHorizontal: 20 },
  bannerArt: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 148,
    height: 100,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  bannerArtWide: { width: 460, height: 120 },
  bannerCopy: { width: '100%', paddingRight: 100, gap: 3, zIndex: 1 },
  bannerCopyWide: { maxWidth: 640, paddingRight: 280 },
  bedriftRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bedrift: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 168,
    backgroundColor: 'rgba(8, 28, 58, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  title: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5 },
  titleWide: { fontSize: 32, lineHeight: 36 },
  lead: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16, maxWidth: 230 },
  filterBar: {
    ...cardShadow,
    marginTop: -12,
    marginHorizontal: 8,
    marginBottom: 6,
    backgroundColor: ui.card,
    borderRadius: 999,
    paddingVertical: 3,
    paddingLeft: 4,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  employeeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ui.pill,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexGrow: 0,
    flexShrink: 0,
  },
  employeeText: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: {
    backgroundColor: '#fff',
    borderColor: '#E6EDF5',
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(20, 36, 64, 0.06)' } : null),
  },
  chipText: { color: ui.muted, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: ui.ink, fontWeight: '700' },
  moreChip: { paddingHorizontal: 8, maxWidth: 88 },
  choices: {
    ...cardShadow,
    marginHorizontal: 10,
    marginBottom: 6,
    backgroundColor: ui.card,
    borderRadius: 16,
    maxHeight: 240,
    paddingVertical: 4,
  },
  choice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  choiceText: { color: ui.ink, fontSize: 14, flex: 1 },
  choiceOn: { color: ui.blue, fontWeight: '700' },
  error: { color: ui.danger, fontSize: 13, paddingHorizontal: 16, paddingBottom: 6 },
  kpis: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, paddingHorizontal: 10 },
  kpi: {
    ...cardShadow,
    backgroundColor: ui.card,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    gap: 1,
  },
  kpiIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  kpiValue: { color: ui.ink, fontSize: 20, lineHeight: 23, fontWeight: '800' },
  kpiValueWide: { fontSize: 28, lineHeight: 32 },
  kpiLabel: { color: ui.muted, fontSize: 10, lineHeight: 13, minHeight: 26 },
  kpiAction: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 },
  kpiActionText: { color: ui.blue, fontSize: 10, fontWeight: '700', flexShrink: 1 },
  kpiActionSpacer: { height: 14 },
  split: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, alignItems: 'stretch' },
  splitCard: { flex: 1, minWidth: 0, gap: 4 },
  card: { ...cardShadow, backgroundColor: ui.card, borderRadius: 14, padding: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, color: ui.ink, fontSize: 10, lineHeight: 13, fontWeight: '800' },
  cardTitleLarge: { fontSize: 15, lineHeight: 18 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  donutCenter: {
    position: 'absolute', left: 4, right: 4, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  donutValue: { color: ui.ink, fontWeight: '800' },
  donutCaption: { color: ui.muted, fontSize: 7.5, lineHeight: 9, textAlign: 'center' },
  legend: { flexGrow: 1, flexShrink: 1, maxWidth: 148, gap: 3, minWidth: 0 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotSpacer: { width: 6 },
  legendLabel: { color: ui.muted, fontSize: 9, lineHeight: 11, flexShrink: 1 },
  legendValue: { color: ui.ink, fontSize: 10, fontWeight: '800', marginLeft: 6 },
  chartPlot: { flexDirection: 'row', alignItems: 'flex-end' },
  yAxis: { width: 18, justifyContent: 'space-between' },
  yTick: { color: ui.faint, fontSize: 8 },
  monthLabels: { flexDirection: 'row', marginTop: 2 },
  monthLabel: { color: ui.muted, fontSize: 8 },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 2 },
  chartKey: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  keySwatch: { width: 7, height: 7, borderRadius: 2 },
  keyText: { color: ui.ink, fontSize: 9 },
  detailCard: { marginHorizontal: 10, paddingBottom: 4, gap: 0 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: ui.line,
  },
  detailLabel: { flex: 1, color: '#5E6B80', fontSize: 12, lineHeight: 15 },
  detailValue: { color: ui.ink, fontWeight: '800', fontSize: 12, minWidth: 22, textAlign: 'right' },
  miniTrack: { width: 42, height: 5, borderRadius: 99, backgroundColor: ui.track, overflow: 'hidden' },
  miniFill: { height: 5, borderRadius: 99, backgroundColor: ui.blue },
  detailPct: { width: 32, textAlign: 'right', color: ui.muted, fontSize: 11, fontWeight: '700' },
});
