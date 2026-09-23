import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupedCatalog, isWidgetOn } from '../../src/homeWidgetCatalog';
import { soft } from '../parentHome/softTheme';

export default function WidgetCatalogGrid({
  role = 'parent',
  widgets = [],
  canEdit = true,
  onToggle,
  testIDPrefix = 'home-add',
}) {
  const groups = groupedCatalog(role);
  return (
    <View testID="home-widget-catalog">
      {groups.map((group) => (
        <View key={group.id} style={styles.group} testID={`home-catalog-group-${group.id}`}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <View style={styles.grid}>
            {group.items.map((item) => {
              const on = isWidgetOn(widgets, item.type);
              return (
                <TouchableOpacity
                  key={item.type}
                  style={[styles.tile, on && styles.tileOn]}
                  onPress={() => canEdit && onToggle?.(item.type)}
                  disabled={!canEdit}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${on ? 'Skru av' : 'Skru på'} ${item.label}`}
                  testID={`${testIDPrefix}-${item.type}`}
                >
                  <View style={[styles.icon, on && styles.iconOn]}>
                    <Ionicons name={item.icon} size={20} color={on ? '#fff' : soft.sage} />
                  </View>
                  <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
                  <Text style={[styles.state, on && styles.stateOn]}>{on ? 'På' : 'Av'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 16 },
  groupLabel: {
    fontSize: 12,
    color: soft.muted,
    fontFamily: soft.body,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '31.5%',
    minWidth: 96,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: soft.card,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
  },
  tileOn: {
    backgroundColor: soft.mint,
    borderColor: soft.sage,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: soft.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconOn: { backgroundColor: soft.sage },
  label: {
    fontSize: 13,
    color: soft.ink,
    fontFamily: soft.body,
    textAlign: 'center',
    lineHeight: 16,
    minHeight: 32,
  },
  state: { fontSize: 11, color: soft.muted, fontFamily: soft.body, marginTop: 4 },
  stateOn: { color: soft.sage },
});
