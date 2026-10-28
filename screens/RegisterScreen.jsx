import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createUserWithEmailAndPassword, updateProfile,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { BREAKPOINTS, colors, radius } from '../src/theme';
import { sendVerificationEmailV2 } from '../src/utils/sendVerificationEmail';
import { fetchInvitePreview } from '../src/utils/invite';
import { claimPendingFriendInvite } from '../src/utils/friends';
import { isTeamType } from '../src/utils/teams';
import { isClassroomType } from '../src/utils/groupTypes';
import {
  setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { useOptionalRoute } from '../src/hooks/useOptionalRoute';
import { claimUsername } from '../src/utils/usernames';
import { uniqueUsername } from '../src/utils/account';
import { persistUserConsents } from '../src/utils/consents';
import { isCompanyGroupType } from '../src/utils/groupInviteLogic';
import { inviteContextRecord, joinInviteRecord } from '../src/utils/inviteLinkJoin';
import { rememberInviteContext } from '../src/utils/inviteLinkJoinClient';
import { registrationProfile } from '../src/utils/registrationProfile';
import { passwordStrength, isValidEmail, isSyntheticEmail } from '../src/utils/accountContact';
import PendingAddFriendBanner from '../components/PendingAddFriendBanner';
import { persistPendingAddFriend } from '../src/utils/pendingAddFriend';
import BrandLogo from '../components/BrandLogo';
import SignInLegalConsent, { persistSignInConsent } from '../components/SignInLegalConsent';
import { useI18n } from '../src/i18n';

// Venneinvitasjonen fra /register?friendInvite=…&email=… (web). Når appen går fra
// lasting til registrering, nullstilles ruten og adressen blir /register uten parametre,
// så invitasjonen tas vare på i fanen til personen har registrert seg (SOS-01).
const FRIEND_INVITE_KEY = 'protop_register_friend_invite';

function readStoredFriendInvite() {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = JSON.parse(sessionStorage.getItem(FRIEND_INVITE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function storeFriendInvite(value) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (value?.friendInvite) sessionStorage.setItem(FRIEND_INVITE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(FRIEND_INVITE_KEY);
  } catch { /* privat modus */ }
}

function readInviteParams(route) {
  const p = route?.params || {};
  // Web deep links may also land as nested query on first paint
  let qs = {};
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      qs = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    } catch {}
  }
  const friendInvite = String(p.friendInvite || qs.friendInvite || '').trim();
  const stored = friendInvite ? {} : readStoredFriendInvite();
  return {
    email: String(p.email || qs.email || stored.email || '').trim().toLowerCase(),
    familyId: String(p.familyId || qs.familyId || '').trim(),
    phone: String(p.phone || qs.phone || '').trim(),
    friendInvite: friendInvite || String(stored.friendInvite || '').trim(),
    addFriend: String(p.addFriend || qs.addFriend || '').trim(),
  };
}

/** Behold verdier vi allerede har, når adressefeltet er skrevet om uten parametre. */
function keepInviteParams(prev, next) {
  const out = { ...next };
  Object.keys(prev || {}).forEach((key) => {
    if (!out[key] && prev[key]) out[key] = prev[key];
  });
  return out;
}

export default function RegisterScreen({ navigation, setJustRegisteredEmail }) {
  const route = useOptionalRoute();
  const { lang } = useI18n();
  // Invitasjonen leses fra ruten eller adressefeltet ved første visning. Navigasjonen kan
  // skrive adressen om til /register uten parametre etterpå, så verdiene holdes fast (SOS-01).
  const [invite, setInvite] = useState(() => readInviteParams(route));
  useEffect(() => {
    setInvite((prev) => keepInviteParams(prev, readInviteParams(route)));
  }, [route]);

  // Ta vare på venneinvitasjonen i fanen, så den overlever nullstillingen og en omlasting.
  useEffect(() => {
    if (invite.friendInvite) storeFriendInvite({ friendInvite: invite.friendInvite, email: invite.email });
  }, [invite.friendInvite, invite.email]);
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.tablet;
  const goBack = navigation.canGoBack() ? () => navigation.goBack() : undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState(invite.email || '');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailSubmitError, setEmailSubmitError] = useState(null);
  // Feil vises i skjemaet: Alert.alert gjør ingenting på web.
  const [submitError, setSubmitError] = useState('');
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [legalOk, setLegalOk] = useState(false);
  const [legalError, setLegalError] = useState(false);

  const [inviteGroup, setInviteGroup] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(!!invite.familyId);

  useEffect(() => {
    if (invite.addFriend) persistPendingAddFriend(invite.addFriend);
  }, [invite.addFriend]);

  useEffect(() => {
    if (invite.email && !email) setEmail(invite.email);
  }, [invite.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    if (!invite.familyId) {
      setInviteLoading(false);
      setInviteGroup(null);
      return undefined;
    }
    setInviteLoading(true);
    // Gruppen er lukket for andre enn medlemmer. Serveren svarer med navn og type
    // bare når e-posten faktisk er invitert.
    fetchInvitePreview({ familyId: invite.familyId, email: invite.email })
      .then((res) => {
        if (!alive) return;
        if (!res?.ok) {
          setInviteGroup({ missing: true, id: invite.familyId });
          return;
        }
        setInviteGroup({
          id: invite.familyId,
          name: res.name || 'Ukjent gruppe',
          type: res.type || 'family',
          joinCode: '',
        });
        // Logger personen inn med Microsoft eller Google i stedet, husker appen invitasjonen
        // og kan be om å bekrefte e-posten for å bli med (UX-30).
        if (isCompanyGroupType(res.type)) {
          rememberInviteContext(inviteContextRecord({
            familyId: invite.familyId, email: invite.email, groupType: res.type, groupName: res.name,
          }));
        }
      })
      .catch(() => {
        if (alive) setInviteGroup({ missing: true, id: invite.familyId });
      })
      .finally(() => {
        if (alive) setInviteLoading(false);
      });
    return () => { alive = false; };
  }, [invite.familyId, invite.email]);

  const emailTrimmed = email.trim().toLowerCase();
  const nameTrimmed = name.trim();

  const emailValid = isValidEmail(emailTrimmed) && !isSyntheticEmail(emailTrimmed);

  const pwRules = useMemo(() => passwordStrength(password), [password]);

  const passwordStrong = pwRules.strong;

  const canSubmit = !loading && nameTrimmed.length > 0 && emailValid && passwordStrong;
  const emailLocked = !!invite.email;
  const isTeamInvite = inviteGroup && !inviteGroup.missing && isTeamType(inviteGroup.type);
  const isClassInvite = inviteGroup && !inviteGroup.missing && isClassroomType(inviteGroup.type);
  // Bedriftsinvitasjon: registreringen er svaret. Invitasjonen godtas når e-posten er bekreftet (UX-30).
  const isCompanyInvite = inviteGroup && !inviteGroup.missing && isCompanyGroupType(inviteGroup.type);

  const handleRegister = async () => {
    if (!legalOk) {
      setLegalError(true);
      setTriedSubmit(true);
      return;
    }
    const consents = await persistSignInConsent(lang);
    setTriedSubmit(true);
    setEmailSubmitError(null);
    setSubmitError('');
    if (!canSubmit) return;

    try {
      const methods = await fetchSignInMethodsForEmail(auth, emailTrimmed);
      if (methods && methods.length > 0) {
        const m = 'E-postadressen er allerede registrert.';
        setEmailSubmitError(m);
        return;
      }
    } catch (_) {
      setSubmitError('Kunne ikke sjekke e-postadressen akkurat nå. Sjekk nettet og prøv igjen.');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailTrimmed, password);
      await updateProfile(cred.user, { displayName: nameTrimmed });

      // Profilen lagres før bekreftelses-e-posten sendes, så den finnes når lenken åpnes.
      // Navnet er gitt her, så profilsteget hoppes over (UX-30). Fra en bedriftsinvitasjon
      // lagres ønsket om å bli med: når e-posten er bekreftet, godtar appen invitasjonen
      // (serveren sjekker at den gjelder denne e-posten). Andre gruppeinvitasjoner får
      // Godta/Avslå som før (syncMyInvites i InviteRespondOverlay).
      try {
        // Brukernavn til oppslag (venner, innlogging med brukernavn). Feiler reservasjonen,
        // lagres profilen uten; brukernavnet kan settes under profilen senere.
        let username = '';
        try {
          username = await claimUsername(
            await uniqueUsername(nameTrimmed || emailTrimmed, cred.user.uid),
            cred.user.uid,
            'adult',
          );
        } catch {
          username = '';
        }
        await setDoc(doc(db, 'users', cred.user.uid), {
          ...registrationProfile({
            uid: cred.user.uid,
            name: nameTrimmed,
            email: emailTrimmed,
            username,
            language: lang,
            joinInvite: isCompanyInvite ? joinInviteRecord({
              familyId: inviteGroup.id,
              email: emailTrimmed,
              groupType: inviteGroup.type,
              groupName: inviteGroup.name,
            }) : null,
          }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        await setDoc(doc(db, 'parents', cred.user.uid), {
          uid: cred.user.uid,
          name: nameTrimmed,
          email: emailTrimmed,
          username,
          usernameLower: username,
          linkedChildren: [],
          createdAt: serverTimestamp(),
          emailVerified: false,
          active: true,
          provider: 'password',
        }, { merge: true });
        if (consents) await persistUserConsents(cred.user.uid, consents).catch(() => {});
      } catch (profileErr) {
        // Uten lagret profil kommer profilsteget etter bekreftelsen, som før.
        console.warn('Profil ved registrering ble ikke lagret', profileErr?.message || profileErr);
      }
      await sendVerificationEmailV2(emailTrimmed);

      if (invite.friendInvite) {
        try {
          await claimPendingFriendInvite({
            uid: cred.user.uid,
            token: invite.friendInvite,
            profile: { name: nameTrimmed, displayName: nameTrimmed },
          });
        } catch (friendErr) {
          console.warn('Friend invite claim failed', friendErr?.message || friendErr);
        }
        storeFriendInvite(null);
      }

      setJustRegisteredEmail?.(emailTrimmed);
    } catch (err) {
      console.error('❌ Registrering feilet:', err);
      let msg = 'Registrering feilet. Prøv igjen.';
      if (err?.code === 'auth/email-already-in-use') {
        msg = 'E-postadressen er allerede registrert.';
        setEmailSubmitError(msg);
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'Ugyldig e-postadresse.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'Passordet er for svakt (minst 8 tegn, store/små bokstaver og tall).';
      } else if (err?.code === 'auth/network-request-failed') {
        msg = 'Ingen nettforbindelse. Sjekk nettet og prøv igjen.';
      }
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const Rule = ({ ok, text }) => (
    <View style={styles.ruleRow}>
      <Text style={[styles.ruleDot, ok ? styles.ruleOk : styles.ruleBad]}>{ok ? '●' : '○'}</Text>
      <Text style={[styles.ruleText, ok ? styles.ok : styles.bad]}>{text}</Text>
    </View>
  );

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {goBack ? (
          <TouchableOpacity onPress={goBack} style={styles.back} accessibilityRole="button">
            <Text style={styles.backTxt}>‹ Tilbake</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ height: 12 }} />
        )}

        <ScrollView
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, wide && styles.cardWide]}>
            <BrandLogo variant="full" height={56} maxWidth={320} style={styles.logoImg} />
            <Text style={styles.heading}>Opprett konto</Text>
            <Text style={styles.sub}>Fyll inn navn, e-post og passord — så er du i gang på under ett minutt.</Text>

            {invite.friendInvite && !invite.familyId ? (
              <View style={styles.inviteBox}>
                <Text style={styles.inviteEyebrow}>Venneinvitasjon</Text>
                <Text style={styles.inviteTitle}>Noen vil gjerne bli venn med deg</Text>
                <Text style={styles.inviteSub}>
                  Når du registrerer deg, blir dere venner — uten at du får tilgang til bedriften eller kalenderen deres.
                </Text>
              </View>
            ) : (
              <PendingAddFriendBanner />
            )}

            {invite.familyId ? (
              <View style={[
                styles.inviteBox,
                isTeamInvite && styles.inviteBoxTeam,
                isClassInvite && styles.inviteBoxClass,
              ]}>
                {inviteLoading ? (
                  <Text style={styles.inviteSub}>Henter invitasjon…</Text>
                ) : inviteGroup?.missing ? (
                  <Text style={styles.inviteSub}>
                    Vi fant ikke invitasjonen. Den kan være trukket tilbake eller allerede besvart. Du kan fortsatt opprette konto.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.inviteEyebrow}>
                      {isTeamInvite
                        ? 'Invitasjon til idrettslag'
                        : (isClassInvite ? 'Invitasjon til klasserom' : 'Invitasjon til bedrift')}
                    </Text>
                    <Text style={styles.inviteTitle}>{inviteGroup?.name}</Text>
                    <Text style={styles.inviteSub}>
                      {/* ProTop: invitasjoner som ikke er til lag eller klasse, gjelder en bedrift. */}
                      {isTeamInvite
                        ? 'Du er invitert til laget. Opprett konto og bekreft e-posten. Deretter godtar eller avslår du invitasjonen.'
                        : (isClassInvite
                          ? 'Du er invitert til klassen som lærer eller ansatt. Opprett konto og bekreft e-posten. Deretter godtar eller avslår du invitasjonen.'
                          : 'Opprett konto og bekreft e-posten, så er du med i bedriften. Er invitasjonen ikke til deg, kan du avslå den etterpå.')}
                    </Text>
                    {!!inviteGroup?.joinCode && (isTeamInvite || isClassInvite) ? (
                      <Text style={styles.inviteCode}>
                        {isClassInvite ? 'Klassekode' : 'Lagkode'}: {inviteGroup.joinCode}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}

            <Text style={styles.label}>Navn</Text>
            <TextInput
              style={styles.input}
              placeholder="Ditt navn"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Navn"
              autoComplete="name"
              textContentType="name"
              value={name}
              onChangeText={setName}
              editable={!loading}
            />
            {triedSubmit && nameTrimmed.length === 0 && (
              <Text style={styles.errorText}>Fyll inn navn.</Text>
            )}

            <Text style={styles.label}>E-post</Text>
            <TextInput
              style={[styles.input, email.length > 0 && !emailValid ? styles.inputError : null]}
              placeholder="navn@domene.no"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="E-post"
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                if (emailLocked) return;
                setEmail(t);
                if (emailSubmitError) setEmailSubmitError(null);
              }}
              editable={!loading && !emailLocked}
            />
            {emailLocked ? (
              <Text style={styles.hint}>E-posten er forhåndsutfylt fra invitasjonen.</Text>
            ) : null}
            {email.length > 0 && !emailValid && <Text style={styles.errorText}>Skriv en gyldig e-postadresse.</Text>}
            {!!emailSubmitError && <Text style={[styles.errorText, { marginTop: 2 }]}>{emailSubmitError}</Text>}

            <Text style={styles.label}>Passord</Text>
            <View style={styles.pwRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.pwInput,
                  password.length > 0 && !passwordStrong ? styles.inputError : null,
                ]}
                placeholder="Minst 8 tegn"
                placeholderTextColor={colors.placeholder}
                accessibilityLabel="Passord, minst 8 tegn"
                autoComplete="new-password"
                textContentType="newPassword"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.showBtn}
                disabled={loading}
                onPress={() => setShowPassword((s) => !s)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Skjul passordet' : 'Vis passordet'}
              >
                <Text style={styles.showBtnText}>{showPassword ? 'Skjul' : 'Vis'}</Text>
              </TouchableOpacity>
            </View>

            {password.length > 0 ? (
              <View style={styles.rulesBox}>
                <Rule ok={pwRules.lenOK} text="Minst 8 tegn" />
                <Rule ok={pwRules.hasUpper} text="Minst én stor bokstav" />
                <Rule ok={pwRules.hasLower} text="Minst én liten bokstav" />
                <Rule ok={pwRules.hasDigit} text="Minst ett tall" />
                <Rule ok={pwRules.hasSymbol} text="(Valgfritt) symbol for ekstra styrke" />
              </View>
            ) : null}

            <SignInLegalConsent
              accepted={legalOk}
              showError={legalError || triedSubmit}
              onAcceptedChange={(next) => {
                setLegalOk(next);
                if (next) setLegalError(false);
              }}
            />

            {!!submitError && (
              <Text style={[styles.errorText, styles.submitError]} accessibilityRole="alert">{submitError}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, (!canSubmit || !legalOk || loading) && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.primaryBtnText}>
                  {isCompanyInvite
                    ? 'Registrer og bli med'
                    : (inviteGroup && !inviteGroup.missing ? 'Registrer og se invitasjonen' : 'Registrer')}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.signupRow}>
              <Text style={styles.signupMuted}>Har du allerede konto? </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Login', invite.familyId
                  ? { email: invite.email, familyId: invite.familyId }
                  : undefined)}
                disabled={loading}
              >
                <Text style={styles.linkInline}>Logg inn</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  backTxt: { fontWeight: '400', color: colors.brandInk, fontSize: 16 },
  scrollBody: {
    flexGrow: 1,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      },
    }),
  },
  cardWide: { marginTop: 24 },
  logoImg: { marginBottom: 14, alignSelf: 'flex-start' },
  heading: {
    fontSize: 28, fontWeight: '400', color: colors.ink, marginBottom: 8, letterSpacing: -0.4,
  },
  sub: { color: colors.muted, fontWeight: '400', marginBottom: 16, lineHeight: 20 },
  inviteBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  inviteBoxTeam: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  inviteBoxClass: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
  },
  inviteEyebrow: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  inviteTitle: { fontSize: 18, fontWeight: '400', color: colors.ink },
  inviteSub: { marginTop: 6, fontSize: 13, fontWeight: '400', color: colors.muted, lineHeight: 18 },
  inviteCode: { marginTop: 8, fontWeight: '400', color: colors.brandInk, fontSize: 13 },
  label: { fontWeight: '400', color: colors.ink, marginTop: 4, marginBottom: 6, fontSize: 13 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    marginBottom: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.sunken,
    fontSize: 16,
    fontWeight: '400',
    color: colors.ink,
  },
  pwInput: { flex: 1, marginBottom: 0 },
  inputError: { borderColor: '#f59e0b' },
  errorText: { color: '#b45309', fontWeight: '400', fontSize: 12, marginTop: -4, marginBottom: 8 },
  submitError: { fontSize: 13, marginTop: 4 },
  hint: { fontSize: 12, fontWeight: '400', marginTop: -4, marginBottom: 8, color: colors.muted },
  ok: { color: '#16a34a' },
  bad: { color: '#b45309' },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  showBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 12 },
  showBtnText: { color: colors.brandInk, fontWeight: '400' },
  rulesBox: { marginTop: 0, marginBottom: 4, gap: 3 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { fontSize: 10 },
  ruleOk: { color: colors.successInk },
  ruleBad: { color: colors.muted },
  ruleText: { fontSize: 12, fontWeight: '400' },
  primaryBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    minHeight: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.brandInk,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: colors.onBrand, fontWeight: '400', fontSize: 16 },
  signupRow: {
    marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
  },
  signupMuted: { color: colors.muted, fontWeight: '500', fontSize: 14 },
  linkInline: { color: colors.brandInk, fontWeight: '400', textDecorationLine: 'underline' },
});
