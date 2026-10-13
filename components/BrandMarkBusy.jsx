import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

const NATIVE = Platform.OS !== 'web';

/** Source canvas of ProTop_symbol_transparent.png */
const BASE_W = 422;
const BASE_H = 447;

/**
 * Natural connected components from the approved PNG (no artificial cuts).
 * Cubes stay separate; each pillar/group is one continuous piece so tops
 * are not torn off the body during the bubble wave.
 */
const PARTS = [
  { key: 'c0', kind: 'cube', x: 22, y: 278, w: 25, h: 22, src: require('../assets/brand-busy/00-cube.png') },
  { key: 'c1', kind: 'cube', x: 58, y: 236, w: 39, h: 37, src: require('../assets/brand-busy/01-cube.png') },
  { key: 'c2', kind: 'cube', x: 59, y: 320, w: 39, h: 36, src: require('../assets/brand-busy/02-cube.png') },
  { key: 'c3', kind: 'cube', x: 101, y: 168, w: 36, h: 35, src: require('../assets/brand-busy/03-cube.png') },
  { key: 'c4', kind: 'cube', x: 101, y: 274, w: 41, h: 41, src: require('../assets/brand-busy/04-cube.png') },
  { key: 'c5', kind: 'cube', x: 136, y: 211, w: 51, h: 43, src: require('../assets/brand-busy/05-cube.png') },
  { key: 'p0', kind: 'pillar', x: 152, y: 243, w: 65, h: 136, src: require('../assets/brand-busy/06-pillar.png') },
  { key: 'p1', kind: 'pillar', x: 188, y: 94, w: 136, h: 326, src: require('../assets/brand-busy/07-pillar.png') },
  { key: 'p2', kind: 'pillar', x: 275, y: 19, w: 129, h: 338, src: require('../assets/brand-busy/08-pillar.png') },
];

/** Bubble order: small cubes flow into the rising pillars. */
const WAVE = ['c0', 'c2', 'c1', 'c4', 'c5', 'c3', 'p0', 'p1', 'p2'];

/**
 * Approved ProTop mark, rebuilt as separate PNG pieces so cubes/pillars can
 * bubble in sequence. No plate or halo — transparent around the artwork.
 */
export default function BrandMarkBusy({
  height = 112,
  playing = true,
}) {
  const width = height * (BASE_W / BASE_H);
  const scale = width / BASE_W;
  const values = useRef(WAVE.map(() => new Animated.Value(0))).current;

  const indexByKey = useMemo(() => {
    const map = new Map();
    WAVE.forEach((key, index) => map.set(key, index));
    return map;
  }, []);

  useEffect(() => {
    if (!playing) {
      values.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return undefined;
    }

    const n = WAVE.length;
    const step = 140;
    const loops = values.map((value, index) => {
      const lead = index * step;
      const trail = Math.max(0, (n - index - 1) * step) + 360;
      const anim = Animated.loop(
        Animated.sequence([
          Animated.delay(lead),
          Animated.timing(value, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.back(1.4)),
            useNativeDriver: NATIVE,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 520,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: NATIVE,
          }),
          Animated.delay(trail),
        ]),
      );
      anim.start();
      return anim;
    });

    return () => {
      loops.forEach((loop) => loop.stop());
      values.forEach((value) => value.setValue(0));
    };
  }, [playing, values]);

  return (
    <View
      style={[styles.stage, { width, height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {PARTS.map((part) => {
        const index = indexByKey.get(part.key) ?? 0;
        const pulse = values[index];
        const isCube = part.kind === 'cube';
        const lift = pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0, isCube ? -14 : -8],
        });
        const pop = pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, isCube ? 1.28 : 1.08],
        });
        const turn = pulse.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', isCube ? '12deg' : '3deg'],
        });
        const glow = pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.82, 1],
        });

        return (
          <Animated.Image
            key={part.key}
            source={part.src}
            resizeMode="contain"
            style={{
              position: 'absolute',
              left: part.x * scale,
              top: part.y * scale,
              width: part.w * scale,
              height: part.h * scale,
              opacity: glow,
              transform: [
                { translateY: lift },
                { scale: pop },
                { rotate: turn },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'relative',
    overflow: 'visible',
  },
});
