/**
 * ProTops felles byggeklosser (designsystemet, UX-01). Løftet fra ISO / K-HMS
 * (screens/iso/isoUi.jsx re-eksporterer herfra, så ISO ser ut som før).
 * Bruker fargetokens (useColors), Ionicons, DateField og OptionPicker, og følger
 * lyst og mørkt utseende. Nye moduler importerer fra src/ui.
 */
import React, { createContext, useContext } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import DateField from '../../components/DateField';
import OptionPicker from '../../components/OptionPicker';
import { dateKey } from '../utils/dates';
import { BREAKPOINTS } from '../theme';
import { elevationStyle, radius, space } from './tokens';
import BackLink from './BackLink';
import { useRepeatsShellTitle } from './ShellTitles';

export function useWide() {
  const { width } = useWindowDimensions();
  return width >= BREAKPOINTS.desktop;
}

export function usePhone() {
  const { width } = useWindowDimensions();
  return width < BREAKPOINTS.tablet;
}

/** Farge for ikon, strek og tonet bakgrunn. */
export function toneColor(colors, tone) {
  if (tone === 'ok') return colors.success;
  if (tone === 'warn') return colors.warn;
  if (tone === 'danger') return colors.danger;
  if (tone === 'info') return colors.brand;
  return colors.muted;
}

/** Tekstfarge for en tone: *Ink-variantene gir 4,5:1 mot kort og tonet bakgrunn. */
export function toneInk(colors, tone) {
  if (tone === 'ok') return colors.successInk || colors.success;
  if (tone === 'warn') return colors.warnInk || colors.warn;
  if (tone === 'danger') return colors.dangerInk || colors.danger;
  if (tone === 'info') return colors.brandInk || colors.brand;
  return colors.muted;
}

/**
 * Sideoverskrift. Modulbåndet (ModuleHero) i skallet viser modulnavnet,
 * så her vises bare undersidens tittel, en kort forklaring og handlinger.
 * Når skallet allerede viser samme tittel (toppfeltet eller tittelraden), står bare
 * forklaringen og knappene igjen: én tittel per side (AGENTS.md).
 * back: { label, onPress } gir tilbakelenken «‹ {label}» (BackLink) over tittelen.
 */
