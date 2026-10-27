/**
 * Felles byggeklosser for Møter: knapper, statusmerker, datoflis, avatarer,
 * faner med tall, søk og tomtilstand. Farger følger valgt utseende (lys/mørk).
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { initials, MONTHS_SHORT, phaseInfo, WEEKDAYS_SHORT, weekdayOf } from '../../src/meetings/model';
import { meetingType } from '../../src/meetings/templates';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* native */ }
}

export const TONES = {
  muted: { fg: '#475569', bg: '#eef2f6', dot: '#94a3b8' },
  info: { fg: '#075985', bg: '#e0f2fe', dot: '#0ea5e9' },
  live: { fg: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  warn: { fg: '#92400e', bg: '#fef3c7', dot: '#f59e0b' },
  success: { fg: '#166534', bg: '#dcfce7', dot: '#22c55e' },
  danger: { fg: '#991b1b', bg: '#fee2e2', dot: '#ef4444' },
  brand: { fg: '#0b6fb8', bg: '#e3f2fe', dot: '#1099F4' },
  violet: { fg: '#5b21b6', bg: '#ede9fe', dot: '#7c3aed' },
};

const AVATAR_COLORS = ['#1099F4', '#7c3aed', '#0f766e', '#ea580c', '#db2777', '#2563eb', '#ca8a04', '#0891b2'];

export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Btn({
  label, icon, onPress, tone = 'ghost', small = false, busy = false, disabled = false, nativeID, style, iconRight = false, accessibilityLabel,
}) {
  const colors = useColors();
  const palette = {
    primary: { bg: colors.brand, fg: '#fff', border: colors.brand },
    dark: { bg: '#07274C', fg: '#fff', border: '#07274C' },
    success: { bg: '#16a34a', fg: '#fff', border: '#16a34a' },
    danger: { bg: colors.card, fg: '#dc2626', border: '#fecaca' },
    soft: { bg: `${colors.brand}14`, fg: colors.brand, border: 'transparent' },
    ghost: { bg: colors.card, fg: colors.ink, border: colors.line },
    plain: { bg: 'transparent', fg: colors.muted, border: 'transparent' },
    ai: { bg: '#f5f3ff', fg: '#6d28d9', border: '#ddd6fe' },
  }[tone] || { bg: colors.card, fg: colors.ink, border: colors.line };
  const off = disabled || busy;
  return (
    <Pressable
      nativeID={nativeID}
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: off, busy }}
      style={({ hovered, pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        !label && styles.btnIconOnly,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.45 : 1 },
        hovered && !off && { transform: [{ translateY: -1 }], shadowOpacity: tone === 'primary' ? 0.18 : 0.06 },
        pressed && !off && { opacity: 0.85 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : null}
      {!busy && icon && !iconRight ? <Ionicons name={icon} size={small ? 15 : 17} color={palette.fg} /> : null}
      {label ? <Text style={[styles.btnText, small && styles.btnTextSmall, { color: palette.fg }]} numberOfLines={1}>{label}</Text> : null}
      {!busy && icon && iconRight ? <Ionicons name={icon} size={small ? 15 : 17} color={palette.fg} /> : null}
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, label, color, size = 18, disabled = false, nativeID, active = false }) {
  const colors = useColors();
  return (
    <Pressable
      nativeID={nativeID}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ hovered }) => [
        styles.iconBtn,
        { opacity: disabled ? 0.35 : 1 },
        (hovered || active) && !disabled && { backgroundColor: `${colors.brand}12` },
      ]}
    >
      <Ionicons name={icon} size={size} color={color || (active ? colors.brand : colors.muted)} />
    </Pressable>
  );
}

