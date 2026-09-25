import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Share, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { rotateClassroomJoinCode } from '../../src/utils/classroom';
import { classroomColors as c } from '../../src/classroomTheme';

export default function ClassroomInviteScreen({ classroomId, classroom }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const [code, setCode] = useState(classroom?.joinCode || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(classroom?.joinCode || '');
  }, [classroom?.joinCode]);

  const share = async () => {
    const message = `Bli med i ${classroom?.name || 'klassen'} på ProTop!\n\nKlassekode: ${code}\n\nÅpne appen → Klasserom → «Har du en klassekode?» Oppgi kode og elevens navn. Rektor/lærer må godkjenne.`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Alert.alert('Kopiert', 'Invitasjonsteksten er kopiert.');
        return;
      }
      await Share.share({ message });
    } catch {
      Alert.alert('Kode', code);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const next = await rotateClassroomJoinCode(classroomId, uid);
      setCode(next);
      Alert.alert('Ny kode', `Klassekoden er nå ${next}`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke fornye koden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.body}>
      <TouchableOpacity
        style={styles.direct}
        onPress={() => nav.navigate('ClassroomAddStaff', { classroomId, classroom })}
      >
        <Ionicons name="person-add-outline" size={18} color={c.brand} />
        <View style={{ flex: 1 }}>
          <Text style={styles.directTitle}>Inviter ansatt</Text>
          <Text style={styles.directSub}>E-post, telefon eller bruker med passord</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.direct}
        onPress={() => nav.navigate('ClassroomAddStudents', { classroomId, classroom })}
      >
        <Ionicons name="people-outline" size={18} color={c.brand} />
        <View style={{ flex: 1 }}>
          <Text style={styles.directTitle}>Legg til elever</Text>
          <Text style={styles.directSub}>Lim inn en lang liste med navn</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </TouchableOpacity>

      <Text style={styles.lead}>
        Eller del klassekoden. Foresatte oppgir kode + elevens for- og etternavn, og du godkjenner under Godkjenninger.
      </Text>
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Klassekode</Text>
        <Text style={styles.code}>{code || '—'}</Text>
      </View>
      <TouchableOpacity style={styles.primary} onPress={share}>
        <Ionicons name="share-outline" size={18} color="#fff" />
        <Text style={styles.primaryTxt}>Del kode</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={rotate} disabled={busy}>
        <Text style={styles.secondaryTxt}>Forny kode</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  direct: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.brandSoft,
  },
  directTitle: { color: c.ink, fontWeight: '400', fontSize: 14 },
  directSub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  lead: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 19, marginBottom: 16, marginTop: 8 },
  codeCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16,
  },
  codeLabel: { color: c.muted, fontWeight: '400', fontSize: 12, textTransform: 'uppercase' },
  code: { color: c.ink, fontWeight: '400', fontSize: 36, letterSpacing: 4, marginTop: 8 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 16, paddingVertical: 14, marginBottom: 10,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  secondary: {
    alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line,
  },
  secondaryTxt: { color: c.ink, fontWeight: '400' },
});
