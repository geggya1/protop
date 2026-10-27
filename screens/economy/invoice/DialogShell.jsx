/**
 * Dialog med tittel, innhold som kan rulles og knapper i bunnen.
 * Web: portal + position:fixed (som ConfirmDialog). Native: Modal.
 */
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

export default function DialogShell({ visible, title, onClose, children, footer, colors, width = 560, nativeID }) {
  if (!visible) return null;
  const card = (
    <View
      nativeID={nativeID}
      accessibilityRole="dialog"
      accessibilityLabel={title}
      style={[styles.card, { backgroundColor: colors.card, maxWidth: width }]}
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16, flex: 1 }}>{title}</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={[styles.foot, { borderTopColor: colors.line }]}>{footer}</View> : null}
    </View>
  );
  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && document.body) {
    return createPortal(
      <div style={portal}>
        <div role="presentation" onClick={onClose} style={backdrop} />
        <div onClick={(event) => event.stopPropagation()} style={{ ...holder, maxWidth: width }}>
          {card}
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: width }}>{card}</Pressable>
      </Pressable>
    </Modal>
  );
}

const portal = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};
const backdrop = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(15,23,42,0.45)',
};
const holder = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxHeight: '92vh',
  display: 'flex',
};

const styles = StyleSheet.create({
  card: { width: '100%', borderRadius: 12, overflow: 'hidden', maxHeight: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  body: { flexGrow: 0, flexShrink: 1 },
  foot: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, padding: 12, borderTopWidth: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
});
