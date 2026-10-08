import React, { useEffect, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useLayout } from '../src/theme';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

function idleOf(group) {
  if (group.idle != null) return group.idle;
  return group.options?.[0]?.id ?? '';
}

function activeLabels(groups) {
  return (groups || []).flatMap((group) => {
    if (group.value === idleOf(group)) return [];
    const option = (group.options || []).find((row) => row.id === group.value);
    return option ? [option.label] : [];
  });
}

/**
 * Filter og sortering. På mobil ligger valgene i en popup.
 * På bredere skjerm ligger de som knapper på siden.
 * Hver gruppe er ett valg. Flere grupper kan settes samtidig.
 */
export default function FilterMenu({ groups = [], children = null, marked = false }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const [open, setOpen] = useState(false);
  const [allowDismiss, setAllowDismiss] = useState(false);
  const labels = activeLabels(groups);
  const on = marked || labels.length > 0;
  const buttonLabel = labels.length ? labels.join(' · ') : 'Filter';

  useEffect(() => {
    if (!open) {
      setAllowDismiss(false);
      return undefined;
    }
    const id = setTimeout(() => setAllowDismiss(true), 400);
    return () => clearTimeout(id);
  }, [open]);

  const choices = groups.map((group) => (
    <View key={group.id} style={styles.group}>
      {group.label ? <Text style={[styles.groupLabel, { color: colors.muted }]}>{group.label}</Text> : null}
      {(group.options || []).map((option) => {
        const selected = group.value === option.id;
        return (
          <TouchableOpacity
            key={option.id || 'all'}
            nativeID={option.nativeID}
            onPress={() => group.onChange?.(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.option, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: selected ? colors.brand : colors.ink, flex: 1 }}>{option.label}</Text>
            {selected ? <Ionicons name="checkmark" size={18} color={colors.brand} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  ));

  if (!isPhone) {
    return (
      <View style={styles.inline}>
        {groups.map((group) => (
          <View key={group.id} style={styles.chips}>
            {(group.options || []).map((option) => {
              const selected = group.value === option.id;
              return (
                <TouchableOpacity
                  key={option.id || 'all'}
                  nativeID={option.nativeID}
                  onPress={() => group.onChange?.(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.chip, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : colors.card }]}
                >
                  <Text style={{ color: selected ? colors.brand : colors.ink }}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        {children}
      </View>
    );
  }

  const dismiss = () => {
    if (allowDismiss) setOpen(false);
  };

  function reset() {
    groups.forEach((group) => {
      const idle = idleOf(group);
      if (group.value !== idle) group.onChange?.(idle);
    });
  }

  const card = (
    <View nativeID="filter-menu" style={[styles.card, { backgroundColor: colors.card }]} accessibilityRole="dialog" accessibilityViewIsModal>
      <Text style={[styles.title, { color: colors.ink }]}>Filter</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        {choices}
        {children}
      </ScrollView>
      {labels.length ? (
        <TouchableOpacity onPress={reset} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Nullstill</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button">
        <Text style={{ color: colors.muted }}>Lukk</Text>
      </TouchableOpacity>
    </View>
  );

  let dialog = null;
  if (open) {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body && createPortal) {
      dialog = createPortal(
        <div style={webPortalStyle}>
          <div role="presentation" onClick={dismiss} style={webBackdropStyle} />
          <div role="dialog" onClick={(event) => event.stopPropagation()} style={webDialogStyle}>
            {card}
          </div>
        </div>,
        document.body,
      );
    } else {
      dialog = (
        <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
          <View style={styles.nativeRoot}>
            <Pressable style={styles.nativeBackdrop} onPress={dismiss} />
            <View style={styles.nativeCenter} pointerEvents="box-none">
              {card}
            </View>
          </View>
        </Modal>
      );
    }
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Filter og sortering"
        style={[styles.button, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
      >
        <Ionicons name="funnel-outline" size={16} color={on ? colors.brand : colors.ink} />
        <Text style={{ color: on ? colors.brand : colors.ink, flexShrink: 1 }} numberOfLines={1}>{buttonLabel}</Text>
      </TouchableOpacity>
      {dialog}
    </>
  );
}

const webPortalStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483646,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};
const webBackdropStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(26, 39, 68, 0.55)',
};
const webDialogStyle = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 420,
};

const styles = StyleSheet.create({
  inline: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  nativeRoot: { flex: 1 },
  nativeBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 39, 68, 0.5)' },
  nativeCenter: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 18, padding: 18, width: '100%', maxWidth: 420, alignSelf: 'center', gap: 10, maxHeight: '86%' },
  title: { fontSize: 18, fontWeight: '600' },
  scroll: { maxHeight: 420 },
  scrollInner: { gap: 12 },
  group: { gap: 8 },
  groupLabel: { fontSize: 12, fontWeight: '600' },
  option: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
