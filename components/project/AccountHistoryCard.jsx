import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { nbDate } from '../../src/project/companyPublic';
import {
  accountYearWindow,
  buildAccountChart,
  formatThousands,
  periodLabel,
  stepAccountYear,
} from '../../src/project/accountSeries';

const CHART_HEIGHT = 196;

function foundedYear(value) {
  const match = String(value || '').match(/^(\d{4})/);
  return match ? match[1] : '';
}

function selectionBandWidth(labels) {
  if (!labels || labels.length < 2) return 36;
  const gap = Math.abs(labels[1].x - labels[0].x);
  return Math.max(26, Math.min(40, gap * 0.32));
}

function RoundButton({ label, disabled, filled, onPress, colors, children }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!filled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.round,
        {
          backgroundColor: filled ? colors.brand : colors.card,
          borderColor: filled ? colors.brand : colors.line,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function AccountHistoryCard({
  accounts,
  founded,
  loading = false,
  colors,
}) {
  const allYears = accounts?.years || [];
  const [mode, setMode] = useState('line');
  const [selectedYear, setSelectedYear] = useState(null);
  const [windowStart, setWindowStart] = useState(null);
  const [width, setWidth] = useState(320);
  const yearWindow = accountYearWindow(allYears, { selectedYear, anchor: windowStart });
  const visible = yearWindow.visible;
  const selected = yearWindow.selected;
  const newest = allYears[allYears.length - 1] || selected;
  const chart = buildAccountChart(visible, { width, height: CHART_HEIGHT });
  const stepRef = useRef(() => {});
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -48) stepRef.current(1);
      else if (gesture.dx >= 48) stepRef.current(-1);
    },
  })).current;
  if (!selected || !newest) return null;

  const summaryValue = newest.ebitda != null ? newest.ebitda : newest.driftsresultat;
  const summaryLabel = newest.ebitda != null ? `EBITDA ${newest.aar}` : `Driftsresultat ${newest.aar}`;
  const opened = foundedYear(founded);
  const isLatest = selected.aar === accounts.aar;
  const meta = [
    isLatest ? (accounts.revidert ? 'Revidert' : 'Ikke revidert') : '',
    isLatest && accounts.smaafortak ? 'Små foretak' : '',
    isLatest && accounts.morselskap ? 'Morselskap' : '',
    nbDate(selected.fra) && nbDate(selected.til) ? `${nbDate(selected.fra)} – ${nbDate(selected.til)}` : '',
  ].filter(Boolean).join(' · ');
  const rows = [
    ['Sum driftsinntekter', 'driftsinntekter', true],
    ['Driftsresultat (EBIT)', 'driftsresultat', true],
    ['Resultat før skatt', 'resultatFoerSkatt', false],
    ['Årsresultat', 'aarsresultat', false],
    ['Eiendeler', 'eiendeler', false],
    ['Egenkapital', 'egenkapital', false],
    ['Gjeld', 'gjeld', false],
  ];
  const revenueColor = colors.ink;
  const ebitColor = colors.brand;

  function step(delta) {
    const next = stepAccountYear(allYears, { selectedYear: selected?.aar, anchor: windowStart, delta });
    const latestStart = Math.max(0, allYears.length - 5);
    setWindowStart(next.start === latestStart ? null : next.start);
    if (next.selected) setSelectedYear(next.selected.aar);
  }
  stepRef.current = step;

  function choose(year) {
    setSelectedYear(year);
  }

  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Regnskap og nøkkeltall</Text>
      <Text style={[styles.unit, { color: colors.muted }]}>Beløp i 1000</Text>
      {loading ? (
        <Text style={[styles.unit, { color: colors.muted }]}>Henter tidligere år fra Regnskapsregisteret…</Text>
      ) : null}
      {meta ? <Text style={[styles.unit, { color: colors.muted }]}>{meta}</Text> : null}

      <View style={styles.summary}>
        <View style={[styles.tile, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Text style={[styles.tileLabel, { color: colors.muted }]}>{summaryLabel}</Text>
          <Text style={[styles.tileValue, { color: colors.ink }]}>{formatThousands(summaryValue) || '—'}</Text>
        </View>
        <View style={[styles.tile, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Text style={[styles.tileLabel, { color: colors.muted }]}>Etableringsår</Text>
          <Text style={[styles.tileValue, { color: colors.ink }]}>{opened || '—'}</Text>
        </View>
      </View>

      <View style={[styles.chartCard, { borderColor: colors.line }]}>
        <View style={styles.chartHead}>
          <Text style={[styles.chartTitle, { color: colors.ink }]}>Regnskap</Text>
          <View style={styles.controls}>
            <RoundButton label="Forrige år" disabled={!yearWindow.canPrev} onPress={() => step(-1)} colors={colors}>
              <Ionicons name="chevron-back" size={16} color={yearWindow.canPrev ? colors.ink : colors.muted} />
            </RoundButton>
            <RoundButton label="Neste år" disabled={!yearWindow.canNext} filled={yearWindow.canNext} onPress={() => step(1)} colors={colors}>
              <Ionicons name="chevron-forward" size={16} color={yearWindow.canNext ? '#fff' : colors.muted} />
            </RoundButton>
            <RoundButton label="Linjediagram" filled={mode === 'line'} onPress={() => setMode('line')} colors={colors}>
              <Ionicons name="analytics-outline" size={16} color={mode === 'line' ? '#fff' : colors.ink} />
            </RoundButton>
            <RoundButton label="Stolpediagram" filled={mode === 'bar'} onPress={() => setMode('bar')} colors={colors}>
              <Ionicons name="bar-chart-outline" size={16} color={mode === 'bar' ? '#fff' : colors.ink} />
            </RoundButton>
          </View>
        </View>

        <View
          accessibilityLabel={`Utvikling ${visible[0]?.aar} til ${visible[visible.length - 1]?.aar}. Valgt ${periodLabel(selected)}. Sveip for å bytte år.`}
          style={styles.chartSlot}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 40 && Math.abs(next - width) > 1) setWidth(next);
          }}
          {...pan.panHandlers}
        >
          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
            {chart.labels.filter((label) => label.aar === selected.aar).map((label) => {
              const bandW = selectionBandWidth(chart.labels);
              return (
                <Rect
                  key={`band-${label.aar}`}
                  x={label.x - bandW / 2}
                  y={14}
                  width={bandW}
                  height={CHART_HEIGHT - 44}
                  rx={10}
                  fill={colors.brand}
                  opacity={0.14}
                />
              );
            })}
            {chart.yTicks.map((tick) => {
              const y = Math.round(tick.y) + 0.5;
              return (
                <React.Fragment key={tick.label}>
                  <Line x1={48} y1={y} x2={width - 8} y2={y} stroke={colors.line} strokeWidth={1} />
                  <SvgText x={42} y={Math.round(tick.y) + 4} fill={colors.muted} fontSize={11} textAnchor="end">{tick.label}</SvgText>
                </React.Fragment>
              );
            })}
            {chart.hits.map((hit) => (
              <Rect
                key={`hit-${hit.aar}`}
                x={hit.x}
                y={hit.y}
                width={hit.width}
                height={hit.height}
                fill="transparent"
                onPress={() => choose(hit.aar)}
              />
            ))}
            {selected ? (
              <Line
                x1={chart.labels.find((label) => label.aar === selected.aar)?.x || 0}
                y1={16}
                x2={chart.labels.find((label) => label.aar === selected.aar)?.x || 0}
                y2={CHART_HEIGHT - 30}
                stroke={colors.brand}
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.55}
              />
            ) : null}
            {mode === 'line' ? (
              <>
                {chart.revenueSegments.map((points) => (
                  <Polyline key={`rev-${points}`} points={points} fill="none" stroke={revenueColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {chart.ebitSegments.map((points) => (
                  <Polyline key={`ebit-${points}`} points={points} fill="none" stroke={ebitColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {/* Fylte markører over linjene, så markøren ikke skjærer hull i punktet. */}
                {chart.dots.map((dot) => {
                  const active = dot.aar === selected.aar;
                  const color = dot.series === 'revenue' ? revenueColor : ebitColor;
                  return (
                    <React.Fragment key={`${dot.series}-${dot.aar}`}>
                      <Circle
                        cx={dot.x}
                        cy={dot.y}
                        r={active ? 7 : 4.5}
                        fill={colors.card}
                        onPress={() => choose(dot.aar)}
                      />
                      <Circle
                        cx={dot.x}
                        cy={dot.y}
                        r={active ? 4 : 2.75}
                        fill={color}
                        onPress={() => choose(dot.aar)}
                      />
                    </React.Fragment>
                  );
                })}
              </>
            ) : chart.bars.map((bar) => (
              <Rect
                key={`${bar.series}-${bar.aar}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={3}
                fill={bar.series === 'revenue' ? revenueColor : ebitColor}
                opacity={bar.aar === selected.aar ? 1 : 0.45}
                onPress={() => choose(bar.aar)}
              />
            ))}
            {chart.labels.map((label) => (
              <SvgText
                key={label.aar}
                x={label.x}
                y={label.y}
                fill={label.aar === selected.aar ? colors.brand : colors.muted}
                fontSize={visible.length > 4 ? 10 : 11}
                fontWeight={label.aar === selected.aar ? '600' : '400'}
                textAnchor="middle"
                onPress={() => choose(label.aar)}
              >
                {label.text}
              </SvgText>
            ))}
          </Svg>
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: revenueColor }]} />
            <Text style={[styles.legendText, { color: colors.ink }]}>Sum driftsinntekter</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: ebitColor }]} />
            <Text style={[styles.legendText, { color: colors.ink }]}>Driftsresultat (EBIT)</Text>
          </View>
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHead}>
          <Text style={[styles.tableTitle, { color: colors.ink }]}>Regnskap</Text>
          <Text style={[styles.tableYear, { color: colors.ink }]}>{periodLabel(selected)}</Text>
        </View>
        {rows.map(([label, key, highlight]) => {
          const value = selected[key];
          return (
            <View
              key={label}
              style={[
                styles.tableRow,
                {
                  borderColor: highlight ? colors.brand : 'transparent',
                  backgroundColor: highlight ? colors.brandSoft : 'transparent',
                },
              ]}
            >
              <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
              <Text style={[styles.yearValue, { color: Number(value) < 0 ? colors.danger : colors.ink }]}>
                {formatThousands(value) || '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 16, fontWeight: '600' },
  unit: { fontSize: 13, lineHeight: 18 },
  summary: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 4 },
  tileLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.4, textTransform: 'uppercase' },
  tileValue: { fontSize: 22, fontWeight: '600' },
  chartCard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  chartSlot: { width: '100%' },
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chartTitle: { fontSize: 16, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  round: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },
  table: { gap: 4, marginTop: 2 },
  tableHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 4 },
  tableTitle: { fontSize: 15, fontWeight: '600' },
  tableYear: { fontSize: 14, fontVariant: ['tabular-nums'] },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  rowLabel: { fontSize: 14, flex: 1 },
  yearValue: { fontSize: 14, minWidth: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
