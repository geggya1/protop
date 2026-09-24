import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { listUserPlatforms } from '../../src/platform/platformCore';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { AvatarBubble } from '../../components/AvatarPicker';

export default function PlatformListScreen({ config, embedded, onOpenGroup }) {
  const c = config.theme;
  const nav = useNavigation();
  const { uid, selectFamily } = useApp();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (fromRefresh = false) => {
    if (!uid) {
      setGroups([]);
      setLoading(false);
      return;
    }
    if (fromRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const list = await listUserPlatforms(uid, config.type);
      setGroups(Array.isArray(list) ? list : []);
    } catch (e) {
      setGroups([]);
      setError(e?.message || 'Kunne ikke hente grupper.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, config.type]);

  useEffect(() => { load(false); }, [load]);

  const open = async (group) => {
    if (!group?.id) return;
    try {
      await selectFamily(group.id);
      if (onOpenGroup) onOpenGroup(group.id);
      else nav.navigate(config.homeRoute, { module: 'home' });
    } catch (e) {
      setError(e?.message || 'Kunne ikke åpne gruppen.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
        <Text style={[styles.loadingTxt, { color: c.muted }]}>Henter…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded, { backgroundColor: c.bg }]}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.brand} />
        )}
      >
        {!!error && <Text style={styles.error}>{error}</Text>}

        {groups.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Ionicons name={config.icon} size={32} color={c.muted} />
            <Text style={[styles.emptyTitle, { color: c.ink }]}>Ingen {config.labelShort.toLowerCase()}er ennå</Text>
            <Text style={[styles.emptySub, { color: c.muted }]}>
              Opprett en ny via plattformoversikten, eller bli med med {config.codeLabel.toLowerCase()}.
            </Text>
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: c.brand }]}
              onPress={() => nav.navigate(config.joinRoute)}
            >
              <Text style={styles.ctaTxt}>Bli med med kode</Text>
            </TouchableOpacity>
          </View>
        ) : groups.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}
            onPress={() => open(g)}
            activeOpacity={0.85}
          >
            <AvatarBubble group avatarId={g.avatarId} photoURL={g.photoURL} name={g.name} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: c.ink }]} numberOfLines={1}>{g.name || '—'}</Text>
              <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>{config.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </TouchableOpacity>
        ))}

        {!embedded && (
          <TouchableOpacity style={styles.linkRow} onPress={() => goPlatformOverview(nav)}>
            <Ionicons name="swap-horizontal-outline" size={18} color={c.brand} />
            <Text style={[styles.linkTxt, { color: c.brand }]}>Skift organisasjon</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingTxt: { fontSize: 13 },
  wrap: { flex: 1 },
  wrapEmbedded: { minHeight: 200 },
  body: { padding: 16, gap: 10, paddingBottom: 32 },
  error: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
  empty: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 10, borderWidth: 1 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 16 },
  linkTxt: { fontSize: 14, fontWeight: '700' },
});
