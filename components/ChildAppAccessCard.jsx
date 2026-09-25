import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { countAllowedApps, groupedChildRestrictableApps } from '../src/utils/childApps';
import BrandToggle from './BrandToggle';

/**
 * På/av-liste for apper et barn kan se. Brukes av foresatt i barnets innstillinger.
 * Gruppert pedagogisk — samme mapper som barnemenyen.
 */
export default function ChildAppAccessCard({
  allowedApps,
  onToggle,
  title = 'Apper barnet kan bruke',
  subtitle = 'Slå av det barnet ikke trenger. Kjøretøy/hus er av som standard; reiser kan ses uten redigering.',
  compact = false,
  showCount = true,
}) {
  const { on: onCount, total } = countAllowedApps(allowedApps);
  const groups = groupedChildRestrictableApps();

  return (
    <View>
      {title ? <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.sectionSub, compact && styles.sectionSubCompact]}>{subtitle}</Text> : null}
      {showCount ? (
        <Text style={[styles.count, compact && styles.countCompact]}>
          {onCount} av {total} apper er på
        </Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.id} style={styles.groupBlock}>
          <Text style={[styles.groupTitle, compact && styles.groupTitleCompact]}>{group.title}</Text>
          <View style={[styles.group, compact && styles.groupCompact]}>
            {group.apps.map((app, index) => {
              const on = allowedApps?.[app.id] !== false;
              return (
                <View
                  key={app.id}
                  style={[
                    styles.row,
                    compact && styles.rowCompact,
                    index === group.apps.length - 1 && styles.rowLast,
                  ]}
                >
                  <View style={[
                    styles.iconCircle,
                    compact && styles.iconCircleCompact,
                    !on && styles.iconOff,
                  ]}>
                    <Ionicons
                      name={app.icon}
                      size={compact ? 13 : 18}
                      color={on ? colors.brand : colors.muted}
                    />
                  </View>
                  <Text
                    style={[styles.label, compact && styles.labelCompact, !on && styles.labelOff]}
                    numberOfLines={1}
                  >
                    {app.label}
                  </Text>
                  <BrandToggle
                    compact={compact}
                    value={on}
                    onValueChange={(value) => onToggle?.(app.id, value)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
    marginLeft: 4,
  },
  sectionTitleCompact: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.42,
    marginBottom: 2,
    marginLeft: 2,
  },
  sectionSub: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 8,
    marginLeft: 4,
    lineHeight: 18,
  },
  sectionSubCompact: {
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 6,
    marginLeft: 2,
    lineHeight: 16,
  },
  count: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.brand,
    marginBottom: 8,
    marginLeft: 4,
  },
  countCompact: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4,
    marginLeft: 2,
  },
  groupBlock: {
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.ink,
    marginBottom: 6,
    marginLeft: 4,
  },
  groupTitleCompact: {
    fontSize: 11,
    fontWeight: '400',
    marginBottom: 4,
    marginLeft: 2,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  groupCompact: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowCompact: {
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  rowLast: { borderBottomWidth: 0 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleCompact: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  iconOff: { backgroundColor: '#f1f5f9' },
  label: { flex: 1, fontWeight: '400', fontSize: 15, color: colors.ink, minWidth: 0 },
  labelCompact: { fontWeight: '500', fontSize: 13 },
  labelOff: { color: colors.muted },
});
