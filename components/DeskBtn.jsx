import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import { touch } from '../src/ui/tokens';
import HelpTarget from './HelpTarget';

/**
 * Kompakt desktop-knapp — aldri full bredde.
 * Tettheten følger pekeren (UX-23): med mus 32 px høy, på berøringsskjerm (iPad i liggende
 * format) minst touch.min høy med litt større tekst.
 */
export function DeskBtn({
  label,
  icon,
  onPress,
  primary = false,
  muted = false,
  accessibilityLabel,
}) {
  const { isTouch } = useLayout();
  const btn = (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, isTouch && styles.btnTouch, primary && styles.primary, muted && styles.muted]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={primary ? colors.onBrand : colors.brand} />
      ) : null}
      {label ? (
        <Text style={[styles.txt, isTouch && styles.txtTouch, primary && styles.txtPrimary]}>{label}</Text>
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
  btnTouch: { height: 'auto', minHeight: touch.min, paddingHorizontal: 14 },
  primary: {
    backgroundColor: colors.brandInk,
    borderColor: colors.brandInk,
  },
  muted: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  txt: { fontWeight: '500', fontSize: 13, color: colors.brandInk },
  txtTouch: { fontSize: 15 },
  txtPrimary: { color: colors.onBrand },
});
