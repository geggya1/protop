import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';
import { listenPlatformExpenses, createPlatformExpense } from '../../src/platform/platformCore';

function formatNok(n) {
  return `${Number(n || 0).toLocaleString('nb-NO')} kr`;
}

export default function PlatformExpensesScreen({ config, groupId, group }) {
  const c = config.theme;
  const { uid, activeProfile } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenPlatformExpenses(groupId, (list) => {
      setExpenses(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const add = async () => {
    try {
      await createPlatformExpense({
        groupId,
        title,
        amount: parseFloat(amount.replace(',', '.')),
        paidByUid: uid,
        paidByName: activeProfile?.name,
        authorUid: uid,
      });
      setCreating(false);
      setTitle('');
      setAmount('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke registrere utgift.');
    }
  };

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text style={[styles.summaryLabel, { color: c.muted }]}>Totalt registrert</Text>
        <Text style={[styles.summaryAmount, { color: c.ink }]}>{formatNok(total)}</Text>
        <Text style={[styles.summaryHint, { color: c.muted }]}>Inspirert av VennTrip — del reiseutgifter rettferdig.</Text>
      </View>

      <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setCreating(true)}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addTxt}>Registrer utgift</Text>
      </TouchableOpacity>

      {creating && (
        <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Hva gjelder det?" placeholderTextColor={c.muted} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Beløp (kr)" placeholderTextColor={c.muted} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={add}>
            <Text style={styles.saveTxt}>Lagre</Text>
          </TouchableOpacity>
        </View>
      )}

      {expenses.map((ex) => (
        <View key={ex.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: c.ink }]}>{ex.title}</Text>
            <Text style={[styles.cardSub, { color: c.muted }]}>Betalt av {ex.paidByName || 'Ukjent'}</Text>
          </View>
          <Text style={[styles.cardAmount, { color: c.brand }]}>{formatNok(ex.amount)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  summary: { borderRadius: 16, padding: 18, borderWidth: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontWeight: '400', textTransform: 'uppercase' },
  summaryAmount: { fontSize: 28, fontWeight: '400', marginTop: 4 },
  summaryHint: { fontSize: 12, textAlign: 'center', marginTop: 6 },
  addBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14 },
  addTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: '400' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '400' },
  cardSub: { fontSize: 12, marginTop: 2 },
  cardAmount: { fontSize: 16, fontWeight: '400' },
});
