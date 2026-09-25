import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { colors } from '../../src/theme';
import { completeAirbnbOAuthFromRedirect } from '../../src/utils/hospitalityIntegrations';

/**
 * Landing page for Airbnb OAuth redirect (web same-window / popup).
 */
export default function AirbnbOAuthRedirectScreen({ navigation }) {
  const [status, setStatus] = useState('working');
  const [message, setMessage] = useState('Fullfører Airbnb-innlogging…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const WebBrowser = await import('expo-web-browser');
        WebBrowser.maybeCompleteAuthSession();
      } catch {
        // ignore — popup flow may still complete via opener
      }

      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      if (cancelled) return;

      const result = await completeAirbnbOAuthFromRedirect();
      if (cancelled) return;

      if (result.ok) {
        setStatus('ok');
        setMessage('Airbnb er koblet. Sender deg tilbake…');
        const target = (result.returnTo && String(result.returnTo).startsWith('/'))
          ? result.returnTo
          : '/';
        setTimeout(() => {
          window.location.assign(target);
        }, 500);
        return;
      }

      if (result.cancelled) {
        setStatus('info');
        setMessage('Venter på Airbnb… Du kan lukke dette vinduet hvis innloggingen skjer i et annet vindu.');
        return;
      }

      setStatus('error');
      setMessage(result.error || 'Airbnb-innlogging feilet.');
    })();
    return () => { cancelled = true; };
  }, [navigation]);

  return (
    <View style={styles.wrap}>
      {status === 'working' ? <ActivityIndicator color={colors.brand} /> : null}
      <Text style={[styles.title, status === 'error' && styles.titleErr]}>{message}</Text>
      <Text style={styles.sub}>
        {status === 'error'
          ? 'Gå tilbake til Utleie og prøv «Logg inn» på nytt.'
          : 'Du kan lukke dette vinduet hvis det ikke lukkes automatisk.'}
      </Text>
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
    color: colors.ink || colors.text || '#0f172a',
    textAlign: 'center',
  },
  titleErr: { color: '#b91c1c' },
  sub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 320,
  },
});
