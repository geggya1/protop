import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../../src/theme';

/**
 * Landing page for Strava OAuth redirect (web popup/redirect).
 * Completes the AuthSession so the opener receives the auth code.
 */
export default function StravaOAuthRedirectScreen() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const WebBrowser = await import('expo-web-browser');
        WebBrowser.maybeCompleteAuthSession();
      } catch {
        // ignore
      }
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.title}>Fullfører Strava-innlogging…</Text>
      <Text style={styles.sub}>Du kan lukke dette vinduet hvis det ikke lukkes automatisk.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg || '#f8fafc',
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '400',
    color: colors.ink,
    textAlign: 'center',
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 320,
  },
});
