import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { statusLabel } from '../../src/utils/weekPlanView';

export default function DayTimeline({ items, colors, canEdit, onPressSlot }) {
  if (!items?.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="sunny-outline" size={28} color={colors.muted} />
        <Text style={[styles.emptyTitle, { color: colors.ink }]}>Ingen timer denne dagen</Text>
        <Text style={[styles.emptyHint, { color: colors.muted }]}>
          {canEdit
            ? 'Bruk knappene øverst til høyre for å importere timeplan eller legge til en time.'
            : 'Ingen timeplan for denne dagen ennå.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item, idx) => {
        const highlight = item.status === 'now' || item.status === 'next';
        const done = item.status === 'done';
        const label = statusLabel(item.status);
        const last = idx === items.length - 1;
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.row,
              highlight && { backgroundColor: item.style.soft },
            ]}
            onPress={() => canEdit && onPressSlot?.(item)}
            activeOpacity={canEdit ? 0.8 : 1}
            disabled={!canEdit}
          >
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: done ? colors.success : item.style.color },
                  highlight && styles.dotHi,
                ]}
              />
              {!last ? <View style={[styles.line, { backgroundColor: colors.line }]} /> : null}
            </View>
            <Text style={[styles.time, { color: colors.muted }]}>{item.timeLabel}</Text>
            <View style={[styles.iconWrap, { backgroundColor: item.style.soft }]}>
              <Ionicons name={item.style.icon} size={18} color={item.style.color} />
            </View>
            <Text
              style={[styles.title, { color: colors.ink }, done && styles.titleDone]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {label ? (
              <View style={styles.status}>
                {item.status === 'done' ? (
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                ) : (
                  <View style={[styles.statusDot, { backgroundColor: colors.brand }]} />
                )}
                <Text
                  style={[
                    styles.statusTxt,
                    { color: item.status === 'done' ? colors.success : colors.brand },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 4,
    borderRadius: 14,
    minHeight: 52,
  },
  rail: {
    width: 18,
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingTop: 18,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 1,
  },
  dotHi: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  line: {
    position: 'absolute',
    top: 30,
    bottom: -10,
    width: 2,
    borderRadius: 1,
  },
  time: {
    width: 92,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontWeight: '500', fontSize: 15 },
  titleDone: { color: '#64748b' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontWeight: '500', fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, gap: 8 },
  emptyTitle: { fontWeight: '500', fontSize: 16 },
  emptyHint: { fontSize: 13, fontWeight: '400', textAlign: 'center', lineHeight: 18 },
});
