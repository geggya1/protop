import React from 'react';
import {
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toneColor, pctWidth } from '../../src/hr/uiHelpers';
import { useRepeatsShellTitle } from '../../src/ui/ShellTitles';
import DateInput from '../../components/DateInput';

export function HrCard({ colors, children, style }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
}

/** Seksjonstittel. Samme tekst som sidetittelen i skallet (HR · Personell) vises ikke igjen. */
export function HrSectionTitle({ colors, title, subtitle, right }) {
  const shellHasTitle = useRepeatsShellTitle(title);
  if (shellHasTitle && !subtitle && !right) return null;
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {shellHasTitle ? null : <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>}
        {subtitle ? <Text style={[styles.sectionSub, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {right || null}
    </View>
  );
}

export function HrStat({ colors, label, value, hint }) {
  return (
    <View style={[styles.stat, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.ink }]}>{value}</Text>
      {hint ? <Text style={[styles.statHint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function HrChip({ colors, label, active, onPress, nativeID }) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.brand : colors.line,
          backgroundColor: active ? `${colors.brand}18` : colors.bg,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? colors.brand : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function HrButton({ colors, label, onPress, icon, primary, danger, disabled, nativeID }) {
  const bg = danger ? (colors.danger || '#b91c1c') : primary ? colors.brand : colors.bg;
  const fg = primary || danger ? '#fff' : colors.ink;
  return (
    <Pressable
      nativeID={nativeID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.button,
        {
          backgroundColor: bg,
          borderColor: primary || danger ? bg : colors.line,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** date: 'iso' eller 'nb' gir datovelger i stedet for tekstfelt, med verdien lagret i det formatet. */
export function HrField({
  colors, label, value, onChangeText, placeholder, multiline, keyboardType, autoFocus, date, clearable,
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text> : null}
      {date ? (
        <DateInput
          value={value ?? ''}
          onChange={onChangeText}
          format={date}
          placeholder={placeholder || undefined}
          clearable={!!clearable}
          accessibilityLabel={label || undefined}
          style={{ backgroundColor: colors.bg }}
        />
      ) : (
        <TextInput
          autoFocus={!!autoFocus}
          value={value ?? ''}
          onChangeText={onChangeText}
          placeholder={placeholder || ''}
          placeholderTextColor={colors.muted}
          multiline={!!multiline}
          keyboardType={keyboardType || 'default'}
          style={[
            styles.input,
            multiline && styles.inputMulti,
            { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
          ]}
        />
      )}
    </View>
  );
}

export function UtilizationBar({ colors, billablePct, targetPct, band }) {
  const tone = toneColor(band?.tone, colors);
  return (
    <View style={styles.utilWrap}>
      <View style={[styles.utilTrack, { backgroundColor: colors.line }]}>
        <View style={[styles.utilFill, { width: pctWidth(billablePct), backgroundColor: tone }]} />
        {targetPct != null ? (
          <View style={[styles.utilTarget, { left: pctWidth(targetPct), backgroundColor: colors.ink }]} />
        ) : null}
      </View>
      <View style={styles.utilMeta}>
        <Text style={[styles.utilPct, { color: tone }]}>{`${Number(billablePct || 0).toFixed(1)} %`}</Text>
        <Text style={[styles.utilBand, { color: colors.muted }]}>{band?.label || ''}</Text>
      </View>
    </View>
  );
}

export function SalarySparkline({ colors, series, showPercent = false }) {
  const amounts = (series || []).map((row) => Number(row.annualAmount) || 0);
  if (amounts.length < 2) {
    return (
      <Text style={[styles.sparkEmpty, { color: colors.muted }]}>
        Legg inn minst to lønnsår for å se utvikling.
      </Text>
    );
  }
  const max = Math.max(...amounts);
  const min = Math.min(...amounts);
  const span = Math.max(1, max - min);
  return (
    <View style={styles.sparkRow}>
      {amounts.map((amount, index) => {
        const h = 18 + ((amount - min) / span) * 52;
        const pct = series[index]?.changePercent;
        return (
          <View key={`${index}-${amount}`} style={styles.sparkCol}>
            {showPercent && pct != null ? (
              <Text style={[styles.sparkPct, { color: pct >= 0 ? (colors.brand || '#15803d') : (colors.danger || '#b91c1c') }]}>
                {`${pct > 0 ? '+' : ''}${pct}%`}
              </Text>
            ) : null}
            <View style={[styles.sparkBar, { height: h, backgroundColor: colors.brand }]} />
            <Text style={[styles.sparkLabel, { color: colors.muted }]}>
              {String(series[index].effectiveDate || '').slice(0, 4)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function EmptyHint({ colors, text }) {
  return <Text style={[styles.empty, { color: colors.muted }]}>{text}</Text>;
}

export function RowLink({ colors, title, subtitle, meta, onPress, icon = 'chevron-forward', nativeID }) {
  return (
    <Pressable nativeID={nativeID} onPress={onPress} style={[styles.row, { borderColor: colors.line }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: colors.muted }]} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {meta ? <Text style={[styles.rowMeta, { color: colors.muted }]}>{meta}</Text> : null}
      <Ionicons name={icon} size={18} color={colors.muted} />
    </Pressable>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    ...webShadow,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  sectionSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  stat: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  statHint: { fontSize: 12 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  buttonText: { fontSize: 13, fontWeight: '600' },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  utilWrap: { gap: 6 },
  utilTrack: { height: 10, borderRadius: 999, overflow: 'hidden', position: 'relative' },
  utilFill: { height: '100%', borderRadius: 999 },
  utilTarget: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 14,
    marginLeft: -1,
    opacity: 0.55,
  },
  utilMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  utilPct: { fontSize: 14, fontWeight: '700' },
  utilBand: { fontSize: 12 },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, minHeight: 96, paddingTop: 8 },
  sparkCol: { alignItems: 'center', gap: 4, flex: 1 },
  sparkBar: { width: '70%', maxWidth: 28, borderRadius: 6, minHeight: 18 },
  sparkLabel: { fontSize: 11 },
  sparkPct: { fontSize: 10, fontWeight: '700' },
  sparkEmpty: { fontSize: 13 },
  empty: { fontSize: 13, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
  },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  rowMeta: { fontSize: 12 },
});
