import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import {
  listenPlatformJoinRequests, approvePlatformJoinRequest, rejectPlatformJoinRequest,
} from '../../src/platform/platformCore';

export default function PlatformApprovalsScreen({ config, groupId }) {
  const c = config.theme;
  const { uid } = useApp();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenPlatformJoinRequests(groupId, (list) => {
      setRequests((list || []).filter((r) => r.status === 'pending'));
      setLoading(false);
    });
  }, [groupId]);

  const approve = async (req) => {
    setBusyId(req.id);
    try {
      await approvePlatformJoinRequest(groupId, req.id, uid);
      Alert.alert('Godkjent', `${req.parentName} er lagt til.`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke godkjenne.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (req) => {
    setBusyId(req.id);
    try {
      await rejectPlatformJoinRequest(groupId, req.id, uid);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke avslå.');
    } finally {
      setBusyId(null);
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
        Personer som har brukt {config.codeLabel.toLowerCase()} venter her på godkjenning.
      </Text>
      {requests.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="checkmark-circle-outline" size={36} color={c.success} />
          <Text style={[styles.emptyTitle, { color: c.ink }]}>Ingen ventende</Text>
          <Text style={[styles.emptySub, { color: c.muted }]}>Nye forespørsler dukker opp her.</Text>
        </View>
      ) : requests.map((req) => (
        <View key={req.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.name, { color: c.ink }]}>{req.parentName || req.parentEmail || 'Ukjent'}</Text>
          {!!req.parentEmail && (
            <Text style={[styles.sub, { color: c.muted }]}>{req.parentEmail}</Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.reject} onPress={() => reject(req)} disabled={busyId === req.id}>
              <Text style={styles.rejectTxt}>Avslå</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.approve, { backgroundColor: c.brand }]}
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
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  name: { fontWeight: '900', fontSize: 17 },
  sub: { marginTop: 4, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  reject: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center' },
  rejectTxt: { color: '#dc2626', fontWeight: '800' },
  approve: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  approveTxt: { color: '#fff', fontWeight: '800' },
});
