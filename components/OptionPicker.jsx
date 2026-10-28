import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { CHIP_LIMIT, SEARCH_FROM, filterOptions, normalizeOptions, optionSummary, pickerMode } from '../src/utils/optionPicker';

export { CHIP_LIMIT };

/**
 * Felles velger for hele appen.
 * 1–4 valg: knapper (chips) side om side. 5 eller flere: et felt som åpner en liste
 * (nedtrekk på web, bunnark på mobil), med søk når det er mange valg og avkrysning ved flervalg.
 *
 * options: [{ id, label, hint?, icon?, group? }] eller ['tekst']
 * value: id (enkeltvalg) eller [id] (multiple)
 * onChange: (id | [id]) → void. Enkeltvalg gir '' når valget fjernes.
 */
let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}
// Over ark (Modal) og hjelpekortet.
const PORTAL_Z = 2147483100;

function Chips({ list, value, onChange, multiple, small, clearable, disabled }) {
  const colors = useColors();
  const on = (id) => (multiple ? (value || []).includes(id) : value === id);
  return (
    <View style={styles.chips} accessibilityRole={multiple ? undefined : 'radiogroup'}>
      {list.map((o) => {
        const active = on(o.id);
        return (
          <TouchableOpacity
            key={String(o.id)}
            disabled={disabled}
            onPress={() => {
              if (multiple) onChange(active ? (value || []).filter((x) => x !== o.id) : [...(value || []), o.id]);
              else if (active) { if (clearable) onChange(''); } else onChange(o.id);
            }}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: active, disabled: !!disabled }}
            style={[styles.chip, small && styles.chipSmall, { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? `${colors.brand}18` : colors.bg, opacity: disabled ? 0.5 : 1 }]}
          >
            {active ? <Ionicons name="checkmark" size={13} color={colors.brand} /> : (o.icon ? <Ionicons name={o.icon} size={13} color={colors.muted} /> : null)}
            <Text style={{ color: active ? colors.brandInk : colors.ink, fontSize: small ? 12 : 13, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function OptionList({ list, value, multiple, onPick, onCustom, query, setQuery, searchable, highlight, setHighlight, clearRow, autoFocus, placeholder }) {
  const colors = useColors();
  const shown = filterOptions(list, query);
  const q = String(query || '').trim();
  const exact = shown.some((o) => o.label.toLowerCase() === q.toLowerCase());
  const rows = [
    ...(clearRow ? [{ kind: 'clear' }] : []),
    ...shown.map((o) => ({ kind: 'option', o })),
    ...(onCustom && q && !exact ? [{ kind: 'custom' }] : []),
  ];
  let lastGroup = null;
  return (
    <>
      {searchable ? (
        <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <Ionicons name="search" size={15} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={(t) => { setQuery(t); setHighlight(0); }}
            placeholder={placeholder || 'Søk'}
            placeholderTextColor={colors.placeholder}
            autoFocus={autoFocus}
            style={[styles.searchInput, { color: colors.ink }, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
            accessibilityLabel="Søk i valgene"
          />
        </View>
      ) : null}
      <ScrollView style={styles.listScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {rows.map((row, i) => {
          const hi = i === highlight;
          if (row.kind === 'clear') {
            return (
              <Pressable key="__clear" onPress={() => onPick('')} onHoverIn={() => setHighlight(i)} style={[styles.row, hi && { backgroundColor: colors.sunken }]} accessibilityRole="button">
                <Ionicons name="close-circle-outline" size={16} color={colors.muted} />
                <Text style={[styles.rowText, { color: colors.muted }]}>{clearRow}</Text>
              </Pressable>
            );
          }
          if (row.kind === 'custom') {
            return (
              <Pressable key="__custom" onPress={() => onCustom(q)} onHoverIn={() => setHighlight(i)} style={[styles.row, hi && { backgroundColor: colors.sunken }]} accessibilityRole="button">
                <Ionicons name="add" size={16} color={colors.brand} />
                <Text style={[styles.rowText, { color: colors.brandInk }]}>Bruk «{q}»</Text>
              </Pressable>
            );
          }
          const o = row.o;
          const active = multiple ? (value || []).includes(o.id) : value === o.id;
          const header = o.group && o.group !== lastGroup ? o.group : null;
          lastGroup = o.group || lastGroup;
          return (
            <React.Fragment key={String(o.id)}>
              {header ? <Text style={[styles.group, { color: colors.muted }]}>{header}</Text> : null}
              <Pressable
                onPress={() => onPick(o.id)}
                onHoverIn={() => setHighlight(i)}
                style={[styles.row, hi && { backgroundColor: colors.sunken }]}
                accessibilityRole={multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: active }}
              >
                {multiple ? (
                  <Ionicons name={active ? 'checkbox' : 'square-outline'} size={18} color={active ? colors.brand : colors.muted} />
                ) : (o.icon ? <Ionicons name={o.icon} size={16} color={active ? colors.brand : colors.muted} /> : null)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowText, { color: active ? colors.brandInk : colors.ink, fontWeight: active ? '600' : '400' }]} numberOfLines={2}>{o.label}</Text>
                  {o.hint ? <Text style={[styles.rowHint, { color: colors.muted }]} numberOfLines={1}>{o.hint}</Text> : null}
                </View>
                {!multiple && active ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
              </Pressable>
            </React.Fragment>
          );
        })}
        {!rows.length ? <Text style={[styles.empty, { color: colors.muted }]}>Ingen treff</Text> : null}
      </ScrollView>
    </>
  );
}

export default function OptionPicker({
  options, value, onChange, multiple = false, placeholder = 'Velg', small = false, clearable = true,
  clearLabel = 'Ingen valgt', searchable, searchPlaceholder, onCustom = null, chipLimit = CHIP_LIMIT, disabled = false,
  accessibilityLabel, title,
}) {
  const colors = useColors();
  const { width: winW } = useWindowDimensions();
  const list = useMemo(() => normalizeOptions(options), [options]);
  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [anchor, setAnchor] = useState(null);

  const useChips = pickerMode(list.length, { chipLimit, custom: !!onCustom }) === 'chips';
  const canSearch = searchable ?? (list.length > SEARCH_FROM || !!onCustom);
  const sheet = Platform.OS !== 'web' || !createPortal || winW < 600;
  const summary = optionSummary(list, value, multiple, placeholder);
  const clearRow = !multiple && clearable && value ? clearLabel : null;

  const close = () => { setOpen(false); setQuery(''); setHighlight(0); };
  const pick = (id) => {
    if (multiple) {
      const cur = value || [];
      onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
      return;
    }
    onChange(id);
    close();
  };
  const custom = onCustom ? (q) => { onCustom(q); close(); } : null;

  const openPicker = () => {
    if (disabled) return;
    if (!sheet && fieldRef.current?.getBoundingClientRect) {
      const r = fieldRef.current.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, 260), window.innerWidth - 16);
      const below = window.innerHeight - r.bottom;
      const up = below < 260 && r.top > below;
      setAnchor({
        left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
        width,
        top: up ? undefined : r.bottom + 4,
        bottom: up ? window.innerHeight - r.top + 4 : undefined,
        maxHeight: Math.max(180, Math.min(360, (up ? r.top : below) - 16)),
      });
    }
    setOpen(true);
  };

  // Web: tastatur i listen, og lukk ved endret vindusstørrelse eller rulling utenfor listen.
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open || sheet || typeof window === 'undefined') return undefined;
    const shown = filterOptions(list, query);
    const count = (clearRow ? 1 : 0) + shown.length + (custom && query.trim() && !shown.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()) ? 1 : 0);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(count - 1, h + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const i = highlight - (clearRow ? 1 : 0);
        if (clearRow && highlight === 0) pick('');
        else if (shown[i]) pick(shown[i].id);
        else if (custom && query.trim()) custom(query.trim());
      }
    };
    const onScroll = (e) => { if (panelRef.current && e.target && panelRef.current.contains?.(e.target)) return; close(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, sheet, list, query, highlight, clearRow]); // eslint-disable-line react-hooks/exhaustive-deps

  if (useChips) {
    return <Chips list={list} value={value} onChange={onChange} multiple={multiple} small={small} clearable={clearable} disabled={disabled} />;
  }

  const listProps = {
    list, value, multiple, onPick: pick, onCustom: custom, query, setQuery, searchable: canSearch, highlight, setHighlight, clearRow,
    placeholder: searchPlaceholder,
  };

  return (
    <View>
      <Pressable
        ref={fieldRef}
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel || title || placeholder}: ${summary.empty ? 'ingen valgt' : summary.text}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        style={({ hovered }) => [styles.field, small && styles.fieldSmall, { borderColor: open ? colors.brand : (hovered ? colors.muted : colors.line), backgroundColor: colors.card, opacity: disabled ? 0.5 : 1 }]}
      >
        <Text style={[styles.fieldText, small && { fontSize: 13 }, { color: summary.empty ? colors.placeholder : colors.ink }]} numberOfLines={1}>{summary.text}</Text>
        {multiple && (value || []).length ? (
          <View style={[styles.count, { backgroundColor: `${colors.brand}18` }]}><Text style={{ color: colors.brandInk, fontSize: 12, fontWeight: '600' }}>{(value || []).length}</Text></View>
        ) : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>

      {open && !sheet && anchor ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: PORTAL_Z }} data-option-picker="1">
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Lukk listen" />
          <div
            ref={panelRef}
            style={{
              position: 'fixed', left: anchor.left, width: anchor.width, top: anchor.top, bottom: anchor.bottom, maxHeight: anchor.maxHeight,
              display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, border: `1px solid ${colors.line}`,
              background: colors.card, boxShadow: '0 12px 32px rgba(15,23,42,0.18)',
            }}
          >
            <OptionList {...listProps} autoFocus />
            {multiple ? (
              <View style={[styles.footer, { borderTopColor: colors.line }]}>
                {(value || []).length ? <TouchableOpacity onPress={() => onChange([])} accessibilityRole="button"><Text style={{ color: colors.muted, fontSize: 13 }}>Fjern alle</Text></TouchableOpacity> : <View />}
                <TouchableOpacity onPress={close} style={[styles.done, { backgroundColor: colors.brandInk }]} accessibilityRole="button"><Text style={[styles.doneText, { color: colors.onBrand }]}>Ferdig</Text></TouchableOpacity>
              </View>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}

      {open && sheet ? (
        <Modal transparent visible animationType="slide" onRequestClose={close}>
          <View style={styles.sheetScrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Lukk listen" />
            <View style={[styles.sheet, { backgroundColor: colors.card }]}>
              <View style={styles.sheetHead}>
                <Text style={[styles.sheetTitle, { color: colors.ink }]} numberOfLines={1}>{title || placeholder}</Text>
                <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel="Lukk" hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <OptionList {...listProps} autoFocus={false} />
              {multiple ? (
                <View style={[styles.footer, { borderTopColor: colors.line }]}>
                  {(value || []).length ? <TouchableOpacity onPress={() => onChange([])} accessibilityRole="button"><Text style={{ color: colors.muted, fontSize: 14 }}>Fjern alle</Text></TouchableOpacity> : <View />}
                  <TouchableOpacity onPress={close} style={[styles.done, { backgroundColor: colors.brandInk }]} accessibilityRole="button"><Text style={[styles.doneText, { color: colors.onBrand }]}>Ferdig</Text></TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, minHeight: 34 },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 9, minHeight: 30 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, alignSelf: 'stretch', maxWidth: 520 },
  fieldSmall: { minHeight: 34, paddingHorizontal: 10 },
  fieldText: { flex: 1, fontSize: 14 },
  count: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 8, marginBottom: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, minHeight: 38 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  listScroll: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 42 },
  rowText: { fontSize: 14 },
  rowHint: { fontSize: 12, marginTop: 1 },
  group: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  empty: { padding: 14, fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  done: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  doneText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
});
