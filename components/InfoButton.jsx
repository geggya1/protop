import React, { useState } from 'react';
import { Platform, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useLayout } from '../src/theme';
import { touchHit } from '../src/ui/touchTarget';
import ScrollSheet from './ScrollSheet';

/** Forklaring som på mobil ligger bak et info-ikon. Ikonet er 22 px, trykkflaten 44 px (UX-26). */
export default function InfoButton({ title = 'Info', children }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const { isTouch } = useLayout();
  const hit = touchHit(22, 24, { touch: isTouch, os: Platform.OS });
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
        hitSlop={hit.hitSlop}
        style={hit.style}
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
