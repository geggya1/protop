import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';
import { listenVolunteerSlots, signUpVolunteerSlot, createVolunteerSlot } from '../../src/platform/platformCore';

export default function PlatformVolunteerScreen({ config, groupId, group }) {
  const c = config.theme;
  const { uid, activeProfile } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:30');
  const [spots, setSpots] = useState('4');

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenVolunteerSlots(groupId, (list) => {
      setSlots(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const toggle = async (slot) => {
    try {
      await signUpVolunteerSlot(groupId, slot.id, uid, activeProfile?.name);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke melde deg på/av.');
    }
  };

  const add = async () => {
    try {
      await createVolunteerSlot({
        groupId,
        title,
        dateKey,
        startTime,
        spots: parseInt(spots, 10) || 1,
        authorUid: uid,
      });
      setCreating(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette tjeneste.');
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
        Meld deg på frivillig tjeneste — vertskap, kor, barnekirke m.m.
      </Text>

      {isAdmin && (
        creating ? (
          <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Tittel" placeholderTextColor={c.muted} value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Dato YYYY-MM-DD" placeholderTextColor={c.muted} value={dateKey} onChangeText={setDateKey} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Tid" placeholderTextColor={c.muted} value={startTime} onChangeText={setStartTime} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Antall plasser" placeholderTextColor={c.muted} value={spots} onChangeText={setSpots} keyboardType="number-pad" />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={add}>
              <Text style={styles.saveTxt}>Opprett</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addTxt}>Ny tjeneste</Text>
          </TouchableOpacity>
        )
      )}

      {slots.map((slot) => {
        const signed = (slot.signedUp || []).some((s) => s.uid === uid);
        const count = (slot.signedUp || []).length;
        return (
          <View key={slot.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={[styles.title, { color: c.ink }]}>{slot.title}</Text>
            <Text style={[styles.meta, { color: c.muted }]}>
              {slot.dateKey} · {slot.startTime || '—'} · {count}/{slot.spots || 1} plasser
            </Text>
            {!!slot.description && <Text style={[styles.desc, { color: c.muted }]}>{slot.description}</Text>}
            <TouchableOpacity
              style={[styles.btn, signed ? { backgroundColor: c.brandSoft } : { backgroundColor: c.brand }]}
              onPress={() => toggle(slot)}
            >
              <Text style={[styles.btnTxt, { color: signed ? c.brand : '#fff' }]}>
                {signed ? 'Avmeld' : 'Meld meg på'}
              </Text>
            </TouchableOpacity>
            {(slot.signedUp || []).length > 0 && (
              <Text style={[styles.names, { color: c.muted }]}>
                {(slot.signedUp || []).map((s) => s.name).join(', ')}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  lead: { fontSize: 13, lineHeight: 18 },
  addBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  addTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  title: { fontSize: 16, fontWeight: '400' },
  meta: { fontSize: 12 },
  desc: { fontSize: 13, lineHeight: 18 },
  btn: {
    alignSelf: 'flex-start', paddingVertical: 10, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  btnTxt: { fontWeight: '400', fontSize: 14 },
  names: { fontSize: 11 },
});
