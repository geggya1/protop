import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { configForType } from '../../src/platform/platformConfigs';
import { createPlatformEvent, createDaycareAnnouncement } from '../../src/platform/platformCore';

export default function PlatformCreateEventScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { groupId, group, mode } = route.params || {};
  const platformType = group?.type || route.params?.platformType || 'friends';
  const config = configForType(platformType);
  const c = config.theme;
  const { uid, activeProfile } = useApp();
  const isAnnouncement = mode === 'announcement' || platformType === 'daycare';

  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState(today);
  const [startTime, setStartTime] = useState('18:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isAnnouncement) {
        await createDaycareAnnouncement({
          groupId,
          title,
          body: description,
          authorUid: uid,
          authorName: activeProfile?.name || 'Ansatt',
        });
      } else {
        await createPlatformEvent({
          groupId,
          title,
          dateKey,
          startTime,
          location,
          description,
          authorUid: uid,
          authorName: activeProfile?.name || 'Medlem',
          eventType: platformType === 'congregation' ? 'service' : 'plan',
        });
      }
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
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
        <Text style={[styles.headTitle, { color: c.ink }]}>
          {isAnnouncement ? 'Ny beskjed' : `Ny ${config.eventsLabel.toLowerCase().slice(0, -1) || 'plan'}`}
        </Text>
        <TouchableOpacity onPress={save} disabled={busy || !title.trim()}>
          {busy ? <ActivityIndicator color={c.brand} size="small" /> : (
            <Text style={[styles.save, { color: c.brand }, !title.trim() && { opacity: 0.4 }]}>Lagre</Text>
          )}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: c.muted }]}>Tittel</Text>
        <TextInput
          style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
          value={title}
          onChangeText={setTitle}
          placeholder={isAnnouncement ? 'F.eks. Ukeplan' : 'F.eks. Hyttetur'}
          placeholderTextColor={c.muted}
        />
        {!isAnnouncement && (
          <>
            <Text style={[styles.label, { color: c.muted }]}>Dato (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
              value={dateKey}
              onChangeText={setDateKey}
              placeholder="2026-08-24"
              placeholderTextColor={c.muted}
            />
            <Text style={[styles.label, { color: c.muted }]}>Tid</Text>
            <TextInput
              style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="18:00"
              placeholderTextColor={c.muted}
            />
            <Text style={[styles.label, { color: c.muted }]}>Sted</Text>
            <TextInput
              style={[styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
              value={location}
              onChangeText={setLocation}
              placeholder="Adresse eller møtested"
              placeholderTextColor={c.muted}
            />
          </>
        )}
        <Text style={[styles.label, { color: c.muted }]}>{isAnnouncement ? 'Beskjed' : 'Beskrivelse'}</Text>
        <TextInput
          style={[styles.input, styles.area, { borderColor: c.line, color: c.ink, backgroundColor: c.surface }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Detaljer…"
          placeholderTextColor={c.muted}
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
  save: { fontSize: 15, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 14 },
  area: { minHeight: 100 },
});
