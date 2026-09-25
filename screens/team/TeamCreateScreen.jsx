import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { createTeam } from '../../src/utils/teams';
import { canAccessAllPlatforms } from '../../src/utils/platformAccess';
import { teamColors as c } from '../../src/teamTheme';

export default function TeamCreateScreen() {
  const nav = useNavigation();
  const { user, activeProfile, selectFamily } = useApp();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canAccessAllPlatforms(user)) nav.replace('CreateGroup');
  }, [user, nav]);

  const create = async () => {
    if (!name.trim()) {
      Alert.alert('Mangler navn', 'Gi laget et navn.');
      return;
    }
    setBusy(true);
    try {
      const { familyId, joinCode } = await createTeam({
        name: name.trim(),
        sport: sport.trim(),
        user,
        profile: activeProfile,
      });
      await selectFamily(familyId);
      Alert.alert(
        'Lag opprettet',
        `Lagkode: ${joinCode}\n\nDel koden med foresatte. De ber om å bli med med barnets navn — du godkjenner forespørsler.`,
        [{ text: 'Åpne laget', onPress: () => nav.replace('TeamHome') }],
      );
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette lag.');
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
          <Text style={styles.kicker}>Idrettslag</Text>
          <Text style={styles.title}>Opprett lag</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          For idrettslag, kullet eller klubb. Du blir administrator og får en unik lagkode til foresatte.
        </Text>
        <Text style={styles.label}>Lagnavn</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="F.eks. Sola HK mini 2017"
          placeholderTextColor={c.muted}
        />
        <Text style={styles.label}>Idrett / type (valgfritt)</Text>
        <TextInput
          style={styles.input}
          value={sport}
          onChangeText={setSport}
          placeholder="Håndball, fotball, turn…"
          placeholderTextColor={c.muted}
        />
        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={create}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.btnTxt}>Opprett idrettslag</Text>
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
