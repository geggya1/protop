import React, { useEffect, useState } from 'react';
import {
  Modal, Pressable, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

/**
 * Popup for å sette eller endre barnets innloggingspassord.
 * Lagrer via setMemberPassword (Auth + lesbar kopi for foresatte).
 */
export default function ChangeChildPasswordModal({
  visible,
  mode = 'change', // 'set' | 'change'
  childName = '',
  busy = false,
  onCancel,
  onSubmit,
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setPassword('');
    setConfirm('');
    setShow(false);
    setError('');
  }, [visible]);

  const title = mode === 'set' ? 'Sett passord' : 'Endre passord';
  const body = mode === 'set'
    ? `Velg et passord ${childName ? `${childName}` : 'barnet'} kan logge inn med på telefon eller PC.`
    : 'Skriv inn det nye passordet. Det gamle erstattes med en gang.';

  const submit = async () => {
    const next = password.trim();
    if (next.length < 6) {
      setError('Passordet må ha minst 6 tegn.');
      return;
    }
    if (next !== confirm.trim()) {
      setError('Passordene er ulike.');
      return;
    }
    setError('');
    await onSubmit?.(next);
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()}>
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              onPress={onCancel}
              disabled={busy}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.body}>{body}</Text>

          <Text style={styles.label}>Nytt passord</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Minst 6 tegn"
              placeholderTextColor={colors.muted}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShow((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={show ? 'Skjul passord' : 'Vis passord'}
            >
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Gjenta nytt passord"
            placeholderTextColor={colors.muted}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          <Text style={styles.hint}>
            Noter det sammen med barnet — det vises under Brukernavn og passord etter lagring.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnMuted]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.btnMutedTxt}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryTxt}>Lagre passord</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '400', color: colors.ink },
  body: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 14 },
  label: { fontWeight: '400', color: colors.ink, marginBottom: 6, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.sunken,
    color: colors.ink,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    alignSelf: 'flex-start', padding: 8 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  error: { color: '#b91c1c', fontWeight: '400', fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnMuted: { backgroundColor: colors.sunken },
  btnMutedTxt: { color: colors.ink, fontWeight: '400', fontSize: 15 },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  btnDisabled: { opacity: 0.7 },
});
