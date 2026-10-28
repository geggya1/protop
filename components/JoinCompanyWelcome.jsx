import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import { useHelp } from '../src/context/HelpContext';
import {
  Button, radius, space, type, useConfirm,
} from '../src/ui';
import { notifyUser } from '../src/utils/dialog';
import { companyDisplayName } from '../src/utils/companyName';
import { TIMESHEET_TIPS, joinWelcomeVisible } from '../src/utils/inviteLinkJoin';
import { clearJoinInvite, declineJoinedCompany } from '../src/utils/inviteLinkJoinClient';

/**
 * Første side i bedriften etter invitasjonslenken (UX-30): «Slik fører du timer», og
 * «Ikke meg? Avslå» for den som fikk invitasjonen ved en feil.
 * Vises til personen trykker «Skjønner» eller avslår (users/{uid}.joinInvite).
 */
export default function JoinCompanyWelcome() {
  const colors = useColors();
  const help = useHelp();
  const confirm = useConfirm();
  const {
    uid, userProfile, familyId, family, families, selectFamily, applyFamilyPatch,
  } = useApp();
  const joinInvite = userProfile?.joinInvite || null;
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visible = !hidden && joinWelcomeVisible(joinInvite, familyId);
  const companyName = companyDisplayName(family, joinInvite?.familyName || 'bedriften');

  // Kortet er introduksjonen her; den generelle rundturen legger seg ikke over.
  useEffect(() => {
    if (visible) help?.dismiss?.({ welcome: true });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const close = () => {
    setHidden(true);
    clearJoinInvite(uid);
  };

  const decline = async () => {
    if (busy) return;
    const sure = await confirm({
      title: 'Avslå invitasjonen?',
      message: `Du tas ut av «${companyName}» med en gang, og administratoren får beskjed. Bruk dette hvis invitasjonen ikke var til deg.`,
      confirmText: 'Avslå',
      tone: 'warn',
    });
    if (!sure) return;
    setBusy(true);
    setError('');
    try {
      await declineJoinedCompany({ uid, familyId });
      const next = (families || []).find((row) => (
        row?.id && row.id !== familyId && row.deleted !== true && row.hiddenFromApp !== true
      ));
      applyFamilyPatch?.(familyId, { hiddenFromApp: true });
      setHidden(true);
      await selectFamily?.(next?.id || null);
      notifyUser('Invitasjonen er avslått', `Du er ikke med i «${companyName}».`);
    } catch (err) {
      setError(err?.message || 'Kunne ikke avslå invitasjonen. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      nativeID="join-company-welcome"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.brand }]}
      accessibilityRole="summary"
    >
      <View style={styles.head}>
        <Ionicons name="checkmark-circle" size={22} color={colors.successInk || colors.brand} />
        <Text style={[type.label, { color: colors.muted, flex: 1 }]} numberOfLines={2}>
          {`Du er med i ${companyName}`}
        </Text>
      </View>
      <Text style={[type.title, { color: colors.ink }]} accessibilityRole="header" aria-level={2}>
        Slik fører du timer
      </Text>
      {TIMESHEET_TIPS.map((tip, i) => (
        <View key={tip} style={styles.tip}>
          <View style={[styles.num, { backgroundColor: colors.brandSoft }]}>
            <Text style={[type.caption, { color: colors.brandInk }]}>{i + 1}</Text>
          </View>
          <Text style={[type.body, { color: colors.ink, flex: 1 }]}>{tip}</Text>
        </View>
      ))}
      {error ? <Text style={[type.body, { color: colors.dangerInk || colors.danger }]}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Skjønner" variant="primary" onPress={close} disabled={busy} nativeID="join-company-ok" />
        <TouchableOpacity
          onPress={decline}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Ikke meg? Avslå invitasjonen"
          nativeID="join-company-decline"
          style={styles.decline}
        >
          <Text style={[type.body, { color: colors.muted }]}>
            Ikke meg?
            {' '}
            <Text style={{ color: colors.brandInk, textDecorationLine: 'underline' }}>Avslå</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: space.md,
    marginBottom: 0,
    padding: space.md,
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  num: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.xxs,
  },
  decline: { minHeight: 44, justifyContent: 'center' },
});