export function Pill({ label, tone = 'muted', icon, dot = false, small = false, style }) {
  const t = TONES[tone] || TONES.muted;
  return (
    <View style={[styles.pill, small && styles.pillSmall, { backgroundColor: t.bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      {icon ? <Ionicons name={icon} size={small ? 11 : 12} color={t.fg} /> : null}
      <Text style={[styles.pillText, small && styles.pillTextSmall, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function PhasePill({ phase, small }) {
  const info = phaseInfo(phase);
  return <Pill label={info.label} tone={info.tone} dot small={small} />;
}

export function TypeBadge({ typeId, compact = false }) {
  const colors = useColors();
  const type = meetingType(typeId);
  return (
    <View style={[styles.typeBadge, { borderColor: colors.line }]}>
      <View style={[styles.typeIcon, { backgroundColor: `${type.color}1f` }]}>
        <Ionicons name={type.icon} size={11} color={type.color} />
      </View>
      {!compact ? <Text style={[styles.typeText, { color: colors.muted }]} numberOfLines={1}>{type.label}</Text> : null}
    </View>
  );
}

export function TypeIcon({ typeId, size = 40 }) {
  const type = meetingType(typeId);
  return (
    <View style={[styles.typeIconBig, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: `${type.color}1a` }]}>
      <Ionicons name={type.icon} size={size * 0.48} color={type.color} />
    </View>
  );
}

export function NumberChip({ number }) {
  const colors = useColors();
  if (!number) return null;
  return (
    <View style={[styles.numberChip, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
      <Text style={[styles.numberText, { color: colors.muted }]}>Møte {number}</Text>
    </View>
  );
}

/** Datoflis: måned, dag og ukedag. Uten dato vises en strek. */
export function DateTile({ date, size = 'md', highlight = false, muted = false }) {
  const colors = useColors();
  const big = size === 'lg';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const accent = muted ? colors.muted : (highlight ? '#fff' : colors.brand);
  const ink = highlight ? '#fff' : colors.ink;
  return (
    <View
      style={[
        styles.tile,
        big && styles.tileLg,
        { backgroundColor: highlight ? colors.brand : colors.sunken, borderColor: highlight ? colors.brand : colors.line },
      ]}
    >
      {m ? (
        <>
          <Text style={[styles.tileMonth, big && styles.tileMonthLg, { color: accent }]}>{MONTHS_SHORT[Number(m[2]) - 1].toUpperCase()}</Text>
          <Text style={[styles.tileDay, big && styles.tileDayLg, { color: ink }]}>{Number(m[3])}</Text>
          <Text style={[styles.tileWeek, { color: highlight ? '#e0f2fe' : colors.muted }]}>{WEEKDAYS_SHORT[weekdayOf(date)]}</Text>
        </>
      ) : (
        <>
          <Text style={[styles.tileDay, big && styles.tileDayLg, { color: colors.muted }]}>–</Text>
          <Text style={[styles.tileWeek, { color: colors.muted }]}>uten dato</Text>
        </>
      )}
    </View>
  );
}

export function Avatar({ name, photoUrl, size = 28, ring }) {
  const colors = useColors();
  const bg = avatarColor(name);
  const ringColor = ring || colors.card;
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ringColor }}
      />
    );
  }
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: `${bg}22`,
        alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ringColor,
      }}
    >
      <Text style={{ color: bg, fontSize: size * 0.36, fontWeight: '700' }}>{initials(name)}</Text>
    </View>
  );
}

export function AvatarStack({ people = [], max = 4, size = 26 }) {
  const colors = useColors();
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View key={p.id || p.name || i} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={p.name} photoUrl={p.photoUrl} size={size} />
        </View>
      ))}
      {rest > 0 ? (
        <View style={[styles.more, { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.3, backgroundColor: colors.sunken, borderColor: colors.card }]}>
          <Text style={{ fontSize: size * 0.34, color: colors.muted, fontWeight: '700' }}>+{rest}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Segmenterte faner med tall. */
export function SegTabs({ tabs, value, onChange, nativeIDPrefix = 'seg' }) {
  const colors = useColors();
  return (
    <View style={[styles.seg, { backgroundColor: colors.sunken, borderColor: colors.line }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            nativeID={`${nativeIDPrefix}-${tab.id}`}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ hovered }) => [
              styles.segItem,
              active && [styles.segActive, { backgroundColor: colors.card }],
              hovered && !active && { backgroundColor: `${colors.card}99` },
            ]}
          >
            <Text style={[styles.segText, { color: active ? colors.ink : colors.muted, fontWeight: active ? '700' : '500' }]}>{tab.label}</Text>
            {tab.count != null ? (
              <View style={[styles.segCount, { backgroundColor: active ? (tab.alert ? '#fef3c7' : `${colors.brand}18`) : colors.card }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: active ? (tab.alert ? '#92400e' : colors.brand) : colors.muted }}>{tab.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Understreket fanerad (inne i et møte). */
export function UnderTabs({ tabs, value, onChange }) {
  const colors = useColors();
  return (
    <View style={[styles.under, { borderBottomColor: colors.line }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            nativeID={`meeting-tab-${tab.id}`}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ hovered }) => [styles.underItem, { borderBottomColor: active ? colors.brand : 'transparent' }, hovered && !active && { borderBottomColor: colors.line }]}
          >
            {tab.icon ? <Ionicons name={tab.icon} size={16} color={active ? colors.brand : colors.muted} /> : null}
            <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? colors.ink : colors.muted }}>{tab.label}</Text>
            {tab.count != null ? <Text style={{ fontSize: 12, color: colors.muted }}>{tab.count}</Text> : null}
            {tab.dot ? <View style={[styles.dot, { backgroundColor: tab.dot }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Søk', nativeID, style }) {
  const colors = useColors();
  return (
    <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }, style]}>
      <Ionicons name="search" size={16} color={colors.muted} />
      <TextInput
        nativeID={nativeID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel={placeholder}
        style={[styles.searchInput, { color: colors.ink }]}
      />
      {value ? <IconBtn icon="close-circle" size={16} label="Tøm søk" onPress={() => onChange('')} /> : null}
    </View>
  );
}

/** Tekstfelt med etikett. */
export function Field({
  label, value, onChange, placeholder, multiline = false, minHeight, editable = true, nativeID, style, inputStyle, hint, autoFocus, onBlur, keyboardType, maxLength,
}) {
  const colors = useColors();
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={[styles.label, { color: colors.muted }]}>{label}</Text> : null}
      <TextInput
        nativeID={nativeID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        editable={editable}
        autoFocus={autoFocus}
        onBlur={onBlur}
        keyboardType={keyboardType}
        maxLength={maxLength}
        accessibilityLabel={label || placeholder}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && { minHeight: minHeight || 96, paddingTop: 10, lineHeight: 21 },
          { color: colors.ink, borderColor: colors.line, backgroundColor: editable ? colors.card : colors.sunken },
          inputStyle,
        ]}
      />
      {hint ? <Text style={{ fontSize: 12, color: colors.muted }}>{hint}</Text> : null}
    </View>
  );
}

export function Label({ children, style }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.muted }, style]}>{children}</Text>;
}

