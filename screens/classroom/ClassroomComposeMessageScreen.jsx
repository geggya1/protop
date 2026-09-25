import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  listenSubjects, createClassMessage, MESSAGE_AUDIENCES,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomComposeMessageScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { uid, activeProfile, familyId, family } = useApp();
  const classroomId = route.params?.classroomId || familyId;
  const [audience, setAudience] = useState('all_students');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [pickedStudents, setPickedStudents] = useState({});
  const [pickedSubjects, setPickedSubjects] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!classroomId) return undefined;
    const a = listenSubjects(classroomId, setSubjects);
    const b = onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.active !== false && s.deleted !== true));
    });
    return () => { a(); b(); };
  }, [classroomId]);

  const needStudents = audience === 'students' || audience === 'student_subjects';
  const needSubjects = audience === 'subjects' || audience === 'student_subjects' || audience === 'all_subjects';

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createClassMessage(classroomId, {
        title,
        body,
        audience,
        studentIds: Object.keys(pickedStudents).filter((id) => pickedStudents[id]),
        subjectIds: audience === 'all_subjects'
          ? subjects.map((s) => s.id)
          : Object.keys(pickedSubjects).filter((id) => pickedSubjects[id]),
        authorUid: uid,
        authorName: activeProfile?.name || '',
      });
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke sende.');
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
          <Text style={styles.kicker}>Strøm</Text>
          <Text style={styles.title}>Ny kunngjøring</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Kunngjøring i strømmen — elever kan kommentere. Oppgaver opprettes under Klassearbeid.</Text>
        <Text style={styles.label}>Målgruppe</Text>
        {MESSAGE_AUDIENCES.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={[styles.aud, audience === a.id && styles.audOn]}
            onPress={() => setAudience(a.id)}
          >
            <Ionicons name={`${a.icon}-outline`} size={18} color={audience === a.id ? c.brand : c.muted} />
            <Text style={[styles.audTxt, audience === a.id && styles.audTxtOn]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
        {needStudents && (
          <>
            <Text style={styles.label}>Elever</Text>
            {students.map((s) => {
              const on = !!pickedStudents[s.id];
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.pick}
                  onPress={() => setPickedStudents((p) => ({ ...p, [s.id]: !on }))}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? c.brand : c.muted} />
                  <Text style={styles.pickTxt}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        {needSubjects && audience !== 'all_subjects' && (
          <>
            <Text style={styles.label}>Fag</Text>
            {subjects.map((s) => {
              const on = !!pickedSubjects[s.id];
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.pick}
                  onPress={() => setPickedSubjects((p) => ({ ...p, [s.id]: !on }))}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? c.brand : c.muted} />
                  <Text style={styles.pickTxt}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}
        <Text style={styles.label}>Emne</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Emne" placeholderTextColor={c.muted} />
        <Text style={styles.label}>Beskjed</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={body}
          onChangeText={setBody}
          placeholder="Skriv beskjeden…"
          placeholderTextColor={c.muted}
          multiline
        />
        <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} onPress={send} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Send beskjed</Text>}
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
    borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center',
  },
  kicker: { fontSize: 11, fontWeight: '400', color: c.tint, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '400', color: c.ink },
  body: { padding: 16, paddingBottom: 40 },
  lead: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  label: { color: c.ink, fontWeight: '400', fontSize: 12, marginBottom: 6, marginTop: 10 },
  aud: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: c.line,
  },
  audOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  audTxt: { color: c.ink, fontWeight: '400' },
  audTxtOn: { color: c.brand },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  pickTxt: { color: c.ink, fontWeight: '400' },
  input: {
    backgroundColor: c.surface, borderRadius: 14, padding: 14, color: c.ink, fontWeight: '400',
    borderWidth: 1, borderColor: c.line,
  },
  area: { minHeight: 120, textAlignVertical: 'top' },
  btn: {
    alignSelf: 'flex-start', marginTop: 20, backgroundColor: c.brand, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
