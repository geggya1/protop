import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { listUserTeams } from '../../src/utils/teams';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { teamColors as c } from '../../src/teamTheme';
import { AvatarBubble } from '../../components/AvatarPicker';
import HelpTarget from '../../components/HelpTarget';

export default function TeamGroupsScreen({ embedded, onOpenTeam }) {
  const nav = useNavigation();
  const { uid, selectFamily } = useApp();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (fromRefresh = false) => {
    if (!uid) {
      setTeams([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (fromRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const list = await listUserTeams(uid);
      setTeams(Array.isArray(list) ? list : []);
    } catch (e) {
      setTeams([]);
      setError(e?.message || 'Kunne ikke hente lag.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

  // useEffect (not useFocusEffect): this screen is often embedded in TeamShell tabs,
  // where focus callbacks can miss tab switches and leave the view blank/stuck.
  useEffect(() => {
    load(false);
  }, [load]);

  const open = async (team) => {
    if (!team?.id) return;
    try {
      await selectFamily(team.id);
      if (onOpenTeam) onOpenTeam(team.id);
      else nav.navigate('TeamHome', { module: 'home' });
    } catch (e) {
      setError(e?.message || 'Kunne ikke åpne laget.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
        <Text style={styles.loadingTxt}>Henter lag…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, embedded ? styles.wrapEmbedded : styles.wrapSolo]}>
      {!embedded && (
        <View style={styles.head}>
          <Text style={styles.title}>Lag</Text>
          <HelpTarget id="add">
            <TouchableOpacity style={styles.plus} onPress={() => nav.navigate('TeamCreate')}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </HelpTarget>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.brand} />
        )}
      >
        <TouchableOpacity style={styles.joinBtn} onPress={() => nav.navigate('TeamJoin')}>
          <Ionicons name="key-outline" size={18} color={c.brand} />
          <Text style={styles.joinTxt}>Har du en lagkode?</Text>
        </TouchableOpacity>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTxt}>{error}</Text>
            <TouchableOpacity onPress={() => load(false)}>
              <Text style={styles.retryTxt}>Prøv igjen</Text>
            </TouchableOpacity>
          </View>
        )}

        {teams.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ingen lag ennå</Text>
            <Text style={styles.emptySub}>
              Bruk + for å opprette idrettslag, eller bli med med unik kode.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => nav.navigate('TeamCreate')}>
              <Text style={styles.emptyBtnTxt}>Opprett idrettslag</Text>
            </TouchableOpacity>
          </View>
        ) : teams.map((item) => (
          <TouchableOpacity key={item.id} style={styles.row} onPress={() => open(item)}>
            <AvatarBubble
              group
              avatarId={item.avatarId}
              photoURL={item.photoURL}
              name={item.name}
              size={48}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name || 'Lag'}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{item.sport || 'Idrettslag'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.muted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.familyLink} onPress={() => goPlatformOverview(nav)}>
          <Ionicons name="swap-horizontal-outline" size={18} color={c.tint} />
          <Text style={styles.familyLinkTxt}>Skift organisasjon</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  wrapEmbedded: { backgroundColor: 'transparent' },
  wrapSolo: { backgroundColor: c.bg },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, gap: 10,
  },
  loadingTxt: { color: c.muted, fontWeight: '400', fontSize: 13 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '400', color: c.ink },
  plus: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.fab,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  joinBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.surface, borderRadius: 16, paddingVertical: 14, marginBottom: 12,
    borderWidth: 1, borderColor: c.line,
  },
  joinTxt: { color: c.brand, fontWeight: '400', fontSize: 15 },
  errorBox: {
    backgroundColor: '#fef2f2', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#fecaca', gap: 8,
  },
  errorTxt: { color: '#b91c1c', fontWeight: '400', fontSize: 13 },
  retryTxt: { color: c.brand, fontWeight: '400', fontSize: 13 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  rowName: { color: c.ink, fontWeight: '400', fontSize: 16 },
  rowSub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  empty: {
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20,
    backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line,
  },
  emptyTitle: { color: c.ink, fontWeight: '400', fontSize: 17 },
  emptySub: { color: c.muted, textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '400' },
  emptyBtn: {
    alignSelf: 'flex-start',
    marginTop: 16, backgroundColor: c.brand, borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  emptyBtnTxt: { color: '#fff', fontWeight: '400' },
  familyLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, paddingVertical: 12,
  },
  familyLinkTxt: { color: c.tint, fontWeight: '400' },
});
