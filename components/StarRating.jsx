import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

export default function StarRating({
  value = 0,
  onChange,
  size = 28,
  readonly = false,
}) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          disabled={readonly || !onChange}
          onPress={() => onChange?.(n === rating ? 0 : n)}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityLabel={`${n} stjerner`}
        >
          <Ionicons
            name={n <= rating ? 'star' : 'star-outline'}
            size={size}
            color={n <= rating ? colors.star : colors.line}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
});
