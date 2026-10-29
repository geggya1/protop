/**
 * Datofelt med kalender, brukt overalt der en dato legges inn.
 * Ser ut som et vanlig tekstfelt. Trykk åpner kalenderen:
 * - nett (også mobil Safari): nettleserens egen datovelger (input type=date over feltet).
 * - app: DateTimePicker, med «Ferdig» på iOS.
 *
 * value: «åååå-mm-dd» eller «dd.mm.åååå». onChange får verdien tilbake i samme format
 * (format 'iso' eller 'nb'; uten format gjelder formatet verdien har, ellers iso).
 * Tom verdi gir tom streng. clearable viser en knapp som tømmer feltet.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { radius, space, type } from '../src/ui/tokens';
import { detectDateFormat, displayDate, outputDate, toIsoDate } from '../src/utils/dateInput';

const OVERLAY = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  opacity: 0.02,
  color: 'transparent',
  background: 'transparent',
  cursor: 'pointer',
  border: 'none',
  zIndex: 2,
};

function localDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export default function DateInput({
  value,
  onChange,
  format,
  placeholder = 'Velg dato',
  editable = true,
  clearable = false,
  min,
  max,
  style,
  textStyle,
  accessibilityLabel,
  nativeID,
  compact = false,
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const iso = toIsoDate(value);
  const out = format || detectDateFormat(value, 'iso');
  const minIso = toIsoDate(min);
  const maxIso = toIsoDate(max);
  const shown = iso ? displayDate(iso) : (value && !iso ? String(value) : '');
  const label = accessibilityLabel || placeholder;
  const emit = (next) => onChange?.(next ? outputDate(next, out) : '');
  const box = [
    styles.box,
    compact && styles.compact,
    { borderColor: colors.line, backgroundColor: editable ? colors.card : (colors.sunken || colors.bg) },
    style,
  ];
  const text = (
    <Text
      style={[styles.text, { color: shown ? colors.ink : colors.placeholder || colors.muted }, compact && styles.compactText, textStyle]}
      numberOfLines={1}
    >
      {shown || placeholder}
    </Text>
  );
  const clear = clearable && editable && value ? (
    <TouchableOpacity
      onPress={() => emit('')}
      accessibilityRole="button"
      accessibilityLabel={`Tøm ${label.toLowerCase()}`}
      hitSlop={8}
      style={styles.clear}
    >
      <Ionicons name="close-circle" size={18} color={colors.muted} />
    </TouchableOpacity>
  ) : null;

  if (!editable) {
    return (
      <View style={box} nativeID={nativeID} accessibilityLabel={`${label}: ${shown || 'ikke satt'}`}>
        {text}
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={box} nativeID={nativeID}>
        <Ionicons name="calendar-outline" size={compact ? 16 : 18} color={colors.brand} />
        {text}
        {clear}
        <input
          type="date"
          value={iso}
          min={minIso || undefined}
          max={maxIso || undefined}
          aria-label={label}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            // Chrome og Edge på PC åpner kalenderen bare fra ikonet i feltet, som er usynlig her.
            try { e.currentTarget.showPicker?.(); } catch { /* eldre nettlesere: fokus holder */ }
          }}
          onChange={(e) => emit(e.target.value)}
          style={{ ...OVERLAY, right: clear ? 34 : 0, width: clear ? 'calc(100% - 34px)' : '100%' }}
        />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={box}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown || 'ikke valgt'}`}
        nativeID={nativeID}
      >
        <Ionicons name="calendar-outline" size={compact ? 16 : 18} color={colors.brand} />
        {text}
        {clear}
      </TouchableOpacity>
      {open ? (
        <DateTimePicker
          value={iso ? localDate(iso) : new Date()}
          mode="date"
          locale="nb-NO"
          minimumDate={minIso ? localDate(minIso) : undefined}
          maximumDate={maxIso ? localDate(maxIso) : undefined}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, picked) => {
            if (Platform.OS !== 'ios') setOpen(false);
            if (event?.type === 'dismissed') {
              setOpen(false);
              return;
            }
            if (picked) emit(toIsoDate(picked));
          }}
        />
      ) : null}
      {Platform.OS === 'ios' && open ? (
        <TouchableOpacity onPress={() => setOpen(false)} style={styles.done} accessibilityRole="button">
          <Text style={[styles.doneText, { color: colors.brandInk || colors.brand }]}>Ferdig</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.sm,
    minHeight: 44,
  },
  compact: { minHeight: 36, paddingHorizontal: space.xs },
  text: { ...type.body, flex: 1, minWidth: 0 },
  compactText: { ...type.caption },
  clear: { zIndex: 3, padding: 2 },
  done: { alignSelf: 'flex-end', paddingVertical: space.xs, paddingHorizontal: space.xxs },
  doneText: { ...type.body, fontWeight: '600' },
});
