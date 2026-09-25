import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import {
  listenTeamJoinRequests, approveTeamJoinRequest, rejectTeamJoinRequest,
} from '../../src/utils/teams';
import { teamColors as c } from '../../src/teamTheme';

export default function TeamApprovalsScreen({ teamId }) {
  const { uid } = useApp();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!teamId) { setLoading(false); return undefined; }
    return listenTeamJoinRequests(teamId, (list) => {
      setRequests((list || []).filter((r) => r.status === 'pending'));
      setLoading(false);
    });
  }, [teamId]);

  const approve = async (req) => {
    setBusyId(req.id);
    try {
      await approveTeamJoinRequest(teamId, req.id, uid);
      Alert.alert('Godkjent', `${req.childName} er lagt til på laget.`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke godkjenne.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (req) => {
    setBusyId(req.id);
    try {
      await rejectTeamJoinRequest(teamId, req.id, uid);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke avslå.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Foresatte som har brukt lagkoden og oppgitt barnets navn venter her på godkjenning.
      </Text>
      {requests.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={36} color={c.success} />
          <Text style={styles.emptyTitle}>Ingen ventende</Text>
          <Text style={styles.emptySub}>Nye forespørsler dukker opp her.</Text>
        </View>
      ) : requests.map((req) => (
        <View key={req.id} style={styles.card}>
          <Text style={styles.child}>{req.childName}</Text>
          <Text style={styles.parent}>
            Foresatt: {req.parentName || req.parentEmail || 'Ukjent'}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.reject}
              onPress={() => reject(req)}
              disabled={busyId === req.id}
            >
              <Text style={styles.rejectTxt}>Avslå</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approve}
              onPress={() => approve(req)}
              disabled={busyId === req.id}
            >
              {busyId === req.id
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.approveTxt}>Godkjenn</Text>}
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
  lead: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 18, marginBottom: 14 },
  card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10 },
  child: { color: c.ink, fontWeight: '400', fontSize: 17 },
  parent: { color: c.muted, fontWeight: '400', marginTop: 4, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reject: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.surface2,
  },
  rejectTxt: { color: c.ink, fontWeight: '400' },
  approve: {
    flex: 1.4, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: c.success,
  },
  approveTxt: { color: '#fff', fontWeight: '400' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { color: c.ink, fontWeight: '400', fontSize: 16 },
  emptySub: { color: c.muted, fontWeight: '400' },
});
