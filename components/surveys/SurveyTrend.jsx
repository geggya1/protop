/**
 * Utvikling over tid for undersøkelser (HR → Medarbeiderundersøkelse og Kunder → Kundeundersøkelse).
 * trend fra src/surveys/trend.js.
 *
 * - Linjediagram for hovedtallet (totalindeks 0–100 eller NPS −100–100), én serie, med linje ved
 *   målet. Trykk eller hold over et punkt for tall. «Vis som tabell» gir de samme tallene som tekst.
 * - Områdene per undersøkelse i en tabell med endring fra forrige (pil og fortegn, ikke bare farge).
 * - «Hva må bedres»: områder under målet eller med tydelig fall.
 */
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { chartColorsFor } from '../../src/ui/chartColors';
import { radius, space, type } from '../../src/ui/tokens';

function signed(n) {
  if (n == null) return '–';
  if (n === 0) return '±0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function Delta({ colors, value }) {
  if (value == null) return <Text style={[styles.caption, { color: colors.muted }]}>–</Text>;
  const icon = value > 0 ? 'arrow-up' : value < 0 ? 'arrow-down' : 'remove';
  return (
    <View style={styles.delta}>
      <Ionicons name={icon} size={12} color={colors.muted} />
      <Text style={[styles.caption, { color: colors.ink }]}>{signed(value)}</Text>
    </View>
  );
}

/**
 * Varmekart i områdetabellen: fargen sier hvor langt området er fra målet (divergerende skala,
 * rød under, grå rundt målet, blå over; samme validerte trinn som svarfordelingen). Tallet står
 * alltid i cellen, så fargen er aldri alene om informasjonen.
 */
export const HEAT_BINS = [
  { max: -20, label: 'Mer enn 20 under målet' },
  { max: -5, label: '5–20 under' },
  { max: 5, label: 'Rundt målet (±5)' },
  { max: 15, label: '5–15 over' },
  { max: Infinity, label: 'Mer enn 15 over' },
];

export function heatBin(score, target = 70) {
  if (score == null || target == null) return -1;
  const d = score - target;
  if (d < -20) return 0;
  if (d < -5) return 1;
  if (d <= 5) return 2;
  if (d <= 15) return 3;
  return 4;
}

