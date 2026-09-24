// src/screens/ChildListScreen.jsx
import React, { useEffect, useState, useRef, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  collection,
  query,
  where,
  getDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigation } from '@react-navigation/native';
import TopNavBar from '../components/TopNavBar';
import { calculateAge } from '../src/utils/age';
import { useProfileNavigation } from '../src/hooks/useProfileNavigation';

export default function ChildListScreen() {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [familyId, setFamilyId] = useState(null);

  const navigation = useNavigation();
  const { goChildProfile } = useProfileNavigation();

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  const unsubSubCollRef = useRef(null);
  const unsubTopLevelRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert('Ukjent bruker', 'Du må logge inn for å se barn.');
        setLoading(false);
        return;
      }

      try {
        const parentSnap = await getDoc(doc(db, 'parents', uid));
        if (!parentSnap.exists()) {
          Alert.alert('Feil', 'Foreldredokument ikke funnet.');
          setLoading(false);
          return;
        }
        const famId = parentSnap.data().familyId;
        setFamilyId(famId);

        const subRef = collection(db, 'families', famId, 'children');
        unsubSubCollRef.current = onSnapshot(
          subRef,
          (snap) => {
            const subList = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((c) => c.deleted !== true);

            if (subList.length > 0) {
              setChildren(sortChildren(subList));
              setLoading(false);
              if (unsubTopLevelRef.current) {
                unsubTopLevelRef.current();
                unsubTopLevelRef.current = null;
              }
            } else {
              if (!unsubTopLevelRef.current) {
                const topQ = query(
                  collection(db, 'children'),
                  where('familyId', '==', famId),
                  where('deleted', '!=', true)
                );
                unsubTopLevelRef.current = onSnapshot(
                  topQ,
                  (tsnap) => {
                    const list = tsnap.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
                    setChildren(sortChildren(list));
                    setLoading(false);
                  },
                  () => setLoading(false)
                );
              }
            }
          },
          () => setLoading(false)
        );
      } catch (error) {
        console.error('Feil ved henting av barn:', error);
        Alert.alert('Feil', 'Kunne ikke hente barn fra databasen.');
        setLoading(false);
      }
    };

    init();

    return () => {
      if (unsubSubCollRef.current) { unsubSubCollRef.current(); unsubSubCollRef.current = null; }
      if (unsubTopLevelRef.current) { unsubTopLevelRef.current(); unsubTopLevelRef.current = null; }
    };
  }, []);

  const sortChildren = (list) =>
    [...list].sort((a, b) => {
      const aInactive = a.active === false;
      const bInactive = b.active === false;
      if (aInactive !== bInactive) return aInactive ? 1 : -1;
      const an = (a.name || '').toLowerCase();
      const bn = (b.name || '').toLowerCase();
      return an.localeCompare(bn);
    });

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  };

  const handlePressChild = (item) => {
    const childPayload = {
      ...item,
      id: item.id || item.childId,
      familyId: familyId || item.familyId || null,
    };
    goChildProfile(childPayload);
  };

  const handleAddChild = () => navigation.navigate('AddChild', { familyId });

  const headerRight = useMemo(
    () => (
      <TouchableOpacity style={styles.primaryBtnSm} onPress={handleAddChild}>
        <Text style={styles.primaryBtnSmText}>+ Legg til barn</Text>
      </TouchableOpacity>
    ),
    [familyId]
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <TopNavBar
          title="Barn"
          subtitle=""
          showBack
          onBack={() => navigation.goBack()}
          pages={[
            { label: 'Familier', route: 'FamilyOverview' },
            { label: 'Maler', route: 'Templates' },
          ]}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0b74d1" />
        </View>
      </View>
    );
  }

  const Empty = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>Ingen barn funnet</Text>
      <Text style={styles.emptyText}>Legg til barn for å komme i gang.</Text>
      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={handleAddChild}>
        <Text style={styles.primaryBtnText}>➕ Legg til barn</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <TopNavBar
        title="Barn"
        subtitle=""
        showBack
        onBack={() => navigation.goBack()}
        pages={[
          { label: 'Familier', route: 'FamilyOverview' },
          { label: 'Maler', route: 'Templates' },
        ]}
      />

      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const age = calculateAge(item.birthday);
          const rawPhoto = item.photoUrl || item.photoURL || null;
          const stamp =
            (item?.updatedAt && (item.updatedAt.seconds || item.updatedAt._seconds)) || Date.now();
          const photo = rawPhoto ? `${rawPhoto}${rawPhoto.includes('?') ? '&' : '?'}cb=${stamp}` : null;
          const isInactive = item.active === false;

          return (
            <TouchableOpacity
              style={[styles.childRow, isInactive && { opacity: 0.6 }]}
              onPress={() => handlePressChild(item)}
              activeOpacity={0.85}
            >
              <Image
                source={photo ? { uri: photo } : require('../assets/avatar-child.png')}
                style={styles.childAvatar}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.childName} numberOfLines={1}>
                  {item.name || 'Uten navn'}
                </Text>
                <Text style={styles.childMeta}>
                  Alder: {age == null ? 'Ukjent' : `${age} år`}
                </Text>
                {!!item.username && (
                  <Text style={styles.childUser}>
                    Brukernavn: <Text style={{ fontWeight: '800' }}>{item.username}</Text>
                  </Text>
                )}
              </View>

              <Text style={styles.chevron}>{'›'}</Text>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <View style={styles.listHeaderRow}>
            <Text style={styles.title}>Dine barn</Text>
            {headerRight}
          </View>
        }
        ListEmptyComponent={<Empty />}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        style={{ backgroundColor: '#f6f9fc' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const CARD_BG = 'rgba(255,255,255,0.96)';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f9fc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f6f9fc' },

  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: '#0f172a' },

  primaryBtnSm: {
    backgroundColor: '#0b74d1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 12px rgba(11,116,209,0.25)' }
      : { elevation: 2 }),
  },
  primaryBtnSmText: { color: '#fff', fontWeight: '800' },

  primaryBtn: {
    backgroundColor: '#0b74d1',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 6px 16px rgba(11,116,209,0.25)' }
      : { elevation: 2 }),
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },

  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 12,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 14px rgba(15,23,42,0.06)' }
      : { elevation: 2 }),
  },
  childAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e2e8f0',
  },
  childName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  childMeta: { marginTop: 2, fontSize: 12, color: '#475569', fontWeight: '600' },
  childUser: { marginTop: 2, fontSize: 12, color: '#0b1f33' },

  chevron: { fontSize: 26, color: '#0f172a', marginLeft: 8 },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0b3d91' },
  emptyText: { marginTop: 6, fontSize: 13, color: '#64748b', textAlign: 'center' },
});
