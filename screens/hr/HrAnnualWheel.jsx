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
  return chart.idle;
}

/**
 * Det grafiske årshjulet: tolv måneder rundt, aktivitetene som buer innenfor (farge = status),
 * viser for dagens dato og «gjort» i midten. Trykk en måned eller en aktivitet for å velge måneden.
 * layout fra wheelLayout(). summary fra annualSummary().
 */
export default function HrAnnualWheel({
  colors, layout, summary, year, selectedMonth, onSelectMonth, size = 320, today = new Date(),
}) {
  const chart = chartColorsFor(colors);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 26;
  const rBand = rOuter - 22;
  const trackGap = 13;
  const thisYear = today.getFullYear() === Number(year);
  const nowMonth = thisYear ? today.getMonth() : -1;
  const needle = thisYear ? yearFraction(today) * 360 : null;
  const tracks = Math.max(1, layout.tracks);
  const rHole = rBand - 10 - tracks * trackGap;
  const select = (m) => () => onSelectMonth?.(m);
  const label = `Årshjul ${year}: ${summary.done} av ${summary.total} gjort, ${summary.now} denne måneden, ${summary.late} ikke krysset av.`;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={label} nativeID="hr-annual-wheel-graphic">
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
        {layout.items.filter((i) => i.track >= 0).map((i) => {
          const r = rBand - 10 - i.track * trackGap;
          const a0 = i.start * 30 + 5;
          const a1 = (i.end + 1) * 30 - 5;
          return (
            <Path
              key={i.activity.id}
              d={arc(cx, cy, r, a0, a1)}
              stroke={statusColor(i.status, chart)}
              strokeWidth={8}
              strokeLinecap="round"
              fill="none"
              onPress={select(i.start)}
            />
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
        <Text style={[styles.hero, { color: colors.ink }]}>{`${summary.done}/${summary.total}`}</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>{`gjort i ${year}`}</Text>
        {thisYear ? <Text style={[styles.sub, { color: colors.muted }]}>{`Nå: ${MONTHS_NB[nowMonth].toLowerCase()}`}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hero: { ...type.h1 },
  sub: { ...type.caption },
});
