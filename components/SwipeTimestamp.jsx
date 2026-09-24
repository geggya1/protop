import React, { useCallback, useMemo, useRef } from 'react';
import {
  View, Animated, PanResponder, StyleSheet, Platform,
} from 'react-native';

const REVEAL_MAX = 78;

/**
 * Messenger-stil: dra samtalen mot venstre for å vise dato/tid på meldingene.
 * Children er en render-prop: ({ revealAnim, stampWidth }) => FlatList...
 */
export function useSwipeTimestampReveal() {
  const reveal = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => (
      Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2
    ),
    onPanResponderGrant: () => {
      reveal.stopAnimation((v) => { startX.current = v; });
    },
    onPanResponderMove: (_, g) => {
      const next = Math.max(0, Math.min(REVEAL_MAX, startX.current - g.dx));
      reveal.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const current = Math.max(0, Math.min(REVEAL_MAX, startX.current - g.dx));
      const open = current > REVEAL_MAX / 2 || g.vx < -0.4;
      Animated.spring(reveal, {
        toValue: open ? REVEAL_MAX : 0,
        useNativeDriver: false,
        speed: 28,
        bounciness: 4,
      }).start();
    },
  }), [reveal]);

  const stampWidth = REVEAL_MAX;

  return { reveal, panResponder, stampWidth };
}

/** Rad-wrapper som skyver boblen og viser tidsstempel til høyre. */
export function SwipeStampRow({
  reveal,
  stampWidth,
  stamp,
  align = 'left',
  children,
}) {
  const shift = reveal.interpolate({
    inputRange: [0, stampWidth],
    outputRange: [0, -stampWidth],
    extrapolate: 'clamp',
  });
  const stampOpacity = reveal.interpolate({
    inputRange: [0, stampWidth * 0.35, stampWidth],
    outputRange: [0, 0.4, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.rowWrap}>
      <Animated.View style={[styles.stampCol, { width: stampWidth, opacity: stampOpacity }]}>
        {stamp}
      </Animated.View>
      <Animated.View
        style={[
          styles.bubbleShift,
          align === 'right' && styles.bubbleShiftRight,
          { transform: [{ translateX: shift }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export function SwipeTimestampHost({ panResponder, children, style }) {
  return (
    <View
      style={[{ flex: 1 }, style]}
      {...panResponder.panHandlers}
      // Web: also support wheel/drag via CSS touch-action
      {...(Platform.OS === 'web' ? { dataSet: { swipeChat: '1' } } : {})}
    >
      {children}
    </View>
  );
}

export function useResetReveal(reveal) {
  return useCallback(() => {
    Animated.spring(reveal, {
      toValue: 0,
      useNativeDriver: false,
      speed: 28,
      bounciness: 0,
    }).start();
  }, [reveal]);
}

const styles = StyleSheet.create({
  rowWrap: {
    position: 'relative',
    marginBottom: 8,
    justifyContent: 'center',
  },
  stampCol: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  bubbleShift: {
    width: '100%',
  },
  bubbleShiftRight: {
    alignItems: 'flex-end',
  },
});
