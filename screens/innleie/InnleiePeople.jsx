import React, { useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName, periodLabel } from '../../src/employees/model';
import { hrKindBucket, hrKindLabel } from '../../src/hr/directory';
import { hiredCatalogItem } from '../../src/hr/hired';
import { awayRows, innleieDashboard } from '../../src/innleie/dashboard';
import { formatNbDate } from '../../src/hr/model';
import { radius, type } from '../../src/ui/tokens';
import {
  ACCENT, Avatar, Pill, Segmented, gridItem, gridStyle,
} from '../hr/HrDashParts';
import HiredChecklist from './HiredChecklist';
import { PersonCard } from './InnleieDashboard';
import { lazyScreen } from '../../src/ui/lazyScreen';
const EmptyHint = lazyScreen(() => import('../hr/HrShared'), { name: 'EmptyHint', pick: 'EmptyHint', silent: true });
const HrButton = lazyScreen(() => import('../hr/HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrFollowUp = lazyScreen(() => import('../hr/HrFollowUp'), { name: 'HrFollowUp', silent: true });

const SHEETS = [
  { id: 'krav', label: 'Krav', icon: 'shield-checkmark-outline' },
  { id: 'oppfolging', label: 'Saker og oppgaver', icon: 'flag-outline' },
];

/**
 * Innleide og eksterne: kortliste med søk og Aktive/Deaktiverte, og personen med
 * kravene for innleie og saker. Arbeidsavtale, lønn og samtaler er leverandørens ansvar.
 */
export default function InnleiePeople({
  colors, employees, hr, notices, selectedId, onSelect, sheet = 'krav', onSheet,
  canWrite, onPatch, familyId, focusCaseId, assigneeUid, assigneeName, onOpenTask, onCreateFollowUpTask,
  formKit = null, gapFilter = '', onClearGap, onOpenProfile, onOpenFollowUp,
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const dash = useMemo(() => innleieDashboard(employees, hr, { notices, status }), [employees, hr, notices, status]);
  const awayToday = useMemo(() => new Set(dash.awayToday.map((row) => row.employeeId)), [dash.awayToday]);
  const q = query.trim().toLowerCase();
  const rows = dash.rows.filter((row) => {
    if (gapFilter && !row.cells.summary.lawGapIds.includes(gapFilter)) return false;
    if (!q) return true;
    return [row.name, row.title, row.kindLabel, row.employee?.person?.email].join(' ').toLowerCase().includes(q);
  });
  const selected = (employees || []).find((row) => row.id === selectedId && hrKindBucket(row) === 'external') || null;
  const activeSheet = SHEETS.some((item) => item.id === sheet) ? sheet : 'krav';

  if (!selected) {
    return (
      <View style={styles.page} nativeID="hr-hired">
        <View style={styles.tools}>
          <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Søk etter navn, rolle eller e-post"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.ink }]}
            />
          </View>
          <Segmented
            colors={colors}
            nativeID="innleie-status"
            options={[
              { id: 'active', label: 'Aktive', count: dash.counts.active },
              { id: 'inactive', label: 'Deaktiverte', count: dash.counts.inactive },
            ]}
            value={status}
            onChange={setStatus}
          />
        </View>
        {gapFilter ? (
          <Pressable onPress={onClearGap} accessibilityRole="button" style={styles.filter}>
            <Pill label={`Mangler: ${hiredCatalogItem(gapFilter)?.label || gapFilter}`} accent={ACCENT.red} icon="close-circle" />
          </Pressable>
        ) : null}
        <Text style={[styles.caption, { color: colors.muted }]} nativeID="hr-hired-count">
          {`${dash.innleid} innleid · ${dash.ekstern} ekstern. Det som mangler, står først. Nye registreres under Ny ansatt med personelltype Innleid eller Ekstern.`}
        </Text>
        {rows.length ? (
          <View style={gridStyle(3, 260, 10)}>
            {rows.map((row) => (
              <View key={row.id} style={gridItem(260)}>
                <PersonCard
                  colors={colors}
                  row={row}
                  away={awayToday.has(row.id)}
                  onPress={() => { onSelect?.(row.id); onSheet?.('krav'); }}
                />
              </View>
            ))}
          </View>
        ) : (
          <EmptyHint colors={colors} text={status === 'inactive' ? 'Ingen deaktiverte innleide.' : 'Ingen innleide eller eksterne i dette utvalget.'} />
        )}
      </View>
    );
  }

  const kindLabel = hrKindLabel(selected);
  const name = displayName(selected);
  const away = awayRows(notices, [selected], { days: 30 });
  return (
    <View style={styles.page} nativeID="hr-hired-sheet">
      <Pressable
        onPress={() => { onSelect?.(''); onSheet?.('krav'); }}
        accessibilityRole="button"
        style={styles.back}
      >
        <Ionicons name="arrow-back" size={16} color={colors.brand} />
        <Text style={[styles.caption, { color: colors.brand, fontWeight: '600' }]}>Til innleid personell</Text>
      </Pressable>
      <View style={[styles.head, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Avatar name={name} photoUrl={selected.person?.photoUrl} size={52} accent={ACCENT.slate} square />
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.caption, { color: colors.muted }]} numberOfLines={2}>
            {[selected?.company?.title, periodLabel(selected)].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.pills}>
            <Pill label={kindLabel} accent={ACCENT.slate} solid />
            {away.map((row) => (
              <Pill
                key={row.id}
                label={row.fromDate === row.toDate ? `Borte ${formatNbDate(row.fromDate)}` : `Borte ${formatNbDate(row.fromDate)}–${formatNbDate(row.toDate)}`}
                accent={ACCENT.violet}
                icon="calendar-clear-outline"
              />
            ))}
          </View>
          <View style={styles.headActions}>
            {onOpenProfile ? (
              <HrButton colors={colors} icon="person-circle-outline" label="Profil og kontakt" onPress={() => onOpenProfile(selected.id)} nativeID="innleie-open-profile" />
            ) : null}
            {onOpenFollowUp ? (
              <HrButton colors={colors} icon="happy-outline" label="Trivsel og evaluering" onPress={() => onOpenFollowUp(selected.id)} nativeID="innleie-open-followup" />
            ) : null}
          </View>
        </View>
      </View>
      <Segmented
        colors={colors}
        nativeID="hr-hired-sheet"
        options={SHEETS}
        value={activeSheet}
        onChange={(id) => onSheet?.(id)}
      />

      {activeSheet === 'krav' ? (
        <HiredChecklist
          colors={colors}
          employee={selected}
          kindLabel={kindLabel}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
        />
      ) : null}

      {activeSheet === 'oppfolging' ? (
        <HrFollowUp
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          lockedEmployeeId={selected.id}
          onPatch={onPatch}
          familyId={familyId}
          focusCaseId={focusCaseId}
          assigneeUid={assigneeUid}
          assigneeName={assigneeName}
          onOpenTask={onOpenTask}
          onCreateFollowUpTask={onCreateFollowUpTask}
          formKit={formKit}
          hideReviews
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  search: {
    flexGrow: 1, flexBasis: 240, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, minHeight: 44,
  },
  searchInput: { flex: 1, ...type.body, paddingVertical: 8 },
  filter: { alignSelf: 'flex-start' },
  caption: { ...type.caption },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: radius.card, padding: 14,
  },
  headText: { flex: 1, minWidth: 0, gap: 3 },
  title: { ...type.h2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  headActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
});
