import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import {
  applyPlatformSwitch,
  platformSegmentActive,
  platformSwitchSegments,
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
  const segments = useMemo(() => platformSwitchSegments(list), [list]);
  const many = segments.length > 2;
  const hidden = !isParent || isChild || isActingAsChild;

  const webSet = useMemo(
    () => (Platform.OS === 'web' ? { dataSet: { wpPlatformSwitch: '1' } } : null),
    [],
  );

  if (hidden) return null;

  const onPick = async (segment) => {
    if (busy || !segment || platformSegmentActive(segment, family)) return;
    setBusy(true);
    try {
      await applyPlatformSwitch({
        navigation: nav,
        selectFamily,
        families: list,
        family,
        side: segment.side,
        groupId: segment.groupId,
      });
    } finally {
      setBusy(false);
    }
  };

  const control = (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        many && styles.wrapMany,
        { borderColor: colors.line, backgroundColor: colors.sunken || '#f4f6f9' },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel={many ? 'Bytt mellom privat og bedrifter' : 'Bytt mellom privat og bedrift'}
      {...webSet}
    >
      {segments.map((segment) => (
        <Seg
          key={segment.id}
          label={segment.label}
          active={platformSegmentActive(segment, family)}
          compact={compact}
          wideLabel={many && segment.side === 'company'}
          colors={colors}
          disabled={busy}
          onPress={() => onPick(segment)}
        />
      ))}
    </View>
  );

  if (!many) return control;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.scrollerContent}
    >
      {control}
    </ScrollView>
  );
}

function Seg({ label, active, compact, wideLabel, colors, disabled, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.seg,
        compact && styles.segCompact,
        wideLabel && styles.segWide,
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
          wideLabel && styles.labelWide,
          { color: active ? colors.ink : colors.muted },
          active && styles.labelActive,
        ]}
        numberOfLines={wideLabel ? 2 : 1}
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
  wrapMany: {
    maxWidth: '100%',
    flexGrow: 0,
  },
  scroller: {
    maxWidth: '100%',
    flexGrow: 0,
    alignSelf: 'center',
  },
  scrollerContent: {
    flexGrow: 0,
    justifyContent: 'center',
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
  segWide: {
    flex: 0,
    minWidth: 88,
    maxWidth: 220,
    paddingVertical: 4,
  },
  labelWide: {
    maxWidth: 200,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 15,
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
