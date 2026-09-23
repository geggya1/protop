import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { AvatarBubble } from '../../components/AvatarPicker';

export default function PlatformMembersScreen({ config, groupId }) {
  const c = config.theme;
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) { setLoading(false); return undefined; }
    const unsubP = onSnapshot(
      query(collection(db, 'families', groupId, 'parents')),
      (snap) => setParents(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.deleted !== true && p.active !== false && p.placeholder !== true),
      ),
    );
    const unsubC = onSnapshot(
      query(collection(db, 'families', groupId, 'children')),
      (snap) => {
        setChildren(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((ch) => ch.active !== false && ch.deleted !== true));
        setLoading(false);
      },
    );
    return () => { unsubP(); unsubC(); };
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
        {config.type === 'daycare'
          ? 'Barn og foresatte knyttet til barnehagen eller SFO-en.'
          : `Medlemmer i ${config.labelShort.toLowerCase()}en.`}
      </Text>

      {parents.length > 0 && (
        <>
          <Text style={[styles.section, { color: c.muted }]}>
            {config.type === 'daycare' ? 'Foresatte og ansatte' : 'Medlemmer'} ({parents.length})
          </Text>
          {parents.map((p) => (
            <View key={p.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <AvatarBubble avatarId={p.avatarId} photoURL={p.photoURL} name={p.name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: c.ink }]}>{p.name || 'Medlem'}</Text>
                <Text style={[styles.sub, { color: c.muted }]}>
                  {p.admin || p.superAdmin ? 'Administrator' : (p.email || 'Medlem')}
                </Text>
              </View>
              {(p.admin || p.superAdmin) && (
                <View style={[styles.badge, { backgroundColor: c.brandSoft }]}>
                  <Ionicons name="shield-checkmark" size={14} color={c.brand} />
                </View>
              )}
            </View>
          ))}
        </>
      )}

      {children.length > 0 && (
        <>
          <Text style={[styles.section, { color: c.muted }]}>Barn ({children.length})</Text>
          {children.map((ch) => (
            <View key={ch.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
              <AvatarBubble avatarId={ch.avatarId} photoURL={ch.photoURL} name={ch.name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: c.ink }]}>{ch.name || 'Barn'}</Text>
                {!!ch.birthday && (
                  <Text style={[styles.sub, { color: c.muted }]}>{ch.birthday}</Text>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {parents.length === 0 && children.length === 0 && (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Ionicons name="people-outline" size={28} color={c.muted} />
          <Text style={[styles.emptyTxt, { color: c.muted }]}>Ingen medlemmer registrert ennå.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 8, paddingBottom: 32 },
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  section: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  badge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 16, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1, marginTop: 16 },
  emptyTxt: { fontSize: 14, textAlign: 'center' },
});
