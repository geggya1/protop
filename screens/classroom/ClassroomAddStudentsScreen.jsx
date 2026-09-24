import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { addClassroomStudents, parseStudentNames, isClassroomAdmin } from '../../src/utils/classroom';
import { classroomColors as c } from '../../src/classroomTheme';

export default function ClassroomAddStudentsScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { uid, familyId, family } = useApp();
  const classroomId = route.params?.classroomId || familyId;
  const classroom = route.params?.classroom || family;
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    if (!classroomId) return undefined;
    return onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
  }, [classroomId]);

  const parsed = useMemo(() => parseStudentNames(raw), [raw]);
  const canAdmin = isClassroomAdmin(classroom, uid, staff);

  const submit = async () => {
    if (!canAdmin) {
      Alert.alert('Ingen tilgang', 'Bare rektor/lærer-admin kan legge til elever.');
      return;
    }
    if (!parsed.length || busy) return;
    setBusy(true);
    try {
      const created = await addClassroomStudents({
        classroomId,
        names: parsed,
        createdBy: uid,
      });
      setDone(created);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke legge til elever.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Text style={styles.headTitle}>Elever lagt til</Text>
        </View>
        <View style={styles.doneBody}>
          <Ionicons name="checkmark-circle" size={48} color={c.success} />
          <Text style={styles.doneLead}>{done.length} elever er i klassen.</Text>
          <Text style={styles.hint}>Hver elev har fått en tom, tilgangsstyrt mappe som kun skolen ser.</Text>
          <TouchableOpacity style={styles.primary} onPress={() => nav.goBack()}>
            <Text style={styles.primaryTxt}>Ferdig</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>Legg til elever</Text>
          <Text style={styles.headSub}>{classroom?.name || 'Klasse'}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Lim inn en liste — ett navn per linje. Fornavn og etternavn skilles med mellomrom.
          Maks 80 om gangen.
        </Text>
        <TextInput
          style={styles.area}
          value={raw}
          onChangeText={setRaw}
          placeholder={'Ola Nordmann\nKari Hansen\nPer Olsen'}
          placeholderTextColor={c.muted}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.count}>{parsed.length} navn gjenkjent</Text>
        {parsed.slice(0, 12).map((p, i) => (
          <Text key={`${p.name}-${i}`} style={styles.preview}>• {p.name}</Text>
        ))}
        {parsed.length > 12 ? <Text style={styles.hint}>…og {parsed.length - 12} til</Text> : null}
        <TouchableOpacity
          style={[styles.primary, (!parsed.length || busy) && { opacity: 0.45 }]}
          onPress={submit}
          disabled={!parsed.length || busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.primaryTxt}>Legg til {parsed.length || ''} elever</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  back: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  headTitle: { fontSize: 18, fontWeight: '900', color: c.ink },
  headSub: { fontSize: 12, fontWeight: '600', color: c.tint, marginTop: 1 },
  body: { padding: 16, paddingBottom: 40 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  area: {
    minHeight: 180, backgroundColor: c.surface, borderRadius: 16, padding: 14,
    color: c.ink, fontWeight: '700', borderWidth: 1, borderColor: c.line,
  },
  count: { marginTop: 12, color: c.brand, fontWeight: '800' },
  preview: { color: c.ink, fontWeight: '600', marginTop: 4 },
  hint: { color: c.muted, fontWeight: '600', marginTop: 8, lineHeight: 18 },
  primary: {
    marginTop: 20, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  doneLead: { color: c.ink, fontWeight: '800', fontSize: 18, textAlign: 'center' },
});
