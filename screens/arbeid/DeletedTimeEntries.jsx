import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import {
  Badge, Button, Card, showSaveError, showSaveToast, space, type, useConfirm, radius,
} from '../../src/ui';
import { deletionRows, filterDeletionRows } from '../../src/arbeid/timeEntryRestore.js';
import { formatDate } from '../../src/format/nb';

const SHOWN = 25;

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hoursText(value) {
  return `${String(Number(value) || 0).replace('.', ',')} t`;
}

/**
 * Slettede timer (sikkerhetskopi i appen): slettelloggen med «Gjenopprett» per føring.
 * Vises bare for dem som kan lese loggen (timeDeletionReader i firestore.rules). Andre ser ingenting.
 * employees/projects: til navn i stedet for id. onRestored: kalles med føringen som er lagt inn igjen.
 */
export default function DeletedTimeEntries({ familyId, employees = [], projects = [], onRestored = null }) {
  const colors = useColors();
  const confirm = useConfirm();
  const [data, setData] = useState({ loading: true, denied: false, error: '', records: [], restored: new Set() });
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    if (!familyId) return;
    const { loadTimeEntryDeletions } = await import('../../src/economy/timeEntryRestoreClient.js');
    const res = await loadTimeEntryDeletions(familyId);
    setData({
      loading: false,
      denied: !!res.denied,
      error: res.ok ? '' : (res.error || ''),
      records: res.records || [],
      restored: res.restored || new Set(),
    });
  }, [familyId]);

  useEffect(() => {
    setData((prev) => ({ ...prev, loading: true }));
    load();
  }, [load]);

  const rows = useMemo(() => deletionRows(data.records, {
    restored: data.restored,
    employees,
    projects,
  }), [data.records, data.restored, employees, projects]);
  const filtered = useMemo(() => filterDeletionRows(rows, query), [rows, query]);
  const shown = all ? filtered : filtered.slice(0, SHOWN);

  async function restore(row) {
    const ok = await confirm({
      title: 'Gjenopprette timen?',
      message: `${row.employee}, ${formatDate(row.date)}, ${hoursText(row.hours)} på ${row.project}. `
        + 'Timen legges inn igjen som ny føring og må godkjennes på nytt.'
        + (row.full ? '' : ' Slettingen er eldre enn kopifunksjonen, så beskrivelse og klokkeslett kommer ikke tilbake.'),
      confirmText: 'Gjenopprett',
    });
    if (!ok) return;
    setBusy(row.key);
    try {
      const { restoreDeletedTimeEntry } = await import('../../src/economy/timeEntryRestoreClient.js');
      const entry = await restoreDeletedTimeEntry(familyId, row.record);
      setData((prev) => ({ ...prev, restored: new Set([...prev.restored, row.entryId]) }));
      showSaveToast(`Timen til ${row.employee} ${formatDate(row.date)} er gjenopprettet.`);
      onRestored?.(entry);
    } catch (error) {
      const denied = /permission|insufficient/i.test(String(error?.code || error?.message || ''));
      showSaveError(denied
        ? 'Du har ikke rett til å føre timer for denne ansatte.'
        : (error?.message || 'Timen ble ikke gjenopprettet.'));
    } finally {
      setBusy('');
    }
  }

  // Uten tilgang til loggen vises ikke kortet i det hele tatt.
  if (!familyId || data.denied) return null;

  return (
    <Card
      title="Slettede timer"
      subtitle="Timer som er slettet, med hvem som slettet dem og når. Gjenopprett en time som ble slettet ved en feil."
    >
      <View nativeID="slettede-timer" style={styles.stack}>
        {data.loading ? <ActivityIndicator color={colors.brand} /> : null}
        {data.error ? <Text style={[type.body, { color: colors.dangerInk || colors.danger }]}>{data.error}</Text> : null}
        {!data.loading && !data.error && !rows.length ? (
          <Text style={[type.body, { color: colors.muted }]}>Ingen timer er slettet.</Text>
        ) : null}
        {rows.length > 5 ? (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på ansatt, prosjekt eller beskrivelse"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Søk i slettede timer"
            nativeID="slettede-timer-sok"
            style={[styles.input, type.body, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.bg }]}
          />
        ) : null}
        {shown.map((row) => (
          <View key={row.key} style={[styles.row, { borderColor: colors.line }]}>
            <View style={styles.main}>
              <Text style={[type.bodyStrong, { color: colors.ink }]}>
                {row.employee} · {formatDate(row.date)} · {hoursText(row.hours)}
              </Text>
              <Text style={[type.label, { color: colors.ink }]} numberOfLines={2}>
                {[row.project, row.description].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                Slettet {when(row.at)} av {row.byName}{row.reason ? ` (${row.reason})` : ''}
              </Text>
            </View>
            {row.restored ? <Badge label="Gjenopprettet" tone="ok" icon="checkmark" /> : null}
            {!row.restored && row.restorable ? (
              <Button
                small
                label="Gjenopprett"
                icon="arrow-undo-outline"
                busy={busy === row.key}
                disabled={!!busy && busy !== row.key}
                onPress={() => restore(row)}
                nativeID={`gjenopprett-${row.entryId}`}
              />
            ) : null}
            {!row.restored && !row.restorable ? <Badge label="Mangler data" tone="muted" /> : null}
          </View>
        ))}
        {!all && filtered.length > SHOWN ? (
          <Button label={`Vis alle ${filtered.length}`} onPress={() => setAll(true)} small nativeID="slettede-timer-alle" />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs, marginTop: space.xs },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, minWidth: 220, gap: 2 },
  input: {
    borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs,
  },
});
