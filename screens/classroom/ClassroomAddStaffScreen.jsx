import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { inviteAdultSmart, addAdultManual, isGroupAdmin } from '../../src/utils/groups';
import { isClassroomAdmin, setStaffRole, STAFF_ROLES } from '../../src/utils/classroom';
import { isValidUsername, suggestUsername, usernameTaken } from '../../src/utils/usernames';
import { hasContactInfo, isValidEmail } from '../../src/utils/account';
import { passwordRules } from '../../components/PasswordFields';
import PasswordFields from '../../components/PasswordFields';
import PhoneInput from '../../components/PhoneInput';
import { classroomColors as c } from '../../src/classroomTheme';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';

const MODES = [
  { id: 'invite_email', icon: 'mail-outline', title: 'Inviter med e-post', sub: 'Sender e-postinvitasjon med lenke.' },
  { id: 'invite_phone', icon: 'call-outline', title: 'Inviter med telefon', sub: 'Sender SMS-invitasjon.' },
  { id: 'password', icon: 'key-outline', title: 'Opprett bruker med passord', sub: 'Du lager brukernavn og passord.' },
];

export default function ClassroomAddStaffScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { classroomId, classroom, mode: initialMode } = route.params || {};
  const { uid, familyId, family } = useApp();
  const fid = classroomId || familyId;
  const room = classroom || family;
  const [parents, setParents] = useState([]);
  const isAdmin = isClassroomAdmin(room, uid, parents) || isGroupAdmin(room, uid);

  const [mode, setMode] = useState(initialMode || null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [taken, setTaken] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [staffRole, setRole] = useState('teacher');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [inviteDone, setInviteDone] = useState(null);

  useEffect(() => {
    if (!fid) return undefined;
    return onSnapshot(
      query(collection(db, 'families', fid, 'parents')),
      (snap) => setParents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setParents([]),
    );
  }, [fid]);

  const isInvite = mode === 'invite_email' || mode === 'invite_phone';
  const isPassword = mode === 'password';
  const pwRules = useMemo(() => passwordRules(password, { minLen: 8, requireMixed: true }), [password]);
  const hasContact = hasContactInfo(email, phone);
  const emailInvalid = email.trim().length > 0 && !isValidEmail(email);
  const usernameOk = isValidUsername(username) && !taken && !checkingUsername;
  const passwordOk = pwRules.strong && password === password2;
  const roleMeta = STAFF_ROLES.find((r) => r.id === staffRole);

  useEffect(() => {
    if (name && !username) setUsername(suggestUsername(name));
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isPassword) return undefined;
    let alive = true;
    if (!isValidUsername(username)) {
      setTaken(false);
      setCheckingUsername(false);
      return undefined;
    }
    setCheckingUsername(true);
    const tmr = setTimeout(async () => {
      try {
        const busyName = await Promise.race([
          usernameTaken(username),
          new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
        ]);
        if (alive) setTaken(!!busyName);
      } catch {
        if (alive) setTaken(false);
      } finally {
        if (alive) setCheckingUsername(false);
      }
    }, 400);
    return () => { alive = false; clearTimeout(tmr); };
  }, [username, isPassword]);

  const canSubmit = (() => {
    if (!name.trim() || !fid) return false;
    if (emailInvalid) return false;
    if (mode === 'invite_email') return isValidEmail(email);
    if (mode === 'invite_phone') return String(phone || '').replace(/\D/g, '').length >= 8;
    if (mode === 'password') return usernameOk && passwordOk && hasContact;
    return false;
  })();

  const applyRole = async (staffUid) => {
    if (!staffUid) return;
    try { await setStaffRole(fid, staffUid, staffRole); } catch {}
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    if (!isAdmin) {
      Alert.alert('Ingen tilgang', 'Bare rektor/admin kan invitere ansatte.');
      return;
    }
    setBusy(true);
    try {
      if (isInvite) {
        const res = await inviteAdultSmart({
          familyId: fid,
          name,
          email: mode === 'invite_email' ? email : (email || ''),
          phone: mode === 'invite_phone' ? phone : (phone || ''),
          identifier: mode === 'invite_email' ? email : (mode === 'invite_phone' ? phone : ''),
          familyName: room?.name || 'klassen',
          groupType: room?.type || 'classroom',
          joinCode: room?.joinCode || '',
          createdBy: auth.currentUser?.uid || uid,
          asAdmin: !!roleMeta?.admin,
        });
        const parentKey = res?.key || res?.invitee?.uid;
        if (parentKey) await applyRole(parentKey);
        setInviteDone({
          mode, name: name.trim(),
          email: mode === 'invite_email' ? email.trim().toLowerCase() : '',
          phone: mode === 'invite_phone' ? phone : '',
          joinCode: room?.joinCode || '',
          existingUser: !!res?.existingUser,
          emailSent: mode === 'invite_email' ? !!res?.emailSent : null,
          smsSent: mode === 'invite_phone' ? !!res?.smsSent : null,
        });
        return;
      }
      const res = await addAdultManual({
        familyId: fid, name, username, password, email, phone,
        createdBy: auth.currentUser?.uid || uid,
        asAdmin: !!roleMeta?.admin,
      });
      await applyRole(res.uid);
      setCreated(res);
    } catch (e) {
      const msg = e?.message === 'taken' ? 'Brukernavnet er opptatt.'
        : (e?.message === 'contact-required' ? 'Oppgi e-post eller telefon.' : (e?.message || 'Klarte ikke å legge til.'));
      Alert.alert('Feil', msg);
    } finally {
      setBusy(false);
    }
  };

  if (inviteDone || created) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}><Text style={styles.headTitle}>{created ? 'Bruker opprettet' : 'Invitasjon sendt'}</Text></View>
        <View style={styles.doneBody}>
          <Ionicons name="checkmark-circle" size={48} color={c.success} />
          <Text style={styles.doneLead}>
            {created
              ? `De logger inn med @${created.username || created.login}`
              : (inviteDone.existingUser
                ? `${inviteDone.name} har allerede ProTop og får varsel ved neste innlogging for å godta eller avslå.`
                : `${inviteDone.name} er invitert som ${roleMeta?.label || 'ansatt'}.`)}
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => nav.goBack()}>
            <Text style={styles.primaryTxt}>Ferdig</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => (mode ? setMode(null) : nav.goBack())}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headTitle}>{mode ? 'Ny ansatt' : 'Inviter ansatt'}</Text>
          <Text style={styles.headSub}>{room?.name || 'Klasse'}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!mode ? (
          <>
            <Text style={styles.lead}>
              Inviter rektor, lærer, assistent eller skoleadmin. Elever legges inn separat.
            </Text>
            {MODES.map((m) => (
              <TouchableOpacity key={m.id} style={styles.modeCard} onPress={() => setMode(m.id)}>
                <View style={styles.modeIcon}><Ionicons name={m.icon} size={22} color={c.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modeTitle}>{m.title}</Text>
                  <Text style={styles.modeSub}>{m.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.lbl}>Rolle</Text>
            <View style={styles.roleRow}>
              {STAFF_ROLES.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.roleChip, staffRole === r.id && styles.roleOn]}
                  onPress={() => setRole(r.id)}
                >
                  <Text style={[styles.roleTxt, staffRole === r.id && styles.roleTxtOn]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.lbl}>Navn</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Fornavn og etternavn" placeholderTextColor={c.muted} />
            {(mode === 'invite_email' || isPassword) && (
              <>
                <Text style={styles.lbl}>E-post</Text>
                <TextInput
                  style={[styles.input, emailInvalid && styles.inputBad]}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="navn@skole.no"
                  placeholderTextColor={c.muted}
                />
              </>
            )}
            {(mode === 'invite_phone' || isPassword) && (
              <>
                <Text style={styles.lbl}>Telefon</Text>
                <PhoneInput value={phone} onChange={setPhone} />
              </>
            )}
            {isPassword && (
              <>
                <Text style={styles.lbl}>Brukernavn</Text>
                <TextInput
                  style={[styles.input, taken && styles.inputBad]}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  placeholderTextColor={c.muted}
                />
                <PasswordFields
                  password={password}
                  onPasswordChange={setPassword}
                  confirm={password2}
                  onConfirmChange={setPassword2}
                  minLen={8}
                  requireMixed
                />
              </>
            )}
            <TouchableOpacity
              style={[styles.primary, (!canSubmit || busy) && { opacity: 0.45 }]}
              onPress={submit}
              disabled={!canSubmit || busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.primaryTxt}>{isInvite ? 'Inviter' : 'Opprett bruker'}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line,
  },
  back: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  headTitle: { fontSize: 18, fontWeight: '900', color: c.ink },
  headSub: { fontSize: 12, fontWeight: '600', color: c.tint, marginTop: 1 },
  body: { padding: 16, paddingBottom: 40 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  modeIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  modeTitle: { color: c.ink, fontWeight: '800', fontSize: 15 },
  modeSub: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
  lbl: { color: c.ink, fontWeight: '800', fontSize: 13, marginTop: 10, marginBottom: 6 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
  },
  roleOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  roleTxt: { color: c.muted, fontWeight: '800', fontSize: 12 },
  roleTxtOn: { color: c.brand },
  input: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.line,
    paddingHorizontal: 14, paddingVertical: 12, color: c.ink, fontWeight: '600', fontSize: 16,
  },
  inputBad: { borderColor: '#f59e0b' },
  primary: {
    marginTop: 20, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  doneLead: { color: c.ink, fontWeight: '700', fontSize: 15, textAlign: 'center' },
});
