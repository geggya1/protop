import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { listenPickupPlans, createPickupPlan } from '../../src/platform/platformCore';

export default function PlatformPickupScreen({ config, groupId }) {
  const c = config.theme;
  const { uid } = useApp();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [childName, setChildName] = useState('');
  const [dateKey, setDateKey] = useState(new Date().toISOString().slice(0, 10));
  const [pickupTime, setPickupTime] = useState('16:00');
  const [pickupBy, setPickupBy] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenPickupPlans(groupId, (list) => {
      setPlans(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const submit = async () => {
    try {
      await createPickupPlan({
        groupId, childName, dateKey, pickupTime, pickupBy, pickupPhone, notes, authorUid: uid,
      });
      setFormOpen(false);
      Alert.alert('Sendt', 'Henteplan er registrert.');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre henteplan.');
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
        Registrer hvem som henter og når — som oppholdsplan i IST Home.
      </Text>

      <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setFormOpen(!formOpen)}>
        <Text style={styles.addTxt}>+ Ny henteplan</Text>
      </TouchableOpacity>

      {formOpen && (
        <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Barn" value={childName} onChangeText={setChildName} placeholderTextColor={c.muted} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Dato" value={dateKey} onChangeText={setDateKey} placeholderTextColor={c.muted} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Hentetid" value={pickupTime} onChangeText={setPickupTime} placeholderTextColor={c.muted} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Hentes av" value={pickupBy} onChangeText={setPickupBy} placeholderTextColor={c.muted} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Telefon" value={pickupPhone} onChangeText={setPickupPhone} placeholderTextColor={c.muted} keyboardType="phone-pad" />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Notat" value={notes} onChangeText={setNotes} placeholderTextColor={c.muted} />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={submit}>
            <Text style={styles.saveTxt}>Lagre</Text>
          </TouchableOpacity>
        </View>
      )}

      {plans.map((p) => (
        <View key={p.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.name, { color: c.ink }]}>{p.childName}</Text>
          <Text style={[styles.meta, { color: c.muted }]}>
            {p.dateKey} kl. {p.pickupTime || '—'}
          </Text>
          {!!p.pickupBy && (
            <Text style={[styles.pickup, { color: c.brand }]}>Hentes av {p.pickupBy}{p.pickupPhone ? ` · ${p.pickupPhone}` : ''}</Text>
          )}
          {!!p.notes && <Text style={[styles.notes, { color: c.muted }]}>{p.notes}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  lead: { fontSize: 13, lineHeight: 18 },
  addBar: { padding: 14, borderRadius: 14, alignItems: 'center' },
  addTxt: { color: '#fff', fontWeight: '400' },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '400' },
  meta: { fontSize: 12 },
  pickup: { fontSize: 13, fontWeight: '400', marginTop: 4 },
  notes: { fontSize: 12, marginTop: 2 },
});