export function Page({ title, intro, actions, children, wide, back }) {
  const colors = useColors();
  const shellHasTitle = useRepeatsShellTitle(title);
  const head = !shellHasTitle || intro || actions;
  return (
    <View style={{ gap: 14 }}>
      {back ? <BackLink label={back.label} onPress={back.onPress} nativeID={back.nativeID} /> : null}
      {head ? (
        <View style={[styles.pageHead, { flexDirection: wide ? 'row' : 'column' }]}>
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            {shellHasTitle ? null : (
              <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header" aria-level={2}>{title}</Text>
            )}
            {intro ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{intro}</Text> : null}
          </View>
          {actions ? <View style={[styles.row, { flexWrap: 'wrap', gap: space.xs }]}>{actions}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ title, right, children, style, onPress, accessibilityLabel, subtitle }) {
  const colors = useColors();
  const body = (
    <>
      {title || right ? (
        <View style={[styles.row, { justifyContent: 'space-between', gap: space.xs }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? <Text style={[styles.cardTitle, { color: colors.ink }]} accessibilityRole={onPress ? undefined : 'header'} aria-level={onPress ? undefined : 3}>{title}</Text> : null}
            {subtitle ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </>
  );
  const base = [styles.card, { borderColor: colors.line, backgroundColor: colors.card }, style];
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} style={base}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={base}>{body}</View>;
}

/**
 * Knapp. variant: 'primary' | 'secondary' | 'danger' (kind er det gamle navnet, 'ghost' = secondary).
 * size 'sm' (eller small) gir 32 px høy knapp med trykkflate på 44 px.
 */
export function Button({
  label, icon, onPress, variant, kind, size, small, disabled, busy, accessibilityLabel, nativeID,
}) {
  const colors = useColors();
  const tone = variant || kind || 'secondary';
  const primary = tone === 'primary';
  const danger = tone === 'danger';
  const compact = small || size === 'sm';
  const bg = primary ? colors.brandInk : (danger ? `${colors.danger}14` : colors.bg);
  const fg = primary ? colors.onBrand : (danger ? colors.dangerInk : colors.ink);
  return (
    <TouchableOpacity
      onPress={disabled || busy ? undefined : onPress}
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      hitSlop={compact ? SMALL_HIT : undefined}
      style={[
        styles.btn,
        compact && styles.btnSmall,
        { backgroundColor: bg, borderColor: primary ? colors.brandInk : (danger ? `${colors.danger}55` : colors.line), opacity: disabled ? 0.45 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : (icon ? <Ionicons name={icon} size={compact ? 14 : 16} color={fg} /> : null)}
      {label ? <Text style={{ color: fg, fontWeight: '600', fontSize: compact ? 12 : 14, flexShrink: 1 }} numberOfLines={1}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

// 32 px høy knapp + 6 px over og under = 44 px trykkflate.
const SMALL_HIT = { top: 6, bottom: 6, left: 4, right: 4 };

/** Statusmerke: kort tekst med tone ('ok' | 'warn' | 'danger' | 'info' | 'muted'). */
export function Badge({ label, tone = 'muted', icon }) {
  const colors = useColors();
  const c = toneColor(colors, tone);
  const ink = toneInk(colors, tone);
  const hex = /^#/.test(String(c));
  return (
    <View style={[styles.pill, { backgroundColor: hex ? `${c}14` : colors.sunken, borderColor: hex ? `${c}44` : colors.line }]}>
      {icon ? <Ionicons name={icon} size={12} color={c} /> : null}
      <Text style={{ color: ink, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'info', icon }) {
  const colors = useColors();
  const c = toneColor(colors, tone);
  return (
    <View style={[styles.banner, { borderColor: `${c}55`, backgroundColor: `${c}12` }]} accessibilityRole="alert">
      <Ionicons name={icon || (tone === 'danger' ? 'alert-circle-outline' : (tone === 'ok' ? 'checkmark-circle-outline' : 'information-circle-outline'))} size={18} color={c} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 13, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

/** Tom tilstand: ikon, tittel, én setning om hvorfor, og en handling. */
export function EmptyState({ icon = 'file-tray-outline', title, text, action }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { borderColor: colors.line }]}>
      <Ionicons name={icon} size={28} color={colors.muted} />
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 15, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 19, maxWidth: 460 }}>{text}</Text> : null}
      {action || null}
    </View>
  );
}

// Feltet rundt en velger: navnet blir overskrift og skjermlesertekst, og påkrevd felt kan ikke tømmes.
const FieldContext = createContext(null);

export function useFieldContext() {
  return useContext(FieldContext);
}

export function Field({ label, hint, error, required, children }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
          {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      ) : null}
      <FieldContext.Provider value={{ label: typeof label === 'string' ? label : '', required: !!required }}>
        {children}
      </FieldContext.Provider>
      {hint && !error ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
      {error ? (
        <Text style={{ color: colors.dangerInk || colors.danger, fontSize: 12 }} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>
      ) : null}
    </View>
  );
}

/** Tekstfelt. Inne i et Field blir feltnavnet skjermlesertekst automatisk. */
export function TextIn({ value, onChangeText, multiline, placeholder, keyboardType, accessibilityLabel, rows = 4, editable = true }) {
  const colors = useColors();
  const field = useContext(FieldContext);
  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={onChangeText}
      multiline={multiline}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      keyboardType={keyboardType}
      accessibilityLabel={accessibilityLabel || field?.label || placeholder}
      style={[
        styles.input,
        { color: colors.ink, borderColor: colors.line, backgroundColor: editable ? colors.bg : colors.sunken },
        multiline && { minHeight: rows * 22, textAlignVertical: 'top' },
      ]}
    />
  );
}

/**
 * Valg. Under 5 valg: knapper side om side. 5 eller flere: liste med søk (felles velger for hele appen).
 * placeholder vises i feltet når ingenting er valgt (f.eks. «Alle» i filtre).
 */
export function Choice({ options, value, onChange, multi = false, small, placeholder = 'Velg', title, clearLabel, clearable }) {
  // Tømme valget: i filtre («Alle …») og valgfrie felt. Påkrevde felt og vippebrytere utenfor felt kan ikke tømmes.
  const field = useContext(FieldContext);
  const filter = /^Alle\b/.test(String(placeholder || ''));
  const canClear = clearable ?? (filter || (!!field && !field.required));
  return (
    <OptionPicker
      options={options}
      value={multi ? (value || []) : value}
      onChange={onChange}
      multiple={multi}
      small={small}
      placeholder={placeholder}
      title={title || field?.label || undefined}
      clearable={canClear}
      clearLabel={clearLabel || (filter ? placeholder : 'Ingen valgt')}
    />
  );
}

export function DateIn({ value, onChange, placeholder = 'Velg dato' }) {
  const colors = useColors();
  return (
    <View style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, paddingVertical: 2 }]}>
      <DateField
        value={value || null}
        placeholder={placeholder}
        onChange={(d) => onChange(d ? dateKey(d) : '')}
        textStyle={{ color: value ? colors.ink : colors.placeholder }}
        iconColor={colors.brand}
      />
    </View>
  );
}

export function Check({ label, value, onChange, required = false }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: !!value }} accessibilityLabel={required ? `${label} (påkrevd)` : label} style={[styles.row, { gap: space.xs, paddingVertical: 4 }]}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={20} color={value ? colors.brand : colors.muted} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{label}{required ? <Text style={{ color: colors.dangerInk || colors.danger }}> *</Text> : null}</Text>
    </TouchableOpacity>
  );
}

export function Sheet({ visible, title, onClose, children, footer, wide }) {
  const colors = useColors();
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Lukk" />
        <View
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line, maxWidth: wide ? 760 : 560 }]}
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={typeof title === 'string' ? title : undefined}
        >
          <View style={[styles.row, { justifyContent: 'space-between', paddingBottom: space.xs }]}>
            <Text style={[styles.cardTitle, { color: colors.ink, fontSize: 18 }]} accessibilityRole="header" aria-level={2}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" style={{ padding: 6 }} hitSlop={SMALL_HIT}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: Platform.OS === 'web' ? '70vh' : 520 }} contentContainerStyle={{ gap: 14, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={[styles.row, { justifyContent: 'flex-end', gap: space.xs, paddingTop: 10, flexWrap: 'wrap' }]}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

