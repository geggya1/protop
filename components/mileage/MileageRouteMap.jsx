/**
 * Kartpreview for kjøretur: fra/til-markører og kjørelinje.
 * Web: Leaflet i iframe. Native: lenke til kart-app.
 */
import React, { useMemo } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapsUrl } from '../../src/utils/locationMaps';
import { routeMapDocument } from '../../src/mileage/routeMapHtml';

function hasCoords(place) {
  return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng));
}

export default function MileageRouteMap({
  fromPlace = null,
  toPlace = null,
  points = [],
  colors,
  height = 220,
  fromLabel = '',
  toLabel = '',
}) {
  const from = hasCoords(fromPlace)
    ? { ...fromPlace, label: fromLabel || fromPlace.label || 'Fra' }
    : null;
  const to = hasCoords(toPlace)
    ? { ...toPlace, label: toLabel || toPlace.label || 'Til' }
    : null;
  const path = Array.isArray(points) ? points : [];
  const canShow = !!(from || to || path.length >= 2);

  const html = useMemo(
    () => (canShow
      ? routeMapDocument({
        from,
        to,
        points: path,
        brand: colors?.brand || '#3D6B8A',
        fromLabel: from?.label || 'Fra',
        toLabel: to?.label || 'Til',
      })
      : ''),
    [canShow, from?.lat, from?.lng, from?.label, to?.lat, to?.lng, to?.label, path, colors?.brand],
  );

  if (!canShow) {
    return (
      <View style={[styles.empty, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
        <Ionicons name="map-outline" size={18} color={colors.muted} />
        <Text style={{ color: colors.muted, flex: 1, fontSize: 13 }}>
          Kart vises når begge adressene er stedfestet.
        </Text>
      </View>
    );
  }

  if (Platform.OS !== 'web') {
    const target = to || from;
    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(mapsUrl(target))}
        accessibilityRole="button"
        accessibilityLabel="Åpne kjøreturen i kart"
        style={[styles.open, { backgroundColor: colors.sunken, borderColor: colors.line }]}
      >
        <Ionicons name="map-outline" size={18} color={colors.brand} />
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Åpne rute i kart</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.wrap, { height, borderColor: colors.line }]}
      nativeID="mileage-route-map"
      accessibilityLabel="Kart over kjøreturen"
    >
      {React.createElement('iframe', {
        title: 'Kart over kjøreturen',
        srcDoc: html,
        sandbox: 'allow-scripts allow-same-origin',
        style: { border: 0, width: '100%', height: '100%', borderRadius: 12 },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
});
