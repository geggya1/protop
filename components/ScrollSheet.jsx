import React, { useEffect, useState } from 'react';
import {
  Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useColors } from '../src/context/ThemeContext';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

/**
 * Skyvefelt over siden. Brukes når et tannhjul åpner innstillinger
 * uten at de ligger som eget skilleark.
 */
export default function ScrollSheet({ visible, title, onClose, children }) {
  const colors = useColors();
  const scrollMax = Math.max(320, Math.round(Dimensions.get('window').height * 0.78));
  const [allowDismiss, setAllowDismiss] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAllowDismiss(false);
      return undefined;
    }
    const id = setTimeout(() => setAllowDismiss(true), 400);
    return () => clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    if (allowDismiss) onClose?.();
  };

  const sheet = (
    <View style={[styles.sheet, { backgroundColor: colors.card }]} accessibilityRole="dialog" accessibilityViewIsModal>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
          <Text style={{ color: colors.brand }}>Lukk</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={[styles.scroll, { maxHeight: scrollMax }]}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body && createPortal) {
    return createPortal(
      <div style={webRoot} onClick={dismiss}>
        <div style={webSheetWrap} onClick={(event) => event.stopPropagation()}>
          {sheet}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.nativeRoot}>
        <Pressable style={styles.backdrop} onPress={dismiss} />
        <View style={styles.nativeDock} pointerEvents="box-none">
          {sheet}
        </View>
      </View>
    </Modal>
  );
}

const webRoot = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483646,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  background: 'rgba(26, 39, 68, 0.55)',
  padding: 0,
};
const webSheetWrap = {
  width: '100%',
  maxWidth: 720,
  maxHeight: '92%',
  display: 'flex',
};

const styles = StyleSheet.create({
  nativeRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 39, 68, 0.55)',
  },
  nativeDock: { maxHeight: '92%', width: '100%' },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '100%',
    width: '100%',
    paddingTop: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 18, fontWeight: '600' },
  scroll: { maxHeight: Math.round(Dimensions.get('window').height * 0.78) },
  scrollInner: { paddingHorizontal: 16, paddingBottom: 28 },
});