function luminance(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Tekstfargen med best kontrast mot cellen (lys eller mørk). */
export function inkOn(fill) {
  return contrast(fill, '#ffffff') >= contrast(fill, '#111827') ? '#ffffff' : '#111827';
}

const PAD = { left: 36, right: 16, top: 16, bottom: 28 };
const HEIGHT = 200;

/** Linjediagram for én serie. metric: 'index' (0–100) eller 'nps' (−100–100). */
function LineChart({ colors, points, metric, target, nativeID }) {
  const chart = chartColorsFor(colors);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState(-1);
  const values = points.map((p) => (metric === 'nps' ? p.nps : p.index));
  const min = metric === 'nps' ? -100 : 0;
  const max = 100;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
  const y = (v) => PAD.top + innerH - ((v - min) / (max - min)) * innerH;
  const ticks = metric === 'nps' ? [-100, -50, 0, 50, 100] : [0, 25, 50, 75, 100];
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const f = focus >= 0 ? points[focus] : null;
  const fv = f ? values[focus] : null;
  const unit = metric === 'nps' ? 'NPS' : 'av 100';
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }} nativeID={nativeID}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT} accessibilityRole="image" accessibilityLabel={points.map((p, i) => `${p.label}: ${values[i] ?? 'ingen tall'}`).join(', ')}>
          {ticks.map((t) => (
            <React.Fragment key={t}>
              <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.line} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={11} fill={colors.muted} textAnchor="end">{String(t)}</SvgText>
            </React.Fragment>
          ))}
          {target != null ? (
            <Line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} stroke={colors.ink} strokeWidth={1.5} strokeDasharray="4 4" />
          ) : null}
          {points.map((p, i) => (
            <SvgText key={p.id} x={x(i)} y={HEIGHT - 8} fontSize={11} fill={colors.muted} textAnchor="middle">{p.label}</SvgText>
          ))}
          {d ? <Path d={d} stroke={chart.bar} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {values.map((v, i) => (v == null ? null : (
            <Circle key={points[i].id} cx={x(i)} cy={y(v)} r={focus === i ? 6 : 4.5} fill={chart.bar} stroke={colors.card} strokeWidth={2} />
          )))}
          {/* Siste verdi står som tall ved punktet. */}
          {values.length && values[values.length - 1] != null ? (
            <SvgText x={x(values.length - 1)} y={y(values[values.length - 1]) - 10} fontSize={12} fontWeight="600" fill={colors.ink} textAnchor="middle">
              {String(values[values.length - 1])}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
      {/* Treffflater større enn punktene: én stripe per undersøkelse. */}
      {width > 0 ? points.map((p, i) => {
        const w = points.length === 1 ? innerW : innerW / Math.max(1, points.length - 1);
        return (
          <Pressable
            key={p.id}
            onPress={() => setFocus(focus === i ? -1 : i)}
            onHoverIn={() => setFocus(i)}
            onHoverOut={() => setFocus((cur) => (cur === i ? -1 : cur))}
            accessibilityRole="button"
            accessibilityLabel={`${p.label}: ${values[i] ?? 'ingen tall'} ${unit}`}
            style={[styles.hit, { left: Math.max(0, x(i) - w / 2), width: w, top: PAD.top, height: innerH }]}
          />
        );
      }) : null}
      {f && width > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.tip, {
            backgroundColor: colors.card,
            borderColor: colors.line,
            left: Math.min(Math.max(0, x(focus) - 80), Math.max(0, width - 160)),
            top: 0,
          }]}
        >
          <Text style={[styles.bodyStrong, { color: colors.ink }]}>{f.label}</Text>
          <Text style={[styles.caption, { color: colors.ink }]}>{fv == null ? 'Ingen tall' : `${fv} ${unit}`}</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {[`${f.count} svar`, f.pct != null ? `${f.pct} % svarte` : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * trend: surveyTrend(). metric: 'index' eller 'nps'. target: mållinjen (f.eks. 70).
 * indexLabel: navnet på hovedtallet («Totalindeks», «Tilfredshetsindeks»).
 */
export default function SurveyTrend({
  colors, trend, metric = 'index', target = null, areaTarget = 70, indexLabel = 'Totalindeks', onExport, nativeID = 'survey-trend',
}) {
  const [table, setTable] = useState(false);
  const chart = chartColorsFor(colors);
  if (!trend) return null;
  const { points } = trend;
  const label = metric === 'nps' ? 'NPS' : indexLabel;
  const mainDelta = metric === 'nps' ? trend.npsDelta : trend.indexDelta;
  const latest = metric === 'nps' ? trend.latest.nps : trend.latest.index;
  return (
    <View style={styles.stack} nativeID={nativeID}>
      <View style={styles.toolbar}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={[styles.caption, { color: colors.muted }]}>{`${label} siste ${points.length} ${points.length === 1 ? 'gang' : 'ganger'}`}</Text>
          <View style={styles.headline}>
            <Text style={[styles.value, { color: colors.ink }]}>{latest == null ? '–' : String(latest)}</Text>
            {trend.previous ? <Delta colors={colors} value={mainDelta} /> : null}
            {trend.previous ? <Text style={[styles.caption, { color: colors.muted }]}>{`fra ${trend.previous.label}`}</Text> : null}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => setTable((v) => !v)}
            accessibilityRole="button"
            style={[styles.chip, { borderColor: table ? colors.brand : colors.line, backgroundColor: colors.bg }]}
            nativeID={`${nativeID}-table-toggle`}
          >
            <Text style={[styles.caption, { color: table ? colors.brand : colors.ink }]}>{table ? 'Vis som diagram' : 'Vis som tabell'}</Text>
          </Pressable>
          {onExport && Platform.OS === 'web' ? (
            <Pressable onPress={onExport} accessibilityRole="button" style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID={`${nativeID}-export`}>
              <Ionicons name="download-outline" size={14} color={colors.ink} />
              <Text style={[styles.caption, { color: colors.ink }]}>Last ned (Excel)</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {table ? null : (
        <>
          <LineChart colors={colors} points={points} metric={metric} target={target} nativeID={`${nativeID}-chart`} />
          {target != null ? (
            <View style={styles.legendItem}>
              <View style={[styles.dash, { borderColor: colors.ink }]} />
              <Text style={[styles.caption, { color: colors.muted }]}>{metric === 'nps' ? `Mål: NPS ${target}` : `Mål: ${target} av 100`}</Text>
            </View>
          ) : null}
        </>
      )}

      {/* Områdene per undersøkelse. Tabellen vises alltid, og er også tabellvisningen av diagrammet. */}
      <View style={[styles.table, { borderColor: colors.line }]} nativeID={`${nativeID}-areas`}>
        <View style={[styles.row, styles.headRow, { borderColor: colors.line }]}>
          <Text style={[styles.areaCol, styles.caption, { color: colors.muted }]}>Område</Text>
          {points.map((p) => (
            <Text key={p.id} style={[styles.numCol, styles.caption, { color: colors.muted }]} numberOfLines={1}>{p.label}</Text>
          ))}
          <Text style={[styles.numCol, styles.caption, { color: colors.muted }]}>Endring</Text>
        </View>
        {(table ? [{ area: label, values: points.map((p) => (metric === 'nps' ? p.nps : p.index)), delta: mainDelta, main: true }] : [])
          .concat(table && metric === 'nps' && points.some((p) => p.index != null)
            ? [{ area: indexLabel, values: points.map((p) => p.index), delta: trend.indexDelta, main: true }] : [])
          .concat(table ? [{ area: 'Antall svar', values: points.map((p) => p.count), delta: null, main: true, plain: true }] : [])
          .concat(trend.matrix)
          .map((m) => (
            <View key={m.area} style={[styles.row, { borderColor: colors.line }]}>
              <Text style={[styles.areaCol, m.main ? styles.bodyStrong : styles.body, { color: colors.ink }]} numberOfLines={2}>{m.area}</Text>
              {m.values.map((v, i) => {
                const bin = m.main ? -1 : heatBin(v, areaTarget);
                const fill = bin >= 0 ? chart.likert[bin] : null;
                return (
                  <View key={points[i].id} style={[styles.numCol, styles.cellWrap]}>
                    <Text
                      style={[
                        styles.cell,
                        i === m.values.length - 1 && !m.plain ? styles.bodyStrong : styles.body,
                        fill ? { backgroundColor: fill, color: inkOn(fill) } : { color: colors.ink },
                      ]}
                      accessibilityLabel={v == null ? `${m.area} ${points[i].label}: ikke målt` : `${m.area} ${points[i].label}: ${v}${bin >= 0 ? `, ${HEAT_BINS[bin].label.toLowerCase()}` : ''}`}
                    >
                      {v == null ? '–' : String(v)}
                    </Text>
                  </View>
                );
              })}
              <View style={[styles.numCol, styles.deltaCol]}>{m.plain ? null : <Delta colors={colors} value={m.delta} />}</View>
            </View>
          ))}
      </View>

      {trend.matrix.length ? (
        <View style={styles.legend} nativeID={`${nativeID}-heat-legend`}>
          {HEAT_BINS.map((b, i) => (
            <View key={b.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: chart.likert[i] }]} />
              <Text style={[styles.caption, { color: colors.muted }]}>{b.label}</Text>
            </View>
          ))}
          <Text style={[styles.caption, { color: colors.muted }]}>{`Mål per område: ${areaTarget} av 100.`}</Text>
        </View>
      ) : null}

      {trend.mustImprove.length ? (
        <View style={[styles.box, { borderColor: colors.line }]} nativeID={`${nativeID}-improve`}>
          <View style={styles.legendItem}>
            <Ionicons name="construct" size={16} color={colors.warn} />
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>Hva må bedres</Text>
          </View>
          {trend.mustImprove.map((m) => (
            <View key={m.area} style={styles.improveRow}>
              <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{m.area}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{m.reason}</Text>
              <Text style={[styles.bodyStrong, { color: colors.ink, minWidth: 28, textAlign: 'right' }]}>{m.score == null ? '–' : String(m.score)}</Text>
            </View>
          ))}
        </View>
      ) : points.length > 1 ? (
        <Text style={[styles.caption, { color: colors.muted }]}>Alle områdene er på eller over målet, og ingen har falt tydelig siden forrige gang.</Text>
      ) : null}
      {points.length === 1 ? (
        <Text style={[styles.caption, { color: colors.muted }]}>Utviklingen vises når dere har gjennomført minst to undersøkelser. Bruk de samme spørsmålene hver gang, så tallene kan sammenlignes.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  value: { ...type.h2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  hit: { position: 'absolute' },
  tip: { position: 'absolute', width: 160, borderWidth: 1, borderRadius: radius.control, padding: 8, gap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dash: { width: 18, borderTopWidth: 2, borderStyle: 'dashed' },
  table: { borderTopWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderBottomWidth: 1, paddingVertical: 6 },
  headRow: { paddingTop: 4 },
  areaCol: { flex: 2, minWidth: 90 },
  numCol: { flex: 1, minWidth: 44, textAlign: 'right' },
  cellWrap: { alignItems: 'flex-end' },
  cell: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.control / 2, textAlign: 'center', overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  swatch: { width: 12, height: 12, borderRadius: radius.control / 4 },
  deltaCol: { alignItems: 'flex-end' },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  improveRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
});
