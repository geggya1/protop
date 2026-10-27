import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  accessLevelSections, accessSectionTitle, accountDeactivated, employeeLevelIds,
} from '../../src/access/companyAccess';
import {
  employeeContactEmail, employeeInviteState, inviteTimeline, normalizeInviteState,
} from '../../src/employees/invite';
import { isDeletedEmployee } from '../../src/employees/model';
import { formatUsageStamp } from '../../src/employees/usage';

// Statusene der administrator kan sende (eller sende på nytt) bedriftsinvitasjonen.
const INVITABLE = new Set(['none', 'queued', 'sent', 'declined']);

function inviteButtonLabel(key) {
  if (key === 'sent') return 'Send invitasjon på nytt';
  if (key === 'declined') return 'Inviter på nytt';
  return 'Send invitasjon';
}

function inviteHeadline(state, deleted) {
  if (deleted) return 'Ligger i papirkurven';
  if (state.key === 'closed') return 'Kontoen er deaktivert';
  if (state.key === 'member') return 'Knyttet til en bruker';
  return state.label || 'Ikke invitert';
}

/** Nivåene som er krysset av i Tilgangsstyring, gruppert slik de står der. */
function levelSummary(employee, companyName) {
  const selected = employeeLevelIds(employee);
  return accessLevelSections()
    .map((section) => ({
      id: section.id,
      title: section.id === 'specialist' ? 'Fagansvar' : accessSectionTitle(section.id, companyName),
      labels: section.levels.filter((level) => selected.includes(level.id)).map((level) => level.label),
    }))
    .filter((row) => row.labels.length);
}

function Card({ title, icon, colors, nativeID, children }) {
  return (
    <View
      nativeID={nativeID}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
        Platform.OS === 'web' ? styles.cardLift : null,
      ]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name={icon} size={16} color={colors.brand} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, colors, tone, last }) {
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: tone || colors.ink }]}>{value}</Text>
    </View>
  );
}

/**
 * Brukerkonto under Innstillinger: aktiver eller deaktiver, inviter og se når invitasjonen gikk.
 * Rettighetene vises bare som oppsummering. De settes i Tilgangsstyring.
 */
