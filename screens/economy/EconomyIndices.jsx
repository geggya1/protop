import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { periodLabel } from '../../src/indeksregulering/engine';
import { formatIndex } from '../../src/indeksregulering/letter';
import {
  appendIndexHistory,
  indexTableRows,
  mergeIndexSnapshot,
  usedIndexIds,
} from '../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../src/indeksregulering/remoteSsb';
import { fetchAllIndices } from '../../src/indeksregulering/ssb';
import { loadIndexCache, saveIndexCache } from '../../src/indeksregulering/storage';
import { indexNews, latestMap, osloDate } from '../../src/indeksregulering/watch';

function showValue(value) {
  if (value === '' || value == null) return '—';
  return formatIndex(value);
}

export default function EconomyIndices({ contracts = [] }) {
  const colors = useColors();
  const [series, setSeries] = useState(null);
  const [history, setHistory] = useState([]);
  const [checkedAt, setCheckedAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadIndexCache(),
      loadRemoteIndexSnapshot().catch(() => null),
    ]).then(([cache, remote]) => {
      if (!live) return;
      setSeries(mergeIndexSnapshot(cache?.series, remote));
      const remoteHistory = Array.isArray(remote?.history) ? remote.history : [];
      const localHistory = Array.isArray(cache?.history) ? cache.history : [];
      setHistory(remoteHistory.length >= localHistory.length ? remoteHistory : localHistory);
      setCheckedAt(remote?.checkedAt || cache?.fetchedAt || '');
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const rows = useMemo(
    () => indexTableRows({ contracts, series, history }),
    [contracts, series, history],
  );
  const used = usedIndexIds(contracts);

  async function refresh() {
    if (!used.length || working) return;
    setWorking(true);
    setError('');
    setNote('Henter benyttede indekser fra SSB…');
    try {
      const previous = latestMap(series);
      const bundle = await fetchAllIndices({ ids: used });
      const news = indexNews(previous, latestMap(bundle.series));
      const nextHistory = appendIndexHistory(history, news, bundle.fetchedAt);
      await saveIndexCache({ ...bundle, news, history: nextHistory, checkedOn: osloDate() });
      setSeries(bundle.series);
      setHistory(nextHistory);
      setCheckedAt(bundle.fetchedAt);
      setNote(news.length
        ? `${news.length} indeks${news.length === 1 ? '' : 'er'} har et nytt punkt.`
        : 'Indeksene er hentet. Ingen nye punkt siden forrige registrering.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke hente indeksene.');
      setNote('');
    } finally {
      setWorking(false);
    }
  }

  return (
    <View nativeID="economy-indices" style={styles.stack}>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Systemet spør SSB én gang i døgnet om indeksene som er navngitt i inngåtte avtaler.
        Nye punkt registreres her, én rad per indeks.
      </Text>
      {checkedAt ? (
        <Text style={{ color: colors.muted }}>Sist registrert {checkedAt.slice(0, 16).replace('T', ' ')}</Text>
      ) : (
        <Text style={{ color: colors.muted }}>Ingen SSB-registrering er lagret ennå.</Text>
      )}
      {note ? <Text style={{ color: colors.ink }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      <TouchableOpacity
        onPress={refresh}
        disabled={working || !used.length}
        accessibilityRole="button"
        style={[styles.btn, { backgroundColor: colors.brand, opacity: working || !used.length ? 0.55 : 1 }]}
      >
        <Text style={{ color: '#fff' }}>{working ? 'Henter…' : 'Hent benyttede indekser nå'}</Text>
      </TouchableOpacity>
      {!used.length ? (
        <Text style={{ color: colors.muted }}>Ingen avtaler har en registrert indeks ennå.</Text>
      ) : (
        <ScrollView horizontal style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View>
            <View style={[styles.tr, styles.head, { borderBottomColor: colors.line }]}>
              {['Indeks', 'SSB-tabell', 'Siste periode', 'Verdi', 'Forrige', 'Avtaler', ''].map((label) => (
                <Text key={label || 'flag'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {rows.map((row) => (
              <View key={row.id} style={[styles.tr, { borderBottomColor: colors.line }]}>
                <Text style={[styles.td, { color: colors.ink, fontWeight: '600' }]}>{row.name}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.table || '—'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.period ? periodLabel(row.period) : '—'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{showValue(row.value)}</Text>
                <Text style={[styles.td, { color: colors.muted }]}>
                  {row.previousPeriod ? `${periodLabel(row.previousPeriod)} · ${showValue(row.previousValue)}` : '—'}
                </Text>
                <Text style={[styles.td, { color: colors.ink }]}>{row.agreements}</Text>
                <Text style={[styles.td, { color: row.changed ? (colors.danger || '#b45309') : colors.muted }]}>
                  {row.changed ? 'Ny indeks' : ''}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  table: { borderWidth: 1, borderRadius: 12 },
  tr: { flexDirection: 'row', minWidth: 860, borderBottomWidth: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  head: { paddingVertical: 8 },
  th: { width: 140, fontSize: 12 },
  td: { width: 140, fontSize: 14, paddingRight: 8 },
});
