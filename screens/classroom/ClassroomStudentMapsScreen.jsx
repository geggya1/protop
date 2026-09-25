import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import { staffRoleOf, isClassroomAdmin } from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';

export default function ClassroomStudentMapsScreen({ classroomId, classroom }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = onSnapshot(collection(db, 'families', classroomId, 'children'), (snap) => {
      setStudents(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => s.deleted !== true && s.active !== false)
          .sort((x, y) => (x.name || '').localeCompare(y.name || '', 'nb')),
      );
      setLoading(false);
    }, () => { setStudents([]); setLoading(false); });
    const b = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { a(); b(); };
  }, [classroomId]);

  const isStaff = !!staffRoleOf(classroom, uid, staff);
  const isAdmin = isClassroomAdmin(classroom, uid, staff);

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  if (!isStaff) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={36} color={c.sensitive} />
        <Text style={styles.deniedTitle}>Kun skolen</Text>
        <Text style={styles.deniedSub}>
          Elevmapper er sensitive og vises bare for ansatte med tildelt rettighet.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.warn}>
        <Ionicons name="shield-checkmark-outline" size={18} color={c.sensitive} />
        <Text style={styles.warnTxt}>
          Sensitive mapper. Tilgang styres av rettighetsbeskytter (rektor). Ikke alle ansatte ser alt.
        </Text>
      </View>
      {students.length === 0 ? (
        <Text style={styles.empty}>Ingen elever i klassen ennå.</Text>
      ) : students.map((s) => (
        <TouchableOpacity
          key={s.id}
          style={styles.row}
          onPress={() => nav.navigate('ClassroomStudentMap', {
            classroomId, studentId: s.id, studentName: s.name, classroom,
          })}
        >
          <View style={styles.av}><Text style={styles.avTxt}>{(s.name || '?')[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{s.name}</Text>
            <Text style={styles.sub}>Journal · personvern · § 12 · barnevern</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </TouchableOpacity>
      ))}
      {isAdmin ? (
        <Text style={styles.foot}>Som rektor kan du styre hvem som ser hver seksjon inne i mappen.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  deniedTitle: { color: c.ink, fontWeight: '400', fontSize: 18 },
  deniedSub: { color: c.muted, fontWeight: '400', textAlign: 'center', lineHeight: 20 },
  warn: {
    flexDirection: 'row', gap: 10, backgroundColor: c.sensitiveSoft,
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  warnTxt: { flex: 1, color: c.sensitive, fontWeight: '400', fontSize: 13, lineHeight: 18 },
  empty: { color: c.muted, fontWeight: '400' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  av: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avTxt: { color: c.ink, fontWeight: '400' },
  name: { color: c.ink, fontWeight: '400', fontSize: 15 },
  sub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  foot: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 12, lineHeight: 18 },
});
