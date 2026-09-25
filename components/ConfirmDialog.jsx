import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, Platform } from 'react-native';
import { colors } from '../src/theme';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

/**
 * Én dialog for web og native.
 * - Enkel: confirmText / cancelText / onConfirm / onCancel
 * - Fleksibel: buttons=[{ text, style, onPress }]
 *
 * Web: portal + position:fixed. Skjult RN Modal kan legge igjen et lag
 * som spiser alle trykk (Dokumenter/album på mobil-Safari).
 */
export default function ConfirmDialog({
  visible,
  title = 'Bekreft',
  message = '',
  confirmText = 'OK',
  cancelText = 'Avbryt',
  danger = false,
  onCancel,
  onConfirm,
  buttons,
  onClose,
}) {
  if (!visible) return null;

  const close = () => {
    onClose?.();
  };

  const resolvedButtons = Array.isArray(buttons) && buttons.length
    ? buttons
    : [
        ...(onCancel || cancelText
          ? [{ text: cancelText, style: 'cancel', onPress: onCancel }]
          : []),
        {
          text: confirmText,
          style: danger ? 'destructive' : 'default',
          onPress: onConfirm,
        },
      ];

  const dismiss = () => {
    close();
    onCancel?.();
  };

  const card = (
    <Pressable style={styles.card} onPress={() => {}} onStartShouldSetResponder={() => true}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!message && <Text style={styles.msg}>{message}</Text>}
      <View style={styles.row}>
        {resolvedButtons.map((b, idx) => (
          <TouchableOpacity
            key={`${b.text}-${idx}`}
            onPress={() => {
              // Kjør handling først — onClose må ikke nullstille state før onPress leser den.
              b.onPress?.();
              close();
            }}
            style={[
              styles.btn,
              b.style === 'cancel' && styles.muted,
              b.style === 'destructive' && styles.danger,
              (!b.style || b.style === 'default') && styles.primary,
            ]}
          >
            <Text style={[
              styles.btnTxt,
              b.style === 'cancel' && { color: '#0f172a' },
            ]}>
              {b.text || 'OK'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Pressable>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && document.body) {
    return createPortal(
      <div style={webPortalStyle}>
        <div role="presentation" onClick={dismiss} style={webBackdropStyle} />
        <div
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          style={webDialogStyle}
        >
          {card}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        {card}
      </Pressable>
    </Modal>
  );
}

export function InfoDialog({ visible, title, message, onClose }) {
  return (
    <ConfirmDialog
      visible={visible}
      title={title}
      message={message}
      buttons={[{ text: 'OK', onPress: onClose }]}
      onClose={onClose}
    />
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
  background: 'rgba(0,0,0,0.35)',
};
const webDialogStyle = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 440,
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 12px 28px rgba(0,0,0,0.15)' }
      : { elevation: 6 }),
  },
  title: { fontSize: 16, fontWeight: '400', color: '#0f172a' },
  msg: { marginTop: 8, color: '#334155' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  btn: {
    alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnTxt: { color: '#fff', fontWeight: '400' },
  muted: { backgroundColor: '#e5e7eb' },
  primary: { backgroundColor: colors.brand },
  danger: { backgroundColor: '#b00020' },
});
