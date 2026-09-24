import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { listenAbsences, reportAbsence } from '../../src/platform/platformCore';

export default function PlatformAbsenceScreen({ config, groupId }) {
  const c = config.theme;
  const { uid, activeProfile } = useApp();
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [childName, setChildName] = useState('');
  const [dateKey, setDateKey] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenAbsences(groupId, (list) => {
      setAbsences(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const submit = async () => {
    try {
      await reportAbsence({
        groupId,
        childName,
        dateKey,
        reason,
        authorUid: uid,
        authorName: activeProfile?.name,
      });
      setFormOpen(false);
      setChildName('');
      setReason('');
      Alert.alert('Sendt', 'Fravær er meldt til barnehagen.');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke melde fravær.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      <Text style={[styles.lead, { color: c.muted }]}>
        Meld sykdom eller planlagt fravær — som i Flyt Foresatt og IST Home.
      </Text>

      <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setFormOpen(!formOpen)}>
        <Ionicons name="medical-outline" size={20} color="#fff" />
        <Text style={styles.addTxt}>Meld fravær</Text>
      </TouchableOpacity>

      {formOpen && (
        <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Barnets navn" placeholderTextColor={c.muted} value={childName} onChangeText={setChildName} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Dato YYYY-MM-DD" placeholderTextColor={c.muted} value={dateKey} onChangeText={setDateKey} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Årsak (valgfritt)" placeholderTextColor={c.muted} value={reason} onChangeText={setReason} />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={submit}>
            <Text style={styles.saveTxt}>Send</Text>
          </TouchableOpacity>
        </View>
      )}

      {absences.map((a) => (
        <View key={a.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.name, { color: c.ink }]}>{a.childName}</Text>
          <Text style={[styles.meta, { color: c.muted }]}>{a.dateKey} · {a.reason || 'Ingen årsak oppgitt'}</Text>
          <View style={[styles.badge, { backgroundColor: a.status === 'pending' ? '#fef3c7' : c.brandSoft }]}>
            <Text style={{ color: a.status === 'pending' ? '#b45309' : c.brand, fontSize: 11, fontWeight: '700' }}>
              {a.status === 'pending' ? 'Venter' : 'Registrert'}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  lead: { fontSize: 13, lineHeight: 18 },
  addBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '800' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
});