export function Banner({ tone = 'info', icon = 'information-circle', title, children, action }) {
  const t = TONES[tone] || TONES.info;
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={{ color: t.fg, fontWeight: '700', fontSize: 13 }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={{ color: t.fg, fontSize: 13, lineHeight: 19 }}>{children}</Text> : children}
      </View>
      {action || null}
    </View>
  );
}

export function Empty({ icon = 'calendar-outline', title, text, action }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: `${colors.brand}12` }]}>
        <Ionicons name={icon} size={28} color={colors.brand} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>{title}</Text>
      {text ? <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', maxWidth: 420, lineHeight: 19 }}>{text}</Text> : null}
      {action || null}
    </View>
  );
}

export function Card({ children, style, pad = 16 }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, padding: pad }, style]}>{children}</View>;
}

export function SectionHead({ title, count, right, style }) {
  const colors = useColors();
  return (
    <View style={[styles.sectionHead, style]}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      {count != null ? <Text style={[styles.sectionCount, { color: colors.muted, backgroundColor: colors.sunken }]}>{count}</Text> : null}
      <View style={{ flex: 1 }} />
      {right || null}
    </View>
  );
}

/** Avkrysning. */
/** label vises ved siden av boksen. a11y er bare for skjermleser. */
export function Check({ checked, onPress, label, a11y, disabled = false, size = 20, color, nativeID }) {
  const colors = useColors();
  const on = color || colors.brand;
  return (
    <Pressable
      nativeID={nativeID}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked, disabled }}
      accessibilityLabel={a11y || label}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={[styles.check, { width: size, height: size, borderRadius: size * 0.28, borderColor: checked ? on : colors.line, backgroundColor: checked ? on : colors.card }]}>
        {checked ? <Ionicons name="checkmark" size={size * 0.75} color="#fff" /> : null}
      </View>
      {label ? <Text style={{ color: colors.ink, fontSize: 14 }}>{label}</Text> : null}
    </Pressable>
  );
}

