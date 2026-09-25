import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenTeamJoinRequests } from '../../src/utils/teams';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';
import { teamColors as c } from '../../src/teamTheme';

export default function TeamAlertsScreen({ teamId }) {
  const { uid, family } = useApp();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const admin = isGroupAdmin(family, uid);

  useEffect(() => {
    if (!teamId || !admin) { setLoading(false); return undefined; }
    return listenTeamJoinRequests(teamId, (list) => {
      setPending((list || []).filter((r) => r.status === 'pending'));
      setLoading(false);
    });
  }, [teamId, admin]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  const items = [];
  if (admin && pending.length) {
    items.push({
      id: 'join',
      title: `${pending.length} forespørsel${pending.length > 1 ? 'er' : ''} venter`,
      body: 'Åpne Godkjenninger i menyen for å slippe inn nye foresatte og barn.',
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.info}>
        <Ionicons name="information-circle" size={18} color={c.brand} />
        <Text style={styles.infoTxt}>
          Push-varsler per lag kan tilpasses senere. Her ser du viktige laghendelser.
        </Text>
      </View>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={36} color={c.muted} />
          <Text style={styles.emptyTitle}>Ingen varsler</Text>
        </View>
      ) : items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.bodyTxt}>{item.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  info: {
    flexDirection: 'row', gap: 10, backgroundColor: c.brandSoft,
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  infoTxt: { flex: 1, color: c.ink, fontWeight: '400', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 8 },
  title: { color: c.ink, fontWeight: '400', fontSize: 15 },
  bodyTxt: { color: c.muted, fontWeight: '400', marginTop: 4, fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { color: c.ink, fontWeight: '400' },
});
