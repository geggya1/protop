// src/screens/LoginScreen.jsx
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator,
  Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  signInWithEmailAndPassword,
  signOut,
  reload,
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { colors, radius } from '../src/theme';
import { useI18n } from '../src/i18n';
import { sendPasswordResetV2 } from '../src/utils/sendPasswordReset';
import {
  collectionGroup, getDocs, getDoc, query, where, doc, updateDoc,
  serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { resolveLoginEmail } from '../src/utils/usernames';
import { isChildEmail } from '../src/utils/session';
import { sendVerificationEmailV2 } from '../src/utils/sendVerificationEmail';
import {
  signInWithGoogle,
  signInWithApple,
  signInWithMicrosoft,
  socialErrorMessage,
  consumeOauthError,
} from '../src/utils/authProviders';
import SocialAuthButtons, { OrDivider } from '../components/SocialAuthButtons';
import SignInLegalConsent, { persistSignInConsent } from '../components/SignInLegalConsent';
import BrandLogo from '../components/BrandLogo';
import PendingAddFriendBanner from '../components/PendingAddFriendBanner';
import { persistPendingAddFriend } from '../src/utils/pendingAddFriend';
import { useOptionalRoute } from '../src/hooks/useOptionalRoute';

function confirmAsync(title, message, ok = 'Bli med', cancel = 'Senere') {
  // react-native-web's Alert.alert is a no-op — Promises would hang forever on web.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]);
  });
}

