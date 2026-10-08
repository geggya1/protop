import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useColors } from '../src/context/ThemeContext';
import { ShellTitleRightContext } from './ShellHeader';
import ShellAddButton from './ShellAddButton';
import { useShellTitleRight } from '../src/hooks/useShellTitleRight';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

/**
 * Én «Ny»-knapp. Import, registrering og forklaring ligger i popupen,
 * så listesidene ikke gjentar sidetittelen og forklaringsteksten.
 * Uten skall (ingen titleRight) vises den samme knappen på siden.
 * Én handling og ingen tekst kjører direkte, uten popup.
 */
export default function CreateMenu({
  label,
  title,
  info = '',
  actions = [],
}) {
  const colors = useColors();
  const shell = useContext(ShellTitleRightContext);
  const inShell = !!shell?.claim;
  const [open, setOpen] = useState(false);
  const [allowDismiss, setAllowDismiss] = useState(false);
  const actionsRef = useRef(actions);
  const infoRef = useRef(info);
  actionsRef.current = actions;
  infoRef.current = info;

  const onPress = useCallback(() => {
    const list = actionsRef.current || [];
    const lines = infoLines(infoRef.current);
    if (list.length <= 1 && !lines.length) {
      list[0]?.onPress?.();
      return;
    }
    setOpen(true);
  }, []);

  const button = useMemo(
    () => (
      <ShellAddButton
        label={label}
        onPress={onPress}
        accessibilityLabel={label}
      />
    ),
    [label, onPress],
  );
  useShellTitleRight(button, { active: inShell });

  useEffect(() => {
    if (!open) {
      setAllowDismiss(false);
      return undefined;
    }
    const id = setTimeout(() => setAllowDismiss(true), 400);
    return () => clearTimeout(id);
  }, [open]);

  function choose(action) {
    if (action.disabled) return;
    setOpen(false);
    action.onPress?.();
  }

  const lines = infoLines(info);
  const card = (
    <View
      nativeID="create-menu"
      style={[styles.card, { backgroundColor: colors.card }]}
      accessibilityRole="dialog"
      accessibilityViewIsModal
    >
      <Text style={[styles.title, { color: colors.ink }]}>{title || label}</Text>
      {lines.map((line) => (
        <Text key={line} style={[styles.info, { color: colors.muted }]}>{line}</Text>
      ))}
      <View style={styles.actions}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            nativeID={action.nativeID || `create-menu-${action.id}`}
            onPress={() => choose(action)}
            disabled={!!action.disabled}
            accessibilityRole="button"
            style={[
              styles.action,
              action.primary
                ? { backgroundColor: colors.brand }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
              action.disabled && styles.disabled,
            ]}
          >
            <Text style={{ color: action.primary ? '#fff' : colors.ink, fontWeight: '500' }}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" style={styles.close}>
        <Text style={{ color: colors.muted }}>Lukk</Text>
      </TouchableOpacity>
    </View>
  );

  const dismiss = () => {
    if (allowDismiss) setOpen(false);
  };

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
      {inShell ? null : <View style={styles.inline}>{button}</View>}
      {dialog}
    </>
  );
}

function infoLines(info) {
  if (Array.isArray(info)) return info.map((line) => String(line || '').trim()).filter(Boolean);
  const text = String(info || '').trim();
  return text ? [text] : [];
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
  inline: { alignSelf: 'flex-start' },
  nativeRoot: { flex: 1 },
  nativeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 39, 68, 0.5)',
  },
  nativeCenter: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    borderRadius: 18,
    padding: 18,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '600' },
  info: { fontSize: 14, lineHeight: 20 },
  actions: { gap: 8, marginTop: 4 },
  action: {
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  disabled: { opacity: 0.55 },
  close: { alignSelf: 'flex-start', paddingVertical: 4 },
});
