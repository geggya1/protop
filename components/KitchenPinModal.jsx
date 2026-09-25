import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '../src/theme';
import { isValidKitchenPin } from '../src/utils/kitchenDisplay';

/**
 * PIN-dialog for å avslutte kjøkkenvisning (eller bekrefte PIN ved oppsett).
 */
export default function KitchenPinModal({
  visible,
  mode = 'unlock', // unlock | set
  title,
  message,
  onCancel,
  onSubmit,
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPin('');
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    if (!isValidKitchenPin(pin)) {
      setError('PIN må være 4 siffer');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await onSubmit?.(pin);
      if (ok === false) {
        setError(mode === 'set' ? 'Klarte ikke lagre PIN' : 'Feil PIN');
        setBusy(false);
        return;
      }
      reset();
    } catch {
      setError('Noe gikk galt');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        reset();
        onCancel?.();
      }}
    >
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>{title || (mode === 'set' ? 'Velg PIN' : 'Skriv PIN')}</Text>
          <Text style={styles.body}>
            {message || (mode === 'set'
              ? '4 siffer kreves for å avslutte kjøkkenvisning på denne enheten.'
              : 'Skriv PIN for å avslutte kjøkkenvisning.')}
          </Text>
          <TextInput
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            style={styles.input}
            placeholder="••••"
            autoFocus
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.cancel}
              onPress={() => {
                reset();
                onCancel?.();
              }}
            >
              <Text style={styles.cancelTxt}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ok} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.okTxt}>{mode === 'set' ? 'Lagre' : 'Bekreft'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: colors.card,
    borderRadius: 20, padding: 22, gap: 10,
  },
  title: { fontSize: 20, fontWeight: '400', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 14, fontWeight: '400', color: colors.muted, textAlign: 'center', lineHeight: 20 },
  input: {
    marginTop: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    padding: 14, fontSize: 28, letterSpacing: 12, textAlign: 'center',
    fontWeight: '400', backgroundColor: colors.sunken, color: colors.ink,
  },
  error: { color: '#b91c1c', fontWeight: '400', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancel: {
    flex: 1, backgroundColor: '#e5e7eb', borderRadius: radius.pill,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  cancelTxt: { fontWeight: '400', color: colors.ink },
  ok: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radius.pill,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  okTxt: { fontWeight: '400', color: '#fff' },
});
