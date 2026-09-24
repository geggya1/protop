import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { db } from '../firebase';
import TopNavBar from '../components/TopNavBar';
import { colors } from '../src/theme';

export default function TemplateListScreen({ inShell = false }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  // Skjul native header – bruk TopNavBar (stack) eller shell-header
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    const ref = collection(db, 'templates'); // endre ved behov
    const q = query(ref, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTemplates(list);
        setLoading(false);
      },
      (err) => {
        console.error('Kunne ikke lese maler:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const onRefresh = () => {
    // onSnapshot er live – vis kun en kort indikator for UX
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  };

  const navBar = inShell ? null : (
    <TopNavBar
      title="Maler"
      pages={[
        { label: 'Familier', route: 'FamilyOverview' },
        { label: 'Maler', route: 'Templates' },
      ]}
    />
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {navBar}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </View>
    );
  }

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Ingen maler funnet</Text>
      <Text style={styles.emptyText}>Når du lager dine første maler vil de dukke opp her.</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      {navBar}

      <FlatList
        style={styles.list}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        data={templates}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Empty />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const days = item.days && typeof item.days === 'object'
            ? Object.entries(item.days).filter(([_, v]) => v).map(([k]) => k.toUpperCase())
            : [];
          const reward =
            typeof item.rewardValue !== 'undefined'
              ? String(item.rewardValue)
              : (typeof item.points !== 'undefined' ? String(item.points) : undefined);

          return (
            <View style={styles.card}>
              <Text style={styles.title} numberOfLines={1}>{item.title || 'Uten tittel'}</Text>
              {!!item.description && (
                <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
              )}
              <View style={styles.metaRow}>
                {typeof reward !== 'undefined' && (
                  <Text style={styles.metaPill}>Verdi: {reward}</Text>
                )}
                {!!days.length && (
                  <Text style={styles.metaPill}>Dager: {days.join(', ')}</Text>
                )}
                {!!item.type && (
                  <Text style={styles.metaPill}>Type: {String(item.type).toUpperCase()}</Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const CARD_BG = 'rgba(255,255,255,0.96)';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f9fc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f9fc' },

  list: { flex: 1 },

  card: {
    backgroundColor: CARD_BG,
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }
      : { elevation: 2 }),
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  desc: { marginTop: 6, color: '#334155' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef6ff',
    color: '#0b74d1',
    fontWeight: '700',
    fontSize: 12,
  },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0b3d91' },
  emptyText: { marginTop: 6, fontSize: 13, color: '#64748b', textAlign: 'center' },
});
