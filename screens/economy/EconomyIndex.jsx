import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { calculate, emptyLine, parseAmount, periodLabel } from '../../src/indeksregulering/engine';
import { formatIndex, formatMoney, formatPercent } from '../../src/indeksregulering/letter';
import { fetchSeriesById } from '../../src/indeksregulering/ssb';
import { seriesById } from '../../src/indeksregulering/catalog';
import { draftFromRegisteredContract, knownIndexFacts, missingIndexFields } from '../../src/economy/fromContract';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

export default function EconomyIndex({
  contract,
  customer = null,
  company = null,
  onClose,
}) {
  const colors = useColors();
  const extras = { customer, company };
  const [draft, setDraft] = useState(() => draftFromRegisteredContract(contract, extras));
  const [bundle, setBundle] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setDraft(draftFromRegisteredContract(contract, { customer, company }));
  }, [contract, customer, company]);

  const facts = useMemo(() => knownIndexFacts(draft), [draft]);
  const missing = useMemo(() => missingIndexFields(draft), [draft]);
  const series = bundle?.series?.[draft.indexId] || seriesById(draft.indexId);
  const latest = bundle?.series?.[draft.indexId]?.latest || null;
  const live = useMemo(() => {
    if (!bundle?.series || missing.length) return null;
    return calculate(draft, bundle.series);
  }, [draft, bundle, missing.length]);

  function patch(part) {
    setDraft((current) => {
      const next = { ...current, ...part };
      if (part.value != null) {
        const rate = String(part.value);
        next.lines = current.lines?.length
          ? current.lines.map((line, index) => (index === 0 ? { ...line, rate } : line))
          : [emptyLine({ text: 'Avtalt honorar', quantity: '1', unit: 'RS', rate })];
      }
      return next;
    });
  }

  async function loadIndex() {
    if (!draft.indexId) {
      setError('Avtalen har ikke en registrert indeksserie ennå.');
      return;
    }
    setWorking(true);
    setError('');
    setStatus(`Henter ${seriesById(draft.indexId)?.name || draft.indexId} fra SSB…`);
    try {
      const fetched = await fetchSeriesById(draft.indexId);
      setBundle(fetched);
      const point = fetched.series[draft.indexId]?.latest;
      setStatus(point
        ? `Siste gjeldende indeks er ${formatIndex(point.value)} for ${periodLabel(point.period)}.`
        : 'Serien er hentet, men har ingen publiserte punkt.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke hente indeksen.');
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (draft.indexId) loadIndex();
  }, [draft.indexId]);

  return (
    <View nativeID="economy-index" id="economy-index" style={styles.stack}>
      <TouchableOpacity onPress={onClose} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Tilbake til avtalen</Text>
      </TouchableOpacity>
      <Text style={[styles.h, { color: colors.ink }]}>Indeksregulering</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Dette er feltene som allerede er registrert på avtalen. Modulen henter siste gjeldende SSB-indeks og ber bare om det som mangler for beregningen.
      </Text>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>{draft.title || 'Avtale'}</Text>
        <View style={styles.grid}>
          {facts.map((row) => (
            <Fact key={row.label} label={row.label} value={row.value} colors={colors} />
          ))}
        </View>
      </View>

      {latest ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Siste gjeldende indeks</Text>
          <Text style={[styles.value, { color: colors.ink }]}>
            {series?.name || draft.indexId}: {formatIndex(latest.value)} · {periodLabel(latest.period)}
          </Text>
          {series?.table ? (
            <Text style={{ color: colors.muted }}>SSB-tabell {series.table}{series.codes?.length ? ` · ${series.codes.join(', ')}` : ''}</Text>
          ) : null}
        </View>
      ) : null}

      {missing.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Påkrevd for beregningen</Text>
          {missing.map((row) => (
            <View key={row.id} style={{ gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>{row.label}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>{row.hint}</Text>
              <TextInput
                value={draft[row.id] == null ? '' : String(draft[row.id])}
                onChangeText={(value) => patch({ [row.id]: value })}
                placeholder={row.suggest || ''}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              {row.suggest ? (
                <TouchableOpacity onPress={() => patch({ [row.id]: row.suggest })} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Bruk {row.suggest}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {status ? <Text style={{ color: colors.ink }}>{status}</Text> : null}

      <View style={styles.row}>
        <TouchableOpacity
          onPress={loadIndex}
          disabled={working || !draft.indexId}
          accessibilityRole="button"
          style={[styles.btn, { backgroundColor: colors.brand, opacity: working || !draft.indexId ? 0.55 : 1 }]}
        >
          <Text style={{ color: '#fff' }}>{working ? 'Henter indeks…' : 'Hent siste indeks'}</Text>
        </TouchableOpacity>
      </View>

      {live?.ok ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>
            {live.addition < 0 ? 'Reduksjon' : 'Tillegg'} {formatMoney(live.addition)} kr
          </Text>
          <Text style={{ color: colors.ink }}>{live.model?.formula}</Text>
          <Text style={{ color: colors.muted }}>
            t0 {periodLabel(live.basisPoint.period)} = {formatIndex(live.basisPoint.value)}
            {' · '}
            t {periodLabel(live.regulationPoint.period)} = {formatIndex(live.regulationPoint.value)}
            {' · '}
            endring {formatPercent(live.changePercent)}
          </Text>
          {parseAmount(draft.lines?.[0]?.rate) != null ? (
            <Text style={{ color: colors.ink }}>
              Grunnlag {formatMoney(live.baseSum)} kr
            </Text>
          ) : null}
        </View>
      ) : live?.error ? (
        <Text style={{ color: colors.muted }}>{live.error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  h: { fontSize: 18, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { minWidth: 160, flexGrow: 1, gap: 2 },
  label: { fontSize: 12 },
  value: { fontSize: 15, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
