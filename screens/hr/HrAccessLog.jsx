import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { listAccessLog } from '../../src/hr/accessLogClient';
import { accessLogLines } from '../../src/hr/accessLog';
import { ACCESS_LOG_RETENTION_DAYS } from '../../src/privacy/retentionPolicy';
import { EmptyHint, HrCard, HrSectionTitle } from './HrShared';

/**
 * Innsynslogg (L-19): hvem har åpnet HR-mapper, lønn, fravær og personnummer.
 * Bedriften (eier, administrator, Admin på HR) ser alt; med employeeId vises innsyn i én
 * ansatts opplysninger, også for den ansatte selv.
 */
export default function HrAccessLog({ colors, familyId, employeeId = '', title = 'Innsynslogg', subtitle = '' }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    setState({ loading: true, rows: [], error: '' });
    listAccessLog({ familyId, employeeId }).then((res) => {
      if (!live) return;
      if (!res?.ok) setState({ loading: false, rows: [], error: res?.error || 'Kunne ikke hente innsynsloggen.' });
      else setState({ loading: false, rows: Array.isArray(res.rows) ? res.rows : [], error: '' });
    });
    return () => { live = false; };
  }, [familyId, employeeId]);

  const lines = useMemo(() => accessLogLines(state.rows), [state.rows]);

  return (
    <HrCard colors={colors}>
      <View nativeID={employeeId ? 'hr-access-log-self' : 'hr-access-log'} style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title={title}
          subtitle={subtitle || `Hvem som har åpnet en annens HR-mappe, lønn, fravær eller personnummer, og når. Verdiene logges ikke, og loggen kan ikke endres. Innsyn slettes etter ${ACCESS_LOG_RETENTION_DAYS / 365} år.`}
        />
        {state.loading ? <ActivityIndicator color={colors.brand} /> : null}
        {state.error ? <Text style={{ color: colors.dangerInk || colors.danger }}>{state.error}</Text> : null}
        {!state.loading && !state.error && !lines.length ? <EmptyHint colors={colors} text="Ingen innsyn er logget ennå." /> : null}
        {lines.map((line) => (
          <View key={line.id} style={[styles.row, { borderBottomColor: colors.line }]}>
            <Text style={[styles.when, { color: colors.muted }]}>{line.when}</Text>
            <Text style={[styles.cell, { color: colors.ink }]}>{line.who}</Text>
            <Text style={[styles.cell, { color: colors.ink }]}>{employeeId ? line.what : `${line.what} · ${line.whom}`}</Text>
          </View>
        ))}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  when: { width: 130, fontSize: 13 },
  cell: { flexGrow: 1, flexBasis: 160, fontSize: 14 },
});