function notifyAsync(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

/**
 * Login card — Twitter-style:
 * Google & Apple → OR → username/password → Log in → forgot / sign up
 */
export default function LoginScreen({ navigation }) {
  const { t, lang } = useI18n();
  const route = useOptionalRoute();
  const { width } = useWindowDimensions();
  const wide = width >= 480;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [formError, setFormError] = useState(null);
  const [unverifiedInfo, setUnverifiedInfo] = useState(false);
  const [legalOk, setLegalOk] = useState(false);
  const [legalError, setLegalError] = useState(false);

  const emailTrimmed = email.trim().toLowerCase();
  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]{2,}\.[^\s@]{2,}$/i.test(emailTrimmed),
    [emailTrimmed],
  );
  const busy = loading || socialBusy || resending;

  useEffect(() => {
    const u = String(route?.params?.addFriend || '').trim();
    if (u) persistPendingAddFriend(u);
  }, [route?.params?.addFriend]);

  useEffect(() => {
    const stashed = consumeOauthError();
    if (!stashed) return;
    const err = { code: stashed.code, message: stashed.message, provider: stashed.provider };
    const msg = socialErrorMessage(t, err, stashed.provider);
    if (msg) {
      setFormError(msg);
      notifyAsync(t('common.error'), msg);
    }
  }, [t]);

  const goHome = useCallback(() => {
    // Prefer auth-driven stage reset in App.jsx; Home may not be registered yet.
    if (navigation.getState()?.routeNames?.includes?.('Home')) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [navigation]);

  const goChildHome = useCallback(() => {
    if (navigation.getState()?.routeNames?.includes?.('Home')) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [navigation]);

  const linkLooseMemberships = useCallback(async (user) => {
    const lower = (user.email || '').toLowerCase();
    const [parentsSnap, childrenSnap] = await Promise.all([
      getDocs(query(collectionGroup(db, 'parents'), where('email', '==', lower))),
      getDocs(query(collectionGroup(db, 'children'), where('email', '==', lower))),
    ]);

    const updates = [];

    const ensureListed = (familyId) => {
      updates.push(updateDoc(doc(db, 'families', familyId), {
        members: arrayUnion(user.uid),
        activeUsers: arrayUnion(user.uid),
        updatedAt: serverTimestamp(),
      }).catch(() => {}));
    };

    parentsSnap.forEach((d) => {
      const data = d.data() || {};
      const familyId = d.ref.parent.parent.id;
      if (!data.uid && data.placeholder !== true) {
        updates.push(updateDoc(d.ref, {
          uid: user.uid,
          active: data.active !== false,
          emailVerified: !!user.emailVerified,
          linkedAt: serverTimestamp(),
          linkedBy: user.uid,
        }));
        ensureListed(familyId);
      } else if (data.uid === user.uid && data.placeholder !== true && data.deleted !== true) {
        // Already linked — still ensure LIST membership for chats/messages.
        ensureListed(familyId);
      }
    });

    childrenSnap.forEach((d) => {
      const data = d.data() || {};
      const familyId = d.ref.parent.parent.id;
      if (!data.uid && data.placeholder !== true) {
        updates.push(updateDoc(d.ref, {
          uid: user.uid,
          active: data.active !== false,
          emailVerified: !!user.emailVerified,
          linkedAt: serverTimestamp(),
          linkedBy: user.uid,
        }));
        ensureListed(familyId);
      } else if (data.uid === user.uid && data.placeholder !== true && data.deleted !== true) {
        ensureListed(familyId);
      }
    });

    await Promise.all(updates);
  }, []);

  const handlePendingInvites = useCallback(async (user) => {
    const lower = (user.email || '').toLowerCase();
    const parentsSnap = await getDocs(query(collectionGroup(db, 'parents'), where('email', '==', lower)));

    const invites = [];
    parentsSnap.forEach((d) => {
      const data = d.data() || {};
      // Eksisterende-bruker-invitasjoner håndteres via FamilyInviteRespond / varsler
      if (data.inviteKind === 'existing') return;
      const isInvite = data.placeholder === true || (!!data.invitedAt && !data.acceptedAt);
      if (isInvite && data.inviteStatus !== 'declined') {
        invites.push({ parentRef: d.ref, familyId: d.ref.parent.parent.id, data });
      }
    });
    if (invites.length === 0) return;

    for (const inv of invites) {
      let famName = inv.familyId;
      try {
        const s = await getDoc(doc(db, 'families', inv.familyId));
        if (s.exists()) {
          const fam = s.data() || {};
          if (fam.deleted === true || fam.hiddenFromApp === true) continue;
          famName = fam.name || famName;
        }
      } catch {}

      const ok = await confirmAsync(
        'Invitasjon',
        `Du er invitert som foresatt i familien «${famName}». Vil du bli med?`,
      );
      if (!ok) continue;

      try {
        const now = serverTimestamp();
        await updateDoc(inv.parentRef, {
          uid: user.uid,
          active: true,
          emailVerified: !!user.emailVerified,
          placeholder: false,
          inviteStatus: 'accepted',
          acceptedAt: now,
          acceptedBy: user.uid,
          updatedAt: now,
        });
        await updateDoc(doc(db, 'families', inv.familyId), {
          members: arrayUnion(user.uid),
          activeUsers: arrayUnion(user.uid),
          updatedAt: now,
        });
        await updateDoc(doc(db, 'parents', user.uid), {
          familyIds: arrayUnion(inv.familyId),
          updatedAt: now,
        }).catch(() => {});
        await updateDoc(doc(db, 'users', user.uid), {
          familyIds: arrayUnion(inv.familyId),
          updatedAt: now,
        }).catch(() => {});
      } catch {
        notifyAsync('Kunne ikke akseptere', 'Mangler tillatelse i Firestore-reglene.');
      }
    }
  }, []);

  const doPasswordReset = async () => {
    if (!emailTrimmed) {
      setFormError('Skriv inn e-postadressen først.');
      notifyAsync('Glemt passord', 'Skriv inn e-postadressen først.');
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetV2(emailTrimmed);
      notifyAsync('Sendt', 'Vi har sendt en e-post med lenke for å velge nytt passord.');
    } catch (e) {
      setFormError(e?.message || 'Kunne ikke sende e-post for tilbakestilling.');
      notifyAsync('Feil', e?.message || 'Kunne ikke sende e-post for tilbakestilling.');
    } finally { setLoading(false); }
  };

  const resendVerificationEmail = async () => {
    if (!emailTrimmed || !password) { setFormError('Skriv inn e-post og passord.'); return; }
    if (!emailValid) { setFormError('Ugyldig e-postadresse.'); return; }
    try {
      setResending(true);
      const cred = await signInWithEmailAndPassword(auth, emailTrimmed, password);
      try {
        await cred.user.reload();
        await sendVerificationEmailV2(cred.user.email || emailTrimmed);
        notifyAsync('Sendt', 'Ny bekreftelsesmail er sendt. Sjekk også spam.');
      } finally {
        await signOut(auth);
      }
    } catch {
      setFormError('Kunne ikke sende bekreftelsesmail.');
    } finally { setResending(false); }
  };

  const handleLogin = async () => {
    setFormError(null);
    setUnverifiedInfo(false);
    if (!(await ensureLegal())) return;
    if (!emailTrimmed || !password) { setFormError('E-post, brukernavn eller passord mangler.'); return; }

    setLoading(true);
    try {
      const loginEmail = (await resolveLoginEmail(emailTrimmed)) || emailTrimmed;
      const cred = await signInWithEmailAndPassword(auth, loginEmail, password);
      await reload(cred.user);

      if (!cred.user.emailVerified) {
        setUnverifiedInfo(true);
        try { await sendVerificationEmailV2(cred.user.email || loginEmail); } catch {}
      }

      try { await linkLooseMemberships(cred.user); } catch {}
      try { await handlePendingInvites(cred.user); } catch {}

      // Navigation is driven by onAuthStateChanged + RootNav stage.
      // Only hint-navigate if Home is already registered (avoids silent no-op).
      const loginEmailLower = (cred.user.email || loginEmail || emailTrimmed).toLowerCase();
      if (isChildEmail(loginEmailLower)) goChildHome();
      else goHome();
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setFormError('Feil passord.');
        const reset = await confirmAsync(
          'Feil passord',
          'Vil du tilbakestille passordet?',
          'Tilbakestill',
          'Avbryt',
        );
        if (reset) doPasswordReset();
      } else if (err.code === 'auth/user-not-found') {
        setFormError('Bruker ikke funnet. Opprett ny bruker hvis du ikke har konto.');
      } else {
        setFormError(err?.message || 'Innlogging feilet. Prøv igjen.');
      }
    } finally { setLoading(false); }
  };

  const ensureLegal = async () => {
    if (!legalOk) {
      setLegalError(true);
      return false;
    }
    setLegalError(false);
    await persistSignInConsent(lang);
    return true;
  };

  const social = async (fn, provider) => {
    if (busy) return;
    if (!(await ensureLegal())) return;
    setSocialBusy(true);
    setFormError(null);
    try {
      await fn();
    } catch (e) {
      const msg = socialErrorMessage(t, e, provider);
      if (msg) {
        setFormError(msg);
        notifyAsync(t('common.error'), msg);
      }
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backTxt}>‹ {t('common.back')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ height: 12 }} />
        )}

        <View style={[styles.card, wide && styles.cardWide]}>
          <BrandLogo variant="full" height={56} maxWidth={320} style={styles.logoImg} />
          <Text style={styles.heading}>{t('auth.loginTitle')}</Text>
          <Text style={styles.sub}>{t('auth.loginSocialHint')}</Text>
          <PendingAddFriendBanner />

          <SignInLegalConsent
            accepted={legalOk}
            showError={legalError}
            onAcceptedChange={(next) => {
              setLegalOk(next);
              if (next) setLegalError(false);
            }}
          />

          <SocialAuthButtons
            busy={busy}
            googleLabel={t('auth.googleLogin')}
            appleLabel={t('auth.appleLogin')}
            microsoftLabel={t('auth.microsoftLogin')}
            onGoogle={() => social(signInWithGoogle, 'google')}
            onApple={() => social(signInWithApple, 'apple')}
            onMicrosoft={() => social(signInWithMicrosoft, 'microsoft')}
          />

          <OrDivider label={t('auth.orUpper')} />

          <TextInput
            style={styles.input}
            placeholder={t('auth.identifier')}
            placeholderTextColor="#8b98a5"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(v) => { setEmail(v); if (formError) setFormError(null); }}
            editable={!busy}
          />

          <View style={styles.pwWrap}>
            <TextInput
              style={[styles.input, styles.pwInput]}
              placeholder={t('auth.password')}
              placeholderTextColor="#8b98a5"
              secureTextEntry={!showPw}
              value={password}
              onChangeText={(v) => { setPassword(v); if (formError) setFormError(null); }}
              editable={!busy}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw((s) => !s)}>
              <Text style={styles.eyeTxt}>{showPw ? t('auth.hidePassword') : t('auth.showPassword')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.forgotLine}>
            {t('auth.forgotPrefix')}{' '}
            <Text
              style={styles.linkInline}
              onPress={() => !busy && navigation.navigate('ForgotPassword', { prefill: email.trim() })}
            >
              {t('auth.forgotPasswordLink')}
            </Text>
            ?
          </Text>

          {!!formError && <Text style={styles.errorText}>{formError}</Text>}
          {unverifiedInfo && (
            <Text style={styles.infoText}>E-posten er ikke bekreftet (sjekk e-post/spam).</Text>
          )}

          {loading ? (
            <ActivityIndicator size="large" style={{ marginVertical: 14 }} color={colors.brand} />
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={busy}
            >
              <Text style={styles.primaryBtnText}>{t('auth.loginTitle')}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.signupRow}>
            <Text style={styles.signupMuted}>{t('auth.noAccount')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={busy}>
              <Text style={styles.linkInline}>{t('auth.signUpLink')}</Text>
            </TouchableOpacity>
          </View>

          {unverifiedInfo && (
            <TouchableOpacity
              style={[styles.secondaryBtn, resending && { opacity: 0.6 }]}
              onPress={resendVerificationEmail}
              disabled={busy}
            >
              {resending
                ? <ActivityIndicator />
                : <Text style={styles.secondaryBtnText}>Send bekreftelsesmail på nytt</Text>}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safe: { flex: 1, paddingHorizontal: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  backTxt: { fontWeight: '800', color: colors.brand, fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
    marginTop: 8,
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
  cardWide: { marginTop: 40 },
  logoImg: { marginBottom: 14, alignSelf: 'flex-start' },
  heading: {
    fontSize: 28, fontWeight: '900', color: colors.ink, marginBottom: 8, letterSpacing: -0.4,
  },
  sub: { color: colors.muted, fontWeight: '600', marginBottom: 20, lineHeight: 20 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    marginBottom: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.sunken,
    fontSize: 16,
    color: colors.ink,
  },
  pwWrap: { position: 'relative', width: '100%' },
  pwInput: { paddingRight: 72, marginBottom: 8 },
  eyeBtn: { position: 'absolute', right: 16, top: 14, padding: 4 },
  eyeTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  forgotLine: {
    color: colors.muted, fontSize: 13, fontWeight: '500', marginBottom: 14, marginTop: 2,
  },
  linkInline: { color: colors.brand, fontWeight: '700', textDecorationLine: 'underline' },
  errorText: { color: colors.danger, marginBottom: 10, fontSize: 13, fontWeight: '600' },
  infoText: { color: colors.brand, marginBottom: 10, fontSize: 12, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 15,
    borderRadius: radius.pill,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  signupRow: {
    marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
  },
  signupMuted: { color: colors.muted, fontWeight: '500', fontSize: 14 },
  secondaryBtn: {
    marginTop: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', backgroundColor: colors.card,
  },
  secondaryBtnText: { color: colors.ink, fontWeight: '700' },
});
