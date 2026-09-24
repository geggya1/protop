import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import HelpTarget from './HelpTarget';

export default function Fab({ onPress, label = 'Legg til' }) {
  const { isDesktop } = useLayout();
  if (isDesktop) {
    return (
      <HelpTarget id="add" style={styles.fabDesktopWrap}>
        <TouchableOpacity
          onPress={onPress}
          style={styles.fabDesktop}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.fabDesktopTxt}>{label}</Text>
        </TouchableOpacity>
      </HelpTarget>
    );
  }
  return (
    <HelpTarget id="add" style={styles.fabWrap}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </HelpTarget>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    right: 18,
    bottom: 18,
  },
  fabDesktopWrap: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.fab,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: colors.fab,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabDesktopTxt: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});
