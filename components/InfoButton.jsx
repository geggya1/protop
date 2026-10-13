import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import ScrollSheet from './ScrollSheet';

/** Forklaring som på mobil ligger bak et info-ikon. */
export default function InfoButton({ title = 'Info', children }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="information-circle-outline" size={22} color={colors.brand} />
      </TouchableOpacity>
      <ScrollSheet visible={open} title={title} onClose={() => setOpen(false)}>
        {typeof children === 'string' ? (
          <Text style={{ color: colors.ink, lineHeight: 22 }}>{children}</Text>
        ) : children}
      </ScrollSheet>
    </>
  );
}
