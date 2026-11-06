import React, { useEffect, useState } from 'react';
import {
  Platform, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandToggle from '../BrandToggle';
import { aiAccessGranted } from '../../src/ai/aiPlan';
import { aiPersonFor } from '../../src/ai/aiPeople';
import { setAiPersonAccess, subscribeAiPlan } from '../../src/ai/aiPlanStore';

/** Hvorfor tilgangen ikke virker (eller at den gjør det). */
function statusLine({
  hasUser, person, plan, granted,
}) {
  if (!hasUser) return { text: 'Ikke knyttet til en bruker ennå. Tilgang kan gis når personen har akseptert invitasjonen.', warn: false };
  if (!person.active) {
    return {
      text: granted
        ? 'Står med tilgang, men er ikke i arbeid nå (permisjon, sluttdato passert eller deaktivert). Tilgangen virker ikke.'
        : 'Ikke i arbeid nå (permisjon, sluttdato passert eller deaktivert). Tilgang kan ikke gis.',
      warn: true,
    };
  }
  if (!granted) return { text: 'Har ikke tilgang.', warn: false };
  if (!plan.enabled) return { text: 'Har tilgang, men AI-abonnementet er av for bedriften.', warn: true };
  return { text: 'Har tilgang.', warn: false };
}

/**
 * AI-assistent på personsiden (Innstillinger → Brukerkonto). Samme tilgang som listen under
 * Selskapsinnstillinger → AI-abonnement: begge lytter på aiSettings/plan og lagrer bare
 * sin egen endring, så status er lik begge steder uansett hvor den settes.
 */
export default function EmployeeAiAccessCard({
  familyId, employee, actorUid, canEdit = false, colors, onOpenSettings,
}) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!familyId) return undefined;
    return subscribeAiPlan(familyId, setPlan, (e) => setError(e?.message || 'Kunne ikke hente AI-tilgangen.'));
  }, [familyId]);

  if (!employee) return null;
  const personUid = employee.personUid || '';
  const person = aiPersonFor(personUid, [employee]);
  const granted = !!plan && aiAccessGranted(plan, personUid, person);
  const status = plan ? statusLine({
    hasUser: !!personUid, person, plan, granted,
  }) : { text: 'Henter…', warn: false };
  // Tilgang kan alltid tas bort. Den kan bare gis til personer med bruker som er i arbeid nå.
  const canTurnOn = !!personUid && person.active;
  const disabled = !canEdit || busy || !plan || (!granted && !canTurnOn);

  async function toggle(on) {
    if (disabled) return;
    setBusy(true);
    setError('');
    try {
      await setAiPersonAccess(familyId, actorUid, { uid: personUid, external: person.external }, on);
    } catch (e) {
      setError(e?.message || 'Kunne ikke lagre AI-tilgangen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      nativeID="employee-account-ai"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, Platform.OS === 'web' ? styles.cardLift : null]}
    >
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
        </View>
        <Text style={[styles.title, { color: colors.ink }]}>AI-assistent</Text>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[styles.label, { color: colors.ink }]}>Tilgang til AI-assistenten</Text>
          <Text style={[styles.hint, { color: status.warn ? colors.danger : colors.muted }]} nativeID="employee-account-ai-status">
            {status.text}
          </Text>
          {person.external ? (
            <Text style={[styles.hint, { color: colors.muted }]}>Innleid eller ekstern: tilgangen gjelder bare denne personen.</Text>
          ) : null}
        </View>
        <BrandToggle value={granted} onValueChange={toggle} disabled={disabled} compact />
      </View>
      {error ? <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text> : null}
      <Text style={[styles.hint, { color: colors.muted }]}>
        {canEdit
          ? 'Samme tilgang som i AI-abonnement under selskapsinnstillingene. Endringen lagres med en gang og vises begge steder.'
          : 'Eier, administrator eller den med Admin på AI-abonnement kan endre dette.'}
      </Text>
      {onOpenSettings ? (
        <TouchableOpacity nativeID="employee-account-ai-open" onPress={onOpenSettings} accessibilityRole="link" style={styles.link}>
          <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>Åpne AI-abonnement</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  cardLift: Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(7, 39, 76, 0.06)' } : {},
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
});
