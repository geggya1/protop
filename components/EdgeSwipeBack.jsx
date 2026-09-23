import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
} from 'react';
import { View, PanResponder, StyleSheet, Platform } from 'react-native';

const EDGE_WIDTH = 24;
/** Must be clearly a swipe — low values steal taps from left-side tilbake-lenker. */
const CAPTURE_DX = 28;
const TRIGGER_DX = 70;
const TRIGGER_VX = 0.45;

const EdgeSwipeRegisterContext = createContext(null);

/**
 * Single edge-gesture host. Nested EdgeSwipeBack children register handlers;
 * the innermost (top of stack) runs on swipe so submodule back wins over shell back.
 */
function EdgeSwipeHost({ children, style }) {
  const stackRef = useRef([]);

  const register = useCallback((handler) => {
    if (typeof handler !== 'function') return () => {};
    stackRef.current.push(handler);
    return () => {
      const i = stackRef.current.lastIndexOf(handler);
      if (i >= 0) stackRef.current.splice(i, 1);
    };
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (evt, g) => {
      if (stackRef.current.length === 0) return false;
      const x0 = evt?.nativeEvent?.pageX ?? 0;
      if (x0 > EDGE_WIDTH) return false;
      return g.dx > CAPTURE_DX && g.dx > Math.abs(g.dy) * 1.6;
    },
    onMoveShouldSetPanResponderCapture: (evt, g) => {
      if (stackRef.current.length === 0) return false;
      const x0 = evt?.nativeEvent?.pageX ?? 0;
      if (x0 > EDGE_WIDTH) return false;
      // Capture only after a clear horizontal swipe so nested back-buttons keep taps.
      return g.dx > CAPTURE_DX && g.dx > Math.abs(g.dy) * 1.6;
    },
    onPanResponderRelease: (_, g) => {
      if (!(g.dx >= TRIGGER_DX || g.vx >= TRIGGER_VX)) return;
      const top = stackRef.current[stackRef.current.length - 1];
      if (typeof top === 'function') top();
    },
  }), []);

  return (
    <EdgeSwipeRegisterContext.Provider value={register}>
      <View
        style={[styles.fill, style]}
        {...panResponder.panHandlers}
        {...(Platform.OS === 'web' ? { dataSet: { edgeSwipeBack: '1' } } : {})}
      >
        {children}
      </View>
    </EdgeSwipeRegisterContext.Provider>
  );
}

/**
 * Sveip fra venstre kant mot høyre for å gå tilbake.
 * Tar kun gesten når berøringen starter nær venstre kant, så scrolling fungerer normalt.
 * Høy capture-terskel så CompactBackLink / knapper til venstre fortsatt får trykk.
 *
 * Nestede EdgeSwipeBack deler én gesture-host: innerste (f.eks. mappe) vinner over
 * ytre (f.eks. modul i Mer), så sveip går ett skritt tilbake om gangen.
 */
export default function EdgeSwipeBack({ enabled = true, onBack, children, style }) {
  const register = useContext(EdgeSwipeRegisterContext);

  useEffect(() => {
    if (!register || !enabled || typeof onBack !== 'function') return undefined;
    return register(onBack);
  }, [register, enabled, onBack]);

  // No host above: become the host and register this onBack via a child registrant.
  if (!register) {
    return (
      <EdgeSwipeHost style={style}>
        <EdgeSwipeBack enabled={enabled} onBack={onBack}>
          {children}
        </EdgeSwipeBack>
      </EdgeSwipeHost>
    );
  }

  return <View style={[styles.fill, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: 'transparent' },
});
