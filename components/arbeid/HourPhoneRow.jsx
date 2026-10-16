import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate, formatHours } from '../../src/economy/hoursList.js';

/**
 * Kompakt liste-rad for Timerapport på mobil.
 */
export default function HourPhoneRow({ row, colors, onPress }) {
  const project = row?.projectNumber
    ? `#${row.projectNumber} ${row.projectName || ''}`.trim()
    : (row?.projectName || 'Uten prosjekt');
  const meta = [
    row?.employeeName,
    row?.customerName,
    row?.activityName,
  ].filter(Boolean).join(' · ');

  const label = `${formatDate(row?.date)}, ${formatHours(row?.hours)}, ${project}`;
  const body = (
    <>
      <View style={styles.top}>
        <Text style={[styles.date, { color: colors.ink }]}>{formatDate(row?.date)}</Text>
        <Text style={[styles.hours, { color: colors.ink }]}>{formatHours(row?.hours)}</Text>
      </View>
      <Text style={[styles.project, { color: colors.ink }]} numberOfLines={2}>{project}</Text>
      {meta ? <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>{meta}</Text> : null}
      {row?.description ? (
        <Text style={[styles.desc, { color: colors.ink }]} numberOfLines={2}>{row.description}</Text>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[styles.row, { borderColor: colors.line }]}
        nativeID={row?.id ? `hour-phone-row-${row.id}` : undefined}
        accessibilityLabel={label}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(row)}
      style={[styles.row, { borderColor: colors.line }]}
      nativeID={row?.id ? `hour-row-${row.id}` : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Åpne føring ${label}`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  date: { fontSize: 13, fontWeight: '600' },
  hours: { fontSize: 15, fontWeight: '700' },
  project: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  meta: { fontSize: 12, lineHeight: 16 },
  desc: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
