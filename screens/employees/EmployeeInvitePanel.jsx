import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACCESS_LEVELS, levelById } from '../../src/access/companyAccess';
import {
  employeeContactEmail,
  employeesMissingInviteEmail,
  employeesNotInvited,
  inviteLevelFor,
  invitesAwaitingAccept,
  invitesAwaitingSend,
  invitesDeclined,
  inviteStatusLabel,
  placedAccessLevel,
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
  onInviteSelected,
  progress = null,
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState(canEditAccess ? '' : 'ansatt');
  const [formError, setFormError] = useState('');
  const queued = invitesAwaitingSend(employees);
  const sent = invitesAwaitingAccept(employees);
  const declined = invitesDeclined(employees);

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
      <NotInvitedSection
        colors={colors}
        employees={employees}
        busy={busy}
        progress={progress}
        onInvite={onInviteSelected}
      />
      <Text style={{ color: colors.muted }}>
        Legg til så mange du vil. E-post sendes ikke før du trykker Inviter. Personen får en invitasjon og må selv godta den før hen kommer inn i bedriften, med tilgangsnivået du setter her.
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
          <Text style={[styles.heading, { color: colors.ink }]}>Sendt, venter på svar</Text>
          <Text style={{ color: colors.muted }}>Personen må godta invitasjonen før hen kommer inn i bedriften.</Text>
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

      {declined.length ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.heading, { color: colors.ink }]}>Avslått</Text>
          {declined.map((row) => (
            <View key={row.id} style={[styles.person, { borderColor: colors.line }]}>
              <View style={styles.grow}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{displayName(row)}</Text>
                <Text style={{ color: colors.muted }}>{employeeContactEmail(row)}</Text>
                <Text style={{ color: colors.muted }}>{inviteStatusLabel('declined')}</Text>
              </View>
              <TouchableOpacity onPress={() => onResend?.(row)} disabled={busy} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Inviter på nytt</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function levelText(row) {
  const label = levelById(inviteLevelFor(row))?.label || 'Ansatt';
  return placedAccessLevel(row) ? `Tilgang: ${label}` : `Tilgang: ${label} (standard)`;
}

/**
 * Ansatte som ligger i listen (for eksempel fra Excel-import), men ikke er invitert.
 * Administrator velger hvem som får invitasjon og når. Navn, e-post og tilgang hentes fra personen.
 */
function NotInvitedSection({ colors, employees, busy, progress, onInvite }) {
  const notInvited = useMemo(() => employeesNotInvited(employees), [employees]);
  const missing = useMemo(() => employeesMissingInviteEmail(employees), [employees]);
  const [picked, setPicked] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  if (!notInvited.length && !missing.length) return null;

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? notInvited.filter((row) => `${displayName(row)} ${employeeContactEmail(row)}`.toLowerCase().includes(needle))
    : notInvited;
  const chosen = notInvited.filter((row) => picked.has(row.id));
  const allShownPicked = shown.length > 0 && shown.every((row) => picked.has(row.id));

  function toggle(id) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setPicked((current) => {
      const next = new Set(current);
      for (const row of shown) {
        if (allShownPicked) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });
  }

  async function inviteChosen() {
    const ids = chosen.map((row) => row.id);
    if (!ids.length) return;
    await onInvite?.(ids);
    setPicked(new Set());
  }

  const missingNames = missing.slice(0, 8).map((row) => displayName(row) || 'Uten navn');
  const missingRest = missing.length - missingNames.length;

  return (
    <View nativeID="employee-invite-not-invited" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.heading, { color: colors.ink }]}>
        {`Ikke invitert (${notInvited.length + missing.length})`}
      </Text>
      <Text style={{ color: colors.muted }}>
        Disse ligger i ansattlisten, for eksempel fra import, men har ikke fått invitasjon. Velg hvem som skal inviteres nå. Invitasjonen bruker navnet, e-posten og tilgangen som står på personen. Personen må selv godta før hen kommer inn.
      </Text>
      {notInvited.length > 8 ? (
        <TextInput
          nativeID="employee-invite-filter"
          value={filter}
          onChangeText={setFilter}
          placeholder="Søk i listen"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
      ) : null}
      {shown.length ? (
        <TouchableOpacity
          nativeID="employee-invite-pick-all"
          onPress={toggleAll}
          disabled={busy}
          accessibilityRole="button"
          style={styles.pickAll}
        >
          <Ionicons name={allShownPicked ? 'checkbox' : 'square-outline'} size={20} color={colors.brand} />
          <Text style={{ color: colors.brand }}>{allShownPicked ? 'Fjern alle valg' : 'Velg alle'}</Text>
        </TouchableOpacity>
      ) : null}
      {shown.map((row) => {
        const on = picked.has(row.id);
        return (
          <TouchableOpacity
            key={row.id}
            nativeID={`employee-invite-pick-${row.id}`}
            onPress={() => toggle(row.id)}
            disabled={busy}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={displayName(row)}
            style={[styles.person, { borderColor: on ? colors.brand : colors.line }]}
          >
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.brand : colors.muted} />
            <View style={styles.grow}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{displayName(row)}</Text>
              <Text style={{ color: colors.muted }}>{employeeContactEmail(row)}</Text>
              <Text style={{ color: colors.muted }}>{levelText(row)}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
      {needle && !shown.length ? <Text style={{ color: colors.muted }}>Ingen treff.</Text> : null}
      {missing.length ? (
        <Text nativeID="employee-invite-missing-email" style={{ color: colors.danger || '#b42318' }}>
          {`Mangler e-post (${missing.length}): ${missingNames.join(', ')}${missingRest > 0 ? ` og ${missingRest} til` : ''}. Åpne personen i ansattlisten og legg inn e-post for å kunne invitere.`}
        </Text>
      ) : null}
      {progress ? (
        <Text style={{ color: colors.muted }}>{`Sender invitasjoner … ${progress.done} av ${progress.total}`}</Text>
      ) : null}
      {notInvited.length ? (
        <TouchableOpacity
          nativeID="employee-invite-send-picked"
          onPress={inviteChosen}
          disabled={busy || !chosen.length}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: colors.brand, opacity: busy || !chosen.length ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.primaryText}>{chosen.length ? `Inviter valgte (${chosen.length})` : 'Inviter valgte'}</Text>
          )}
        </TouchableOpacity>
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
  pickAll: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 4 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start', minWidth: 96, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
});
