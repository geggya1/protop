import React, { useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ACCESS_LEVELS } from '../../src/access/companyAccess';
import {
  employeeContactEmail,
  invitesAwaitingAccept,
  invitesAwaitingSend,
  inviteStatusLabel,
} from '../../src/employees/invite';
import { displayName } from '../../src/employees/model';

export default function EmployeeInvitePanel({
  colors,
  employees = [],
  canEditAccess = false,
  busy = false,
  onAdd,
  onRemove,
  onSend,
  onResend,
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState(canEditAccess ? '' : 'ansatt');
  const [formError, setFormError] = useState('');
  const queued = invitesAwaitingSend(employees);
  const sent = invitesAwaitingAccept(employees);

  function addPerson() {
    const level = canEditAccess ? accessLevel : (accessLevel || 'ansatt');
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Fornavn og etternavn må fylles ut.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Skriv en gyldig e-postadresse.');
      return;
    }
    if (!level) {
      setFormError('Velg tilgangsnivået personen skal ha i bedriften.');
      return;
    }
    setFormError('');
    onAdd?.({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      accessLevel: level,
    });
    setFirstName('');
    setLastName('');
    setEmail('');
    if (canEditAccess) setAccessLevel('');
  }

  return (
    <View nativeID="employee-invite" style={styles.stack}>
      <Text style={{ color: colors.muted }}>
        Legg til så mange du vil. E-post sendes ikke før du trykker Inviter. Personen registrerer seg med den vanlige kontosiden og kommer inn i denne bedriften med tilgangsnivået du setter her.
      </Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.heading, { color: colors.ink }]}>Ny person</Text>
        <TextInput
          nativeID="employee-invite-first"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Fornavn"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <TextInput
          nativeID="employee-invite-last"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Etternavn"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <TextInput
          nativeID="employee-invite-email"
          value={email}
          onChangeText={setEmail}
          placeholder="E-post"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <Text style={{ color: colors.muted, fontSize: 13 }}>Tilgang i bedriften</Text>
        <View style={styles.chips}>
          {ACCESS_LEVELS.map((level) => {
            const selected = accessLevel === level.id;
            const locked = !canEditAccess && level.id !== 'ansatt';
            return (
              <TouchableOpacity
                key={level.id}
                disabled={locked || busy}
                onPress={() => setAccessLevel(level.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? colors.brand : colors.line,
                    backgroundColor: selected ? colors.brandSoft : colors.bg,
                    opacity: locked ? 0.45 : 1,
                  },
                ]}
              >
                <Text style={{ color: selected ? colors.brand : colors.ink, fontSize: 13 }}>{level.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!!formError && <Text style={{ color: colors.danger || '#b42318' }}>{formError}</Text>}
        <TouchableOpacity
          nativeID="employee-invite-add"
          onPress={addPerson}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.secondary, { borderColor: colors.line, opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={{ color: colors.ink }}>Legg til</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.heading, { color: colors.ink }]}>
          {queued.length ? `Klare til invitasjon (${queued.length})` : 'Klare til invitasjon'}
        </Text>
        {!queued.length ? (
          <Text style={{ color: colors.muted }}>Ingen venter. Legg til personer over, eller åpne en medarbeider og legg hen klar.</Text>
        ) : queued.map((row) => (
          <View key={row.id} style={[styles.person, { borderColor: colors.line }]}>
            <View style={styles.grow}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{displayName(row)}</Text>
              <Text style={{ color: colors.muted }}>{employeeContactEmail(row)}</Text>
              <Text style={{ color: colors.muted }}>{row.company?.accessRole || inviteStatusLabel(row.invite?.status)}</Text>
            </View>
            <TouchableOpacity onPress={() => onRemove?.(row)} disabled={busy} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Ta ut</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          nativeID="employee-invite-send"
          onPress={() => onSend?.(queued.map((row) => row.id))}
          disabled={busy || !queued.length}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: colors.brand, opacity: busy || !queued.length ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Inviter</Text>}
        </TouchableOpacity>
      </View>

      {sent.length ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.heading, { color: colors.ink }]}>Sendt, ikke godtatt</Text>
          {sent.map((row) => (
            <View key={row.id} style={[styles.person, { borderColor: colors.line }]}>
              <View style={styles.grow}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{displayName(row)}</Text>
                <Text style={{ color: colors.muted }}>{employeeContactEmail(row)}</Text>
                {!!row.invite?.error && <Text style={{ color: colors.danger || '#b42318' }}>{row.invite.error}</Text>}
              </View>
              <TouchableOpacity onPress={() => onResend?.(row)} disabled={busy} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Send på nytt</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  heading: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  person: { borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  grow: { flex: 1, gap: 2 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start', minWidth: 96, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
});
