import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';

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

function parseTimeStr(str) {
  const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/);
  const d = new Date();
  if (m) {
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  } else {
    d.setHours(12, 0, 0, 0);
  }
  return d;
}

function fmtTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Shared time field for web + native — same overlay pattern as DateField / EventFormScreen.
 */
export default function TimeField({
  value,
  onChange,
  placeholder = 'Klokke',
  icon = 'time-outline',
  disabled = false,
  style,
  textStyle,
  iconColor = colors.brand,
}) {
  const [show, setShow] = useState(false);
  const date = parseTimeStr(value);
  const label = value || placeholder;

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.row, disabled && styles.disabled, style]}>
        <Ionicons name={icon} size={18} color={disabled ? colors.muted : iconColor} />
        <Text
          style={[styles.txt, !value && styles.placeholder, textStyle]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {!disabled ? (
          <input
            type="time"
            value={value || ''}
            onChange={(e) => onChange(e.target.value || '')}
            style={OVERLAY_INPUT_STYLE}
            aria-label={placeholder}
          />
        ) : null}
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.row, disabled && styles.disabled, style]}
        onPress={() => !disabled && setShow(true)}
        disabled={disabled}
      >
        <Ionicons name={icon} size={18} color={disabled ? colors.muted : iconColor} />
        <Text
          style={[styles.txt, !value && styles.placeholder, textStyle]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
      {show ? (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, selected) => {
            if (Platform.OS !== 'ios') setShow(false);
            if (e?.type === 'dismissed') {
              setShow(false);
              return;
            }
            if (selected) onChange(fmtTime(selected));
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
  disabled: { opacity: 0.45 },
  txt: { flex: 1, fontWeight: '400', fontSize: 14, color: colors.ink },
  placeholder: { color: colors.muted, fontWeight: '400' },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  doneTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },
});
