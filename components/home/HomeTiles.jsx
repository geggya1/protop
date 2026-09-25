import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line } from 'react-native-svg';
import { useNow } from '../../src/hooks/useNow';
import { widgetVariant } from '../../src/homeWidgetCatalog';
import { soft } from '../parentHome/softTheme';
import { SoftWeatherCard } from './PastelCards';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveCardSurface } from './homeGlass';

function TileWrap({ interactive, onPress, accessibilityLabel, style, children }) {
  if (!interactive) {
    return <View style={style}>{children}</View>;
  }
  return (
    <TouchableOpacity
      style={style}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </TouchableOpacity>
  );
}

export function WeatherTile({
  weather,
  variant = 'now',
  compact = false,
  onPress,
  interactive = true,
}) {
  const spec = widgetVariant('weather', variant);
  return (
    <SoftWeatherCard
      weather={weather}
      look={spec.id}
      compact={compact || spec.id === 'now'}
      onPress={interactive ? onPress : undefined}
    />
  );
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function polar(cx, cy, deg, len) {
  const r = ((deg - 90) * Math.PI) / 180;
  return { x: cx + Math.cos(r) * len, y: cy + Math.sin(r) * len };
}

function AnalogFace({ size }) {
  const now = useNow(1000);
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const hourDeg = ((hours % 12) + minutes / 60) * 30;
  const minDeg = minutes * 6 + seconds * 0.1;
  const cx = size / 2;
  const cy = size / 2;
  const ticks = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const hourPt = polar(cx, cy, hourDeg, size * 0.28);
  const minPt = polar(cx, cy, minDeg, size * 0.38);
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={size / 2 - 1.5} fill={soft.cream} stroke={soft.line} strokeWidth={2} />
      {ticks.map((i) => {
        const outer = polar(cx, cy, i * 30, size / 2 - 6);
        const inner = polar(cx, cy, i * 30, size / 2 - (i % 3 === 0 ? 13 : 10));
        return (
          <Line
            key={i}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={i % 3 === 0 ? soft.ink : soft.muted}
            strokeWidth={i % 3 === 0 ? 2 : 1.2}
            strokeLinecap="round"
          />
        );
      })}
      <Line x1={cx} y1={cy} x2={hourPt.x} y2={hourPt.y} stroke={soft.ink} strokeWidth={4} strokeLinecap="round" />
      <Line x1={cx} y1={cy} x2={minPt.x} y2={minPt.y} stroke={soft.sage} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={4} fill={soft.ink} />
    </Svg>
  );
}

export function ClockTile({
  onPress,
  variant = 'small',
  compact = true,
  interactive = true,
}) {
  const spec = widgetVariant('clock', variant || (compact ? 'small' : 'wide'));
  const look = spec.id;
  const now = useNow(1000);
  const label = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const face = look === 'wide' ? 72 : 56;
  const immersive = useHomeImmersive();

  return (
    <TileWrap
      interactive={interactive}
      onPress={onPress}
      accessibilityLabel={`Klokken er ${label}`}
      style={[styles.clock, look === 'wide' && styles.clockWide, immersive && immersiveCardSurface]}
    >
      {look === 'wide' ? (
        <>
          <AnalogFace size={face} />
          <View style={styles.clockWideCopy}>
            <Text style={styles.kickerInk}>Klokke</Text>
            <Text style={styles.timeTxtWide}>{label}</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.kickerInk}>Klokke</Text>
          <AnalogFace size={face} />
          <Text style={styles.timeTxt}>{label}</Text>
        </>
      )}
    </TileWrap>
  );
}

const WEEKDAYS_NB = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS_NB = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];

export function DateTile({
  onPress,
  variant = 'small',
  compact = true,
  interactive = true,
}) {
  const spec = widgetVariant('date', variant || (compact ? 'small' : 'wide'));
  const look = spec.id;
  const now = useNow(30000);
  const weekday = WEEKDAYS_NB[now.getDay()];
  const month = MONTHS_NB[now.getMonth()];
  const immersive = useHomeImmersive();

  return (
    <TileWrap
      interactive={interactive}
      onPress={onPress}
      accessibilityLabel={`${weekday} ${now.getDate()}. ${month}`}
      style={[styles.dateTile, look === 'wide' && styles.dateWide, immersive && immersiveCardSurface]}
    >
      {look === 'wide' ? (
        <>
          <View>
            <Text style={styles.dateWeek}>{weekday}</Text>
            <Text style={styles.dateMonth}>{month}</Text>
          </View>
          <Text style={styles.dateNumWide}>{now.getDate()}</Text>
        </>
      ) : (
        <>
          <Text style={styles.dateWeek}>{weekday}</Text>
          <Text style={styles.dateNumSm}>{now.getDate()}</Text>
          <Text style={styles.dateMonth}>{month}</Text>
        </>
      )}
    </TileWrap>
  );
}

export function StatTile({
  label, value, hint, icon, onPress, tint = soft.card,
}) {
  return (
    <TouchableOpacity
      style={[styles.stat, { backgroundColor: tint }]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value || ''}`}
    >
      {icon ? <Ionicons name={icon} size={22} color={soft.sage} /> : null}
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.meta} numberOfLines={1}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  clock: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4DC',
  },
  clockWide: { flexDirection: 'row', paddingHorizontal: 16, gap: 16 },
  clockWideCopy: { flex: 1, justifyContent: 'center' },
  timeTxt: { fontSize: 16, color: soft.ink, fontFamily: soft.display, marginTop: 2, letterSpacing: 0.4 },
  timeTxtWide: { fontSize: 28, color: soft.ink, fontFamily: soft.display, letterSpacing: 0.4 },
  dateTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4DC',
    overflow: 'hidden',
  },
  dateWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  dateWeek: {
    fontSize: 11, color: '#E24B4A', fontFamily: soft.body, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '400',
  },
  dateNum: { fontSize: 42, color: '#1C1C1E', fontFamily: soft.display, lineHeight: 46 },
  dateNumSm: { fontSize: 36, color: '#1C1C1E', fontFamily: soft.display, lineHeight: 40 },
  dateNumWide: { fontSize: 44, color: '#1C1C1E', fontFamily: soft.display, lineHeight: 48 },
  dateMonth: { fontSize: 14, color: '#8A93A3', fontFamily: soft.body, textTransform: 'capitalize' },
  stat: {
    flex: 1,
    minHeight: 118,
    borderRadius: 22,
    padding: 12,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
  },
  statLabel: { fontSize: 13, color: soft.muted, fontFamily: soft.body },
  statValue: { fontSize: 28, color: soft.ink, fontFamily: soft.display, lineHeight: 32 },
  meta: { fontSize: 12, color: soft.muted, fontFamily: soft.body },
});
