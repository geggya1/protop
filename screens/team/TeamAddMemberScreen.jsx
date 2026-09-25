import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { inviteAdultSmart, addAdultManual, isGroupAdmin, isTeamAdmin } from '../../src/utils/groups';
import { isValidUsername, suggestUsername, usernameTaken } from '../../src/utils/usernames';
import { hasContactInfo, isValidEmail } from '../../src/utils/account';
import { passwordRules } from '../../components/PasswordFields';
import PasswordFields from '../../components/PasswordFields';
import PhoneInput from '../../components/PhoneInput';
import { teamColors as c } from '../../src/teamTheme';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';

/** invite_email | invite_phone | password */
const MODES = [
  {
    id: 'invite_email',
    icon: 'mail-outline',
    title: 'Inviter med e-post',
    sub: 'Sender e-post. Finnes personen fra før, får hen varsel å godta.',
  },
  {
    id: 'invite_phone',
    icon: 'call-outline',
    title: 'Inviter med telefon',
    sub: 'Sender SMS. Finnes personen fra før, får hen varsel å godta.',
  },
  {
    id: 'password',
    icon: 'key-outline',
    title: 'Opprett bruker med passord',
    sub: 'Du lager brukernavn og passord som de logger inn med.',
  },
];

export default function TeamAddMemberScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { teamId, team, mode: initialMode } = route.params || {};
  const { uid, familyId, family } = useApp();
  const fid = teamId || familyId;
  const teamDoc = team || family;
  const [parents, setParents] = useState([]);
  const isAdmin = isTeamAdmin(teamDoc, uid, parents) || isGroupAdmin(teamDoc, uid);

  const [mode, setMode] = useState(initialMode || null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [taken, setTaken] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
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

  const submit = async () => {
    if (!canSubmit || busy) return;
    if (!isAdmin) {
      Alert.alert('Ingen tilgang', 'Bare administrator kan invitere deltakere.');
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
          familyName: teamDoc?.name || 'laget',
          groupType: teamDoc?.type || 'team',
          joinCode: teamDoc?.joinCode || '',
          createdBy: auth.currentUser?.uid || uid,
          asAdmin: asAdmin,
        });
        setInviteDone({
          mode,
          name: name.trim(),
          email: mode === 'invite_email' ? email.trim().toLowerCase() : '',
          phone: mode === 'invite_phone' ? phone : '',
          joinCode: teamDoc?.joinCode || '',
          existingUser: !!res?.existingUser,
          emailSent: mode === 'invite_email' ? !!res?.emailSent : null,
          emailError: res?.emailError || null,
          smsSent: mode === 'invite_phone' ? !!res?.smsSent : null,
          smsError: res?.smsError || null,
        });
        return;
      }

      const res = await addAdultManual({
        familyId: fid,
        name,
        username,
        password,
        email,
        phone,
        createdBy: auth.currentUser?.uid || uid,
        asAdmin,
      });
      setCreated(res);
    } catch (e) {
      const msg = e?.message === 'taken'
        ? 'Brukernavnet er opptatt.'
        : (e?.message === 'contact-required'
          ? 'Oppgi e-post eller telefon.'
          : (e?.message || 'Klarte ikke å legge til.'));
      Alert.alert('Feil', msg);
    } finally {
      setBusy(false);
    }
  };

  if (inviteDone) {
    const phoneInvite = inviteDone.mode === 'invite_phone';
    const emailOk = inviteDone.emailSent === true;
    const emailFailed = inviteDone.mode === 'invite_email' && inviteDone.emailSent === false;
    const smsOk = inviteDone.smsSent === true;
    const smsFailed = phoneInvite && inviteDone.smsSent === false;
    const title = phoneInvite
      ? (smsOk ? 'SMS sendt' : (smsFailed ? 'Invitert – SMS feilet' : 'Invitasjon registrert'))
      : (emailOk ? 'Invitasjon sendt' : (emailFailed ? 'Invitert – e-post feilet' : 'Invitasjon registrert'));
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Text style={styles.headTitle}>{title}</Text>
        </View>
        <View style={styles.doneBody}>
          <Ionicons
            name={
              phoneInvite
                ? (smsFailed ? 'warning-outline' : 'chatbubble-ellipses-outline')
                : (emailFailed ? 'warning-outline' : 'mail-outline')
            }
            size={48}
            color={(emailFailed || smsFailed) ? '#b45309' : c.brand}
          />
          <Text style={styles.doneLead}>
            {inviteDone.existingUser
              ? `${inviteDone.name || 'Personen'} har allerede ProTop og får en stor varsling ved neste innlogging for å godta eller avslå.`
              : (phoneInvite
                ? (smsOk
                  ? `SMS-invitasjon er sendt til ${inviteDone.phone}.`
                  : `${inviteDone.name} er lagt til som invitert med telefon ${inviteDone.phone}.`)
                : (emailOk
                  ? `E-postinvitasjon er sendt til ${inviteDone.email}.`
                  : `${inviteDone.name} er lagt til som invitert (ikke akseptert).`))}
          </Text>
          {inviteDone.existingUser ? (
            <Text style={styles.doneHint}>
              Status: invitert – venter på svar. Ingen brukernavn-søk; treff skjer via e-post/telefon ved invitasjon.
            </Text>
          ) : phoneInvite ? (
            <>
              {smsFailed ? (
                <Text style={styles.doneHint}>
                  SMS ble ikke sendt
                  {inviteDone.smsError ? `: ${inviteDone.smsError}` : '.'}
                  {' '}
                  Du kan trykke «Send på nytt» under Invitert – ikke akseptert.
                </Text>
              ) : (
                <Text style={styles.doneHint}>
                  De får en SMS med lenke til registrering
                  {inviteDone.joinCode ? ` og lagkode ${inviteDone.joinCode}` : ''}.
                  Status: invitert – ikke akseptert.
                </Text>
              )}
              {!!inviteDone.joinCode && (
                <View style={styles.codeBox}>
                  <Text style={styles.codeLabel}>Lagkode</Text>
                  <Text style={styles.codeValue}>{inviteDone.joinCode}</Text>
                </View>
              )}
            </>
          ) : emailFailed ? (
            <Text style={styles.doneHint}>
              E-post ble ikke sendt
              {inviteDone.emailError ? `: ${inviteDone.emailError}` : '.'}
              {' '}
              Du finner dem under «Invitert – ikke akseptert» og kan trykke «Send på nytt».
            </Text>
          ) : (
            <Text style={styles.doneHint}>
              De får en e-post med lenke til å registrere seg. Status på laget: invitert – ikke akseptert.
            </Text>
          )}
          <TouchableOpacity style={styles.primary} onPress={() => nav.goBack()}>
            <Text style={styles.primaryTxt}>Ferdig</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (created) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Text style={styles.headTitle}>Bruker opprettet</Text>
        </View>
        <View style={styles.doneBody}>
          <Ionicons name="checkmark-circle" size={48} color={c.success} />
          <Text style={styles.doneLead}>De logger inn med</Text>
          <Text style={styles.doneCred}>@{created.username || created.login}</Text>
          <Text style={styles.doneHint}>Gi dem passordet du satte — det vises ikke igjen her.</Text>
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
          <Text style={styles.headTitle}>{mode ? 'Ny foresatt' : 'Inviter deltaker'}</Text>
          <Text style={styles.headSub}>{teamDoc?.name || 'Lag'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!mode ? (
          <>
            <Text style={styles.lead}>
              På idrettslag inviterer du foresatte direkte med e-post eller telefon,
              eller oppretter en bruker med passord. Lagkode finnes fortsatt under Lagkode.
            </Text>
            {MODES.map((m) => (
              <TouchableOpacity key={m.id} style={styles.modeCard} onPress={() => setMode(m.id)}>
                <View style={styles.modeIcon}>
                  <Ionicons name={m.icon} size={22} color={c.brand} />
                </View>
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
            <Text style={styles.lbl}>Navn</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Fornavn og etternavn"
              placeholderTextColor={c.muted}
            />

            {(mode === 'invite_email' || isPassword) && (
              <>
                <Text style={styles.lbl}>
                  E-post{mode === 'invite_email' ? '' : ' (eller telefon)'}
                </Text>
                <TextInput
                  style={[styles.input, emailInvalid && styles.inputBad]}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="navn@epost.no"
                  placeholderTextColor={c.muted}
                />
                {emailInvalid ? <Text style={styles.warn}>Ugyldig e-postadresse</Text> : null}
              </>
            )}

            {(mode === 'invite_phone' || isPassword) && (
              <>
                <Text style={styles.lbl}>
                  Telefon{mode === 'invite_phone' ? '' : ' (eller e-post)'}
                </Text>
                <PhoneInput value={phone} onChange={setPhone} />
                {mode === 'invite_phone' ? (
                  <Text style={styles.hint}>
                    Vi sender SMS med registreringslenke
                    {teamDoc?.joinCode ? ` og lagkode ${teamDoc.joinCode}` : ''}.
                    Nummeret lagres på laget med status invitert.
                  </Text>
                ) : null}
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
                  placeholder="brukernavn"
                  placeholderTextColor={c.muted}
                />
                {username.trim() ? (
                  <Text style={[styles.hint, { color: taken ? '#b45309' : c.tint }]}>
                    {checkingUsername
                      ? 'Sjekker…'
                      : (taken ? 'Opptatt' : (isValidUsername(username) ? 'Ledig' : 'Ugyldig brukernavn'))}
                  </Text>
                ) : null}
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

            {isAdmin && (
              <TouchableOpacity
                style={[styles.adminToggle, asAdmin && styles.adminToggleOn]}
                onPress={() => setAsAdmin((v) => !v)}
              >
                <Ionicons
                  name={asAdmin ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={asAdmin ? c.brand : c.muted}
                />
                <Text style={styles.adminTxt}>Gjør til administrator på laget</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.primary, (!canSubmit || busy) && { opacity: 0.45 }]}
              onPress={submit}
              disabled={!canSubmit || busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.primaryTxt}>
                  {isInvite ? 'Inviter' : 'Opprett bruker'}
                </Text>
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
    backgroundColor: c.bg,
  },
  back: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  headTitle: { fontSize: 18, fontWeight: '400', color: c.ink },
  headSub: { fontSize: 12, fontWeight: '400', color: c.tint, marginTop: 1 },
  body: { padding: 16, paddingBottom: 40, gap: 8 },
  lead: { color: c.muted, fontWeight: '400', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  modeIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  modeTitle: { color: c.ink, fontWeight: '400', fontSize: 15 },
  modeSub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 2, lineHeight: 17 },
  lbl: { color: c.ink, fontWeight: '400', fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.line,
    paddingHorizontal: 14, paddingVertical: 12, color: c.ink, fontWeight: '400', fontSize: 16,
  },
  inputBad: { borderColor: '#f59e0b' },
  hint: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 6, lineHeight: 17 },
  warn: { color: '#b45309', fontWeight: '400', fontSize: 12, marginTop: 4 },
  adminToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: c.surface, borderRadius: 12, padding: 14, marginTop: 14,
  },
  adminToggleOn: { borderWidth: 1, borderColor: c.brand },
  adminTxt: { color: c.ink, fontWeight: '400', fontSize: 14, flex: 1 },
  primary: {
    marginTop: 20, backgroundColor: c.accent, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  doneLead: { color: c.ink, fontWeight: '400', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  doneCred: { color: c.brand, fontWeight: '400', fontSize: 28 },
  doneHint: { color: c.muted, fontWeight: '400', fontSize: 13, textAlign: 'center', marginBottom: 8, lineHeight: 19 },
  codeBox: {
    backgroundColor: c.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24,
    alignItems: 'center', borderWidth: 1, borderColor: c.line, marginBottom: 8,
  },
  codeLabel: { color: c.muted, fontWeight: '400', fontSize: 11, textTransform: 'uppercase' },
  codeValue: { color: c.brand, fontWeight: '400', fontSize: 28, letterSpacing: 3, marginTop: 4 },
});