export function KV({ label, value, mono }) {
  const colors = useColors();
  if (value == null || value === '') return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 14, fontFamily: mono ? (Platform.OS === 'web' ? 'monospace' : undefined) : undefined }}>{String(value)}</Text>
    </View>
  );
}

export function Row({ children, gap = space.xs, wrap = true, style }) {
  return <View style={[styles.row, { gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />;
}

export function ListRow({ title, subtitle, right, onPress, icon, tone, nativeID, testID }) {
  const colors = useColors();
  // testID: hjelperundturen peker på første rad i en liste (src/help/protopPages.js).
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      nativeID={nativeID}
      testID={onPress ? (testID || 'iso-row') : undefined}
      style={[styles.listRow, { borderColor: colors.line }]}>
      {icon ? <Ionicons name={icon} size={18} color={toneColor(colors, tone)} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
    </TouchableOpacity>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pageHead: { gap: space.sm, alignItems: 'flex-start' },
  crumb: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, ...(Platform.OS === 'web' ? elevationStyle(1, 'web') : {}) },
  cardTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, alignSelf: 'flex-start', maxWidth: '100%' },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, borderRadius: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: space.sm },
  empty: { alignItems: 'center', gap: space.xs, padding: space.lg, borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sheet },
  input: { borderWidth: 1, borderRadius: radius.card, paddingHorizontal: space.sm, paddingVertical: 10, fontSize: 15, minHeight: 44 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs, minHeight: 36 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: space.sm },
  sheet: { width: '100%', borderRadius: 18, borderWidth: 1, padding: 18 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: space.sm, borderBottomWidth: 1, minHeight: 52 },
});
