import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { calendarEventSurface } from '../src/utils/timeGrid';

function CalCheck({
  checked, color, label, sublabel, error = false, onPress, nested = false, expandable = false, expanded = false, onToggleExpand,
}) {
  const surface = calendarEventSurface(color || colors.muted);
  return (
    <View style={[styles.calRow, nested && styles.calRowNested]}>
      {expandable ? (
        <TouchableOpacity
          onPress={onToggleExpand}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Skjul delte kalendere' : 'Vis delte kalendere'}
          style={styles.calExpandBtn}
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={colors.muted}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.calExpandSpacer} />
      )}
      <TouchableOpacity
        onPress={onPress}
        style={styles.calCheckHit}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      >
        <View style={[
          styles.calBox,
          { borderColor: surface.accent, backgroundColor: checked ? surface.bg : '#fff' },
        ]}
        >
          {checked ? <Text style={[styles.calTick, { color: surface.ink }]}>✓</Text> : null}
        </View>
        <View style={styles.calLblWrap}>
          <Text style={styles.calLbl} numberOfLines={1}>{label}</Text>
          {sublabel ? (
            <Text style={[styles.calSub, error && styles.calSubErr]} numberOfLines={1}>{sublabel}</Text>
          ) : null}
          {error && !sublabel ? (
            <Text style={styles.calSubErr} numberOfLines={1}>Synkroniserer ikke</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Checkbox list of family + Outlook calendars, including shared Graph calendars as children.
 */
export default function CalendarLayerList({
  calendars, hiddenCals, onToggleCal, defaultExpanded = false,
}) {
  const [expandedIds, setExpandedIds] = useState(() => new Set(
    defaultExpanded
      ? (calendars || []).filter((c) => c.expandable && c.children?.length).map((c) => c.id)
      : [],
  ));

  useEffect(() => {
    if (!defaultExpanded) return undefined;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      (calendars || []).forEach((c) => {
        if (c.expandable && c.children?.length) next.add(c.id);
      });
      return next;
    });
    return undefined;
  }, [calendars, defaultExpanded]);

  return (
    <View>
      {(calendars || []).map((c) => {
        const parentHidden = !!hiddenCals?.has(c.id);
        const isExpanded = expandedIds.has(c.id);
        return (
          <View key={c.id}>
            <CalCheck
              checked={!parentHidden}
              color={c.color || colors.brand}
              label={c.label}
              sublabel={c.sublabel}
              error={!!c.error}
              expandable={!!c.expandable && (c.children?.length > 0)}
              expanded={isExpanded}
              onToggleExpand={() => {
                setExpandedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                });
              }}
              onPress={() => onToggleCal?.(c.id)}
            />
            {isExpanded && c.children?.length ? (
              c.children.map((child) => {
                const childHidden = parentHidden || !!hiddenCals?.has(child.id);
                return (
                  <CalCheck
                    key={child.id}
                    nested
                    checked={!childHidden}
                    color={child.color || c.color || colors.brand}
                    label={child.label}
                    sublabel={child.sublabel || (child.shared ? 'Delt kalender' : null)}
                    onPress={() => {
                      if (parentHidden) {
                        onToggleCal?.(c.id);
                        return;
                      }
                      onToggleCal?.(child.id);
                    }}
                  />
                );
              })
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  calRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, minHeight: 28 },
  calRowNested: { paddingLeft: 8, opacity: 0.95 },
  calExpandBtn: { width: 18, alignItems: 'center', justifyContent: 'center' },
  calExpandSpacer: { width: 18 },
  calCheckHit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  calBox: {
    width: 14, height: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
  },
  calTick: { fontSize: 9, fontWeight: '400', lineHeight: 12 },
  calLblWrap: { flex: 1, minWidth: 0 },
  calLbl: { fontSize: 12, fontWeight: '400', color: colors.ink },
  calSub: { fontSize: 10, fontWeight: '400', color: colors.muted, marginTop: 1 },
  calSubErr: { fontSize: 10, fontWeight: '400', color: '#b45309', marginTop: 1 },
});
