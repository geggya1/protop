import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';
import { listenMinistryGroups, createMinistryGroup } from '../../src/platform/platformCore';

export default function PlatformMinistryScreen({ config, groupId, group }) {
  const c = config.theme;
  const { uid } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [meetingDay, setMeetingDay] = useState('');

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenMinistryGroups(groupId, (list) => {
      setGroups(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const add = async () => {
    try {
      await createMinistryGroup({ groupId, name, description, meetingDay });
      setCreating(false);
      setName('');
      setDescription('');
      setMeetingDay('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette gruppe.');
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
        Kor, ungdom, seniorkrets og arbeidsgrupper — som i ChurchDesk og B1 Mobil.
      </Text>

      {isAdmin && (
        creating ? (
          <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Gruppenavn" placeholderTextColor={c.muted} value={name} onChangeText={setName} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Beskrivelse" placeholderTextColor={c.muted} value={description} onChangeText={setDescription} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Møtedag (f.eks. Onsdag)" placeholderTextColor={c.muted} value={meetingDay} onChangeText={setMeetingDay} />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={add}>
              <Text style={styles.saveTxt}>Opprett gruppe</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addTxt}>Ny menighetsgruppe</Text>
          </TouchableOpacity>
        )
      )}

      {groups.map((g) => (
        <View key={g.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={[styles.icon, { backgroundColor: c.brandSoft }]}>
            <Ionicons name="people" size={20} color={c.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.ink }]}>{g.name}</Text>
            {!!g.description && <Text style={[styles.desc, { color: c.muted }]}>{g.description}</Text>}
            {!!g.meetingDay && (
              <Text style={[styles.day, { color: c.brand }]}>{g.meetingDay}</Text>
            )}
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
  addTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, alignItems: 'flex-start' },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '400' },
  desc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  day: { fontSize: 12, fontWeight: '400', marginTop: 6 },
});
