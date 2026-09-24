import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { useHelp } from '../src/context/HelpContext';

/**
 * Registers a UI rect the help overlay can spotlight (window coordinates).
 * `onAdvance` is what Neste / tapping the hole should do (open the list, press +, …).
 *
 * While a tour is active the target re-measures on a short interval (and via
 * ResizeObserver on web) so the arrow/highlight stays glued to the real
 * component when layout shifts after updates or scene changes.
 */
export default function HelpTarget({ id, children, style, onAdvance }) {
  const { registerTarget, unregisterTarget, registerAdvance, targetsVersion, mode } = useHelp();
  const ref = useRef(null);
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;
  const lastRectRef = useRef(null);

  const publish = useCallback(() => {
    if (!id || !ref.current?.measureInWindow) return;
    ref.current.measureInWindow((x, y, width, height) => {
      if (!(width > 0 && height > 0)) return;
      const prev = lastRectRef.current;
      if (
        prev
        && Math.abs(prev.x - x) < 1
        && Math.abs(prev.y - y) < 1
        && Math.abs(prev.w - width) < 1
        && Math.abs(prev.h - height) < 1
      ) {
        return;
      }
      lastRectRef.current = { x, y, w: width, h: height };
      registerTarget(id, { x, y, w: width, h: height });
    });
  }, [id, registerTarget]);

  useEffect(() => {
    publish();
  }, [publish, targetsVersion]);

  useEffect(() => {
    if (!id || typeof onAdvance !== 'function') return undefined;
    const bridge = (...args) => advanceRef.current?.(...args);
    registerAdvance(id, bridge);
    return () => registerAdvance(id, null);
  }, [id, registerAdvance, onAdvance]);

  useEffect(() => () => {
    if (id) unregisterTarget(id);
  }, [id, unregisterTarget]);

  // Keep spotlight glued to the component while help is open.
  useEffect(() => {
    if (!id || !mode) return undefined;
    publish();
    const tick = setInterval(publish, 320);
    return () => clearInterval(tick);
  }, [id, mode, publish]);

  useEffect(() => {
    if (!id || Platform.OS !== 'web' || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const node = ref.current;
    if (!(typeof Element !== 'undefined' && node instanceof Element)) return undefined;
    let observer;
    try {
      observer = new ResizeObserver(() => publish());
      observer.observe(node);
    } catch {
      return undefined;
    }
    return () => observer?.disconnect();
  }, [id, publish]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={publish}
      style={style}
      nativeID={id ? `help-target-${id}` : undefined}
    >
      {children}
    </View>
  );
}
