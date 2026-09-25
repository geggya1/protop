import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { listenDaycareAnnouncements } from '../../src/platform/platformCore';

function timeAgo(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d) return '';
    return d.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export default function PlatformAnnouncementsScreen({ config, groupId }) {
  const c = config.theme;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenDaycareAnnouncements(groupId, (list) => {
      setItems(list || []);
      setLoading(false);
    });
  }, [groupId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      {items.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.emptyTxt, { color: c.muted }]}>Ingen beskjeder ennå.</Text>
        </View>
      ) : items.map((item) => (
        <View key={item.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.title, { color: c.ink }]}>{item.title}</Text>
            <Text style={[styles.when, { color: c.muted }]}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[styles.bodyTxt, { color: c.ink }]}>{item.body}</Text>
          <Text style={[styles.author, { color: c.muted }]}>{item.authorName || 'Ansatt'}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 12, paddingBottom: 32 },
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1 },
  emptyTxt: { fontSize: 14 },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '400', flex: 1 },
  when: { fontSize: 11 },
  bodyTxt: { fontSize: 14, lineHeight: 20 },
  author: { fontSize: 11 },
});
