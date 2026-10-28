import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, Platform } from 'react-native';
import { colors } from '../src/theme';
import { LIGHT } from '../src/appearance/palette';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

/**
 * Én dialog for web og native.
 * - Enkel: confirmText / cancelText / onConfirm / onCancel
 * - Fleksibel: buttons=[{ text, style, onPress }] (style: 'cancel' | 'default' | 'warn' | 'destructive')
 * - tone: 'default' | 'warn' | 'danger' farger bekreft-knappen (danger er det gamle flagget).
 * Escape avbryter på web. Promise-varianten er useConfirm() i src/ui/useConfirm.jsx.
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
  tone,
  onCancel,
  onConfirm,
  buttons,
  onClose,
}) {
  const latest = useRef({ onCancel, onClose });
  latest.current = { onCancel, onClose };

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      latest.current.onClose?.();
      latest.current.onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible) return null;
  const confirmTone = tone || (danger ? 'danger' : 'default');

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
          style: confirmTone === 'danger' ? 'destructive' : (confirmTone === 'warn' ? 'warn' : 'default'),
          onPress: onConfirm,
        },
      ];

  const dismiss = () => {
    close();
    onCancel?.();
  };

  const card = (
    <Pressable style={styles.card} onPress={() => {}} onStartShouldSetResponder={() => true}>
      {!!title && <Text style={styles.title} accessibilityRole="header">{title}</Text>}
      {!!message && <Text style={styles.msg}>{message}</Text>}
      <View style={styles.row}>
        {resolvedButtons.map((b, idx) => (
          <TouchableOpacity
            key={`${b.text}-${idx}`}
            accessibilityRole="button"
            nativeID={b.style === 'cancel' ? 'confirm-dialog-cancel' : (idx === resolvedButtons.length - 1 ? 'confirm-dialog-ok' : undefined)}
            onPress={() => {
              // Kjør handling først — onClose må ikke nullstille state før onPress leser den.
              b.onPress?.();
              close();
            }}
            style={[
              styles.btn,
              b.style === 'cancel' && styles.muted,
              b.style === 'destructive' && styles.danger,
              b.style === 'warn' && styles.warn,
              (!b.style || b.style === 'default') && styles.primary,
            ]}
          >
            <Text style={[
              styles.btnTxt,
              b.style === 'cancel' && styles.mutedTxt,
              (b.style === 'destructive' || b.style === 'warn') && styles.dangerTxt,
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
          role={confirmTone === 'default' ? 'dialog' : 'alertdialog'}
          aria-modal="true"
          aria-label={title || undefined}
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
  title: { fontSize: 16, fontWeight: '400', color: colors.ink },
  msg: { marginTop: 8, color: colors.muted },
  row: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  btn: {
    alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  // Tekstfargene følger utseendet, så dialogen kan leses i mørk modus.
  btnTxt: { color: colors.onBrand, fontWeight: '400' },
  mutedTxt: { color: colors.ink },
  dangerTxt: { color: '#fff' },
  muted: { backgroundColor: colors.sunken },
  primary: { backgroundColor: colors.brandInk },
  // Fylte knapper har hvit tekst i begge utseender, så fargen er den lyse paletten sin.
  danger: { backgroundColor: LIGHT.dangerInk },
  warn: { backgroundColor: LIGHT.warnInk },
});
