import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { configForType } from '../../src/platform/platformConfigs';
import { createPlatformPost } from '../../src/platform/platformCore';

export default function PlatformComposePostScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { groupId, group } = route.params || {};
  const platformType = group?.type || route.params?.platformType || 'friends';
  const config = configForType(platformType);
  const c = config.theme;
  const { uid, activeProfile } = useApp();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createPlatformPost({
        groupId,
        authorUid: uid,
        authorName: activeProfile?.name || 'Medlem',
        title,
        body,
      });
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke publisere.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={[styles.cancel, { color: c.muted }]}>Avbryt</Text>
        </TouchableOpacity>
        <Text style={[styles.headTitle, { color: c.ink }]}>Nytt innlegg</Text>
        <TouchableOpacity onPress={publish} disabled={busy || !body.trim()}>
          {busy ? <ActivityIndicator color={c.brand} size="small" /> : (
            <Text style={[styles.publish, { color: c.brand }, !body.trim() && { opacity: 0.4 }]}>Publiser</Text>
          )}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <TextInput
          style={[styles.titleInput, { color: c.ink }]}
          placeholder="Tittel (valgfritt)"
          placeholderTextColor={c.muted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.bodyInput, { color: c.ink }]}
          placeholder="Hva vil du dele?"
          placeholderTextColor={c.muted}
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  cancel: { fontSize: 15, fontWeight: '600' },
  headTitle: { fontSize: 16, fontWeight: '800' },
  publish: { fontSize: 15, fontWeight: '800' },
  body: { padding: 16, flexGrow: 1 },
  titleInput: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  bodyInput: { fontSize: 16, lineHeight: 24, minHeight: 160 },
});
