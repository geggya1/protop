import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { MONTHS_NB, yearFraction } from '../../src/hr/annualWheel';
import { chartColorsFor } from '../../src/ui/chartColors';
import { type } from '../../src/ui/tokens';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

/** Punkt på sirkelen: 0° er kl. 12, med klokka. */
function pt(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function ringSegment(cx, cy, r1, r2, a0, a1) {
  const [x0, y0] = pt(cx, cy, r2, a0);
  const [x1, y1] = pt(cx, cy, r2, a1);
  const [x2, y2] = pt(cx, cy, r1, a1);
  const [x3, y3] = pt(cx, cy, r1, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r2} ${r2} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r1} ${r1} 0 ${large} 0 ${x3} ${y3} Z`;
}

function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function statusColor(status, chart) {
  if (status === 'done') return chart.done;
  if (status === 'now') return chart.now;
  if (status === 'late') return chart.late;
  if (status === 'later') return chart.planned;
  if (status === 'iso') return chart.iso;
  return chart.idle;
}

/** Vinkel (grader) for en dag i året: måned 0–11 og dag 1–31, jevnt fordelt innenfor måneden. */
export function dayAngle(month, day, year = new Date().getFullYear()) {
  const days = new Date(year, month + 1, 0).getDate();
  const d = Math.min(Math.max(Number(day) || 15, 1), days);
  return month * 30 + ((d - 0.5) / days) * 30;
}

/**
 * Det grafiske årshjulet: tolv måneder rundt, aktivitetene som buer innenfor (farge = status),
 * viser for dagens dato og «gjort» i midten. Trykk en måned eller en aktivitet for å velge måneden.
 * layout fra wheelLayout(). summary fra annualSummary().
 * Brukes også av ISO-årshjulet: itemColor gir fargen per bue, points er datoer som punkter på
 * månedsringen ({ key, month, day, count, color }), center erstatter teksten i midten
 * ({ hero, lines }), og label er skjermleserteksten.
 */
export default function HrAnnualWheel({
  colors, layout, summary, year, selectedMonth, onSelectMonth, size = 320, today = new Date(),
  itemColor = null, points = [], center = null, label: a11yLabel = '', nativeID = 'hr-annual-wheel-graphic',
}) {
  const chart = chartColorsFor(colors);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 26;
  const rBand = rOuter - 22;
  const thisYear = today.getFullYear() === Number(year);
  const nowMonth = thisYear ? today.getMonth() : -1;
  const needle = thisYear ? yearFraction(today) * 360 : null;
  const tracks = Math.max(1, layout.tracks);
  // Mange samtidige aktiviteter: sporene tettes, så midten aldri blir for liten.
  const minHole = size * 0.18;
  const trackGap = Math.max(6, Math.min(13, (rBand - 10 - minHole) / tracks));
  const stroke = Math.min(8, trackGap * 0.62);
  const rHole = Math.max(rBand - 10 - tracks * trackGap, minHole * 0.7);
  const colorOf = itemColor || ((i) => statusColor(i.status, chart));
  const rPoint = (rBand + rOuter) / 2;
  const select = (m) => () => onSelectMonth?.(m);
  const label = a11yLabel || (summary
    ? `Årshjul ${year}: ${summary.done} av ${summary.total} gjort, ${summary.now} denne måneden, ${summary.late} ikke krysset av.`
    : `Årshjul ${year}`);
  const middle = center || {
    hero: `${summary.done}/${summary.total}`,
    lines: [`gjort i ${year}`, thisYear ? `Nå: ${MONTHS_NB[nowMonth].toLowerCase()}` : ''],
  };

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label} nativeID={nativeID}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {MONTH_SHORT.map((name, m) => {
          const a0 = m * 30 + 1;
          const a1 = (m + 1) * 30 - 1;
          const on = m === selectedMonth;
          const [lx, ly] = pt(cx, cy, rOuter + 13, m * 30 + 15);
          return (
            <G key={name} onPress={select(m)}>
              <Path
                d={ringSegment(cx, cy, rBand, rOuter, a0, a1)}
                fill={m === nowMonth ? chart.segmentNow : chart.segment}
                stroke={on ? colors.brand : 'none'}
                strokeWidth={on ? 2 : 0}
              />
              <SvgText
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fontSize={type.caption.fontSize}
                fontWeight={on ? '600' : '400'}
                fill={on ? colors.brandInk : colors.muted}
              >
                {name}
              </SvgText>
            </G>
          );
        })}
        {layout.items.filter((i) => i.track >= 0).flatMap((i) => (i.segments || [[i.start, i.end]]).map(([from, to]) => {
          const r = rBand - 10 - i.track * trackGap;
          return (
            <Path
              key={`${i.activity.id}-${from}`}
              d={arc(cx, cy, r, from * 30 + 5, (to + 1) * 30 - 5)}
              stroke={colorOf(i)}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              onPress={select(from)}
            />
          );
        }))}
        {points.map((p) => {
          const [x, y] = pt(cx, cy, rPoint, dayAngle(p.month, p.day, Number(year)));
          const big = p.count > 1;
          return (
            <G key={p.key} onPress={select(p.month)}>
              <Circle cx={x} cy={y} r={big ? 7.5 : 5} fill={p.color} stroke={chart.surface} strokeWidth={1.5} />
              {big ? (
                <SvgText x={x} y={y + 3.2} textAnchor="middle" fontSize={9} fontWeight="600" fill={chart.surface}>
                  {p.count > 9 ? '9+' : String(p.count)}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {needle != null ? (
          <G>
            <Line
              x1={pt(cx, cy, rHole - 2, needle)[0]}
              y1={pt(cx, cy, rHole - 2, needle)[1]}
              x2={pt(cx, cy, rOuter + 2, needle)[0]}
              y2={pt(cx, cy, rOuter + 2, needle)[1]}
              stroke={colors.ink}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <Circle cx={pt(cx, cy, rOuter + 2, needle)[0]} cy={pt(cx, cy, rOuter + 2, needle)[1]} r={5} fill={colors.ink} stroke={chart.surface} strokeWidth={2} />
          </G>
        ) : null}
      </Svg>
      <View pointerEvents="none" style={[styles.center, { left: cx - rHole, top: cy - rHole, width: rHole * 2, height: rHole * 2 }]}>
        <Text style={[styles.hero, { color: colors.ink }]}>{middle.hero}</Text>
        {(middle.lines || []).filter(Boolean).map((line) => (
          <Text key={line} style={[styles.sub, { color: colors.muted }]} numberOfLines={1}>{line}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hero: { ...type.h1 },
  sub: { ...type.caption },
});
