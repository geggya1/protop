import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import {
  Button, elevationStyle, radius, space, type, useWide,
} from '../src/ui';
import { joinVerifyState } from '../src/utils/inviteLinkJoin';
import { readInviteContext, requestJoinVerification } from '../src/utils/inviteLinkJoinClient';

/**
 * Invitasjonslenke, men innlogget med en konto der e-posten ikke er bekreftet (f.eks. ny
 * Microsoft-konto). Serveren gir ikke invitasjonen før e-posten er bekreftet, så kortet sier
 * «Bekreft e-posten din for å bli med i X» og sender lenken. Etter bekreftelsen godtas
 * invitasjonen som i UX-30. Gjelder invitasjonen en annen adresse, sier kortet det.
 */
export default function JoinVerifyNotice() {
  const colors = useColors();
  const wide = useWide();
  const {
    uid, user, userProfile, families,
  } = useApp();
  const [context, setContext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    readInviteContext().then((value) => { if (alive) setContext(value); });
    return () => { alive = false; };
  }, [uid]);

  const state = joinVerifyState({
    joinInvite: userProfile?.joinInvite || null,
    context,
    user: auth.currentUser || user,
    families,
  });
  if (!uid || !state) return null;
  const company = state.familyName ? `«${state.familyName}»` : 'bedriften';

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestJoinVerification({
        uid, email: state.email, joinInvite: userProfile?.joinInvite || null, context,
      });
      setSentTo(state.email);
    } catch (err) {
      setError(err?.message || 'Kunne ikke sende lenken. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      nativeID="join-verify-notice"
      style={[
        styles.card,
        wide ? styles.cardDesk : styles.cardPhone,
        { backgroundColor: colors.card, borderColor: colors.brand },
        elevationStyle(2, Platform.OS),
      ]}
      accessibilityRole={Platform.OS === 'web' ? 'region' : undefined}
      accessibilityLabel="Bli med i bedriften"
    >
      {state.kind === 'wrong-email' ? (
        <>
          <Text style={[type.title, { color: colors.ink }]}>{`Invitasjonen til ${company} gjelder en annen e-post`}</Text>
          <Text style={[type.body, { color: colors.ink }]}>
            Logg inn med adressen invitasjonen ble sendt til for å bli med.
          </Text>
          <View style={styles.row}>
            <Button label="Logg ut" onPress={() => signOut(auth).catch(() => {})} nativeID="join-verify-signout" />
          </View>
        </>
      ) : (
        <>
          <Text style={[type.title, { color: colors.ink }]}>{`Bekreft e-posten din for å bli med i ${company}`}</Text>
          <Text style={[type.body, { color: colors.ink }]}>
            {sentTo
              ? `Lenken er sendt til ${sentTo}. Åpne den, så er du med i bedriften.`
              : `Vi sender en lenke til ${state.email}. Når du har åpnet den, er du med i bedriften.`}
          </Text>
          {error ? <Text style={[type.body, { color: colors.dangerInk || colors.danger }]}>{error}</Text> : null}
          <View style={styles.row}>
            <Button
              label={sentTo ? 'Send på nytt' : 'Send lenken'}
              variant="primary"
              onPress={send}
              busy={busy}
              nativeID="join-verify-send"
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    zIndex: 50,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.xs,
  },
  cardPhone: { left: space.sm, right: space.sm, bottom: 96 },
  cardDesk: { right: space.lg, bottom: space.lg, width: 420 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
