import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import {
  listenClassroomJoinRequests, approveClassroomJoinRequest, rejectClassroomJoinRequest,
  isClassroomAdmin,
} from '../../src/utils/classroom';
import { classroomColors as c } from '../../src/classroomTheme';

export default function ClassroomApprovalsScreen({ classroomId, classroom }) {
  const { uid } = useApp();
  const [requests, setRequests] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const a = listenClassroomJoinRequests(classroomId, (list) => {
      setRequests((list || []).filter((r) => r.status === 'pending'));
      setLoading(false);
    });
    const b = onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
      setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setStaff([]));
    return () => { a(); b(); };
  }, [classroomId]);

  const canAdmin = useMemo(
    () => isClassroomAdmin(classroom, uid, staff),
    [classroom, uid, staff],
  );

  const approve = async (req) => {
    if (!canAdmin) return;
    setBusyId(req.id);
    try {
      await approveClassroomJoinRequest(classroomId, req.id, uid);
      Alert.alert('Godkjent', `${req.childName} er lagt til i klassen.`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke godkjenne.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (req) => {
    if (!canAdmin) return;
    setBusyId(req.id);
    try {
      await rejectClassroomJoinRequest(classroomId, req.id, uid);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke avslå.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  if (!canAdmin) {
    return (
      <View style={styles.centerPad}>
        <Ionicons name="lock-closed-outline" size={32} color={c.muted} />
        <Text style={styles.emptyTitle}>Kun rektor/admin</Text>
        <Text style={styles.empty}>Du har ikke tilgang til godkjenninger.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>Foresatte som ber om plass med klassekode vises her.</Text>
      {requests.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="shield-checkmark-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen ventende</Text>
          <Text style={styles.empty}>Nye forespørsler dukker opp automatisk.</Text>
        </View>
      ) : requests.map((req) => (
        <View key={req.id} style={styles.card}>
          <Text style={styles.name}>{req.childName || 'Elev'}</Text>
          <Text style={styles.meta}>
            {[req.parentName, req.parentEmail].filter(Boolean).join(' · ') || 'Foresatt'}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOk]}
              onPress={() => approve(req)}
              disabled={busyId === req.id}
            >
              {busyId === req.id
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnTxt}>Godkjenn</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnNo]}
              onPress={() => reject(req)}
              disabled={busyId === req.id}
            >
              <Text style={[styles.btnTxt, { color: c.danger }]}>Avslå</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, marginBottom: 12 },
  emptyBox: {
    alignItems: 'center', padding: 24, backgroundColor: c.surface,
    borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { marginTop: 8, color: c.ink, fontWeight: '800', fontSize: 16 },
  empty: { marginTop: 6, color: c.muted, textAlign: 'center', fontWeight: '600' },
  card: {
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.line,
  },
  name: { color: c.ink, fontWeight: '900', fontSize: 16 },
  meta: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center',
  },
  btnOk: { backgroundColor: c.brand },
  btnNo: { backgroundColor: '#fff', borderWidth: 1, borderColor: c.line },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
