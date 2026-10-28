import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { employmentState } from '../src/employees/model';
import { useLeaveCompany } from '../src/employees/useLeaveCompany';

function ownerName(family, members) {
  const owner = family?.ownerUid || family?.ownerId || '';
  const row = (members || []).find((member) => member.uid === owner || member.id === owner);
  return row?.name || '';
}

function reasonText(state) {
  if (state === 'deleted') return 'Ansettelsen din er fjernet fra bedriften.';
  if (state === 'ended') return 'Sluttdatoen for ansettelsen din er passert.';
  return 'Ansettelsen din er avsluttet av bedriften.';
}

/**
 * Vises i stedet for «Ingen tilgang» når egen ansettelse i bedriften er avsluttet
 * (deaktivert, i papirkurven eller sluttdato passert). Forklarer hva som har skjedd,
 * hvem man kan kontakte, og gir en vei ut: «Forlat bedriften».
 */
export default function CompanyAccountEnded({ colors, employee }) {
  const { family, members } = useApp();
  const leaving = useLeaveCompany();
  const name = family?.company?.navn || family?.name || 'bedriften';
  const contact = ownerName(family, members);
  const danger = colors.danger || '#b42318';
  return (
    <View nativeID="company-account-ended" style={styles.root}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Ionicons name="lock-closed-outline" size={28} color={danger} />
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {`Kontoen din i ${name} er avsluttet`}
        </Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          {`${reasonText(employmentState(employee))} Du har ikke lenger tilgang til bedriftens sider. `}
          {contact ? `Kontakt ${contact} hvis dette er feil.` : 'Kontakt en administrator i bedriften hvis dette er feil.'}
        </Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Profilen og CV-en din på Min side følger deg videre. Du kan forlate bedriften, så forsvinner den fra listen din.
        </Text>
        {leaving.error ? <Text style={{ color: danger }}>{leaving.error}</Text> : null}
        {leaving.canLeave ? (
          <TouchableOpacity
            nativeID="company-account-ended-leave"
            onPress={leaving.leave}
            disabled={leaving.busy}
            accessibilityRole="button"
            style={[styles.button, { borderColor: danger, opacity: leaving.busy ? 0.6 : 1 }]}
          >
            <Text style={{ color: danger, fontWeight: '600' }}>{leaving.busy ? 'Forlater…' : 'Forlat bedriften'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: 16, padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  lead: { fontSize: 15, lineHeight: 22 },
  button: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
});