/** Små valgknapper i én rad. */
export function Choice({ options, value, onChange, small = false, nativeIDPrefix }) {
  const colors = useColors();
  return (
    <View style={styles.choiceRow}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            nativeID={nativeIDPrefix ? `${nativeIDPrefix}-${opt.id}` : undefined}
            onPress={() => onChange(opt.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            style={({ hovered }) => [
              styles.choice,
              small && styles.choiceSmall,
              {
                borderColor: active ? (opt.color || colors.brand) : colors.line,
                backgroundColor: active ? `${opt.color || colors.brand}14` : colors.card,
              },
              hovered && !active && { borderColor: colors.muted },
            ]}
          >
            {opt.icon ? <Ionicons name={opt.icon} size={14} color={active ? (opt.color || colors.brand) : colors.muted} /> : null}
            <Text style={{ fontSize: small ? 12 : 13, color: active ? (opt.color || colors.brand) : colors.ink, fontWeight: active ? '700' : '500' }}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stat({ icon, label, value, tone = 'brand', onPress, hint, nativeID }) {
  const colors = useColors();
  const t = TONES[tone] || TONES.brand;
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ hovered }) => [styles.stat, { backgroundColor: colors.card, borderColor: hovered && onPress ? t.dot : colors.line }]}
    >
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={18} color={t.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>{value}</Text>
        <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>{label}</Text>
        {hint ? <Text style={{ fontSize: 11.5, color: t.fg, marginTop: 2 }} numberOfLines={1}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Spinner({ label }) {
  const colors = useColors();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.brand} />
      {label ? <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text> : null}
    </View>
  );
}

/**
 * Nedtrekksmeny. items: [{ id, label, icon, tone, disabled, hint, divider }]
 * Web: portal under knappen. Native: ark nederst.
 */
export function Menu({ label = 'Mer', icon = 'ellipsis-horizontal', items = [], onSelect, nativeID, tone = 'ghost', small = false }) {
  const colors = useColors();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const web = Platform.OS === 'web' && createPortal && typeof document !== 'undefined';
  const show = () => {
    if (web && ref.current?.getBoundingClientRect) {
      const r = ref.current.getBoundingClientRect();
      const width = 280;
      const below = window.innerHeight - r.bottom;
      setAnchor({
        left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
        top: below > 320 ? r.bottom + 6 : undefined,
        bottom: below > 320 ? undefined : window.innerHeight - r.top + 6,
        width,
      });
    }
    setOpen(true);
  };
  const pick = (item) => {
    if (item.disabled) return;
    setOpen(false);
    onSelect?.(item.id);
  };
  const list = (
    <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]} accessibilityRole="menu">
      {items.map((item, i) => (item.divider ? (
        <View key={`d${i}`} style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
      ) : (
        <Pressable
          key={item.id}
          nativeID={`menu-${item.id}`}
          onPress={() => pick(item)}
          accessibilityRole="menuitem"
          accessibilityState={{ disabled: !!item.disabled }}
          style={({ hovered }) => [styles.menuItem, hovered && !item.disabled && { backgroundColor: colors.sunken }, item.disabled && { opacity: 0.4 }]}
        >
          <Ionicons name={item.icon || 'ellipse-outline'} size={17} color={item.tone === 'danger' ? '#dc2626' : (item.tone === 'ai' ? '#7c3aed' : colors.muted)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, color: item.tone === 'danger' ? '#dc2626' : colors.ink }}>{item.label}</Text>
            {item.hint ? <Text style={{ fontSize: 11.5, color: colors.muted }} numberOfLines={2}>{item.hint}</Text> : null}
          </View>
        </Pressable>
      )))}
    </View>
  );
  return (
    <View ref={ref} collapsable={false}>
      <Btn label={label} icon={icon} tone={tone} small={small} onPress={show} nativeID={nativeID} accessibilityLabel={label || 'Flere valg'} />
      {open && web && anchor ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 2147483001 }}>
          <div role="presentation" onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0 }} />
          <div style={{ position: 'absolute', left: anchor.left, top: anchor.top, bottom: anchor.bottom, width: anchor.width }}>{list}</div>
        </div>,
        document.body,
      ) : null}
      {open && !web ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setOpen(false)}>
            <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420 }}>{list}</Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { borderWidth: 1, borderRadius: 12, paddingVertical: 6, shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 9 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end', alignItems: 'center', padding: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1,
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, shadowOpacity: 0,
  },
  btnSmall: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, gap: 5 },
  btnIconOnly: { paddingHorizontal: 9 },
  btnText: { fontSize: 14, fontWeight: '600' },
  btnTextSmall: { fontSize: 13 },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillSmall: { paddingHorizontal: 7, paddingVertical: 2, gap: 4 },
  pillText: { fontSize: 12, fontWeight: '600' },
  pillTextSmall: { fontSize: 11 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingLeft: 3, paddingRight: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  typeIcon: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  typeText: { fontSize: 11.5, fontWeight: '500' },
  typeIconBig: { alignItems: 'center', justifyContent: 'center' },
  numberChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  numberText: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
  tile: { width: 58, minHeight: 62, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  tileLg: { width: 78, minHeight: 84, borderRadius: 16 },
  tileMonth: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  tileMonthLg: { fontSize: 12 },
  tileDay: { fontSize: 22, fontWeight: '800', lineHeight: 26, letterSpacing: -0.5 },
  tileDayLg: { fontSize: 32, lineHeight: 38 },
  tileWeek: { fontSize: 11, fontWeight: '500' },
  more: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 12, borderWidth: 1, padding: 4, gap: 2, alignSelf: 'flex-start' },
  segItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  segActive: { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segText: { fontSize: 13.5 },
  segCount: { minWidth: 22, paddingHorizontal: 6, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  under: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderBottomWidth: 1 },
  underItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 2, marginBottom: -1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, minHeight: 40 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8, outlineStyle: 'none', minWidth: 60 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14.5, minHeight: 42 },
  banner: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, alignItems: 'flex-start' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 20 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  sectionCount: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  check: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  choiceSmall: { paddingHorizontal: 9, paddingVertical: 4 },
  stat: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
