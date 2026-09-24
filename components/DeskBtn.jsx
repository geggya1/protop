import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import HelpTarget from './HelpTarget';

/** Kompakt desktop-knapp — aldri full bredde. */
export function DeskBtn({
  label,
  icon,
  onPress,
  primary = false,
  muted = false,
  accessibilityLabel,
}) {
  const btn = (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, primary && styles.primary, muted && styles.muted]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={primary ? '#fff' : colors.brand} />
      ) : null}
      {label ? (
        <Text style={[styles.txt, primary && styles.txtPrimary]}>{label}</Text>
      ) : null}
    </TouchableOpacity>
  );

  if (primary && icon === 'add') {
    return <HelpTarget id="add" style={{ alignSelf: 'flex-start' }}>{btn}</HelpTarget>;
  }
  return btn;
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
  },
  primary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  muted: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  txt: { fontWeight: '500', fontSize: 13, color: colors.brand },
  txtPrimary: { color: '#fff' },
});
