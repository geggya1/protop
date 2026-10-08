import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addActivity,
  addProjectMember,
  removeProjectMember,
  updateActivity,
  updateProject,
  updateProjectMember,
  projectTimeSummary,
  activityTimeSummary,
  setTimeEntryStatus,
  ensureMainActivity,
} from '../../src/project/engine';
import { defaultWorkSettings, PROJECT_ROLES, employeeDisplayName } from '../../src/arbeid/roles.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { pricingModelLabel, PRICING_MODELS } from '../../src/project/projectFields.js';

const TABS = [
  { id: 'hovedside', label: 'Hovedside' },
  { id: 'aktiviteter', label: 'Aktiviteter' },
  { id: 'fakturering', label: 'Faktureringsvalg' },
  { id: 'timerapport', label: 'Timerapport' },
  { id: 'team', label: 'Team' },
];

function ProgressBar({ left, right, leftColor, rightColor, colors }) {
  const total = Math.max(Math.abs(left) + Math.abs(right), 0.01);
  const leftPct = Math.min(100, (Math.abs(left) / total) * 100);
  return (
    <View style={[styles.barTrack, { backgroundColor: colors.sunken || colors.line }]}>
      <View style={[styles.barFill, { width: `${leftPct}%`, backgroundColor: leftColor || colors.brand }]} />
      {right ? (
        <View style={[styles.barFill, { width: `${100 - leftPct}%`, backgroundColor: rightColor || '#f97316', opacity: 0.7 }]} />
      ) : null}
    </View>
  );
}

function CheckRow({ label, value, onChange, colors }) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
    >
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={20}
        color={value ? colors.brand : colors.muted}
      />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Oppgradert prosjektvisning med faner (Moment-inspirert).
 * onChangeState(nextState) / onEditForm() for å hoppe til klassisk redigering.
 */
