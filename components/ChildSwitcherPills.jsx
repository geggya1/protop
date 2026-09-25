import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';

export default function ChildSwitcherPills({
  kids = [],
  selectedId,
  onSelect,
  showAvatar = false,
}) {
  if (!kids.length || kids.length < 2) return null;

  return (
    <View style={styles.row}>
      {kids.map((k) => {
        const on = k.id === selectedId;
        return (
          <TouchableOpacity
            key={k.id}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect?.(k)}
            accessibilityRole="button"
            accessibilityLabel={`Bytt til ${k.name || 'barn'}`}
          >
            {showAvatar && (
              <AvatarBubble
                avatarId={k.avatarId}
                photoURL={k.photoURL || k.photoUrl}
                name={k.name}
                size={22}
              />
            )}
            <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
              {k.name?.split(' ')[0] || 'Barn'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: '#eef6ff', borderColor: '#93c5fd' },
  chipTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  chipTxtOn: { color: '#0b74d1' },
});
