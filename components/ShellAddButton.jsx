import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import HelpTarget from './HelpTarget';

/**
 * Create-action for ShellHeader — same place on mobil and desktop
 * (til høyre for sidetittelen, før hjelp/varsel/profil).
 * Without `label`, renders as an icon-only + button.
 */
export default function ShellAddButton({ label, onPress, accessibilityLabel }) {
  const { isDesktop } = useLayout();
  const iconOnly = !label;
  return (
    <HelpTarget id="add" onAdvance={onPress}>
      <TouchableOpacity
        style={[
          styles.btn,
          iconOnly && styles.btnIcon,
          isDesktop && (iconOnly ? styles.btnIconDesk : styles.btnDesk),
        ]}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel || label || 'Legg til'}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={iconOnly ? (isDesktop ? 20 : 22) : (isDesktop ? 15 : 16)} color="#fff" />
        {label ? (
          <Text style={[styles.txt, isDesktop && styles.txtDesk]} numberOfLines={1}>{label}</Text>
        ) : null}
      </TouchableOpacity>
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
    maxWidth: 180,
  },
  btnIcon: {
    width: 40,
    paddingHorizontal: 0,
    justifyContent: 'center',
    borderRadius: 20,
    maxWidth: 40,
  },
  btnDesk: {
    height: 32,
    borderRadius: 6,
    paddingHorizontal: 10,
    maxWidth: 200,
  },
  btnIconDesk: {
    width: 32,
    height: 32,
    paddingHorizontal: 0,
    justifyContent: 'center',
    borderRadius: 8,
    maxWidth: 32,
  },
  txt: { color: '#fff', fontWeight: '500', fontSize: 13, flexShrink: 1 },
  txtDesk: { fontWeight: '500', fontSize: 13 },
});
