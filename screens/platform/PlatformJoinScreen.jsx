import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { configForType } from '../../src/platform/platformConfigs';
import { submitPlatformJoinRequest } from '../../src/platform/platformCore';

export default function PlatformJoinScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const platformType = route.params?.platformType || 'friends';
  const config = configForType(platformType);
  const c = config.theme;
  const { userProfile } = useApp();

  const [code, setCode] = useState('');
  const [name, setName] = useState(userProfile?.name || userProfile?.displayName || '');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Du må være innlogget.');
      const res = await submitPlatformJoinRequest({
        joinCode: code,
        platformType,
        parentUid: user.uid,
        parentName: name,
        parentEmail: user.email,
        displayName: name,
      });
      Alert.alert(
        'Forespørsel sendt',
        `Du har bedt om å bli med i «${res.groupName}». Administrator må godkjenne.`,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke sende forespørsel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={c.ink} />
        </TouchableOpacity>

        <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={[styles.iconWrap, { backgroundColor: c.brandSoft }]}>
            <Ionicons name={config.icon} size={28} color={c.brand} />
          </View>
          <Text style={[styles.title, { color: c.ink }]}>Bli med i {config.labelShort.toLowerCase()}</Text>
          <Text style={[styles.lead, { color: c.muted }]}>
            Skriv inn {config.codeLabel.toLowerCase()} du har fått. Administrator godkjenner forespørselen.
          </Text>
        </View>

        <Text style={[styles.label, { color: c.muted }]}>{config.codeLabel}</Text>
        <TextInput
          style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ABC123"
          placeholderTextColor={c.muted}
          autoCapitalize="characters"
          maxLength={8}
        />

        <Text style={[styles.label, { color: c.muted }]}>Ditt navn</Text>
        <TextInput
          style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
          value={name}
          onChangeText={setName}
          placeholder="Fornavn Etternavn"
          placeholderTextColor={c.muted}
        />

        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.brand }, (!code.trim() || !name.trim()) && styles.ctaOff]}
          onPress={submit}
          disabled={busy || !code.trim() || !name.trim()}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.ctaTxt}>Send forespørsel</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, paddingBottom: 40 },
  back: { marginBottom: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, marginBottom: 24 },
  iconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '400', textAlign: 'center' },
  lead: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  label: { fontSize: 12, fontWeight: '400', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 16 },
  cta: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  ctaOff: { opacity: 0.5 },
  ctaTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
