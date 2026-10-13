import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import {
  applyPlatformSwitch,
  platformSegmentActive,
  platformSwitchSegments,
  workspacePickerItems,
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
  const choices = useMemo(() => workspacePickerItems(segments), [segments]);
  const many = choices.filter((segment) => segment.side === 'company').length > 1;
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

  const active = choices.find((segment) => platformSegmentActive(segment, family)) || choices[0];
  return (
    <WorkspaceMenu
      label={active?.label || 'Bedrift'}
      choices={choices}
      family={family}
      colors={colors}
      compact={compact}
      busy={busy}
      onPick={onPick}
    />
  );
}

function WorkspaceMenu({
  label, choices, family, colors, compact, busy, onPick,
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.pickerWrap}>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Bedrift, ${label}. Velg arbeidsområde`}
        accessibilityState={{ expanded: open, disabled: busy }}
        style={[
          styles.pickerBtn,
          compact && styles.pickerBtnCompact,
          { borderColor: colors.line, backgroundColor: colors.sunken || '#f4f6f9' },
        ]}
      >
        <Text
          style={[styles.pickerLabel, { color: colors.ink }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted || colors.ink} />
      </TouchableOpacity>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.menuRoot}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk bedriftsvalg"
          />
          <View
            style={[styles.menuCard, { backgroundColor: colors.card || '#fff', borderColor: colors.line }]}
            accessibilityRole="menu"
          >
            <Text style={[styles.menuTitle, { color: colors.muted }]}>Velg arbeidsområde</Text>
            {choices.map((segment) => {
              const selected = platformSegmentActive(segment, family);
              return (
                <TouchableOpacity
                  key={segment.id}
                  onPress={() => {
                    setOpen(false);
                    onPick(segment);
                  }}
                  disabled={busy}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected }}
                  style={[
                    styles.menuRow,
                    selected && { backgroundColor: colors.sunken || '#f4f6f9' },
                  ]}
                >
                  <Text
                    style={[
                      styles.menuLabel,
                      { color: colors.ink },
                      selected && styles.menuLabelOn,
                    ]}
                    numberOfLines={2}
                  >
                    {segment.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={18} color={colors.brand || colors.ink} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
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
  pickerWrap: {
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    alignSelf: 'center',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 280,
    minWidth: 0,
  },
  pickerBtnCompact: {
    maxWidth: 220,
    paddingVertical: 5,
    borderRadius: 7,
  },
  pickerLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  menuRoot: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 16,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  menuCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    zIndex: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  menuLabelOn: {
    fontWeight: '600',
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
