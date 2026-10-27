/**
 * Felles byggeklosser for Til fakturering og fakturasiden.
 * Tabellen blir til kort på smal skjerm, så ingenting forsvinner på mobil.
 */
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '../../../src/economy/invoices.js';

export function money(value, currency = 'NOK') {
  return formatMoney(value, currency);
}

/** Avkryssing på 18 px. partial viser en strek når bare noe er valgt. */
export function Check({ checked, partial = false, onPress, colors, label = '', disabled = false, nativeID }) {
  const on = checked || partial;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      nativeID={nativeID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: checked ? true : (partial ? 'mixed' : false), disabled }}
      accessibilityLabel={label || undefined}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.check, {
        borderColor: on ? colors.brand : colors.muted,
        backgroundColor: on ? colors.brand : colors.card,
        opacity: disabled ? 0.4 : 1,
      }]}
    >
      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
      {!checked && partial ? <View style={styles.partial} /> : null}
    </TouchableOpacity>
  );
}

export function Button({
  label, onPress, colors, tone = 'primary', icon = '', disabled = false, busy = false, nativeID, small = false, a11y,
}) {
  const primary = tone === 'primary';
  const danger = tone === 'danger';
  const success = tone === 'success';
  const bg = primary ? colors.brand : (success ? (colors.success || '#15803d') : 'transparent');
  const fg = primary || success ? '#fff' : (danger ? (colors.danger || '#b42318') : colors.ink);
  const border = primary ? colors.brand : (success ? (colors.success || '#15803d') : (danger ? (colors.danger || '#b42318') : colors.line));
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityLabel={a11y || label}
      accessibilityState={{ disabled: disabled || busy }}
      style={[styles.button, small && styles.buttonSmall, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : 1 }]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      {!busy && icon ? <Ionicons name={icon} size={small ? 14 : 16} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 12 : 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function LinkText({ label, onPress, colors, icon = '', nativeID }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="link" nativeID={nativeID} style={styles.link}>
      {icon ? <Ionicons name={icon} size={14} color={colors.brand} /> : null}
      <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const TONES = {
  block: { bg: '#fee4e2', fg: '#b42318', icon: 'alert-circle' },
  warn: { bg: '#fef3c7', fg: '#92400e', icon: 'warning' },
  info: { bg: '#e0f2fe', fg: '#075985', icon: 'information-circle' },
  ok: { bg: '#dcfce7', fg: '#166534', icon: 'checkmark-circle' },
  muted: { bg: '#f1f5f9', fg: '#334155', icon: '' },
};

export function Chip({ label, tone = 'muted', icon }) {
  const t = TONES[tone] || TONES.muted;
  const name = icon === undefined ? t.icon : icon;
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {name ? <Ionicons name={name} size={12} color={t.fg} /> : null}
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone = 'info', title = '', children, colors }) {
  const t = TONES[tone] || TONES.info;
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.bg }]}>
      <Ionicons name={t.icon || 'information-circle'} size={18} color={t.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={{ color: t.fg, fontWeight: '700' }}>{title}</Text> : null}
        {typeof children === 'string'
          ? <Text style={{ color: colors?.ink || t.fg, fontSize: 13, lineHeight: 19 }}>{children}</Text>
          : children}
      </View>
    </View>
  );
}

export function SectionTitle({ title, colors, right = null }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14, flex: 1 }}>{title}</Text>
      {right}
    </View>
  );
}

