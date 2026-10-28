import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useColors } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { radius, space } from './tokens';

/**
 * Plassholder mens innhold lastes (UX-28), i stedet for spinner og «Laster…».
 * Pulsen stopper når brukeren har valgt redusert bevegelse.
 * Skjermleser hører én gang at innholdet lastes (accessibilityLabel på gruppen).
 */
function usePulse() {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(0.7);
      return undefined;
    }
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: native }),
      Animated.timing(value, { toValue: 0.55, duration: 700, useNativeDriver: native }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, value]);
  return value;
}

export function Skeleton({ width = '100%', height = 14, rounded = 6, style }) {
  const colors = useColors();
  const opacity = usePulse();
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: rounded, backgroundColor: colors.line, opacity }, style]}
    />
  );
}

function Group({ label = 'Laster innhold', children, style }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} aria-busy style={style}>
      {children}
    </View>
  );
}

/** Liste med rader: tittel og en meta-linje per rad. */
function SkeletonList({ rows = 5, label }) {
  const colors = useColors();
  return (
    <Group label={label} style={{ gap: 0 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.listRow, { borderColor: colors.line }]}>
          <Skeleton width={28} height={28} rounded={radius.pill} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={i % 2 ? '55%' : '70%'} height={14} />
            <Skeleton width={i % 2 ? '35%' : '45%'} height={11} />
          </View>
        </View>
      ))}
    </Group>
  );
}

/** Kort med tittel og tre linjer. */
function SkeletonCard({ lines = 3, label }) {
  const colors = useColors();
  return (
    <Group label={label} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Skeleton width="40%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={12} />
      ))}
    </Group>
  );
}

/** Tabell: overskrift og rader med like mange kolonner. */
function SkeletonTable({ rows = 6, columns = 5, label }) {
  const colors = useColors();
  return (
    <Group label={label} style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {Array.from({ length: rows + 1 }, (_, r) => (
        <View key={r} style={[styles.tableRow, { borderColor: colors.line }]}>
          {Array.from({ length: columns }, (__, c) => (
            <View key={c} style={{ flex: c === 0 ? 1.4 : 1 }}>
              <Skeleton width={r === 0 ? '60%' : `${70 + ((r * 7 + c * 13) % 30)}%`} height={r === 0 ? 10 : 12} />
            </View>
          ))}
        </View>
      ))}
    </Group>
  );
}

Skeleton.List = SkeletonList;
Skeleton.Card = SkeletonCard;
Skeleton.Table = SkeletonTable;

export default Skeleton;

const styles = StyleSheet.create({
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.md, gap: space.xs + 2 },
  table: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
