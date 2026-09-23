import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { badgeLabel } from '../src/utils/notifications';

/**
 * Standard unread badge: red circle with a white number, top-right of the icon.
 */
export default function IconBadge({
  count = 0,
  children,
  size = 16,
  offset = -5,
  borderColor = '#fff',
}) {
  const n = Number(count) || 0;
  const label = badgeLabel(n);
  const wide = label.length > 1;
  return (
    <View style={styles.wrap}>
      {children}
      {n > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              minWidth: size,
              height: size,
              borderRadius: size / 2,
              top: offset,
              right: offset,
              paddingHorizontal: wide ? 4 : 0,
              borderColor,
            },
          ]}
        >
          <Text style={[styles.txt, { fontSize: wide ? 9 : 10, lineHeight: size - 4 }]}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    backgroundColor: '#e11d48',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  txt: {
    color: '#fff',
    fontWeight: '900',
    textAlign: 'center',
  },
});