function squash(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * grow: feltet deler bredden med naboene i en rad (flexWrap). Uten grow tar det bare plassen det trenger i høyden.
 * Mens feltet er i bruk vises det som skrives, så mellomrom ikke forsvinner når verdien
 * ryddes (trimmes) på veien. Endrer forelderen mer enn mellomrom, vises verdien.
 */
export function Field({ label, value, onChangeText, colors, placeholder = '', multiline = false, keyboardType, editable = true, nativeID, width, grow = false }) {
  const [typed, setTyped] = useState(null);
  const shown = value == null ? '' : String(value);
  return (
    <View style={[styles.field, grow && !width ? styles.fieldGrow : null, width ? { width } : null]}>
      {label ? <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text> : null}
      <TextInput
        value={typed != null && squash(typed) === squash(shown) ? typed : shown}
        onChangeText={(next) => {
          setTyped(next);
          onChangeText?.(next);
        }}
        onBlur={() => setTyped(null)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        nativeID={nativeID}
        accessibilityLabel={label || placeholder}
        style={[
          styles.input,
          multiline && styles.inputMulti,
          { borderColor: colors.line, color: colors.ink, backgroundColor: editable ? colors.card : (colors.sunken || colors.bg) },
        ]}
      />
    </View>
  );
}

/**
 * Tabell. columns: [{ key, label, width?, flex?, align?, render? }].
 * stacked: kort i stedet for kolonner (smal skjerm).
 */
export function MiniTable({ columns, rows, colors, stacked = false, rowKey = (row, index) => row?.key || row?.id || index, footer = null, dimmed }) {
  if (stacked) {
    return (
      <View style={{ gap: 8 }}>
        {rows.map((row, index) => (
          <View key={rowKey(row, index)} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, opacity: dimmed?.(row) ? 0.5 : 1 }]}>
            {columns.map((col) => {
              const content = col.render ? col.render(row) : row[col.key];
              if (content == null || content === '') return null;
              return (
                <View key={col.key} style={styles.cardRow}>
                  {col.label ? <Text style={{ color: colors.muted, fontSize: 12, width: 110 }}>{col.label}</Text> : null}
                  <View style={{ flex: 1 }}>
                    {typeof content === 'string' || typeof content === 'number'
                      ? <Text style={{ color: colors.ink, fontSize: 13 }}>{content}</Text>
                      : content}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        {footer}
      </View>
    );
  }
  const cell = (col) => ({
    width: col.width,
    flex: col.width ? undefined : (col.flex || 1),
    alignItems: col.align === 'right' ? 'flex-end' : (col.align === 'center' ? 'center' : 'flex-start'),
  });
  return (
    <View>
      <View style={[styles.headRow, { borderBottomColor: colors.ink }]}>
        {columns.map((col) => (
          <View key={col.key} style={[styles.cell, cell(col)]}>
            {typeof col.label === 'string'
              ? <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{col.label}</Text>
              : col.label}
          </View>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={rowKey(row, index)} style={[styles.bodyRow, { borderBottomColor: colors.line, opacity: dimmed?.(row) ? 0.5 : 1 }]}>
          {columns.map((col) => {
            const content = col.render ? col.render(row) : row[col.key];
            return (
              <View key={col.key} style={[styles.cell, cell(col)]}>
                {typeof content === 'string' || typeof content === 'number'
                  ? <Text style={{ color: colors.ink, fontSize: 13, textAlign: col.align === 'right' ? 'right' : 'left' }} numberOfLines={col.wrap ? 3 : 1}>{content}</Text>
                  : content}
              </View>
            );
          })}
        </View>
      ))}
      {footer}
    </View>
  );
}

export function TotalRow({ label, value, colors, strong = true }) {
  return (
    <View style={styles.totalRow}>
      <Text style={{ color: colors.ink, fontWeight: strong ? '700' : '500', flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: strong ? '700' : '500' }}>{value}</Text>
    </View>
  );
}

export function Empty({ text, colors }) {
  return <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 8 }}>{text}</Text>;
}

const styles = StyleSheet.create({
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partial: { width: 8, height: 2, backgroundColor: '#fff', borderRadius: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  buttonSmall: { paddingHorizontal: 10, paddingVertical: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  banner: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 6 },
  field: { gap: 4 },
  fieldGrow: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  headRow: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 6, gap: 8 },
  bodyRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7, gap: 8, alignItems: 'center' },
  cell: { justifyContent: 'center', minWidth: 0 },
  card: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  cardRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  totalRow: { flexDirection: 'row', paddingVertical: 6, gap: 8 },
});
