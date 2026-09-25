import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { useI18n } from '../src/i18n';
import {
  searchPlaces,
  reverseGeocode,
  getDeviceLocation,
  mapsEmbed,
  openGoogleMaps,
  resolveTypedLocation,
} from '../src/utils/location';

const SEARCH_DEBOUNCE_MS = 280;
const MIN_QUERY = 2;

function hasCoords(loc) {
  return Number.isFinite(Number(loc?.lat)) && Number.isFinite(Number(loc?.lng));
}

/**
 * Google-style address autocomplete:
 * - suggestions in a list below the field (never auto-fill the input)
 * - list narrows as you type
 * - clear (×) on the right
 * - spinner beside the clear control
 */
export default function LocationPicker({ value, onChange }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState(value?.label || '');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const reqId = useRef(0);
  const debounceRef = useRef(null);
  const pickingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value?.label && value.label !== q && !open) {
      setQ(value.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.label, value?.placeId]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const clearAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqId.current += 1;
    setQ('');
    setHits([]);
    setOpen(false);
    setSearching(false);
    setSearchError(false);
    setLocationError(null);
    onChangeRef.current(null);
  };

  const runSearch = (text) => {
    setQ(text);
    setSearchError(false);
    setLocationError(null);

    // Typing invalidates a previous selection
    if (value?.label && text.trim() !== value.label) {
      onChangeRef.current(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();

    if (trimmed.length < MIN_QUERY) {
      setHits([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setOpen(true);
    const id = ++reqId.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const next = await searchPlaces(trimmed, lang);
        if (id !== reqId.current) return;
        setHits(next.slice(0, 6));
        setOpen(true);
        setSearchError(false);
      } catch {
        if (id !== reqId.current) return;
        setHits([]);
        setSearchError(true);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  const pick = (hit) => {
    if (!hit || !hasCoords(hit)) {
      setSearchError(true);
      return;
    }
    pickingRef.current = true;
    onChangeRef.current(hit);
    setQ(hit.label);
    setHits([]);
    setOpen(false);
    setSearchError(false);
    setTimeout(() => { pickingRef.current = false; }, 0);
  };

  const useTyped = async () => {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;
    setBusy(true);
    setOpen(false);
    try {
      const loc = await resolveTypedLocation(trimmed, lang);
      if (loc && hasCoords(loc)) pick(loc);
      else if (loc?.label) {
        // Keep label-only as last resort (events/notes), but flag that maps need coords.
        pickingRef.current = true;
        onChangeRef.current(loc);
        setQ(loc.label);
        setHits([]);
        setSearchError(false);
        setTimeout(() => { pickingRef.current = false; }, 0);
      } else {
        setSearchError(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const here = async () => {
    setBusy(true);
    setSearchError(false);
    setLocationError(null);
    setOpen(false);
    try {
      const pos = await getDeviceLocation();
      let loc = null;
      try {
        loc = await reverseGeocode(pos.lat, pos.lng, lang);
      } catch {
        loc = null;
      }
      pick(loc || {
        label: `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`,
        lat: pos.lat,
        lng: pos.lng,
        placeId: '',
        source: 'device',
      });
    } catch (err) {
      const msg = err?.message === 'denied'
        ? t('profile.locationPermissionDenied')
        : t('profile.locationUnavailable');
      setLocationError(msg);
    } finally {
      setBusy(false);
    }
  };

  const filled = Boolean(value?.label);
  const showClear = q.length > 0;
  const typedSources = value?.source === 'typed' || value?.source === 'manual';
  const showUseTyped = q.trim().length >= 5 && (!filled || typedSources);
  const canShowEmpty = !searching && !hits.length && q.trim().length >= MIN_QUERY && !searchError;
  const showEmpty = open && canShowEmpty;
  const embed = filled && hasCoords(value) ? mapsEmbed(value) : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.inputWrap}>
        <TextInput
          value={q}
          onChangeText={runSearch}
          onFocus={() => {
            if (hits.length || canShowEmpty || searchError) setOpen(true);
          }}
          onBlur={() => {
            // Delay so a suggestion tap can register before closing
            setTimeout(() => {
              if (pickingRef.current) return;
              setOpen(false);
            }, 180);
          }}
          placeholder=""
          style={[styles.input, showClear && styles.inputWithClear]}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          returnKeyType="search"
          onSubmitEditing={() => {
            if (hits[0]) pick(hits[0]);
            else useTyped();
          }}
          accessibilityLabel={t('profile.location')}
        />
        <View style={styles.trailing} pointerEvents="box-none">
          {searching ? (
            <ActivityIndicator size="small" color={colors.brand} style={styles.spinner} />
          ) : null}
          {showClear ? (
            <TouchableOpacity
              onPress={clearAll}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.delete')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={22} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {open && (hits.length > 0 || searching || showEmpty) ? (
        <View style={styles.dropdown} accessibilityRole="list">
          {hits.map((h) => (
            <TouchableOpacity
              key={h.placeId || h.label}
              onPress={() => pick(h)}
              style={styles.hit}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={18} color={colors.brand} style={styles.hitIcon} />
              <Text style={styles.hitTxt} numberOfLines={2}>{h.label}</Text>
            </TouchableOpacity>
          ))}
          {searching && !hits.length ? (
            <View style={styles.hitLoading}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.hitLoadingTxt}>{t('common.loading')}</Text>
            </View>
          ) : null}
          {showEmpty ? (
            <View style={styles.hitLoading}>
              <Text style={styles.hitLoadingTxt}>{t('profile.locationSearchFailed')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {searchError && !hits.length && !searching ? (
        <Text style={styles.err}>{t('profile.locationSearchFailed')}</Text>
      ) : null}

      {locationError ? (
        <Text style={styles.err}>{locationError}</Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity onPress={here} style={styles.chip} disabled={busy}>
          <Text style={styles.chipTxt}>{busy ? t('common.loading') : t('profile.useMyLocation')}</Text>
        </TouchableOpacity>
        {showUseTyped ? (
          <TouchableOpacity onPress={useTyped} style={[styles.chip, styles.chipPrimary]} disabled={busy}>
            <Text style={[styles.chipTxt, styles.chipPrimaryTxt]}>
              {busy ? t('common.loading') : t('profile.useTypedAddress')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {filled && value?.source !== 'typed' && value?.source !== 'manual' ? (
        <Text style={styles.ok} numberOfLines={2}>{value.label}</Text>
      ) : null}

      {Platform.OS === 'web' && embed ? (
        <View style={styles.map}>
          {React.createElement('iframe', {
            title: 'map',
            src: embed,
            style: { border: 0, width: '100%', height: 180, borderRadius: 16 },
          })}
        </View>
      ) : null}

      {/* Native has no iframe maps — offer the same external-maps escape hatch as LocationHub. */}
      {Platform.OS !== 'web' && filled && hasCoords(value) ? (
        <TouchableOpacity
          style={styles.mapLink}
          onPress={() => openGoogleMaps(value)}
          accessibilityRole="button"
        >
          <Ionicons name="map-outline" size={18} color={colors.brand} />
          <Text style={styles.mapLinkTxt}>{t('profile.openMaps')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, zIndex: 2 },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingRight: 44,
    fontSize: 16,
    fontWeight: '400',
    color: colors.ink,
  },
  inputWithClear: {
    paddingRight: 72,
  },
  trailing: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  spinner: { marginRight: 2 },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdown: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      },
    }),
  },
  hit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hitIcon: { marginTop: 2 },
  hitTxt: { flex: 1, color: colors.ink, fontWeight: '400', fontSize: 14, lineHeight: 20 },
  hitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  hitLoadingTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipPrimary: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  chipTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  chipPrimaryTxt: { color: colors.ink },
  ok: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  err: { color: colors.danger, fontWeight: '400', fontSize: 13 },
  map: {
    overflow: 'hidden',
    borderRadius: 16,
    height: 180,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  mapLinkTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
});
