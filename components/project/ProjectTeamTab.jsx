import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../OptionPicker';
import { PROJECT_ROLES, employeeDisplayName } from '../../src/arbeid/roles.js';
import { isActiveEmployee } from '../../src/employees/model';
import { formatHours } from '../../src/arbeid/hours.js';
import { memberHoursMap } from '../../src/project/projectDashboard.js';
import {
  addProjectMember,
  removeProjectMember,
  updateProjectMember,
} from '../../src/project/engine.js';
import { showSaveToast } from '../../src/ui/saveToast';

/**
 * Team-fane med tabell, rollevalg, timer og legg til / fjern.
 */
export default function ProjectTeamTab({
  state,
  project,
  members,
  employees = [],
  timeEntries = [],
  colors,
  isAdmin,
  uid,
  onChangeState,
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState('Prosjektmedlem');
  const [pickId, setPickId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [error, setError] = useState('');

  const rows = useMemo(() => memberHoursMap(timeEntries, members), [timeEntries, members]);
  const available = employees.filter((row) => (
    isActiveEmployee(row)
    && !members.some((mem) => mem.employeeId === row.id)
  ));

  function addMember() {
    const emp = employees.find((row) => row.id === pickId);
    if (!emp) {
      setError('Velg medarbeider.');
      return;
    }
    const result = addProjectMember(state, {
      projectId: project.id,
      employeeId: emp.id,
      employeeName: employeeDisplayName(emp),
      photoUrl: emp.person?.photoUrl,
      role,
      addedByUid: uid,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setOpen(false);
    setPickId('');
    setError('');
    showSaveToast(`${employeeDisplayName(emp)} lagt til.`);
  }

  function changeRole(memberId, nextRole) {
    // «Har ført timer»: gjør personen til ordinær deltaker med valgt rolle.
    const derived = members.find((row) => row.id === memberId && row.derived);
    if (derived) {
      const added = addProjectMember(state, {
        projectId: project.id,
        employeeId: derived.employeeId,
        employeeName: derived.employeeName,
        role: nextRole,
        addedByUid: uid,
      });
      if (added.ok) {
        onChangeState(added.state);
        setMenuId('');
        showSaveToast('Lagt til i teamet.');
      } else setError(added.error);
      return;
    }
    const result = updateProjectMember(state, memberId, { role: nextRole });
    if (result.ok) {
      onChangeState(result.state);
      setMenuId('');
      showSaveToast('Rollen er oppdatert.');
    }
  }

  function drop(memberId) {
    if (members.some((row) => row.id === memberId && row.derived)) {
      setError('Personen har ført timer på prosjektet og vises derfor i teamet.');
      return;
    }
    const result = removeProjectMember(state, memberId);
    if (result.ok) {
      onChangeState(result.state);
      setMenuId('');
      showSaveToast('Deltaker fjernet.');
    } else setError(result.error);
  }

  function emailFor(member) {
    const emp = employees.find((row) => row.id === member.employeeId);
    return emp?.person?.email || emp?.email || '';
  }

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="project-team-tab">
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>Team ({members.length} deltakere)</Text>
        {isAdmin ? (
          <TouchableOpacity
            onPress={() => setOpen(true)}
            style={[styles.primary, { backgroundColor: colors.brand }]}
            accessibilityRole="button"
            accessibilityLabel="Legg til medlem"
            nativeID="project-team-add"
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>+ Legg til medlem</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 8 }}>{error}</Text> : null}

      <View style={[styles.tableHead, { borderColor: colors.line }]}>
        {['Navn', 'Rolle', 'Timer', 'E-post', 'Status', ''].map((label) => (
          <Text key={label || 'x'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
        ))}
      </View>
      {rows.map((row) => {
        const email = emailFor(row);
        return (
          <View key={row.id} style={[styles.tableRow, { borderColor: colors.line }]}>
            <View style={[styles.td, styles.nameCell]}>
              {row.photoUrl ? (
                <Image source={{ uri: row.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: `${colors.brand}22`, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={14} color={colors.brand} />
                </View>
              )}
              <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }} numberOfLines={1}>{row.employeeName}</Text>
            </View>
            <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.role}</Text>
            <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.hours)}</Text>
            <Text style={[styles.td, { color: colors.brand }]} numberOfLines={1}>{email || '—'}</Text>
            <View style={[styles.td, styles.statusCell]}>
              <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
              <Text style={{ color: colors.ink, fontSize: 12 }}>Aktiv</Text>
            </View>
            <View style={styles.td}>
              {isAdmin ? (
                <TouchableOpacity onPress={() => setMenuId(menuId === row.id ? '' : row.id)} hitSlop={8}>
                  <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
            {menuId === row.id ? (
              <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.line }]}>
                {PROJECT_ROLES.map((r) => (
                  <TouchableOpacity key={r} onPress={() => changeRole(row.id, r)} style={styles.menuItem}>
                    <Text style={{ color: colors.ink }}>{r}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => drop(row.id)} style={styles.menuItem}>
                  <Text style={{ color: colors.danger || '#b42318' }}>Fjern fra prosjekt</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
      {!rows.length ? (
        <Text style={{ color: colors.muted, paddingVertical: 16 }}>
          Ingen deltakere. Legg til medlemmer så de kan føre timer på prosjektet.
        </Text>
      ) : null}

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Legg til medlem</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {available.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setPickId(row.id)}
                  style={[styles.sheetRow, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: pickId === row.id ? '700' : '400' }}>
                    {employeeDisplayName(row)}
                  </Text>
                </TouchableOpacity>
              ))}
              {!available.length ? (
                <Text style={{ color: colors.muted }}>Alle ansatte er allerede deltakere.</Text>
              ) : null}
            </ScrollView>
            <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 6 }}>Rolle</Text>
            <OptionPicker
              options={PROJECT_ROLES}
              value={role}
              onChange={(r) => { if (r) setRole(r); }}
              title="Rolle"
              clearable={false}
              small
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setOpen(false)} style={[styles.ghost, { borderColor: colors.line, flex: 1 }]}>
                <Text style={{ color: colors.ink, textAlign: 'center' }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addMember} style={[styles.primary, { backgroundColor: colors.brand, flex: 1, alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Legg til</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 12, padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '700' },
  primary: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 8, gap: 8 },
  tableRow: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 8, alignItems: 'center' },
  th: { flex: 1, fontSize: 11 },
  td: { flex: 1, fontSize: 12 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 140 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  statusCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  menu: { width: '100%', borderWidth: 1, borderRadius: 8, padding: 6, marginTop: 4 },
  menuItem: { paddingVertical: 8, paddingHorizontal: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 12, padding: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  ghost: { borderWidth: 1, borderRadius: 8, paddingVertical: 10 },
});
