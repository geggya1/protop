import React, { useEffect, useLayoutEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { auth, db } from '../firebase';
import { collectionGroup, getDocs, limit, query, where } from 'firebase/firestore';
import TopNavBar from '../components/TopNavBar';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    (async () => {
      const u = auth.currentUser;
      if (!u) {
        navigation.replace('Login');
        return;
      }

      let famId =
        (route?.params && (route.params.familyId || route.params?.parent?.familyId)) || null;

      if (!famId) {
        try {
          const qy = query(collectionGroup(db, 'parents'), where('uid', '==', u.uid), limit(1));
          const snap = await getDocs(qy);
          if (!snap.empty) {
            const ref = snap.docs[0].ref;
            famId = ref?.parent?.parent?.id || null;
          }
        } catch {}
      }

      navigation.replace('ParentProfile', {
        parent: {
          id: u.uid,
          uid: u.uid,
          email: u.email || '',
          photoURL: u.photoURL || null,
          displayName: u.displayName || '',
          familyId: famId,
        },
        familyId: famId,
        fromProfileMenu: true,
      });
    })();
  }, [navigation, route?.params]);

  return (
    <View style={styles.screen}>
      <TopNavBar
        title="Profil"
        pages={[{ label: 'Familier', route: 'FamilyOverview' }, { label: 'Maler', route: 'Templates' }]}
      />
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0b74d1" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f9fc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
