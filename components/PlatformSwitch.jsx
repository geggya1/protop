import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import {
  applyPlatformSwitch,
  platformSwitchSide,
} from '../src/utils/platformSwitch';

/**
 * Compact Privat / Bedrift control for the shell header.
 */
export default function PlatformSwitch({ compact = false }) {
  const nav = useNavigation();
  const colors = useColors();
  const {
    family, liveFamilies, families, selectFamily, isParent, isChild, isActingAsChild,
  } = useApp();
  const [busy, setBusy] = useState(false);

  const list = liveFamilies?.length ? liveFamilies : families;
  const side = platformSwitchSide(family);
  const hidden = !isParent || isChild || isActingAsChild;

  const webSet = useMemo(
    () => (Platform.OS === 'web' ? { dataSet: { wpPlatformSwitch: '1' } } : null),
    [],
  );

  if (hidden) return null;

  const onPick = async (next) => {
    if (busy || next === side) return;
    setBusy(true);
    try {
      await applyPlatformSwitch({
        navigation: nav,
        selectFamily,
        families: list,
        family,
        side: next,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { borderColor: colors.line, backgroundColor: colors.sunken || '#f4f6f9' },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Bytt mellom privat og bedrift"
      {...webSet}
    >
      <Seg
        label="Privat"
        active={side === 'personal'}
        compact={compact}
        colors={colors}
        disabled={busy}
        onPress={() => onPick('personal')}
      />
      <Seg
        label="Bedrift"
        active={side === 'company'}
        compact={compact}
        colors={colors}
        disabled={busy}
        onPress={() => onPick('company')}
      />
    </View>
  );
}

function Seg({ label, active, compact, colors, disabled, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.seg,
        compact && styles.segCompact,
        active && { backgroundColor: colors.card },
        active && styles.segActive,
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.label,
          compact && styles.labelCompact,
          { color: active ? colors.ink : colors.muted },
          active && styles.labelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    gap: 2,
    maxWidth: 220,
  },
  wrapCompact: {
    borderRadius: 7,
    padding: 2,
    maxWidth: 200,
  },
  seg: {
    flex: 1,
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segCompact: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  segActive: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  labelCompact: {
    fontSize: 13,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '600',
  },
});
