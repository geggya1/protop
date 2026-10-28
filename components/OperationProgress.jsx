import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../src/context/ThemeContext';

const AMBER = '#9a6700';

/**
 * Graphical progress for long operations and import summaries.
 * Use for live saves (done/total) and finished ImportResult cards alike.
 */
export default function OperationProgress({
  value = 0,
  total = 0,
  label,
  detail,
  status = 'running', // running | success | partial | error
  children,
  nativeID,
  compact = false,
}) {
  const colors = useColors();
  const safeTotal = Math.max(0, Number(total) || 0);
  const rawValue = Math.max(0, Number(value) || 0);
  const safeValue = safeTotal > 0 ? Math.min(safeTotal, rawValue) : rawValue;
  // Hold under 100 % until the job is fully done so near-complete imports don't read as finished.
  const pct = safeTotal > 0
    ? (safeValue >= safeTotal
      ? 100
      : Math.max(0, Math.min(99, Math.round((safeValue / safeTotal) * 100))))
    : (status === 'running' ? null : 100);

  const tone = status === 'success'
    ? colors.success
    : status === 'error'
      ? colors.dangerInk
      : status === 'partial'
        ? AMBER
        : colors.brand;

  const trackBg = status === 'success'
    ? colors.successSoft
    : status === 'error'
      ? 'rgba(220, 38, 38, 0.12)'
      : status === 'partial'
        ? 'rgba(154, 103, 0, 0.12)'
        : colors.brandSoft;

  const border = status === 'error'
    ? colors.dangerInk
    : status === 'partial'
      ? AMBER
      : colors.line;

  const title = label
    || (safeTotal > 0
      ? (status === 'running' ? `Behandler ${safeValue} av ${safeTotal}` : `${safeValue} av ${safeTotal}`)
      : (status === 'running' ? 'Jobber…' : 'Ferdig'));

  return (
    <View
      nativeID={nativeID}
      accessibilityRole="progressbar"
      accessibilityValue={pct != null ? { min: 0, max: 100, now: pct } : undefined}
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        compact && styles.cardCompact,
        {
          backgroundColor: colors.card,
          borderColor: border,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: status === 'error' ? tone : colors.ink }]} numberOfLines={2}>
          {title}
        </Text>
        {pct != null ? (
          <Text style={[styles.pct, { color: tone }]}>{`${pct} %`}</Text>
        ) : null}
      </View>

      <View style={[styles.track, { backgroundColor: trackBg }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${pct == null ? 28 : Math.max(pct === 0 ? 0 : 4, pct)}%`,
              backgroundColor: tone,
              opacity: pct == null ? 0.55 : 1,
            },
            pct == null ? styles.fillIndeterminate : null,
          ]}
        />
      </View>

      {!!detail && (
        <Text style={[styles.detail, { color: colors.muted }]} numberOfLines={3}>
          {detail}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardCompact: {
    padding: 12,
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  pct: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  fillIndeterminate: {
    minWidth: 48,
  },
  detail: {
    fontSize: 13,
    lineHeight: 18,
  },
});
