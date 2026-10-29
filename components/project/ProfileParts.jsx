/**
 * Felles deler for fanene på bedriftssiden: kort, seksjonshode, tom-tekst,
 * avkrysning og lagrelinjen nederst i redigering.
 */
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, space, type } from '../../src/ui/tokens';

const shadow = Platform.OS === 'web' ? { boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)' } : {};

export function Card({ children, colors, style, nativeID }) {
  return (
    <View nativeID={nativeID} id={nativeID} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
}

export function SectionHead({ title, colors, action, onAction, icon }) {
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" style={styles.action}>
          {icon ? <Ionicons name={icon} size={15} color={colors.brandInk || colors.brand} /> : null}
          <Text style={[type.label, { color: colors.brandInk || colors.brand }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function EmptyNote({ colors, children }) {
  return <Text style={[styles.muted, { color: colors.muted }]}>{children}</Text>;
}

export function CheckRow({ checked, label, hint, onPress, colors, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked, disabled: !!disabled }}
      style={[styles.check, disabled && styles.disabled]}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={colors.brand} />
      <View style={styles.flex}>
        <Text style={[type.body, { color: colors.ink }]}>{label}</Text>
        {hint ? <Text style={[type.caption, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

/** Knapp med ikon og tekst, fylt (primary) eller lys. */
export function PillButton({ label, icon, onPress, colors, primary, disabled, nativeID }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      nativeID={nativeID}
      accessibilityRole="button"
      style={[
        styles.pill,
        primary ? { backgroundColor: colors.brandInk || colors.brand } : { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
        disabled && styles.disabled,
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={primary ? colors.onBrand : colors.ink} /> : null}
      <Text style={[type.label, { color: primary ? colors.onBrand : colors.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Lagre og avbryt nederst i en fane som redigeres. Lagrer hele siden. */
export function EditBar({ colors, saving, error, onSave, onCancel, note }) {
  return (
    <View style={[styles.bar, { borderTopColor: colors.line }]}>
      {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}
      {note ? <Text style={[type.caption, { color: colors.muted }]}>{note}</Text> : null}
      <View style={styles.barRow}>
        <PillButton label={saving ? 'Lagrer…' : 'Lagre siden'} icon="checkmark" primary onPress={onSave} disabled={saving} colors={colors} />
        <PillButton label="Avbryt" onPress={onCancel} colors={colors} disabled={saving} />
      </View>
    </View>
  );
}

/** Liten ikonknapp i redigering (flytt, slett). */
export function IconAction({ icon, label, onPress, colors, disabled, tone }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.card }, disabled && styles.faded]}
    >
      <Ionicons name={icon} size={16} color={tone === 'danger' ? colors.danger : colors.ink} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  title: { fontSize: 18, fontWeight: '600', flexShrink: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  muted: { fontSize: 13, lineHeight: 18 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, paddingVertical: space.xxs },
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.55 },
  faded: { opacity: 0.3 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxs + 2,
    borderRadius: radius.control + 2, paddingHorizontal: space.sm, paddingVertical: space.xs + 1,
  },
  bar: { borderTopWidth: 1, paddingTop: space.sm, gap: space.xs },
  barRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  iconBtn: {
    width: 30, height: 30, borderRadius: radius.control, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
