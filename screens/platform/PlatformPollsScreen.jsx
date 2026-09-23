import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';
import {
  listenPlatformPolls, votePlatformPoll, createPlatformPoll,
} from '../../src/platform/platformCore';

export default function PlatformPollsScreen({ config, groupId, group }) {
  const c = config.theme;
  const nav = useNavigation();
  const { uid, activeProfile } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [opt1, setOpt1] = useState('');
  const [opt2, setOpt2] = useState('');
  const [opt3, setOpt3] = useState('');

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenPlatformPolls(groupId, (list) => {
      setPolls(list || []);
      setLoading(false);
    });
  }, [groupId]);

  const vote = async (pollId, idx) => {
    try {
      await votePlatformPoll(groupId, pollId, idx, uid);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke stemme.');
    }
  };

  const create = async () => {
    const options = [opt1, opt2, opt3].filter(Boolean);
    try {
      await createPlatformPoll({
        groupId,
        question,
        options,
        authorUid: uid,
        authorName: activeProfile?.name,
      });
      setCreating(false);
      setQuestion('');
      setOpt1('');
      setOpt2('');
      setOpt3('');
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke opprette avstemning.');
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
        Stem på tid og sted — som i Somo og ZynkUp.
      </Text>

      {isAdmin && (
        creating ? (
          <View style={[styles.form, { backgroundColor: c.surface, borderColor: c.line }]}>
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Spørsmål" placeholderTextColor={c.muted} value={question} onChangeText={setQuestion} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Alternativ 1" placeholderTextColor={c.muted} value={opt1} onChangeText={setOpt1} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Alternativ 2" placeholderTextColor={c.muted} value={opt2} onChangeText={setOpt2} />
            <TextInput style={[styles.input, { color: c.ink, borderColor: c.line }]} placeholder="Alternativ 3 (valgfritt)" placeholderTextColor={c.muted} value={opt3} onChangeText={setOpt3} />
            <View style={styles.formActions}>
              <TouchableOpacity onPress={() => setCreating(false)}><Text style={{ color: c.muted }}>Avbryt</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: c.brand }]} onPress={create}>
                <Text style={styles.saveTxt}>Opprett</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={[styles.addBar, { backgroundColor: c.brand }]} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addTxt}>Ny avstemning</Text>
          </TouchableOpacity>
        )
      )}

      {polls.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="stats-chart-outline" size={28} color={c.muted} />
          <Text style={[styles.emptyTxt, { color: c.muted }]}>Ingen avstemninger ennå.</Text>
        </View>
      ) : polls.map((poll) => (
        <View key={poll.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.question, { color: c.ink }]}>{poll.question}</Text>
          <Text style={[styles.author, { color: c.muted }]}>{poll.authorName || 'Medlem'}</Text>
          {(poll.options || []).map((opt, idx) => {
            const voted = (opt.votes || []).includes(uid);
            const count = (opt.votes || []).length;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.option, voted && { backgroundColor: c.brandSoft, borderColor: c.brand }]}
                onPress={() => vote(poll.id, idx)}
              >
                <Text style={[styles.optionLabel, { color: c.ink }]}>{opt.label}</Text>
                <Text style={[styles.optionCount, { color: c.brand }]}>{count} stemmer</Text>
              </TouchableOpacity>
            );
          })}
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
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTxt: { fontSize: 14 },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  question: { fontSize: 16, fontWeight: '800' },
  author: { fontSize: 12 },
  option: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  optionLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
  optionCount: { fontSize: 12, fontWeight: '700' },
  form: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  saveTxt: { color: '#fff', fontWeight: '800' },
});
