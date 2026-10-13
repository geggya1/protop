import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { geocodeMissing } from '../../src/anbud/geocodePlace';
import { locateNotice, mapPinsForNotices, unboundPlace } from '../../src/anbud/noticePlace';
import {
  RAIL_PEEK,
  RAIL_PREF_KEY,
  RAIL_WIDTH_KEY,
  mapHeightForRail,
  railMaxWidth,
  settleRailWidth,
  sideWidthFromDrag,
} from '../../src/anbud/sideWidth';
import { workGeocodeQuery } from '../../src/anbud/workMap';
import { useParentBottomNavChrome } from '../../src/hooks/useParentBottomNavChrome';
import TenderMap from './TenderMap';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* uten DOM */ }
}

export function revealAnbudRow(id) {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !id) return;
  const selector = `[data-anbud-id="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  requestAnimationFrame(() => {
    document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

export function MapIndexBadge({ n, selected, colors }) {
  const num = Number(n);
  if (!num) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? colors.brand : colors.card,
        borderWidth: 2,
        borderColor: colors.brand,
      }}
    >
      <Text style={{ color: selected ? '#fff' : colors.brand, fontWeight: '800', fontSize: 13 }}>{num}</Text>
    </View>
  );
}

export function mapCardChrome(colors, selected, fallback = {}) {
  if (!selected) {
    return {
      borderColor: fallback.borderColor || colors.line,
      backgroundColor: fallback.backgroundColor || colors.card,
      borderWidth: 1,
    };
  }
  return {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
    borderWidth: 2,
    ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${colors.brand}` } : null),
  };
}

/** Klikk på seksjonen velger nålen. Knapper, felt og lenker beholder sin egen handling. */
export function activateMapRow(event, onFocus) {
  if (!onFocus) return;
  const node = event?.target || event?.nativeEvent?.target;
  const el = node?.nodeType === 3 ? node.parentElement : node;
  if (typeof el?.closest === 'function' && el.closest('button, a, input, textarea, select, [role="button"]')) return;
  onFocus();
}

function readRailWidth() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return { width: RAIL_PEEK, pref: 360 };
  try {
    const max = typeof window !== 'undefined' ? railMaxWidth(window.innerWidth) : 840;
    const prefRaw = Number(localStorage.getItem(RAIL_PREF_KEY));
    const pref = Number.isFinite(prefRaw) && prefRaw > RAIL_PEEK ? Math.min(max, prefRaw) : 360;
    const raw = localStorage.getItem(RAIL_WIDTH_KEY);
    const next = raw == null ? RAIL_PEEK : settleRailWidth(Number(raw), { max });
    return { width: next, pref: next > RAIL_PEEK ? next : pref };
  } catch {
    return { width: RAIL_PEEK, pref: 360 };
  }
}

function preferredOpen(max, remembered) {
  const want = Number(remembered) || 360;
  return Math.min(max, Math.max(Math.min(320, max), want));
}

/**
 * Kartet ligger i høyre marg. Dra det mot venstre, eller trykk, for å forstørre.
 */
