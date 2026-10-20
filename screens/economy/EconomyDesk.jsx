import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { standardById } from '../../src/indeksregulering/catalog';
import {
  QUEUE_BANDS,
  computeRegulation,
  formatKr,
  formatPercentExact,
  queueContracts,
  queueCounts,
} from '../../src/indeksregulering/cases';
import { periodLabel } from '../../src/indeksregulering/engine';
import { formatIndex, formatPercent } from '../../src/indeksregulering/letter';

function toneColor(tone, colors) {
  if (tone === 'danger') return colors.danger || '#dc2626';
  if (tone === 'warn') return colors.warn || '#d97706';
  if (tone === 'success') return colors.success || '#16a34a';
  if (tone === 'brand') return colors.brand;
  return colors.muted;
}

function Pill({ label, tone, colors }) {
  const color = toneColor(tone, colors);
  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function Field({ label, value, colors }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: colors.ink }]}>{value || '–'}</Text>
    </View>
  );
}

function showNode(id) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export default function EconomyDesk({
  contracts = [],
  projects = [],
  customers = [],
  series = null,
  onOpenIndex,
  onOpenContract,
  onOpenHistory,
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [query, setQuery] = useState('');
  const [band, setBand] = useState('alle');
  const [selectedId, setSelectedId] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);
  const [closed, setClosed] = useState({});
  const counts = useMemo(
    () => queueCounts(contracts, series),
    [contracts, series],
  );
  const rows = useMemo(
    () => queueContracts({ contracts, projects, customers, series, query, band: 'alle' }),
    [contracts, projects, customers, series, query],
  );
  const visible = band === 'alle' ? rows : rows.filter((row) => row.status.band === band);
  const selected = visible.find((row) => row.contract.id === selectedId) || rows.find((row) => row.contract.id === selectedId) || visible[0] || null;
  const followUp = counts.ma_vurderes;

  function choose(row) {
    setSelectedId(row.contract.id);
    if (!wide) setMobileDetail(true);
  }

  const showList = wide || !mobileDetail;
  const showPreview = wide || mobileDetail;

  return (
    <View nativeID="economy-desk" style={styles.page}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.title, { color: colors.ink }]}>
            Indeksregulering{followUp ? ` · ${followUp} til oppfølging` : ''}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Avtaler som kan reguleres etter vilkår og publisert indeks. Ingenting sendes eller lagres herfra.
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {QUEUE_BANDS.map((item) => {
          const on = band === item.id;
          const count = counts[item.id] || 0;
          return (
            <TouchableOpacity
              key={item.id}
              nativeID={`index-status-${item.id}`}
              onPress={() => { setBand(item.id); setMobileDetail(false); }}
              style={[styles.filter, {
                borderColor: on ? colors.brand : colors.line,
                backgroundColor: on ? colors.brandSoft || '#E8F6FE' : colors.card,
              }]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '700', fontSize: 13 }}>
                {item.label} {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.split, { flexDirection: wide ? 'row' : 'column' }]}>
        {showList ? (
          <View nativeID="index-contract-list" style={[styles.listCol, { width: wide ? 420 : '100%', borderColor: colors.line, backgroundColor: colors.card }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Søk i prosjekt, oppdragsgiver og avtale"
              placeholderTextColor={colors.placeholder}
              style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {!visible.length ? (
                <Text style={{ color: colors.muted, padding: 12 }}>Ingen avtaler i dette utvalget.</Text>
              ) : null}
              {groupRows(visible, band).map((group) => {
                const open = closed[group.id] !== true;
                return (
                  <View key={group.id}>
                    <TouchableOpacity
                      onPress={() => setClosed((current) => ({ ...current, [group.id]: open }))}
                      style={styles.groupHead}
                    >
                      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
                      <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>{group.label}</Text>
                      <Text style={{ color: colors.muted }}>{group.rows.length}</Text>
                    </TouchableOpacity>
                    {open ? group.rows.map((row) => {
                      const on = selected?.contract.id === row.contract.id;
                      const meta = QUEUE_BANDS.find((item) => item.id === row.status.band);
                      return (
                        <TouchableOpacity
                          key={row.contract.id}
                          onPress={() => choose(row)}
                          style={[styles.item, {
                            borderColor: on ? colors.brand : 'transparent',
                            backgroundColor: on ? (colors.brandSoft || '#E8F6FE') : 'transparent',
                          }]}
                        >
                          <View style={styles.itemTop}>
                            <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                              {[row.project?.number || row.contract.oppdragId, row.contract.title].filter(Boolean).join(' · ')}
                            </Text>
                            {row.status.attention ? (
                              <Ionicons name="alert-circle" size={16} color={toneColor(meta?.tone, colors)} />
                            ) : null}
                          </View>
                          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                            {[row.contract.buyer, kindLabel(row.contract.kind) || row.status.draft?.standard].filter(Boolean).join(' · ')}
                          </Text>
                          <View style={styles.itemTop}>
                            <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }}>
                              {row.status.allowed ? `Neste ${row.status.allowed.split('-').reverse().join('.')}` : 'Dato ikke fastsatt'}
                            </Text>
                            <Pill label={row.status.label} tone={meta?.tone || 'muted'} colors={colors} />
                          </View>
                        </TouchableOpacity>
                      );
                    }) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {showPreview && selected ? (
          <Preview
            row={selected}
            series={series}
            colors={colors}
            onBack={!wide ? () => setMobileDetail(false) : null}
            onOpenIndex={() => onOpenIndex?.(selected.contract)}
            onOpenContract={() => onOpenContract?.(selected.contract.id)}
            onOpenHistory={() => onOpenHistory?.(selected.contract)}
          />
        ) : null}
        {showPreview && !selected ? (
          <View nativeID="index-preview" style={[styles.preview, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.muted }}>Velg en avtale i listen.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function groupRows(rows, band) {
  if (band !== 'alle') {
    const meta = QUEUE_BANDS.find((item) => item.id === band);
    return [{ id: band, label: meta?.label || 'Avtaler', rows }];
  }
  const order = [...QUEUE_BANDS.map((item) => item.id), 'ikke_aktuell'];
  return order.map((id) => ({
    id,
    label: QUEUE_BANDS.find((item) => item.id === id)?.label || 'Ikke aktuell',
    rows: rows.filter((row) => row.status.band === id),
  })).filter((group) => group.rows.length);
}

function Preview({ row, series, colors, onBack, onOpenIndex, onOpenContract, onOpenHistory }) {
  const { contract, project, status } = row;
  const draft = status.draft;
  const chain = status.chain;
  const math = useMemo(() => {
    if (!draft?.indexId || status.band === 'ikke_aktuell') return null;
    return computeRegulation({
      draft,
      series,
      cases: contract.indexCases || [],
      regulations: contract.regulations || [],
    });
  }, [draft, series, contract, status.band]);
  const standard = standardById(draft?.standard);
  const history = historyRows(contract);
  const ready = math?.ok && !math.provisional && (status.band === 'kan_reguleres' || status.band === 'ma_vurderes');

  return (
    <ScrollView nativeID="index-preview" style={styles.preview} contentContainerStyle={[styles.previewInner, { backgroundColor: colors.bg }]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Tilbake til listen</Text>
        </TouchableOpacity>
      ) : null}
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <View style={styles.itemTop}>
          <Text style={[styles.h, { color: colors.ink, flex: 1 }]}>{contract.title || 'Avtale'}</Text>
          <Pill label={status.label} tone={QUEUE_BANDS.find((item) => item.id === status.band)?.tone || 'muted'} colors={colors} />
        </View>
        <Text style={{ color: colors.muted }}>{status.reason}</Text>
        <View style={styles.grid}>
          <Field label="Prosjekt" value={[project?.number, project?.name].filter(Boolean).join(' · ')} colors={colors} />
          <Field label="Oppdragsgiver" value={contract.buyer} colors={colors} />
          <Field label="Kontakt" value={[draft?.contactName, draft?.email].filter(Boolean).join(' · ')} colors={colors} />
          <Field label="Avtaletype" value={kindLabel(contract.kind)} colors={colors} />
          <Field label="Kontraktsstandard" value={standard?.label || draft?.standard} colors={colors} />
          <Field label="Avtaledato" value={pretty(draft?.contractDate)} colors={colors} />
          <Field label="Avtalt pris eks. mva" value={chain?.originalPrice ? formatKr(chain.originalPrice) : ''} colors={colors} />
          <Field label="Påslag" value={draft?.surchargePercent ? `${draft.surchargePercent} % holdes utenfor` : 'Ingen'} colors={colors} />
        </View>
      </View>

      <View nativeID="index-terms" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>Indeksregulering</Text>
        <View style={styles.grid}>
          <Field label="Tillatt" value={status.band === 'ikke_aktuell' ? 'Nei' : 'Ja, etter avtalen'} colors={colors} />
          <Field label="Modell" value={math?.model?.label || draft?.model} colors={colors} />
          <Field label="SSB-tabell" value={[chain?.table, chain?.name].filter(Boolean).join(' · ')} colors={colors} />
          <Field label="Opprinnelig indeks" value={pointText(chain?.original)} colors={colors} />
          <Field label="Sist benyttet indeks" value={pointText(chain?.previous)} colors={colors} />
          <Field label="Ny indeks" value={pointText(chain?.next) || 'Ikke publisert'} colors={colors} />
          <Field label="Frekvens" value={status.frequencyLabel} colors={colors} />
          <Field label="Neste tillatte dato" value={pretty(status.allowed)} colors={colors} />
          <Field label="Gjeldende pris" value={chain?.previousPrice ? formatKr(chain.previousPrice) : ''} colors={colors} />
          <Field label="Beregnet ny pris" value={math?.ok ? formatKr(math.regulated) : (math?.error || 'Grunnlag mangler')} colors={colors} />
        </View>
        {math?.ok ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {math.provisional ? 'Foreløpig beregning. ' : ''}
            Endring {formatPercentExact(math.changePercent)} ({formatPercent(math.changePercent)}). Beløpet er eks. mva og er ikke lagret.
          </Text>
        ) : null}
        {status.missing?.length ? (
          <Text style={{ color: colors.danger || '#dc2626' }}>Mangler: {status.missing.join(', ')}.</Text>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>Reguleringshistorikk</Text>
        {!history.length ? <Text style={{ color: colors.muted }}>Ingen reguleringssaker er lagret på avtalen.</Text> : null}
        {history.length ? (
          <ScrollView horizontal>
            <View>
              <View style={styles.tr}>
                {['Sak', 'Periode', 'Fra', 'Endring', 'Ny pris', 'Status'].map((label) => (
                  <Text key={label} style={[styles.th, { color: colors.muted }]}>{label}</Text>
                ))}
              </View>
              {history.map((item) => (
                <View key={item.id} style={[styles.tr, { borderTopColor: colors.line, borderTopWidth: 1 }]}>
                  <Text style={[styles.td, { color: colors.ink }]}>{item.number}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{item.period}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{item.from}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{item.change}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{item.price}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{item.status}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={onOpenContract} style={[styles.ghost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Åpne avtale</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => showNode('index-terms')} style={[styles.ghost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Vis reguleringsvilkår</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenHistory} style={[styles.ghost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Vis historikk</Text>
        </TouchableOpacity>
        <TouchableOpacity
          nativeID="economy-open-index"
          onPress={onOpenIndex}
          disabled={!ready && status.band === 'ikke_aktuell'}
          style={[styles.primary, { backgroundColor: colors.brand, opacity: status.band === 'ikke_aktuell' ? 0.45 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Start indeksregulering</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function historyRows(contract) {
  const cases = Array.isArray(contract.indexCases) ? contract.indexCases : [];
  const fromCases = cases.map((row) => ({
    id: row.id,
    number: row.number || row.id,
    period: [periodLabel(row.previousPeriod || row.basisPeriod), periodLabel(row.newPeriod)].filter(Boolean).join('–'),
    from: pretty(row.effectiveFrom) || 'Ikke fastsatt',
    change: Number.isFinite(Number(row.changePercent)) ? formatPercent(row.changePercent) : '–',
    price: row.newPrice ? formatKr(row.newPrice) : '–',
    status: row.mailStatus === 'sendt' ? 'Sendt' : (row.status || ''),
  }));
  const seen = new Set(cases.map((row) => row.id));
  const legacy = (contract.regulations || []).filter((row) => row?.id && !seen.has(row.id)).map((row) => ({
    id: row.id,
    number: row.id,
    period: [periodLabel(row.fromPeriod), periodLabel(row.toPeriod)].filter(Boolean).join('–'),
    from: pretty(row.savedAt),
    change: formatPercent(row.changePercent),
    price: formatKr(row.after),
    status: row.sentAt ? 'Sendt' : 'Lagret',
  }));
  return [...fromCases, ...legacy];
}

function pointText(point) {
  if (!point) return '';
  return `${point.label || periodLabel(point.period)} · ${formatIndex(point.value)}`;
}

function pretty(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

const styles = StyleSheet.create({
  page: { gap: 12, flex: 1 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '700' },
  filters: { gap: 8, paddingBottom: 2 },
  filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  split: { gap: 12, alignItems: 'stretch', flex: 1 },
  listCol: { borderWidth: 1, borderRadius: 16, maxHeight: 760, minHeight: 420 },
  search: { margin: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  item: { marginHorizontal: 8, marginBottom: 6, borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  preview: { flex: 1, minWidth: 0 },
  previewInner: { gap: 12, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  h: { fontSize: 18, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  field: { width: 180, flexGrow: 1, gap: 2 },
  fieldLabel: { fontSize: 12 },
  fieldValue: { fontSize: 14 },
  tr: { flexDirection: 'row', minWidth: 640 },
  th: { width: 110, fontSize: 12, paddingVertical: 6, paddingRight: 8 },
  td: { width: 110, fontSize: 13, paddingVertical: 8, paddingRight: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ghost: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
