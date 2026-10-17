import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScrollSheet from '../../components/ScrollSheet';
import { HR_MENU } from '../../src/navigation/shellModules';
import { HrChip } from './HrShared';

/**
 * HR-undermeny.
 * Telefon: én rad som åpner sidene, så oversikten ikke skyves ned av to rader med knapper.
 * Nettbrett og desktop: chips, der det er plass til alle sju.
 */
export function HrSectionList({ colors, page, onChange }) {
  return (
    <View style={styles.sheetList}>
      {HR_MENU.map((item) => {
        const on = page === item.id;
        return (
          <Pressable
            key={item.id}
            nativeID={`hr-section-${item.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(item.id)}
            style={[
              styles.sheetRow,
              {
                borderColor: on ? colors.brand : colors.line,
                backgroundColor: on ? `${colors.brand}18` : colors.bg,
              },
            ]}
          >
            <Ionicons name={item.icon} size={18} color={on ? colors.brand : colors.ink} />
            <Text style={[styles.sheetLabel, { color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HrSectionNav({ colors, page, onChange, isPhone, sheetOpen = false }) {
  const [open, setOpen] = useState(sheetOpen);
  const current = HR_MENU.find((item) => item.id === page) || HR_MENU[0];

  if (!isPhone) {
    return (
      <View style={styles.tabs} nativeID="hr-tabs">
        {HR_MENU.map((item) => (
          <HrChip
            key={item.id}
            colors={colors}
            label={item.label}
            active={page === item.id}
            onPress={() => onChange(item.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <>
      <Pressable
        nativeID="hr-section-picker"
        accessibilityRole="button"
        accessibilityLabel={`Bytt seksjon, ${current.label}`}
        onPress={() => setOpen(true)}
        style={[styles.picker, { borderColor: colors.brand, backgroundColor: `${colors.brand}18` }]}
      >
        <Ionicons name={current.icon} size={16} color={colors.brand} />
        <Text style={[styles.pickerLabel, { color: colors.brand }]}>{current.label}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.brand} />
      </Pressable>
      {open ? (
        <ScrollSheet visible title="Seksjon" onClose={() => setOpen(false)}>
          <HrSectionList
            colors={colors}
            page={page}
            onChange={(id) => {
              onChange(id);
              setOpen(false);
            }}
          />
        </ScrollSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  pickerLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  sheetList: { gap: 8 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
  },
  sheetLabel: { flex: 1, fontSize: 15 },
});
