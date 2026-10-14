import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import {
  ALERT_RAIL_PREF_KEY,
  RAIL_PEEK,
  alertRailIsOpen,
  railMaxWidth,
  settleRailWidth,
  sideWidthFromDrag,
} from '../../src/anbud/sideWidth';
import { useParentBottomNavChrome } from '../../src/hooks/useParentBottomNavChrome';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* uten DOM */ }
}

function readPref() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return 360;
  try {
    const max = typeof window !== 'undefined' ? railMaxWidth(window.innerWidth) : 840;
    const raw = Number(localStorage.getItem(ALERT_RAIL_PREF_KEY));
    return Number.isFinite(raw) && raw > RAIL_PEEK ? Math.min(max, raw) : 360;
  } catch {
    return 360;
  }
}

function preferredWidth(max, remembered) {
  const want = Number(remembered) || 360;
  return Math.min(max, Math.max(Math.min(320, max), want));
}

/**
 * På mobil ligger anbudskartet lavt i listen. Dra det inn fra høyre marg for å forstørre,
 * slik kartet gjør på vurdering og tilbud.
 */
export default function PhoneMapDock({
  colors,
  open = false,
  onOpenChange,
  pinCount = 0,
  children,
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const bottomNav = useParentBottomNavChrome();
  const prefRef = useRef(readPref());
  const widthRef = useRef(RAIL_PEEK);
  const openRef = useRef(open);
  const dragging = useRef(false);
  const stopDrag = useRef(() => {});
  const [width, setWidth] = useState(RAIL_PEEK);
  openRef.current = open;

  useEffect(() => () => stopDrag.current(), []);

  function publish(nextOpen) {
    if (openRef.current === nextOpen) return;
    openRef.current = nextOpen;
    onOpenChange?.(nextOpen);
  }

  function rememberPref(next) {
    prefRef.current = next;
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    try { localStorage.setItem(ALERT_RAIL_PREF_KEY, String(next)); } catch { /* valgfritt */ }
  }

  useLayoutEffect(() => {
    if (dragging.current) return;
    const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
    if (!open) {
      if (widthRef.current !== RAIL_PEEK) {
        widthRef.current = RAIL_PEEK;
        setWidth(RAIL_PEEK);
      }
      return;
    }
    if (!alertRailIsOpen(widthRef.current)) {
      const next = preferredWidth(max, prefRef.current);
      widthRef.current = next;
      setWidth(next);
      return;
    }
    if (widthRef.current > max) {
      widthRef.current = max;
      setWidth(max);
    }
  }, [open, viewportWidth]);

  function closeToPreview() {
    widthRef.current = RAIL_PEEK;
    setWidth(RAIL_PEEK);
    publish(false);
  }

  function setLive(next) {
    widthRef.current = next;
    setWidth(next);
    publish(alertRailIsOpen(next));
  }

  function settle(next) {
    const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
    const settled = settleRailWidth(next, { max });
    widthRef.current = settled;
    setWidth(settled);
    if (alertRailIsOpen(settled)) {
      rememberPref(settled);
      publish(true);
      return;
    }
    publish(false);
  }

  function toggle() {
    if (alertRailIsOpen(widthRef.current)) closeToPreview();
    else {
      const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
      const next = preferredWidth(max, prefRef.current);
      widthRef.current = next;
      setWidth(next);
      rememberPref(next);
      publish(true);
    }
  }

  function startDrag(event) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    event.preventDefault?.();
    const startX = event.clientX ?? event.nativeEvent?.clientX;
    const startW = widthRef.current;
    const max = railMaxWidth(window.innerWidth);
    let moved = false;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    dragging.current = true;
    function move(e) {
      if (Math.abs(e.clientX - startX) > 6) moved = true;
      setLive(sideWidthFromDrag(startW, startX, e.clientX, { min: RAIL_PEEK, max }));
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      dragging.current = false;
      stopDrag.current = () => {};
      if (!moved) {
        toggle();
        return;
      }
      settle(widthRef.current);
    }
    stopDrag.current = () => {
      dragging.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onKey(event) {
    const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault?.();
      toggle();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault?.();
      const next = alertRailIsOpen(widthRef.current)
        ? Math.min(max, widthRef.current + 40)
        : preferredWidth(max, prefRef.current);
      settle(next);
    } else if (event.key === 'ArrowRight' || event.key === 'Escape') {
      event.preventDefault?.();
      settle(event.key === 'Escape' || !alertRailIsOpen(widthRef.current) ? RAIL_PEEK : widthRef.current - 40);
    }
  }

  if (Platform.OS !== 'web') return null;

  const maxNow = railMaxWidth(viewportWidth);
  const expanded = open && alertRailIsOpen(width);
  if (!expanded) return null;
  const map = expanded && typeof children === 'function'
    ? children({ width, viewportHeight, bottomNav })
    : null;
  const peekLabel = `Større${pinCount ? ` · ${pinCount}` : ''}`;

  const handle = React.createElement('div', {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': expanded
      ? 'Dra for å endre bredden på kartet. Dra mot høyre marg for mindre visning.'
      : 'Større kart. Dra inn fra høyre marg for å forstørre, eller trykk for å åpne.',
    'aria-valuenow': Math.round(expanded ? width : RAIL_PEEK),
    'aria-valuemin': RAIL_PEEK,
    'aria-valuemax': maxNow,
    'aria-expanded': expanded,
    tabIndex: 0,
    onPointerDown: startDrag,
    onKeyDown: onKey,
    style: expanded ? {
      width: 16,
      cursor: 'col-resize',
      touchAction: 'none',
      flexShrink: 0,
      alignSelf: 'stretch',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } : {
      width: '100%',
      height: '100%',
      cursor: 'col-resize',
      touchAction: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: colors.ink,
      background: colors.card,
    },
  }, expanded
    ? React.createElement('div', {
      style: { width: 4, height: 56, borderRadius: 4, background: colors.line },
    })
    : React.createElement('span', {
      style: {
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.04em',
        color: colors.brand,
      },
    }, peekLabel));

  const panel = (
    <View
      style={expanded ? {
        position: 'fixed',
        top: 76,
        right: 0,
        bottom: Math.max(12, bottomNav + 8),
        width,
        zIndex: 8000,
        flexDirection: 'row',
        backgroundColor: colors.bg,
        borderLeftWidth: 1,
        borderLeftColor: colors.line,
        ...(Platform.OS === 'web' ? { boxShadow: '-10px 0 28px rgba(15, 23, 42, 0.12)' } : null),
      } : {
        position: 'fixed',
        top: 248,
        right: 0,
        width: RAIL_PEEK,
        height: 176,
        zIndex: 8000,
        backgroundColor: colors.card,
        borderTopLeftRadius: 14,
        borderBottomLeftRadius: 14,
        borderWidth: 1,
        borderRightWidth: 0,
        borderColor: colors.brand,
        overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '-6px 0 18px rgba(15, 23, 42, 0.16)' } : null),
      }}
    >
      {handle}
      {expanded ? (
        <View style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Kart</Text>
            {React.createElement('button', {
              type: 'button',
              'data-testid': 'alert-map-smaller',
              onClick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeToPreview();
              },
              style: {
                border: 0,
                background: 'transparent',
                color: colors.brand,
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
                padding: '8px 4px',
              },
            }, 'Mindre visning')}
          </View>
          {map}
        </View>
      ) : null}
    </View>
  );

  if (createPortal && typeof document !== 'undefined') return createPortal(panel, document.body);
  return panel;
}
