import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { formatDateTime } from '../../src/format/nb';
import { periodLabel } from '../../src/indeksregulering/engine';
import { formatIndex } from '../../src/indeksregulering/letter';
import {
  INDEX_TIME_WINDOWS,
  agreementCountByIndex,
  appendIndexHistory,
  indexColumnIds,
  indexTimeSections,
  mergeIndexSnapshot,
} from '../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../src/indeksregulering/remoteSsb';
import { fetchAllIndices } from '../../src/indeksregulering/ssb';
import { loadIndexCache, saveIndexCache } from '../../src/indeksregulering/storage';
import { indexNews, latestMap, osloDate, shouldCheckToday } from '../../src/indeksregulering/watch';

function showValue(value) {
  if (value == null || value === '') return '—';
  return formatIndex(value);
}


export default function EconomyIndices({ contracts = [] }) {
  const colors = useColors();
  const [series, setSeries] = useState(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(true);
  const [years, setYears] = useState(3);

  const columnIds = useMemo(() => indexColumnIds(contracts), [contracts]);
  const columnKey = columnIds.join('|');
  const counts = useMemo(() => agreementCountByIndex(contracts), [contracts]);
  const sections = useMemo(
    () => indexTimeSections({ series, ids: columnIds, years }),
    [series, columnIds, years],
  );

  useEffect(() => {
    let live = true;
    const ids = columnKey ? columnKey.split('|') : [];
    (async () => {
      let cache = null;
      let remote = null;
      try {
        [cache, remote] = await Promise.all([
          loadIndexCache(),
          loadRemoteIndexSnapshot().catch(() => null),
        ]);
      } catch {
        cache = null;
      }
      if (!live) return;
      const merged = mergeIndexSnapshot(cache?.series, remote);
      const remoteHistory = Array.isArray(remote?.history) ? remote.history : [];
      const localHistory = Array.isArray(cache?.history) ? cache.history : [];
      const initialHistory = remoteHistory.length >= localHistory.length ? remoteHistory : localHistory;
      setSeries(merged);
      setCheckedAt(remote?.checkedAt || cache?.fetchedAt || '');
      const ready = ids.every((id) => merged?.[id]?.points?.length);
      if (ready && !shouldCheckToday(cache?.checkedOn)) {
        setWorking(false);
        return;
      }
      setWorking(true);
      setError('');
      try {
        const bundle = await fetchAllIndices({ ids });
        if (!live) return;
        const nextSeries = { ...merged, ...bundle.series };
        const news = indexNews(latestMap(merged), latestMap(nextSeries));
        const nextHistory = appendIndexHistory(initialHistory, news, bundle.fetchedAt);
        await saveIndexCache({
          ...bundle,
          series: nextSeries,
          news,
          history: nextHistory,
          checkedOn: bundle.errors?.length ? (cache?.checkedOn || '') : osloDate(),
        });
        if (!live) return;
        setSeries(nextSeries);
        setCheckedAt(bundle.fetchedAt);
        setError(bundle.errors?.[0] || '');
      } catch (cause) {
        if (!live) return;
        setError(cause?.message || 'Kunne ikke hente indeksene fra SSB.');
      } finally {
        if (live) setWorking(false);
      }
    })();
    return () => { live = false; };
  }, [columnKey]);

  return (
    <View nativeID="economy-indices" style={styles.stack}>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Én kolonne per indeks. Perioden går nedover, og tidsskalaen avgrenses med filtrene.
        Tallene hentes fra SSB av seg selv.
      </Text>
      {working ? (
        <Text style={{ color: colors.muted }}>Henter tall fra SSB…</Text>
      ) : checkedAt ? (
        <Text style={{ color: colors.muted }}>Sist oppdatert {formatDateTime(checkedAt)}</Text>
      ) : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      <View nativeID="economy-index-filters" style={styles.filters}>
        {INDEX_TIME_WINDOWS.map((item) => {
          const on = years === item.id;
          return (
            <TouchableOpacity
              key={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setYears(item.id)}
              style={[styles.chip, {
                borderColor: on ? colors.brand : colors.line,
                backgroundColor: on ? colors.brand : colors.card,
              }]}
            >
              <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 14 }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {sections.map((section) => (
        <View key={section.frequency} nativeID={`economy-index-${section.frequency}`} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
          <ScrollView
            horizontal
            style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <View>
              <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.card }]}>
                <Text style={[styles.period, styles.th, { color: colors.muted }]}>Periode</Text>
                {section.columns.map((column) => (
                  <View key={column.id} style={styles.col}>
                    <Text style={[styles.colName, { color: colors.ink }]}>{column.name}</Text>
                    <Text style={[styles.colMeta, { color: colors.muted }]}>
                      {[column.basis, column.table ? `tabell ${column.table}` : ''].filter(Boolean).join(' · ')}
                    </Text>
                    {counts[column.id] ? (
                      <Text style={[styles.colMeta, { color: colors.muted }]}>
                        {counts[column.id] === 1 ? '1 avtale' : `${counts[column.id]} avtaler`}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              {section.rows.map((row, index) => {
                const latest = index === section.rows.length - 1;
                return (
                  <View key={row.period} style={[styles.tr, { borderBottomColor: colors.line }]}>
                    <Text style={[styles.period, { color: colors.ink, fontWeight: latest ? '700' : '400' }]}>
                      {periodLabel(row.period)}
                    </Text>
                    {section.columns.map((column) => (
                      <Text
                        key={column.id}
                        style={[styles.value, { color: colors.ink, fontWeight: latest ? '700' : '400' }]}
                      >
                        {showValue(row.values[column.id])}
                      </Text>
                    ))}
                  </View>
                );
              })}
              {!section.rows.length ? (
                <Text style={[styles.empty, { color: colors.muted }]}>
                  {working ? 'Henter tall fra SSB…' : 'Ingen publiserte punkt i perioden.'}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  table: { borderWidth: 1, borderRadius: 12 },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  head: { alignItems: 'flex-start', paddingVertical: 10 },
  period: { width: 168, fontSize: 14, paddingRight: 12 },
  th: { fontSize: 12 },
  col: { width: 176, paddingRight: 12, gap: 2 },
  colName: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  colMeta: { fontSize: 11, lineHeight: 14 },
  value: { width: 176, fontSize: 14, paddingRight: 12, fontVariant: ['tabular-nums'] },
  empty: { padding: 12 },
});
