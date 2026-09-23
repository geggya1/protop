import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch {}
}

/**
 * Web: portal + position:fixed. RN Modal er upålitelig i Chrome/Safari,
 * og klikket som åpner dialogen treffer bakgrunnen og lukker den med en gang.
 */
export default function ConfirmActionModal({
  visible,
  title,
  body,
  confirmLabel = 'OK',
  cancelLabel = 'Avbryt',
  danger = false,
  checkLabel,
  nameToMatch,
  namePlaceholder,
  busy = false,
  inline = false,
  onCancel,
  onConfirm,
}) {
  const [checked, setChecked] = useState(false);
  const [typed, setTyped] = useState('');
  const [allowDismiss, setAllowDismiss] = useState(false);

  useEffect(() => {
    if (visible) {
      setChecked(false);
      setTyped('');
      setAllowDismiss(false);
      const id = setTimeout(() => setAllowDismiss(true), 500);
      return () => clearTimeout(id);
    }
    setAllowDismiss(false);
    return undefined;
  }, [visible]);

  const nameOk = !nameToMatch
    || typed.trim().toLowerCase() === String(nameToMatch).trim().toLowerCase();
  const checkOk = !checkLabel || checked;
  const canConfirm = checkOk && nameOk && !busy;

  const card = (
    <View style={styles.card} accessibilityRole="dialog" accessibilityViewIsModal>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}

      {checkLabel ? (
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setChecked((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          disabled={busy}
        >
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked ? colors.brand : colors.muted}
          />
          <Text style={styles.checkTxt}>{checkLabel}</Text>
        </TouchableOpacity>
      ) : null}

      {nameToMatch ? (
        <View style={styles.nameBlock}>
          <Text style={styles.nameHint}>{namePlaceholder}</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.nameInput}
            placeholder={nameToMatch}
            placeholderTextColor="#94a3b8"
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelTxt}>{cancelLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.confirmBtn,
            danger && styles.confirmDanger,
            !canConfirm && { opacity: 0.4 },
          ]}
          onPress={canConfirm ? onConfirm : undefined}
          disabled={!canConfirm}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmTxt}>{confirmLabel}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!visible) return null;

  if (inline) {
    return <View style={styles.inlineWrap}>{card}</View>;
  }

  const dismiss = () => {
    if (allowDismiss && !busy) onCancel?.();
  };

  if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body && createPortal) {
    return createPortal(
      <div style={webPortalStyle}>
        <div
          role="presentation"
          onClick={dismiss}
          style={webBackdropStyle}
        />
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
  maxWidth: 440,
};

const styles = StyleSheet.create({
  inlineWrap: {
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: 18,
    overflow: 'hidden',
  },
  nativeRoot: { flex: 1 },
  nativeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 39, 68, 0.5)',
  },
  nativeCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.ink },
  body: { marginTop: 8, fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.muted },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  checkTxt: { flex: 1, fontWeight: '700', fontSize: 14, color: colors.ink, lineHeight: 20 },
  nameBlock: { marginTop: 14 },
  nameHint: { fontWeight: '700', fontSize: 12, color: colors.muted, marginBottom: 6 },
  nameInput: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.sunken,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  cancelTxt: { fontWeight: '800', color: colors.muted, fontSize: 15 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.brand,
    minHeight: 46,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  confirmDanger: { backgroundColor: colors.danger },
  confirmTxt: { fontWeight: '800', color: '#fff', fontSize: 15 },
});
