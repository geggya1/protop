// screens/SelectFamilyScreen.jsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function SelectFamilyScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  // Forventet format fra LoginScreen:
  // families: [{ familyId: 'abc123', child: {...} }, ...]
  const inputFamilies = route?.params?.families || [];

  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const enriched = await Promise.all(
          inputFamilies.map(async (f) => {
            if (!f?.familyId) return { ...f, name: '(Ukjent familie)' };
            const snap = await getDoc(doc(db, 'families', f.familyId));
            if (!snap.exists()) return null;
            const data = snap.data() || {};
            if (data.deleted === true || data.hiddenFromApp === true) return null;
            const name = data.name || '(Uten navn)';
            return { ...f, name };
          })
        );
        if (!cancelled) setFamilies(enriched.filter(Boolean));
      } catch (err) {
        console.error('Feil ved henting av familienavn:', err);
        if (!cancelled) Alert.alert('Feil', 'Kunne ikke hente familier.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => { cancelled = true; };
  }, [inputFamilies]);

  const openFamily = (family) => {
    navigation.reset({
      index: 0,
      routes: [{
        name: 'FamilyDashboard',
        params: {
          familyId: family.familyId,
          familyName: family.name,
          ownerUid: family.ownerUid,
        },
      }],
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Laster familier…</Text>
      </View>
    );
  }

  if (!families.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Ingen familier funnet</Text>
        <Text style={styles.muted}>
          Kontoen din er ikke tilknyttet noen familie ennå.
        </Text>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Tilbake</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Velg familie</Text>
      <FlatList
        data={families}
        keyExtractor={(item, idx) => `${item.familyId}-${idx}`}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openFamily(item)}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>ID: {item.familyId}</Text>
            <Text style={styles.link}>Gå til familie</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ paddingVertical: 8 }}
      />

      <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.goBack()}>
        <Text style={[styles.btnText, styles.btnTextSecondary]}>Avbryt</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: '#fff' },
  header: { fontSize: 22, fontWeight: '800', marginBottom: 12, color: '#0f172a' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#0f172a', textAlign: 'center' },
  muted: { color: '#64748b', textAlign: 'center', marginTop: 8 },

  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderLeftWidth: 4,
    borderLeftColor: '#0b74d1',
  },
  name: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 12, color: '#475569', marginTop: 4 },
  link: { marginTop: 10, color: '#0b74d1', fontWeight: '700' },

  btn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSecondary: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  btnText: { fontWeight: '700' },
  btnTextSecondary: { color: '#0f172a' },
});
