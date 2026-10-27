/**
 * Felles byggeklosser for Produkt-sidene: knapper, kort, felt og nøkkeltall.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VAT_CODES, resolveVatPercent, roundMoney } from '../../src/economy/vat.js';
import { dateKey } from '../../src/utils/dates';

export function todayKey() {
  return dateKey(new Date());
}

export function shortDate(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '—';
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}

export function numText(value) {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? String(n).replace('.', ',') : '';
}

export function qtyText(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(roundMoney(n)).replace('.', ',');
}

/** Hele kroner til nøkkeltall. Tabellene viser øre. */
export function kroner(value) {
  const n = Math.round(Number(value) || 0);
  try {
    return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n} kr`;
  }
}

export function vatLabel(code) {
  const row = VAT_CODES.find((item) => item.id === code);
  return row ? `${row.label} (${row.percent} %)` : code || '—';
}

export function withVat(amount, code) {
  return roundMoney((Number(amount) || 0) * (1 + resolveVatPercent(code) / 100));
}

export function Btn({ label, icon, onPress, colors, primary = false, danger = false, disabled = false, nativeID, accessibilityLabel }) {
  const tint = primary ? '#fff' : danger ? (colors.danger || '#b42318') : colors.ink;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        ui.btn,
        primary
          ? { backgroundColor: colors.brand, borderColor: colors.brand }
          : { backgroundColor: colors.card, borderColor: colors.line },
        disabled ? { opacity: 0.55 } : null,
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={tint} /> : null}
      <Text style={{ color: tint, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Card({ title, colors, right, children, nativeID }) {
  return (
    <View nativeID={nativeID} style={[ui.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {title || right ? (
        <View style={ui.cardHead}>
          {title ? <Text style={[ui.cardTitle, { color: colors.ink }]}>{title}</Text> : <View />}
          {right || null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function SectionLabel({ children, colors }) {
  return <Text style={[ui.sectionLabel, { color: colors.muted }]}>{children}</Text>;
}

export function Field({ label, value, onChange, colors, placeholder, keyboardType, basis = 200, grow = false, multiline = false, nativeID, hint }) {
  return (
    <View style={{ flexBasis: basis, flexGrow: grow ? 1 : 0, flexShrink: 1, minWidth: 120, gap: 4 }}>
      <Text style={[ui.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        nativeID={nativeID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder || colors.muted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        accessibilityLabel={label}
        style={[
          ui.input,
          { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
          multiline ? { minHeight: 92 } : null,
        ]}
      />
      {hint ? <Text style={{ color: colors.muted, fontSize: 11 }}>{hint}</Text> : null}
    </View>
  );
}

export function PickerField({ label, basis = 200, grow = false, children, colors }) {
  return (
    <View style={{ flexBasis: basis, flexGrow: grow ? 1 : 0, flexShrink: 1, minWidth: 140, gap: 4 }}>
      <Text style={[ui.label, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

export function Fact({ label, value, colors, strong = false }) {
  return (
    <View style={ui.fact}>
      <Text style={[ui.label, { color: colors.muted }]}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: strong ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

export function Pill({ label, colors, tone = 'neutral' }) {
  const warn = tone === 'archived';
  return (
    <View style={[ui.pill, {
      borderColor: warn ? colors.warn || '#b54708' : colors.line,
      backgroundColor: warn ? `${colors.warn || '#b54708'}14` : colors.bg,
    }]}
    >
      {warn ? <Ionicons name="archive-outline" size={12} color={colors.ink} /> : null}
      <Text style={{ color: colors.ink, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function StatTile({ label, value, hint, colors }) {
  return (
    <View style={[ui.tile, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '600' }} numberOfLines={1}>{value}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, minHeight: 40 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, minHeight: 40 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: 150, flexGrow: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2, minWidth: 0 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { fontSize: 12, fontWeight: '600' },
  td: { fontSize: 13 },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  detailHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 16 },
  fact: { flexBasis: 140, flexGrow: 1, gap: 2 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  miniTable: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
