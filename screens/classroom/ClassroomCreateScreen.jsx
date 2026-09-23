import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { archiveEmptyDuplicateClassrooms, createClassroom } from '../../src/utils/classroom';
import { openPlatformHome } from '../../src/utils/platformNav';
import { canAccessAllPlatforms } from '../../src/utils/platformAccess';
import { classroomColors as c } from '../../src/classroomTheme';

export default function ClassroomCreateScreen() {
  const nav = useNavigation();
  const { lang } = useI18n();
  const { user, activeProfile, selectFamily } = useApp();
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!canAccessAllPlatforms(user || auth.currentUser)) nav.replace('CreateGroup');
  }, [user, nav]);

  const create = async () => {
    // Ref-lås: hindrer dobbelt/trippel-opprettelse ved raske trykk (før busy re-rendres).
    if (submittingRef.current || busy) return;
    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Gi klassen et navn.');
      return;
    }
    const authUser = auth.currentUser || user;
    if (!authUser?.uid) {
      setError('Du må være innlogget for å opprette klasse.');
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      const profile = {
        ...(activeProfile || {}),
        displayName: activeProfile?.displayName || activeProfile?.name || authUser.displayName || '',
      };
      const { familyId, joinCode } = await createClassroom({
        name: trimmed,
        school: school.trim(),
        grade: grade.trim(),
        language: lang,
        user: authUser,
        profile,
      });
      await selectFamily(familyId, {
        name: trimmed,
        type: 'classroom',
        ownerUid: authUser.uid,
        adminUids: [authUser.uid],
        members: [authUser.uid],
        school: school.trim() || null,
        grade: grade.trim() || null,
        joinCode,
        classroomMode: true,
        active: true,
        archived: false,
        deleted: false,
      });
      // Rydd tomme duplikater fra tidligere dobbelttrykk (best effort).
      archiveEmptyDuplicateClassrooms(authUser.uid, { keepId: familyId }).catch(() => {});
      openPlatformHome(nav, 'classroom');
      // Hold busy=true — skjermen unmountes ved navigasjon.
    } catch (e) {
      console.warn('[ClassroomCreate]', e);
      submittingRef.current = false;
      setError(e?.message || 'Klarte ikke opprette klasse.');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()} disabled={busy}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Klasserom</Text>
          <Text style={styles.title}>Opprett klasse</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          For skole, rektor, kontaktlærer eller lærer. Du blir rektor (super-admin) og får en unik klassekode.
        </Text>
        <Text style={styles.label}>Klassenavn</Text>
        <TextInput
          style={[styles.input, !!error && !name.trim() && styles.inputBad]}
          value={name}
          onChangeText={(t) => { setName(t); if (error) setError(''); }}
          placeholder="F.eks. 5A · Sola skole"
          placeholderTextColor={c.muted}
          editable={!busy}
          autoFocus={Platform.OS === 'web'}
        />
        <Text style={styles.label}>Skole (valgfritt)</Text>
        <TextInput
          style={styles.input}
          value={school}
          onChangeText={setSchool}
          placeholder="Skolenavn"
          placeholderTextColor={c.muted}
          editable={!busy}
        />
        <Text style={styles.label}>Trinn / klasse (valgfritt)</Text>
        <TextInput
          style={styles.input}
          value={grade}
          onChangeText={setGrade}
          placeholder="F.eks. 5. trinn"
          placeholderTextColor={c.muted}
          editable={!busy}
        />
        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={18} color="#b45309" />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={create}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Opprett klasserom"
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.btnTxt}>Opprett klasserom</Text>
          )}
        </TouchableOpacity>
        {busy ? (
          <Text style={styles.busyHint}>Oppretter klasse og standardfag…</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  back: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: { fontSize: 11, fontWeight: '800', color: c.tint, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 22, fontWeight: '900', color: c.ink },
  body: { padding: 16, paddingBottom: 40 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  label: { color: c.ink, fontWeight: '800', fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
    color: c.ink, fontWeight: '700', fontSize: 16, borderWidth: 1, borderColor: c.line,
  },
  inputBad: { borderColor: '#f59e0b' },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginTop: 14, backgroundColor: '#fffbeb', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#fde68a',
  },
  errorTxt: { flex: 1, color: '#92400e', fontWeight: '700', fontSize: 13, lineHeight: 18 },
  btn: {
    marginTop: 24, backgroundColor: c.brand, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  busyHint: { marginTop: 12, textAlign: 'center', color: c.muted, fontWeight: '600', fontSize: 13 },
});
