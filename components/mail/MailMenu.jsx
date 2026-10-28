import React, { useCallback, useRef, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { useTitleRef } from './useDomHover';

/** Båndknapp som i Outlook: ikon og tekst, uten ramme, markeres ved hover. */
export function MailToolButton({
  icon,
  iconColor,
  label,
  onPress,
  disabled = false,
  active = false,
  chevron = false,
  primary = false,
  compact = false,
  accessibilityLabel,
  innerRef,
  title,
}) {
  const ref = useTitleRef(title || accessibilityLabel || label, innerRef);
  return (
    <Pressable
      ref={ref}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled, selected: active }}
      style={({ hovered, pressed }) => [
        styles.tool,
        compact && styles.toolCompact,
        primary && styles.toolPrimary,
        active && styles.toolOn,
        !primary && (hovered || pressed) && !disabled && styles.toolHover,
        primary && (hovered || pressed) && styles.toolPrimaryHover,
        disabled && styles.toolDisabled,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={compact ? 16 : 15}
          color={primary ? '#fff' : (iconColor || (active ? colors.brand : colors.ink))}
        />
      ) : null}
      {label && !compact ? (
        <Text style={[styles.toolTxt, primary && styles.toolTxtPrimary]} numberOfLines={1}>{label}</Text>
      ) : null}
      {chevron ? (
        <Ionicons name="chevron-down" size={11} color={primary ? '#fff' : colors.muted} />
      ) : null}
    </Pressable>
  );
}

function MenuRow({ item, onDone }) {
  if (item.divider) return <View style={styles.divider} />;
  if (item.header) return <Text style={styles.header}>{item.header}</Text>;
  return (
    <Pressable
      onPress={() => {
        if (item.disabled) return;
        onDone();
        item.onPress?.();
      }}
      disabled={item.disabled}
      accessibilityRole="menuitem"
      accessibilityLabel={item.label}
      style={({ hovered, pressed }) => [
        styles.row,
        (hovered || pressed) && !item.disabled && styles.rowHover,
        item.disabled && styles.toolDisabled,
      ]}
    >
      <View style={styles.rowIcon}>
        {item.swatch ? (
          <View style={[styles.swatch, { backgroundColor: item.swatch }]} />
        ) : item.icon ? (
          <Ionicons name={item.icon} size={15} color={item.danger ? colors.danger : (item.iconColor || colors.ink)} />
        ) : null}
      </View>
      <Text style={[styles.rowTxt, item.danger && { color: colors.danger }]} numberOfLines={1}>{item.label}</Text>
      {item.hint ? <Text style={styles.rowHint}>{item.hint}</Text> : null}
      {item.checked ? <Ionicons name="checkmark" size={15} color={colors.brand} /> : null}
    </Pressable>
  );
}

/** Meny som åpnes ved et punkt (anker) på skjermen. */
export function MailMenu({
  visible, anchor, items, onClose, width = 240, children,
}) {
  const win = useWindowDimensions();
  if (!visible || !anchor) return null;
  const maxH = Math.min(440, win.height - 24);
  const left = Math.max(8, Math.min(anchor.x, win.width - width - 8));
  const below = anchor.y + (anchor.h || 0) + 4;
  const estimate = Math.min(maxH, (items || []).length * 34 + 16);
  const top = below + estimate > win.height - 8
    ? Math.max(8, anchor.y - estimate - 4)
    : below;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Lukk meny" />
      <View style={[styles.menu, { left, top, width, maxHeight: maxH }]} accessibilityRole="menu">
        <ScrollView style={{ maxHeight: maxH }} keyboardShouldPersistTaps="handled">
          {children || (items || []).map((item, i) => (
            <MenuRow key={item.id || `${item.label || item.header || 'd'}-${i}`} item={item} onDone={onClose} />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function useMenuAnchor() {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const open = useCallback(() => {
    const node = ref.current;
    if (!node?.measureInWindow) {
      setAnchor({ x: 16, y: 80, w: 0, h: 0 });
      return;
    }
    node.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  }, []);
  const close = useCallback(() => setAnchor(null), []);
  return { ref, anchor, open, close };
}

/** Båndknapp med nedtrekksmeny. `items` kan være en funksjon, så menyen bygges når den åpnes. */
export function MailMenuButton({
  items, width, children, ...buttonProps
}) {
  const { ref, anchor, open, close } = useMenuAnchor();
  const list = anchor ? (typeof items === 'function' ? items(anchor) : items) : [];
  return (
    <>
      <MailToolButton innerRef={ref} chevron={!buttonProps.compact} {...buttonProps} onPress={open} />
      <MailMenu visible={!!anchor} anchor={anchor} items={list} onClose={close} width={width}>
        {anchor && children ? children(close) : null}
      </MailMenu>
    </>
  );
}

const styles = StyleSheet.create({
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  toolCompact: { width: 30, paddingHorizontal: 0, justifyContent: 'center' },
  toolHover: { backgroundColor: colors.sunken },
  toolOn: { backgroundColor: colors.brandSoft },
  toolPrimary: { backgroundColor: colors.brand, paddingHorizontal: 12 },
  toolPrimaryHover: { opacity: 0.9 },
  toolDisabled: { opacity: 0.4 },
  toolTxt: { fontSize: 13, color: colors.ink },
  toolTxtPrimary: { color: '#fff' },
  menu: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingVertical: 4,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)' }
      : { elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  rowHover: { backgroundColor: colors.sunken },
  rowIcon: { width: 18, alignItems: 'center' },
  rowTxt: { flex: 1, fontSize: 13, color: colors.ink },
  rowHint: { fontSize: 11, color: colors.muted },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 4 },
  header: {
    fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4,
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2,
  },
});
