import React, { useCallback, useEffect, useState, createElement } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { colors, radius } from '../src/theme';
import {
  beginNotificationPermissionFromGesture,
  completePushSubscription,
  enablePushFromUserGesture,
  getPushStatus,
  isStandaloneDisplay,
  pushSupported,
} from '../src/utils/push';

const DISMISS_KEY = 'weekplan_push_banner_v2';
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 dager — ikke glem for alltid

async function wasDismissedRecently() {
  try {
    let raw = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      raw = window.localStorage.getItem(DISMISS_KEY);
    } else {
      raw = await AsyncStorage.getItem(DISMISS_KEY);
    }
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

async function setDismissedNow() {
  try {
    const value = String(Date.now());
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, value);
      return;
    }
    await AsyncStorage.setItem(DISMISS_KEY, value);
  } catch { /* ignore */ }
}

async function clearDismissed() {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.removeItem(DISMISS_KEY);
      return;
    }
    await AsyncStorage.removeItem(DISMISS_KEY);
  } catch { /* ignore */ }
}

function feedbackForResult(result) {
  if (!result || result.ok) return '';
  switch (result.reason) {
    case 'denied':
      return Platform.OS === 'web'
        ? 'Varsler er blokkert. Åpne iPhone-innstillinger → ProTop → Varsler og slå på.'
        : 'Varsler er blokkert i systeminnstillingene.';
    case 'ios-tab':
      return 'Åpne ProTop fra hjemskjerm-ikonet (ikke Safari-fanen), og trykk «Slå på» der.';
    case 'no-sw':
      return 'Klarte ikke starte varsel-tjenesten. Lukk appen helt og åpne den på nytt fra hjemskjermen.';
    case 'subscribe':
      return 'Tillatelse OK, men abonnement feilet. Prøv igjen, eller slett og legg til ProTop på hjemskjermen på nytt.';
    case 'unsupported':
      return 'Denne enheten støtter ikke web-push.';
    case 'permission':
    default:
      return 'Ingen tillatelse ble gitt. Trykk «Slå på» igjen og velg Tillat i dialogen.';
  }
}

/**
 * Ask for notification permission — required as a tap on iOS (PWA + native).
 * Also reappears if permission is granted but subscription is missing.
 */
export default function PushEnableBanner() {
  const { uid } = useApp();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState('ask'); // ask | denied | ios-tab | resubscribe
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refresh = useCallback(async () => {
    if (!uid || !pushSupported()) {
      setVisible(false);
      return;
    }
    const status = await getPushStatus();
    if (!status.supported) {
      setVisible(false);
      return;
    }
    if (status.iosSafariTab) {
      if (await wasDismissedRecently()) {
        setVisible(false);
        return;
      }
      setMode('ios-tab');
      setVisible(true);
      return;
    }
    if (status.permission === 'denied') {
      if (await wasDismissedRecently()) {
        setVisible(false);
        return;
      }
      setMode('denied');
      setVisible(true);
      return;
    }
    if (status.permission === 'default' || status.permission === 'undetermined') {
      // På hjemskjerm / native: alltid synlig til de har slått på (iOS krever tap).
      if (Platform.OS === 'web' && !isStandaloneDisplay() && await wasDismissedRecently()) {
        setVisible(false);
        return;
      }
      setMode('ask');
      setVisible(true);
      return;
    }
    // permission granted
    if (!status.subscribed) {
      setMode('resubscribe');
      setVisible(true);
      return;
    }
    setVisible(false);
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!visible) return null;

  const dismiss = () => {
    setDismissedNow();
    setVisible(false);
    setFeedback('');
  };

  /**
   * Must start Notification.requestPermission in the same turn as the tap —
   * iOS/WebKit ignores prompts that lose transient activation after an await.
   */
  const enable = () => {
    if (mode === 'ios-tab' || mode === 'denied') {
      dismiss();
      return;
    }
    if (busy || !uid) return;

    // WEB: fire permission prompt BEFORE any setState / await.
    const permissionPromise = Platform.OS === 'web'
      ? beginNotificationPermissionFromGesture()
      : null;

    setBusy(true);
    setFeedback('');

    (async () => {
      try {
        let result;
        if (permissionPromise) {
          const permission = await permissionPromise;
          result = await completePushSubscription(uid, permission);
        } else {
          result = await enablePushFromUserGesture(uid);
        }
        if (result?.ok) {
          await clearDismissed();
          setVisible(false);
          setFeedback('');
          return;
        }
        const msg = feedbackForResult(result);
        setFeedback(msg);
        console.warn('[PushEnableBanner] enable failed', result);
        await refresh();
      } catch (err) {
        console.warn('[PushEnableBanner] enable threw', err?.message || err);
        setFeedback('Noe gikk galt. Prøv igjen.');
        await refresh();
      } finally {
        setBusy(false);
      }
    })();
  };

  const copy = {
    ask: {
      text: Platform.OS !== 'web'
        ? 'Slå på push-varsler for ProTop.'
        : (isStandaloneDisplay()
          ? 'Slå på push-varsler for ProTop på hjemskjermen.'
          : 'Slå på push-varsler. På iPhone fungerer de best etter at ProTop er lagret på hjemskjermen.'),
      btn: busy ? '…' : 'Slå på',
    },
    resubscribe: {
      text: 'Push er tillatt, men ikke koblet til denne enheten. Trykk for å aktivere på nytt.',
      btn: busy ? '…' : 'Aktiver',
    },
    denied: {
      text: Platform.OS === 'ios'
        ? 'Varsler er blokkert. Åpne Innstillinger → ProTop → Varsler og slå på.'
        : Platform.OS === 'android'
          ? 'Varsler er blokkert. Åpne app-innstillinger og tillat varsler for ProTop.'
          : 'Varsler er blokkert. Åpne Innstillinger → ProTop → Varsler og slå på.',
      btn: 'Skjønner',
    },
    'ios-tab': {
      text: 'På iPhone: legg ProTop til hjemskjermen, åpne derfra, og slå deretter på push.',
      btn: 'Skjønner',
    },
  }[mode];

  const actionBtn = Platform.OS === 'web'
    ? createElement(
      'button',
      {
        type: 'button',
        onClick: enable,
        disabled: busy,
        'aria-label': copy.btn,
        style: {
          backgroundColor: colors.brand,
          borderRadius: 8,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 6,
          paddingBottom: 6,
          border: 'none',
          color: '#fff',
          fontWeight: '400',
          fontSize: 12,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
          fontFamily: 'inherit',
        },
      },
      copy.btn,
    )
    : (
      <Pressable
        onPress={enable}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnBusy]}
        accessibilityRole="button"
        accessibilityLabel={copy.btn}
        disabled={busy}
      >
        <Text style={styles.btnTxt}>{copy.btn}</Text>
      </Pressable>
    );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Ionicons name="notifications-outline" size={18} color={colors.brand} />
        <Text style={styles.txt}>{feedback || copy.text}</Text>
        {actionBtn}
        <TouchableOpacity onPress={dismiss} hitSlop={8} accessibilityLabel="Lukk">
          <Ionicons name="close" size={18} color={colors.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#eef6ff',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  txt: { flex: 1, fontSize: 12, fontWeight: '400', color: colors.ink, lineHeight: 16 },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    cursor: 'pointer',
  },
  btnPressed: { opacity: 0.88 },
  btnBusy: { opacity: 0.7 },
  btnTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },
});
