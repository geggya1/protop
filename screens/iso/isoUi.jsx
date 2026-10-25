/**
 * Felles UI-byggeklosser for ISO / K-HMS. Bruker ProTops fargetokens (useColors),
 * Ionicons og DateField, så modulen følger samme profil i lyst og mørkt utseende.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import DateField from '../../components/DateField';
import { dateKey } from '../../src/utils/dates';

export function useWide() {
  const { width } = useWindowDimensions();
  return width >= 1024;
}

export function usePhone() {
  const { width } = useWindowDimensions();
  return width < 768;
}

export function toneColor(colors, tone) {
  if (tone === 'ok') return colors.success;
  if (tone === 'warn') return colors.warn;
  if (tone === 'danger') return colors.danger;
  if (tone === 'info') return colors.brand;
  return colors.muted;
}

/**
 * Sideoverskrift inne i ISO. Modulbåndet (ModuleHero) i skallet viser modulnavnet,
 * så her vises bare undersidens tittel, en kort forklaring og handlinger – som i HR og Økonomi.
 */
export function Page({ title, intro, actions, children, wide, back }) {
  const colors = useColors();
  return (
    <View style={{ gap: 14 }}>
      {back ? (
        <TouchableOpacity onPress={back.onPress} accessibilityRole="link" style={[styles.row, { gap: 4, alignSelf: 'flex-start', minHeight: 32 }]}>
          <Ionicons name="chevron-back" size={16} color={colors.brand} />
          <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>{back.label || 'Tilbake'}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={[styles.pageHead, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">{title}</Text>
          {intro ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{intro}</Text> : null}
        </View>
        {actions ? <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}

export function Card({ title, right, children, style, onPress, accessibilityLabel, subtitle }) {
  const colors = useColors();
  const body = (
    <>
      {title || right ? (
        <View style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? <Text style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text> : null}
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

export function Btn({ label, icon, onPress, kind = 'ghost', disabled, small, busy, accessibilityLabel }) {
  const colors = useColors();
  const primary = kind === 'primary';
  const danger = kind === 'danger';
  const bg = primary ? colors.brand : (danger ? `${colors.danger}14` : colors.bg);
  const fg = primary ? '#fff' : (danger ? colors.danger : colors.ink);
  return (
    <TouchableOpacity
      onPress={disabled || busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, borderColor: primary ? colors.brand : (danger ? `${colors.danger}55` : colors.line), opacity: disabled ? 0.45 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : (icon ? <Ionicons name={icon} size={small ? 14 : 16} color={fg} /> : null)}
      {label ? <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 12 : 14, flexShrink: 1 }} numberOfLines={1}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

export function Pill({ label, tone = 'muted', icon }) {
  const colors = useColors();
  const c = toneColor(colors, tone);
  const hex = /^#/.test(String(c));
  return (
    <View style={[styles.pill, { backgroundColor: hex ? `${c}1c` : colors.sunken, borderColor: hex ? `${c}44` : colors.line }]}>
      {icon ? <Ionicons name={icon} size={12} color={c} /> : null}
      <Text style={{ color: c, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
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

export function Empty({ icon = 'file-tray-outline', title, text, action }) {
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

export function Field({ label, hint, error, required, children }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>
          {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      ) : null}
      {children}
      {hint && !error ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
      {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function TextIn({ value, onChangeText, multiline, placeholder, keyboardType, accessibilityLabel, rows = 4, editable = true }) {
  const colors = useColors();
  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={onChangeText}
      multiline={multiline}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      keyboardType={keyboardType}
      accessibilityLabel={accessibilityLabel || placeholder}
      style={[
        styles.input,
        { color: colors.ink, borderColor: colors.line, backgroundColor: editable ? colors.bg : colors.sunken },
        multiline && { minHeight: rows * 22, textAlignVertical: 'top' },
      ]}
    />
  );
}

export function Choice({ options, value, onChange, multi = false, small }) {
  const colors = useColors();
  const list = (options || []).map((o) => (typeof o === 'string' ? { id: o, label: o } : o));
  const active = (id) => (multi ? (value || []).includes(id) : value === id);
  return (
    <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]} accessibilityRole={multi ? undefined : 'radiogroup'}>
      {list.map((o) => {
        const on = active(o.id);
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => {
              if (!multi) return onChange(on ? '' : o.id);
              const cur = value || [];
              return onChange(on ? cur.filter((x) => x !== o.id) : [...cur, o.id]);
            }}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
            style={[styles.chip, small && { paddingVertical: 5, paddingHorizontal: 9, minHeight: 30 }, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? `${colors.brand}18` : colors.bg }]}
          >
            {on ? <Ionicons name="checkmark" size={13} color={colors.brand} /> : null}
            <Text style={{ color: on ? colors.brand : colors.ink, fontSize: small ? 12 : 13, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
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

export function Check({ label, value, onChange }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: !!value }} style={[styles.row, { gap: 8, paddingVertical: 4 }]}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={20} color={value ? colors.brand : colors.muted} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Velg person fra ProTops ansattregister (ingen egen brukerliste). */
export function PersonPick({ people, value, onChange, placeholder = 'Søk etter ansatt' }) {
  const colors = useColors();
  const [q, setQ] = useState('');
  // Uten søk: bare egne aktive ansatte. Søk når også innleide, eksterne og inaktive.
  const list = (people || [])
    .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : p.own !== false))
    .slice(0, 8);
  return (
    <View style={{ gap: 6 }}>
      {value ? (
        <View style={[styles.row, { gap: 8 }]}>
          <Pill label={value} tone="info" icon="person" />
          <Btn small label="Endre" onPress={() => onChange({ name: '', uid: '' })} />
        </View>
      ) : (
        <>
          <TextIn value={q} onChangeText={setQ} placeholder={placeholder} />
          <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]}>
            {list.map((p) => (
              <TouchableOpacity key={p.id || p.name} onPress={() => { onChange({ name: p.name, uid: p.uid || '' }); setQ(''); }} style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.card }]} accessibilityRole="button">
                <Ionicons name="person-outline" size={13} color={colors.muted} />
                <Text style={{ color: colors.ink, fontSize: 13 }}>{p.name}</Text>
              </TouchableOpacity>
            ))}
            {q && !list.length ? (
              <TouchableOpacity onPress={() => { onChange({ name: q.trim(), uid: '' }); setQ(''); }} style={[styles.chip, { borderColor: colors.line }]} accessibilityRole="button">
                <Text style={{ color: colors.ink, fontSize: 13 }}>Bruk «{q.trim()}»</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

export function Sheet({ visible, title, onClose, children, footer, wide }) {
  const colors = useColors();
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Lukk" />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line, maxWidth: wide ? 760 : 560 }]}>
          <View style={[styles.row, { justifyContent: 'space-between', paddingBottom: 8 }]}>
            <Text style={[styles.cardTitle, { color: colors.ink, fontSize: 18 }]} accessibilityRole="header">{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: Platform.OS === 'web' ? '70vh' : 520 }} contentContainerStyle={{ gap: 14, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={[styles.row, { justifyContent: 'flex-end', gap: 8, paddingTop: 10, flexWrap: 'wrap' }]}>{footer}</View> : null}
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

export function Row({ children, gap = 8, wrap = true, style }) {
  return <View style={[styles.row, { gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />;
}

export function ListRow({ title, subtitle, right, onPress, icon, tone, nativeID }) {
  const colors = useColors();
  // testID: hjelperundturen peker på første rad i en liste (src/help/protopPages.js).
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      nativeID={nativeID}
      testID={onPress ? 'iso-row' : undefined}
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
  pageHead: { gap: 12, alignItems: 'flex-start' },
  crumb: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, ...(Platform.OS === 'web' ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' } : {}) },
  cardTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, alignSelf: 'flex-start', maxWidth: '100%' },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, borderRadius: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 12 },
  empty: { alignItems: 'center', gap: 8, padding: 24, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, minHeight: 44 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  sheet: { width: '100%', borderRadius: 18, borderWidth: 1, padding: 18 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, minHeight: 52 },
});
