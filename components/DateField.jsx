import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { dateKey, parseDateKey } from '../src/utils/dates';

const OVERLAY_INPUT_STYLE = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  opacity: 0,
  cursor: 'pointer',
  width: '100%',
  height: '100%',
  border: 'none',
};

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = parseDateKey(String(value).slice(0, 10));
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function toKey(value) {
  const d = toDate(value);
  return d ? dateKey(d) : '';
}

function formatNb(value) {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString('nb-NO', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Shared date field for web + native.
 * Web: invisible native date input over a formatted label (reliable on mobile Safari).
 * Native: DateTimePicker with iOS "Ferdig" dismiss.
 */
export default function DateField({
  value,
  onChange,
  prefix = '',
  placeholder = 'Velg dato',
  icon = 'calendar-outline',
  min,
  style,
  textStyle,
  iconColor = colors.brand,
}) {
  const [show, setShow] = useState(false);
  const date = toDate(value);
  const label = date ? formatNb(date) : placeholder;
  const display = prefix ? `${prefix}${label}` : label;
  const key = toKey(value);
  const minKey = min ? toKey(min) : undefined;

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.row, style]}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <Text style={[styles.txt, textStyle]} numberOfLines={1}>{display}</Text>
        <input
          type="date"
          value={key}
          min={minKey || undefined}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v ? new Date(`${v}T12:00:00`) : null);
          }}
          style={OVERLAY_INPUT_STYLE}
          aria-label={prefix ? prefix.replace(/:\s*$/, '') : placeholder}
        />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity style={[styles.row, style]} onPress={() => setShow(true)}>
        <Ionicons name={icon} size={18} color={iconColor} />
        <Text style={[styles.txt, textStyle]} numberOfLines={1}>{display}</Text>
      </TouchableOpacity>
      {show ? (
        <DateTimePicker
          value={date || new Date()}
          mode="date"
          minimumDate={minKey ? parseDateKey(minKey) : undefined}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, selected) => {
            if (Platform.OS !== 'ios') setShow(false);
            if (e?.type === 'dismissed') {
              setShow(false);
              return;
            }
            if (selected) onChange(selected);
          }}
        />
      ) : null}
      {Platform.OS === 'ios' && show ? (
        <TouchableOpacity onPress={() => setShow(false)} style={styles.doneBtn}>
          <Text style={styles.doneTxt}>Ferdig</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg,
  },
  txt: { flex: 1, fontWeight: '400', fontSize: 14, color: colors.ink },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  doneTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },
});
