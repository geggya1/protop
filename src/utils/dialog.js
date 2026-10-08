import { Alert, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert does nothing. Use the browser dialog on web
 * so feil og bekreftelser faktisk vises.
 */
export function notifyUser(title, message) {
  const head = String(title || '').trim();
  const body = String(message || '').trim();
  const text = [head, body].filter(Boolean).join('\n\n');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(text || 'ProTop');
    return;
  }
  Alert.alert(head || 'ProTop', body || undefined);
}

export function confirmUser(title, message, { ok = 'OK', cancel = 'Avbryt' } = {}) {
  const text = [title, message].filter(Boolean).join('\n\n');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]);
  });
}
