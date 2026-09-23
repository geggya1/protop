import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../src/theme';

function setDragCursor(on) {
  if (typeof document === 'undefined') return;
  document.body.style.cursor = on ? 'col-resize' : '';
  document.body.style.userSelect = on ? 'none' : '';
}

/**
 * Full-height overlay on the right edge of a mail pane.
 * On web this is a real HTML node with pointer capture so React Native's
 * responder system cannot swallow the drag. Native uses PanResponder.
 */
export function MailPaneResizeHandle({ label, onGrant, onMove, onEnd }) {
  const [hot, setHot] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const nodeRef = useRef(null);
  const cb = useRef({ onGrant, onMove, onEnd });
  cb.current = { onGrant, onMove, onEnd };

  const begin = useCallback((clientX) => {
    dragging.current = true;
    startX.current = Number(clientX) || 0;
    setHot(true);
    setDragCursor(true);
    cb.current.onGrant?.();
  }, []);

  const moveByClientX = useCallback((clientX) => {
    if (!dragging.current) return;
    cb.current.onMove?.(Number(clientX) - startX.current);
  }, []);

  const finish = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setHot(false);
    setDragCursor(false);
    cb.current.onEnd?.();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const el = nodeRef.current;
    if (!el || typeof el.addEventListener !== 'function') return undefined;

    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      begin(e.clientX);
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    };
    const onPtrMove = (e) => {
      if (!dragging.current) return;
      e.preventDefault();
      moveByClientX(e.clientX);
    };
    const onPtrUp = () => {
      if (!dragging.current) return;
      finish();
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', onPtrMove);
    window.addEventListener('pointerup', onPtrUp);
    window.addEventListener('pointercancel', onPtrUp);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', onPtrMove);
      window.removeEventListener('pointerup', onPtrUp);
      window.removeEventListener('pointercancel', onPtrUp);
      setDragCursor(false);
    };
  }, [begin, finish, moveByClientX]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (evt) => {
      begin(evt?.nativeEvent?.pageX ?? 0);
    },
    onPanResponderMove: (_, g) => {
      cb.current.onMove?.(g.dx);
    },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  }), [begin, finish]);

  const active = hot;

  if (Platform.OS === 'web') {
    return (
      <div
        ref={nodeRef}
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        title={`${label} — dra sidelengs`}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => { if (!dragging.current) setHot(false); }}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 20,
          zIndex: 50,
          cursor: 'col-resize',
          touchAction: 'none',
          userSelect: 'none',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'transparent',
        }}
      >
        <div
          style={{
            width: active ? 4 : 2,
            height: '100%',
            background: active ? colors.brand : '#94a3b8',
            borderRadius: 1,
          }}
        />
      </div>
    );
  }

  return (
    <View
      collapsable={false}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      {...pan.panHandlers}
      style={styles.handle}
    >
      <View style={[styles.bar, active && styles.barHot]} />
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 20,
    zIndex: 50,
    alignItems: 'flex-end',
    justifyContent: 'stretch',
  },
  bar: {
    width: 2,
    flex: 1,
    backgroundColor: '#94a3b8',
  },
  barHot: {
    width: 4,
    backgroundColor: colors.brand,
  },
});