export default function ProjectDetail({
  state,
  project,
  employees = [],
  colors,
  isAdmin,
  uid,
  onChangeState,
  onEditForm,
  onBack,
}) {
  const [tab, setTab] = useState('hovedside');
  const [memberOpen, setMemberOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [memberRole, setMemberRole] = useState('Prosjektmedlem');
  const [pickEmployeeId, setPickEmployeeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const members = useMemo(
    () => state.members.filter((row) => row.projectId === project.id && row.active !== false),
    [state.members, project.id],
  );
  const activities = useMemo(
    () => state.activities.filter((row) => row.projectId === project.id),
    [state.activities, project.id],
  );
  const timeEntries = useMemo(
    () => state.timeEntries
      .filter((row) => row.projectId === project.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [state.timeEntries, project.id],
  );
  const summary = useMemo(() => projectTimeSummary(state, project.id), [state, project.id]);
  const settings = defaultWorkSettings(project.workSettings);

  const availableEmployees = employees.filter((row) => (
    row.company?.status !== 'former'
    && !members.some((mem) => mem.employeeId === row.id)
  ));

  function patchSettings(key, value) {
    const result = updateProject(state, project.id, {
      workSettings: { ...settings, [key]: value },
    });
    if (result.ok) {
      onChangeState(result.state);
      setNote('Innstilling lagret.');
    } else setError(result.error);
  }

  function addMember() {
    const emp = employees.find((row) => row.id === pickEmployeeId);
    if (!emp) {
      setError('Velg medarbeider.');
      return;
    }
    const result = addProjectMember(state, {
      projectId: project.id,
      employeeId: emp.id,
      employeeName: employeeDisplayName(emp),
      photoUrl: emp.person?.photoUrl,
      role: memberRole,
      addedByUid: uid,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setMemberOpen(false);
    setPickEmployeeId('');
    setNote(`${employeeDisplayName(emp)} lagt til som ${memberRole}.`);
  }

  function dropMember(memberId) {
    const result = removeProjectMember(state, memberId);
    if (result.ok) {
      onChangeState(result.state);
      setNote('Deltaker fjernet.');
    } else setError(result.error);
  }

  function changeRole(memberId, role) {
    const result = updateProjectMember(state, memberId, { role });
    if (result.ok) onChangeState(result.state);
  }

  function createActivity() {
    const name = activityName.trim() || 'Ny aktivitet';
    let working = state;
    const ensured = ensureMainActivity(working, project.id);
    if (ensured.ok) working = ensured.state;
    const result = addActivity(working, {
      projectId: project.id,
      name,
      billable: project.pricingModel !== 'not_billable',
      priceModelName: pricingModelLabel(project.pricingModel),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setActivityOpen(false);
    setActivityName('');
    setNote('Aktivitet opprettet.');
  }

  function approveEntry(entryId) {
    const result = setTimeEntryStatus(state, entryId, 'godkjent');
    if (result.ok) onChangeState(result.state);
  }

  const membersByRole = useMemo(() => {
    const groups = {};
    for (const role of PROJECT_ROLES) groups[role] = [];
    for (const row of members) {
      const role = PROJECT_ROLES.includes(row.role) ? row.role : 'Annet';
      if (!groups[role]) groups[role] = [];
      groups[role].push(row);
    }
    return groups;
  }, [members]);

  return (
    <View style={styles.wrap} nativeID="project-detail">
      <View style={styles.headRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color={colors.ink} />
          <Text style={{ color: colors.ink }}>Tilbake til listen</Text>
        </TouchableOpacity>
        {onEditForm ? (
          <TouchableOpacity
            onPress={onEditForm}
            style={[styles.editBtn, { borderColor: colors.line }]}
          >
            <Ionicons name="create-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Rediger</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[styles.crumb, { color: colors.muted }]}>Prosjekter / Oversikt</Text>
      <Text style={[styles.title, { color: colors.ink }]}>
        #{project.number} {project.name}
        {project.client ? ` (${project.client})` : ''}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {TABS.map((row) => {
          const on = tab === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => setTab(row.id)}
              style={[styles.tab, on && { borderBottomColor: colors.brand }]}
            >
              <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: on ? '600' : '400', fontSize: 13 }}>
                {row.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {note ? <Text style={{ color: colors.brand, marginBottom: 6 }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 6 }}>{error}</Text> : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {tab === 'hovedside' ? (
          <View style={styles.columns}>
            <View style={[styles.mainCol, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <View style={styles.blockHead}>
                <Text style={[styles.blockTitle, { color: colors.ink }]}>Prosjektinformasjon</Text>
              </View>
              <Info label="Prosjektnummer" value={project.number} colors={colors} />
              <Info label="Kunde" value={project.client || '—'} colors={colors} />
              <Info label="Valuta" value="NOK" colors={colors} />
              <Info label="Oppstartsdato" value={project.start || '—'} colors={colors} />
              <Info label="Sluttdato" value={project.end || '—'} colors={colors} />
              <Info label="Status" value={project.projectStatus || project.phase || 'Under arbeid'} colors={colors} />
              <Info label="Prosjektleder" value={project.manager || '—'} colors={colors} />
              {project.description ? (
                <Text style={{ color: colors.muted, marginTop: 12, lineHeight: 20 }}>{project.description}</Text>
              ) : null}

              <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 20 }]}>Innstillinger for timeføring</Text>
              <CheckRow
                label="Vis prosjekt i alles timelister"
                value={settings.showInAllTimesheets}
                onChange={(v) => patchSettings('showInAllTimesheets', v)}
                colors={colors}
              />
              <CheckRow
                label="Ansatte kan legge seg selv inn på prosjektet"
                value={settings.allowSelfJoin}
                onChange={(v) => patchSettings('allowSelfJoin', v)}
                colors={colors}
              />
              <CheckRow
                label="Beskrivelse på timeføring er påkrevd"
                value={settings.requireDescription}
                onChange={(v) => patchSettings('requireDescription', v)}
                colors={colors}
              />
              <CheckRow
                label="Vis estimerte og planlagte timer i timelisten"
                value={settings.showEstimatedHours}
                onChange={(v) => patchSettings('showEstimatedHours', v)}
                colors={colors}
              />
              <CheckRow
                label="Varsle prosjektleder på e-post ved overskridelse"
                value={settings.notifyOnOverrun}
                onChange={(v) => patchSettings('notifyOnOverrun', v)}
                colors={colors}
              />
            </View>

            <View style={styles.sideCol}>
              <View style={[styles.sideCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <View style={styles.blockHead}>
                  <Text style={[styles.blockTitle, { color: colors.ink }]}>Team</Text>
                  {isAdmin ? (
                    <TouchableOpacity onPress={() => setMemberOpen(true)}>
                      <Text style={{ color: colors.brand, fontSize: 13 }}>+ Legg til</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {PROJECT_ROLES.map((role) => {
                  const rows = membersByRole[role] || [];
                  if (!rows.length) return null;
                  return (
                    <View key={role} style={{ marginBottom: 12 }}>
                      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>{role}</Text>
                      {rows.map((row) => (
                        <View key={row.id} style={styles.memberRow}>
                          {row.photoUrl ? (
                            <Image source={{ uri: row.photoUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatar, { backgroundColor: `${colors.brand}22` }]}>
                              <Ionicons name="person" size={14} color={colors.brand} />
                            </View>
                          )}
                          <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }} numberOfLines={1}>
                            {row.employeeName}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
                {!members.length ? (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen deltakere ennå.</Text>
                ) : null}
              </View>

              <View style={[styles.sideCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Text style={[styles.blockTitle, { color: colors.ink }]}>Nøkkeltall</Text>
                <Info label="Timer jobbet" value={formatHours(summary.hours)} colors={colors} />
                <Info label="Fakturerbare timer" value={formatHours(summary.billable)} colors={colors} />
                <Info label="Ikke-fakturerbart" value={formatHours(summary.nonBillable)} colors={colors} />
                <Info label="Antall føringer" value={String(summary.count)} colors={colors} />
              </View>
            </View>
          </View>
        ) : null}

        {tab === 'aktiviteter' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.blockHead}>
              <Text style={[styles.blockTitle, { color: colors.ink }]}>Aktiviteter</Text>
              <TouchableOpacity
                onPress={() => setActivityOpen(true)}
                style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>+ Legg til aktivitet</Text>
              </TouchableOpacity>
            </View>
            {!activities.length ? (
              <Text style={{ color: colors.muted }}>Ingen aktiviteter. Opprett «Hovedaktivitet» eller en ny.</Text>
            ) : null}
            {activities.map((row) => {
              const stats = activityTimeSummary(state, row.id);
              return (
                <View key={row.id} style={[styles.activityRow, { borderColor: colors.line }]}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {row.status === 'avsluttet' ? 'avsluttet' : 'under arbeid'}
                      {row.priceModelName ? ` · ${row.priceModelName}` : ''}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      Registrert {formatHours(stats.registered)} / Est. {formatHours(stats.estimated)}
                    </Text>
                    <ProgressBar left={stats.registered} right={Math.max(0, -stats.remaining)} colors={colors} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      Fakturerbart {formatHours(stats.billable)}
                    </Text>
                    <ProgressBar left={stats.billable} right={stats.nonBillable} leftColor="#16a34a" rightColor="#94a3b8" colors={colors} />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const result = updateActivity(state, row.id, {
                        status: row.status === 'avsluttet' ? 'under_arbeid' : 'avsluttet',
                      });
                      if (result.ok) onChangeState(result.state);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}

        {tab === 'fakturering' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Prismodell</Text>
            <Info label="Navn" value={project.name} colors={colors} />
            <Info label="Prismodell" value={pricingModelLabel(project.pricingModel) || 'Ikke satt'} colors={colors} />
            <Info label="Kunde" value={project.client || '—'} colors={colors} />
            {project.pricingModel === 'hourly' ? (
              <Info
                label="Ens timepris"
                value={project.pricingSettings?.hourlyRate != null
                  ? String(project.pricingSettings.hourlyRate)
                  : '—'}
                colors={colors}
              />
            ) : null}
            <Text style={{ color: colors.muted, marginTop: 12, fontSize: 13 }}>
              Velg blant: {PRICING_MODELS.map((row) => row.label).join(' · ')}. Endre prismodell under Rediger.
            </Text>
          </View>
        ) : null}

        {tab === 'timerapport' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.blockTitle, { color: colors.ink, marginBottom: 12 }]}>Timerapport</Text>
            <View style={[styles.tableHead, { borderColor: colors.line }]}>
              {['Dato', 'Medarbeider', 'Aktivitet', 'Beskrivelse', 'Timer', 'Fakturerbart', ''].map((label) => (
                <Text key={label} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {timeEntries.map((row) => (
              <View key={row.id} style={[styles.tableRow, { borderColor: colors.line }]}>
                <Text style={[styles.td, { color: colors.ink }]}>{row.date}</Text>
                <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.employeeName}</Text>
                <Text style={[styles.td, { color: colors.muted }]} numberOfLines={1}>{row.activityName}</Text>
                <Text style={[styles.td, { color: colors.ink, flex: 1.4 }]} numberOfLines={2}>{row.description || '—'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.hours)}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.billableHours)}</Text>
                <View style={styles.td}>
                  {row.status === 'godkjent' || row.status === 'låst' ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success || '#16a34a'} />
                  ) : isAdmin ? (
                    <TouchableOpacity onPress={() => approveEntry(row.id)}>
                      <Ionicons name="ellipse-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color={colors.line} />
                  )}
                </View>
              </View>
            ))}
            {!timeEntries.length ? (
              <Text style={{ color: colors.muted, paddingVertical: 16 }}>Ingen timeføringer på prosjektet ennå.</Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'team' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.blockHead}>
              <Text style={[styles.blockTitle, { color: colors.ink }]}>Prosjektdeltakere</Text>
              {isAdmin ? (
                <TouchableOpacity
                  onPress={() => setMemberOpen(true)}
                  style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>+ Legg til medlemskap</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {members.map((row) => (
              <View key={row.id} style={[styles.teamRow, { borderColor: colors.line }]}>
                {row.photoUrl ? (
                  <Image source={{ uri: row.photoUrl }} style={styles.avatarLg} />
                ) : (
                  <View style={[styles.avatarLg, { backgroundColor: `${colors.brand}22` }]}>
                    <Ionicons name="person" size={18} color={colors.brand} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.employeeName}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {PROJECT_ROLES.map((role) => (
                      <TouchableOpacity
                        key={role}
                        onPress={() => changeRole(row.id, role)}
                        style={[
                          styles.roleChip,
                          {
                            borderColor: row.role === role ? colors.brand : colors.line,
                            backgroundColor: row.role === role ? `${colors.brand}14` : 'transparent',
                          },
                        ]}
                      >
                        <Text style={{ color: colors.ink, fontSize: 12 }}>{role}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {isAdmin ? (
                  <TouchableOpacity onPress={() => dropMember(row.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger || '#b42318'} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {!members.length ? (
              <Text style={{ color: colors.muted }}>
                Legg til medarbeidere som deltakere — da får de prosjektet i Arbeid-modulen og kan føre timer.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={memberOpen} animationType="fade" onRequestClose={() => setMemberOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setMemberOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Legg til medlemskap</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {availableEmployees.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setPickEmployeeId(row.id)}
                  style={[styles.sheetRow, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: pickEmployeeId === row.id ? '700' : '400' }}>
                    {employeeDisplayName(row)}
                  </Text>
                </TouchableOpacity>
              ))}
              {!availableEmployees.length ? (
                <Text style={{ color: colors.muted }}>Alle ansatte er allerede deltakere, eller ingen ansatte er registrert.</Text>
              ) : null}
            </ScrollView>
            <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 6 }}>Rolle</Text>
            <View style={styles.chipRow}>
              {PROJECT_ROLES.map((role) => (
                <TouchableOpacity
                  key={role}
                  onPress={() => setMemberRole(role)}
                  style={[
                    styles.roleChip,
                    {
                      borderColor: memberRole === role ? colors.brand : colors.line,
                      backgroundColor: memberRole === role ? `${colors.brand}14` : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: colors.ink, fontSize: 12 }}>{role}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setMemberOpen(false)} style={[styles.ghostBtn, { borderColor: colors.line, flex: 1 }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addMember} style={[styles.primaryBtn, { backgroundColor: colors.brand, flex: 1, justifyItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Legg til</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={activityOpen} animationType="fade" onRequestClose={() => setActivityOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setActivityOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Ny aktivitet</Text>
            <TextInput
              value={activityName}
              onChangeText={setActivityName}
              placeholder="F.eks. Hovedaktivitet"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setActivityOpen(false)} style={[styles.ghostBtn, { borderColor: colors.line, flex: 1 }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createActivity} style={[styles.primaryBtn, { backgroundColor: colors.brand, flex: 1, alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Opprett</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Info({ label, value, colors }) {
  return (
    <View style={styles.infoRow}>
      <Text style={{ color: colors.muted, fontSize: 12, width: 140 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 14, flex: 1 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  crumb: { fontSize: 12, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 },
  tabs: { marginBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 4,
  },
  columns: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  mainCol: { flex: 1.4, minWidth: 280, borderWidth: 1, borderRadius: 10, padding: 16 },
  sideCol: { flex: 1, minWidth: 240, gap: 12 },
  sideCard: { borderWidth: 1, borderRadius: 10, padding: 14 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 16 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  blockTitle: { fontSize: 15, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarLg: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', marginTop: 4 },
  barFill: { height: 8 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 8, gap: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 8, alignItems: 'center' },
  th: { flex: 1, fontSize: 11 },
  td: { flex: 1, fontSize: 12 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  roleChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginTop: 6,
  },
  primaryBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  ghostBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 12, padding: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
