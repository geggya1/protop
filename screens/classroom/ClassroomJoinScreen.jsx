import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { submitClassroomJoinRequest } from '../../src/utils/classroom';
import { normalizeJoinCode } from '../../src/utils/teams';
import { classroomColors as c } from '../../src/classroomTheme';

export default function ClassroomJoinScreen() {
  const nav = useNavigation();
  const { uid, user, activeProfile } = useApp();
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await submitClassroomJoinRequest({
        joinCode: normalizeJoinCode(code),
        childFirstName: firstName,
        childLastName: lastName,
        parentUid: uid,
        parentName: activeProfile?.name || user?.displayName || '',
        parentEmail: user?.email || '',
      });
      Alert.alert(
        'Forespørsel sendt',
        `Du har bedt om å melde ${firstName} ${lastName} inn i «${result.classroomName}». Rektor eller lærer må godkjenne.`,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (e) {
      Alert.alert('Kunne ikke sende', e?.message || 'Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Klasserom</Text>
          <Text style={styles.title}>Bli med i klasse</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Skriv inn klassekode fra rektor eller kontaktlærer, og elevens fulle navn. Skolen må godkjenne før eleven slipper inn.
        </Text>
        <Text style={styles.label}>Klassekode</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(t) => setCode(normalizeJoinCode(t))}
          placeholder="F.eks. AB12CD"
          placeholderTextColor={c.muted}
          autoCapitalize="characters"
          maxLength={8}
        />
        <Text style={styles.label}>Elevens fornavn</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Fornavn"
          placeholderTextColor={c.muted}
        />
        <Text style={styles.label}>Elevens etternavn</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Etternavn"
          placeholderTextColor={c.muted}
        />
        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy || !code || !firstName.trim() || !lastName.trim()}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.btnTxt}>Be om å bli med</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  back: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: { fontSize: 11, fontWeight: '400', color: c.tint, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '400', color: c.ink },
  body: { padding: 16, paddingBottom: 40 },
  lead: { color: c.muted, fontWeight: '400', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  label: { color: c.ink, fontWeight: '400', fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
    color: c.ink, fontWeight: '400', fontSize: 16, borderWidth: 1, borderColor: c.line,
  },
  btn: {
    alignSelf: 'flex-start',
    marginTop: 24, backgroundColor: c.brand, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
