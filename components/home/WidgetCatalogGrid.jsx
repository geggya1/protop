import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupedCatalog, isWidgetOn } from '../../src/homeWidgetCatalog';
import { colors } from '../../src/theme';
import { radius } from '../../src/ui/tokens';

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
                    <Ionicons name={item.icon} size={20} color={on ? colors.onBrand : colors.brand} />
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
    color: colors.muted,
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
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  tileOn: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.card,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconOn: { backgroundColor: colors.brandInk },
  label: {
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 16,
    minHeight: 32,
  },
  state: { fontSize: 11, color: colors.muted, marginTop: 4 },
  stateOn: { color: colors.brandInk },
});
