import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { listenDailyRhythm } from '../../src/platform/platformCore';

export default function PlatformRhythmScreen({ config, groupId }) {
  const c = config.theme;
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    return listenDailyRhythm(groupId, (list) => {
      setSlots(list || []);
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
      <Text style={[styles.lead, { color: c.muted }]}>
        Dagens rytme i barnehagen eller SFO — som i IST Home og MyKid.
      </Text>

      {slots.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="time-outline" size={28} color={c.muted} />
          <Text style={[styles.emptyTxt, { color: c.muted }]}>Ingen dagsrytme registrert ennå.</Text>
        </View>
      ) : slots.map((slot, idx) => (
        <View key={slot.id} style={styles.row}>
          <View style={[styles.timeCol, { backgroundColor: c.brandSoft }]}>
            <Text style={[styles.time, { color: c.brand }]}>{slot.time || '—'}</Text>
          </View>
          {idx < slots.length - 1 && <View style={[styles.line, { backgroundColor: c.line }]} />}
          <View style={[styles.content, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={[styles.label, { color: c.ink }]}>{slot.label}</Text>
            {!!slot.description && (
              <Text style={[styles.desc, { color: c.muted }]}>{slot.description}</Text>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 32 },
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 4, minHeight: 56 },
  timeCol: { width: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  time: { fontSize: 13, fontWeight: '400' },
  line: { position: 'absolute', left: 31, top: 48, width: 2, height: 24 },
  content: { flex: 1, borderRadius: 14, padding: 12, borderWidth: 1 },
  label: { fontSize: 15, fontWeight: '400' },
  desc: { fontSize: 12, marginTop: 4 },
});
