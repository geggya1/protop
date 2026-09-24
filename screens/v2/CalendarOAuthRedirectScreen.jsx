import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  completeCalendarOAuthRedirect,
  OPEN_CALENDAR_SETTINGS_KEY,
  OAUTH_COMPLETE_MESSAGE,
  markOpenMailHub,
  peekOauthRedirectIsMail,
  peekOauthRedirectIsSignIn,
} from '../../src/utils/calendarIntegration';
import { colors } from '../../src/theme';

function notifyOpener(mail) {
  try {
    if (typeof window === 'undefined') return false;
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: OAUTH_COMPLETE_MESSAGE, mail: !!mail },
        window.location.origin,
      );
      window.close();
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function goHome(nav) {
  if (typeof window !== 'undefined') {
    window.location.replace('/hjem');
    return;
  }
  nav?.replace?.('Home');
}

function goLogin(nav) {
  if (typeof window !== 'undefined') {
    window.location.replace('/login');
    return;
  }
  nav?.replace?.('Login');
}

function goCalendarSettings(nav) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(OPEN_CALENDAR_SETTINGS_KEY, '1');
    }
  } catch { /* ignore */ }
  if (notifyOpener(false)) return;
  if (typeof window !== 'undefined') {
    window.location.replace('/');
    return;
  }
  nav?.replace?.('Home', { openShell: { tab: 'plan' } });
}

function goMailHub(nav) {
  markOpenMailHub();
  if (notifyOpener(true)) return;
  if (typeof window !== 'undefined') {
    window.location.replace('/');
    return;
  }
  nav?.replace?.('Home', { openShell: { tab: 'mail' } });
}

/**
 * Landing page for Microsoft/Google OAuth (same-window redirect).
 * Also finishes Microsoft *account* sign-in (reuses /oauth/calendar in Azure).
 * Mail grants reuse /oauth/calendar (Azure-registered) but show e-post copy.
 */
export default function CalendarOAuthRedirectScreen() {
  const nav = useNavigation();
  const [isSignIn] = useState(() => peekOauthRedirectIsSignIn());
  const [isMail] = useState(() => !isSignIn && peekOauthRedirectIsMail());
  const [error, setError] = useState('');

  useEffect(() => {
    const safety = setTimeout(() => {
      setError((prev) => prev || (isSignIn
        ? 'Microsoft-innloggingen tok for lang tid. Prøv igjen.'
        : isMail
          ? 'E-post-innloggingen tok for lang tid. Prøv å koble til på nytt.'
          : 'Kalender-innloggingen tok for lang tid. Prøv å koble til på nytt.'));
    }, 32000);

    (async () => {
      let result;
      try {
        result = await completeCalendarOAuthRedirect();
      } catch (e) {
        result = {
          ok: false,
          mail: isMail,
          signIn: isSignIn,
          error: e?.message || 'Innlogging feilet',
        };
      }

      const signIn = !!(result?.signIn || isSignIn);
      const mail = !!(result?.mail || isMail);
      if (result?.ok) {
        if (signIn) {
          goHome(nav);
          return;
        }
        if (mail) goMailHub(nav);
        else goCalendarSettings(nav);
        return;
      }
      if (result?.popup) {
        try { window.close(); } catch {}
        if (signIn) {
          goHome(nav);
          return;
        }
        if (mail) goMailHub(nav);
        else goCalendarSettings(nav);
        return;
      }
      setError(result?.error || 'Innlogging feilet');
    })();

    return () => clearTimeout(safety);
  }, [nav, isMail, isSignIn]);

  if (error) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>
          {isSignIn
            ? 'Klarte ikke logge inn med Microsoft'
            : isMail
              ? 'Klarte ikke koble til e-post'
              : 'Klarte ikke koble til kalenderen'}
        </Text>
        <Text style={styles.sub}>{error}</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            if (isSignIn) goLogin(nav);
            else if (isMail) goMailHub(nav);
            else goCalendarSettings(nav);
          }}
        >
          <Text style={styles.btnTxt}>
            {isSignIn
              ? 'Tilbake til innlogging'
              : isMail
                ? 'Tilbake til e-post'
                : 'Tilbake til kalenderinnstillinger'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.title}>
        {isSignIn
          ? 'Fullfører Microsoft-innlogging…'
          : isMail
            ? 'Fullfører e-post-innlogging…'
            : 'Fullfører kalender-innlogging…'}
      </Text>
      <Text style={styles.sub}>
        {isSignIn
          ? 'Vent et øyeblikk mens vi logger deg inn i ProTop.'
          : isMail
            ? 'Vent et øyeblikk mens Outlook-e-post kobles til ProTop. Microsoft viser appen som ProTop.'
            : 'Vent et øyeblikk mens Outlook kobles til ProTop.'}
      </Text>
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => {
          if (isSignIn) goLogin(nav);
          else if (isMail) goMailHub(nav);
          else goCalendarSettings(nav);
        }}
      >
        <Text style={styles.linkTxt}>Avbryt</Text>
      </TouchableOpacity>
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
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 360,
  },
  btn: {
    marginTop: 20,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  linkBtn: { marginTop: 20, padding: 8 },
  linkTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
});
