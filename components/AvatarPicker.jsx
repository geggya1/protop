import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { colors, radius } from '../src/theme';
import { PEOPLE_AVATARS, GROUP_AVATARS, avatarById } from '../src/data/avatars';

export default function AvatarPicker({ value, onChange, group = false, compact = false }) {
  const list = group ? GROUP_AVATARS : PEOPLE_AVATARS;
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {list.map((a) => {
        const on = value === a.id;
        return (
          <TouchableOpacity
            key={a.id}
            onPress={() => onChange(a.id)}
            style={[
              styles.cell,
              compact && styles.cellCompact,
              on && { borderColor: a.color, backgroundColor: `${a.color}22` },
            ]}
            accessibilityRole="button"
            accessibilityLabel={a.id}
          >
            <Text style={[styles.emoji, compact && styles.emojiCompact]}>{a.emoji}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AvatarBubble({ avatarId, photoURL, name, size = 64, color, group = false }) {
  const list = group ? GROUP_AVATARS : PEOPLE_AVATARS;
  if (photoURL) {
    return <Image source={{ uri: photoURL }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const a = avatarId ? avatarById(avatarId, list) : null;
  const bg = color || a?.color || '#94a3b8';
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: bg,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {a ? (
        <Text style={{ fontSize: size * 0.48 }}>{a.emoji}</Text>
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: '#fff' }}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wrapCompact: { gap: 6 },
  cell: {
    width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.line,
  },
  cellCompact: {
    width: 44, height: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
  },
  emoji: { fontSize: 30 },
  emojiCompact: { fontSize: 20 },
});