export default function MapRail({
  rows = [],
  colors,
  selectedId = '',
  onSelect,
  onPreview,
  onGeocode,
  focusTick = 0,
  legendLabel = 'Kart',
  openLabel = 'Åpne',
  kindLabel = '',
  mapTitle = 'Kart',
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const bottomNav = useParentBottomNavChrome();
  const initialRail = useRef(null);
  if (!initialRail.current) initialRail.current = readRailWidth();
  const [width, setWidth] = useState(initialRail.current.width);
  const [geoById, setGeoById] = useState({});
  const widthRef = useRef(initialRail.current.width);
  const openRef = useRef(initialRail.current.pref);
  const stopDrag = useRef(() => {});

  useEffect(() => () => stopDrag.current(), []);

  useEffect(() => {
    if (!focusTick || !selectedId) return;
    if (Platform.OS !== 'web' || widthRef.current > RAIL_PEEK) return;
    const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
    const next = preferredOpen(max, openRef.current);
    widthRef.current = next;
    openRef.current = next;
    setWidth(next);
    try {
      localStorage.setItem(RAIL_WIDTH_KEY, String(next));
      localStorage.setItem(RAIL_PREF_KEY, String(next));
    } catch { /* lagring er valgfri */ }
  }, [focusTick]);

  const located = useMemo(
    () => (Array.isArray(rows) ? rows : []).map((row) => (
      row?.geo || !geoById[row?.id] ? row : { ...row, geo: geoById[row.id] }
    )),
    [rows, geoById],
  );
  const pins = useMemo(
    () => mapPinsForNotices(located, { asShown: true, unknownAsLand: false }),
    [located],
  );
  const missingRows = located.filter((row) => !unboundPlace(row) && !locateNotice(row));
  const missingKey = missingRows.map((row) => row.id).join(',');

  useEffect(() => {
    if (!missingKey) return undefined;
    let live = true;
    geocodeMissing(missingRows, locateNotice, workGeocodeQuery).then((hits) => {
      if (!live || !hits?.length) return;
      setGeoById((current) => {
        const next = { ...current };
        hits.forEach((row) => { next[row.id] = row.geo; });
        return next;
      });
      onGeocode?.(hits);
    }).catch(() => {});
    return () => { live = false; };
  }, [missingKey]);

  function remember(next) {
    const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
    const settled = settleRailWidth(next, { max });
    widthRef.current = settled;
    if (settled > RAIL_PEEK) openRef.current = settled;
    setWidth(settled);
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(RAIL_WIDTH_KEY, String(settled));
      if (settled > RAIL_PEEK) localStorage.setItem(RAIL_PREF_KEY, String(settled));
    } catch { /* lagring er valgfri */ }
  }

  function toggle() {
    const max = railMaxWidth(typeof window !== 'undefined' ? window.innerWidth : viewportWidth);
    if (widthRef.current > RAIL_PEEK) remember(RAIL_PEEK);
    else remember(preferredOpen(max, openRef.current));
  }

  function setLive(next) {
    widthRef.current = next;
    if (next > RAIL_PEEK) openRef.current = next;
    setWidth(next);
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
    function move(e) {
      if (Math.abs(e.clientX - startX) > 6) moved = true;
      setLive(sideWidthFromDrag(startW, startX, e.clientX, { min: RAIL_PEEK, max }));
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      stopDrag.current = () => {};
      if (!moved) {
        toggle();
        return;
      }
      remember(widthRef.current);
    }
    stopDrag.current = () => {
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
      const next = widthRef.current <= RAIL_PEEK
        ? preferredOpen(max, openRef.current)
        : Math.min(max, widthRef.current + 40);
      remember(next);
    } else if (event.key === 'ArrowRight' || event.key === 'Escape') {
      event.preventDefault?.();
      remember(event.key === 'Escape' ? RAIL_PEEK : widthRef.current - 40);
    }
  }

  const open = width > RAIL_PEEK + 48;
  const maxNow = railMaxWidth(viewportWidth);
  const map = (
    <TenderMap
      pins={pins}
      selectedId={selectedId}
      colors={colors}
      missing={missingRows.length}
      compact={width < 420}
      mapHeight={mapHeightForRail(width, viewportHeight - bottomNav)}
      showMark={false}
      openLabel={openLabel}
      kindLabel={kindLabel}
      legendLabel={legendLabel}
      mapTitle={mapTitle}
      showHeading={false}
      requireSelection
      onSelect={onSelect}
      onPreview={onPreview}
    />
  );

  if (Platform.OS !== 'web') {
    return map;
  }

  const handle = React.createElement('div', {
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': open
      ? 'Dra for å endre bredden på kartet. Dra mot høyre marg for å legge det tilbake.'
      : 'Kart. Dra inn fra høyre marg for å forstørre, eller trykk for å åpne.',
    'aria-valuenow': Math.round(width),
    'aria-valuemin': RAIL_PEEK,
    'aria-valuemax': maxNow,
    'aria-expanded': open,
    tabIndex: 0,
    onPointerDown: startDrag,
    onKeyDown: onKey,
    style: open ? {
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
  }, open
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
    }, `Kart${pins.length ? ` · ${pins.length}` : ''}`));

  const panel = (
    <View
      style={open ? {
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
        top: 148,
        right: 0,
        width: Math.max(RAIL_PEEK, width),
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
      {open ? (
        <View style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Kart</Text>
            <TouchableOpacity onPress={() => remember(RAIL_PEEK)} accessibilityRole="button" accessibilityLabel="Legg kartet tilbake i høyre marg">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Legg i margen</Text>
            </TouchableOpacity>
          </View>
          {map}
        </View>
      ) : null}
    </View>
  );

  if (createPortal && typeof document !== 'undefined') return createPortal(panel, document.body);
  return panel;
}