export default function EmployeeAccountView({
  employee,
  colors,
  companyName = '',
  busy = false,
  canEdit = false,
  canInvite = false,
  onClassify,
  onInvite,
  onOpenAccess,
}) {
  if (!employee) return null;
  const danger = colors.danger || '#b42318';
  const success = colors.success || '#16a34a';
  const deleted = isDeletedEmployee(employee);
  const deactivated = accountDeactivated(employee);
  const locked = !canEdit || busy || deleted;
  const canLogin = !!employee.company?.canLogin;

  const inviteState = employeeInviteState(employee);
  const invite = normalizeInviteState(employee.invite);
  const inviteEmail = invite.email || employeeContactEmail(employee);
  const timeline = inviteTimeline(employee);
  const canSend = canInvite && !deleted && INVITABLE.has(inviteState.key);

  const levels = levelSummary(employee, companyName);
  const overrides = Object.keys(employee.company?.accessOverrides || {}).length;

  const inviteRows = [
    { id: 'status', label: 'Status', value: inviteHeadline(inviteState, deleted), tone: inviteState.key === 'declined' ? danger : null },
    ...(inviteEmail ? [{ id: 'email', label: 'E-post', value: inviteEmail }] : []),
    ...timeline.map((row) => ({ id: row.id, label: row.label, value: formatUsageStamp(row.at) || row.at })),
    ...(invite.error ? [{ id: 'error', label: 'Feil', value: invite.error, tone: danger }] : []),
  ];

  return (
    <View nativeID="employee-account" style={styles.root}>
      <Card title="Konto" icon="person-circle-outline" colors={colors} nativeID="employee-account-status">
        <View style={[styles.switch, { borderColor: deactivated ? danger : colors.line }]}>
          <TouchableOpacity
            nativeID="employee-account-activate"
            accessibilityRole="button"
            accessibilityLabel="Aktiver kontoen"
            accessibilityState={{ selected: !deactivated, disabled: locked }}
            disabled={locked || !deactivated}
            onPress={() => onClassify?.({ status: 'active' })}
            style={[styles.switchSide, !deactivated && { backgroundColor: colors.successSoft || '#e4f5ea' }]}
          >
            <Text style={{ color: !deactivated ? success : colors.muted, fontWeight: '700' }}>Aktiv</Text>
          </TouchableOpacity>
          <TouchableOpacity
            nativeID="employee-account-deactivate"
            accessibilityRole="button"
            accessibilityLabel="Deaktiver kontoen"
            accessibilityState={{ selected: deactivated, disabled: locked }}
            disabled={locked || deactivated}
            onPress={() => onClassify?.({ status: 'inactive', canLogin: false })}
            style={[styles.switchSide, deactivated && { backgroundColor: danger }]}
          >
            <Text style={{ color: deactivated ? '#fff' : colors.muted, fontWeight: '700' }}>Deaktivert</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.hint, { color: deactivated ? danger : colors.muted }]}>
          {deleted
            ? 'Ligger i papirkurven. Gjenopprett fra hovedsiden.'
            : (deactivated
              ? 'Deaktivert. Personen kan ikke logge inn og har ingen rettigheter.'
              : 'Kontoen er aktiv.')}
        </Text>
        {!deactivated ? (
          <TouchableOpacity
            nativeID="employee-account-login"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: canLogin, disabled: locked }}
            disabled={locked}
            onPress={() => onClassify?.({ canLogin: !canLogin })}
            style={styles.check}
          >
            <View style={[
              styles.box,
              {
                borderColor: canLogin ? colors.brand : colors.line,
                backgroundColor: canLogin ? colors.brand : colors.card,
                opacity: locked ? 0.6 : 1,
              },
            ]}
            >
              {canLogin ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
            </View>
            <Text style={{ color: colors.ink, fontSize: 15 }}>Kan logge inn</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <Card title="Invitasjon" icon="mail-outline" colors={colors} nativeID="employee-account-invite">
        <View>
          {inviteRows.map((row, i) => (
            <Row
              key={row.id}
              label={row.label}
              value={row.value}
              tone={row.tone}
              colors={colors}
              last={i === inviteRows.length - 1}
            />
          ))}
        </View>
        {canInvite && inviteState.key === 'missingEmail' ? (
          <Text style={[styles.hint, { color: colors.muted }]}>Legg inn e-post på hovedsiden før du inviterer.</Text>
        ) : null}
        {canInvite && inviteState.key === 'closed' && !deleted ? (
          <Text style={[styles.hint, { color: colors.muted }]}>Aktiver kontoen før du inviterer.</Text>
        ) : null}
        {canSend ? (
          <TouchableOpacity
            nativeID="employee-account-invite-send"
            onPress={onInvite}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryText}>{inviteButtonLabel(inviteState.key)}</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <Card title="Rettigheter" icon="key-outline" colors={colors} nativeID="employee-account-access">
        {deactivated ? (
          <Text style={[styles.hint, { color: danger }]}>Deaktivert. Ingen rettigheter.</Text>
        ) : (
          <View>
            {levels.length ? levels.map((row, i) => (
              <Row
                key={row.id}
                label={row.title}
                value={row.labels.join(', ')}
                colors={colors}
                last={i === levels.length - 1 && !overrides}
              />
            )) : (
              <Row label="Nivå" value="Ikke plassert i noe nivå" tone={colors.muted} colors={colors} last={!overrides} />
            )}
            {overrides ? (
              <Row
                label="Egne avvik"
                value={overrides === 1 ? '1 område avviker fra nivået' : `${overrides} områder avviker fra nivået`}
                colors={colors}
                last
              />
            ) : null}
          </View>
        )}
        <Text style={[styles.hint, { color: colors.muted }]}>Rettighetene settes bare i Tilgangsstyring.</Text>
        {onOpenAccess ? (
          <TouchableOpacity
            nativeID="employee-account-open-access"
            onPress={onOpenAccess}
            accessibilityRole="link"
            style={styles.link}
          >
            <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>Åpne Tilgangsstyring</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </TouchableOpacity>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, width: '100%', maxWidth: 760 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  cardLift: Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(7, 39, 76, 0.06)' } : {},
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  switch: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  switchSide: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 18 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, alignSelf: 'flex-start' },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 9, alignItems: 'flex-start' },
  rowLabel: { width: '34%', maxWidth: 180, minWidth: 110, fontSize: 13, lineHeight: 20 },
  rowValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  primary: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
});
