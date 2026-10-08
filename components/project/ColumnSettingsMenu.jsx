import React, { useEffect, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { PROJECT_LIST_COLUMNS, toggleVisibleColumn } from '../../src/project/listColumns';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

/**
 * Innstillingsmeny for hvilke kolonner som vises i prosjektlisten.
 * Valgene lagres av forelder (AsyncStorage per bruker).
 */
export default function ColumnSettingsMenu({
  visibleKeys = [],
  onChange,
  onReset,
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [allowDismiss, setAllowDismiss] = useState(false);
  const visible = new Set(visibleKeys);

  useEffect(() => {
    if (!open) {
      setAllowDismiss(false);
      return undefined;
    }
    const id = setTimeout(() => setAllowDismiss(true), 400);
    return () => clearTimeout(id);
  }, [open]);

  const dismiss = () => {
    if (allowDismiss) setOpen(false);
  };

  function toggle(key) {
    const next = toggleVisibleColumn(visibleKeys, key, !visible.has(key));
    onChange?.(next);
  }

  const card = (
    <View
      nativeID="project-column-settings"
      style={[styles.card, { backgroundColor: colors.card }]}
      accessibilityRole="dialog"
      accessibilityViewIsModal
    >
      <Text style={[styles.title, { color: colors.ink }]}>Kolonner</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Velg hvilke kolonner som skal vises. Valget huskes for deg.
      </Text>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        {PROJECT_LIST_COLUMNS.map((col) => {
          const on = visible.has(col.key);
          return (
            <TouchableOpacity
              key={col.key}
              onPress={() => toggle(col.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={col.label}
              style={[styles.option, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={20}
                color={on ? colors.brand : colors.muted}
              />
              <Text style={{ color: on ? colors.brand : colors.ink, flex: 1 }}>{col.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {onReset ? (
        <TouchableOpacity
          onPress={() => onReset()}
          accessibilityRole="button"
          accessibilityLabel="Tilbakestill kolonner"
        >
          <Text style={{ color: colors.brand }}>Tilbakestill til standard</Text>
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
        accessibilityLabel="Kolonneinnstillinger"
        style={[styles.button, { borderColor: colors.line, backgroundColor: colors.card }]}
      >
        <Ionicons name="options-outline" size={16} color={colors.ink} />
        <Text style={{ color: colors.ink }}>Kolonner</Text>
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
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nativeRoot: { flex: 1 },
  nativeBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 39, 68, 0.5)' },
  nativeCenter: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 18, padding: 18, width: '100%', maxWidth: 420, alignSelf: 'center', gap: 10, maxHeight: '86%' },
  title: { fontSize: 18, fontWeight: '600' },
  scroll: { maxHeight: 420 },
  scrollInner: { gap: 8 },
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
