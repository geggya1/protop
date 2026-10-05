import React from 'react';
import { Platform, Text, View } from 'react-native';
import { APP_BUILD_ID } from '../src/constants/build';
import { isPublicLiveHost } from '../src/utils/hostingChannel';

/** Synlig merke utenfor live protop.no, så gammel produksjonsbundle ikke forveksles. */
export default function DevHostBanner() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (isPublicLiveHost(window.location.hostname)) return null;
  const host = window.location.hostname || 'lokal';
  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: '#07274C',
        paddingVertical: 8,
        paddingHorizontal: 14,
        zIndex: 9999,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
        Utvikling — ikke live protop.no
      </Text>
      <Text style={{ color: '#c5d4e8', fontSize: 11, marginTop: 2 }}>
        {host} · bygg {APP_BUILD_ID}
      </Text>
    </View>
  );
}
