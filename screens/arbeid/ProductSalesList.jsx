import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../../components/OptionPicker';
import SaleStatusBadge from '../../components/sales/SaleStatusBadge';
import { formatMoney } from '../../src/economy/invoices.js';
import { SALE_STATUSES } from '../../src/economy/products.js';
import { saleIsLocked, saleProjectLabel, saleTotals } from '../../src/economy/productSalesView.js';
import { formatDate } from '../../src/format/nb';

// flex: kolonnen tar resten av bredden, med width som minste bredde.
const COLUMNS = [
  { key: 'date', label: 'Dato', width: 104 },
  { key: 'name', label: 'Produkt', width: 240, flex: 2 },
  { key: 'quantity', label: 'Antall', width: 84, num: true },
  { key: 'customer', label: 'Kunde', width: 170, flex: 1 },
  { key: 'project', label: 'Prosjekt', width: 200, flex: 1.2 },
  { key: 'employee', label: 'Medarbeider', width: 140 },
  { key: 'amount', label: 'Beløp inkl. mva', width: 130, num: true },
  { key: 'status', label: 'Status', width: 116 },
];
const OPEN_WIDTH = 28;
const MIN_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, OPEN_WIDTH);

function dash(value) {
  const text = String(value || '').trim();
  return text || '—';
}

function qty(row) {
  const n = Number(row.quantity) || 0;
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
  return `${shown} ${row.unit || 'stk'}`;
}

function cellBox(col) {
  return col.flex ? { flex: col.flex, minWidth: col.width } : { width: col.width };
}

function ProjectCell({ row, colors, col, onOpenProject }) {
  const label = saleProjectLabel(row);
  if (!label) return <Text style={[styles.cell, cellBox(col), { color: colors.muted }]}>—</Text>;
  if (!row.projectId || !onOpenProject) {
    return <Text style={[styles.cell, cellBox(col), { color: colors.ink }]} numberOfLines={3}>{label}</Text>;
  }
  return (
    <View style={[styles.cell, cellBox(col)]}>
      <TouchableOpacity
        onPress={() => onOpenProject(row.projectId)}
        accessibilityRole="link"
        accessibilityLabel={`Åpne prosjekt ${label}`}
        nativeID={`produktsalg-prosjekt-${row.id}`}
      >
        <Text style={{ color: colors.brand, fontSize: 13 }} numberOfLines={3}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SortHead({ col, sort, onSort, colors }) {
  const on = sort?.key === col.key;
  const arrow = on ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : null;
  return (
    <TouchableOpacity
      onPress={() => onSort?.(col.key)}
      disabled={!onSort}
      accessibilityRole="button"
      accessibilityLabel={`Sorter på ${col.label}`}
      accessibilityState={{ selected: on }}
      nativeID={`produktsalg-sort-${col.key}`}
      style={[styles.cell, styles.head, cellBox(col), col.num ? { justifyContent: 'flex-end' } : null]}
    >
      <Text style={{ color: on ? colors.ink : colors.muted, fontWeight: '600', fontSize: 12 }}>{col.label}</Text>
      {arrow ? <Ionicons name={arrow} size={12} color={colors.ink} /> : null}
    </TouchableOpacity>
  );
}

function SaleRow({ row, colors, onOpen, onOpenProject }) {
  const locked = saleIsLocked(row);
  return (
    <Pressable
      onPress={() => onOpen?.(row)}
      accessibilityRole="button"
      accessibilityLabel={`Åpne salg ${row.name} ${formatDate(row.date, { empty: '' })}`}
      nativeID={`produktsalg-row-${row.id}`}
      style={({ hovered }) => [
        styles.line,
        { borderBottomColor: colors.line },
        hovered ? { backgroundColor: colors.sunken || colors.bg } : null,
      ]}
    >
      <Text style={[styles.cell, cellBox(COLUMNS[0]), { color: colors.ink }]}>{formatDate(row.date, { empty: '—' })}</Text>
      <View style={[styles.cell, cellBox(COLUMNS[1])]}>
        <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
        {row.sku ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.sku}</Text> : null}
        {row.title && row.title !== row.name ? (
          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{row.title}</Text>
        ) : null}
      </View>
      <Text style={[styles.cell, styles.num, cellBox(COLUMNS[2]), { color: colors.ink }]}>{qty(row)}</Text>
      <Text style={[styles.cell, cellBox(COLUMNS[3]), { color: colors.ink }]} numberOfLines={2}>{dash(row.customerName)}</Text>
      <ProjectCell row={row} colors={colors} col={COLUMNS[4]} onOpenProject={onOpenProject} />
      <Text style={[styles.cell, cellBox(COLUMNS[5]), { color: colors.ink }]} numberOfLines={2}>{dash(row.employeeName)}</Text>
      <Text style={[styles.cell, styles.num, cellBox(COLUMNS[6]), { color: colors.ink }]}>{formatMoney(row.amountInclVat)}</Text>
      <View style={[styles.cell, cellBox(COLUMNS[7])]}>
        <SaleStatusBadge status={row.status} colors={colors} />
      </View>
      <View style={[styles.cell, { width: OPEN_WIDTH, paddingHorizontal: 0 }]}>
        <Ionicons
          name={locked ? 'lock-closed-outline' : 'chevron-forward'}
          size={14}
          color={colors.muted}
          accessibilityLabel={locked ? 'Låst' : undefined}
        />
      </View>
    </Pressable>
  );
}

function SaleCard({ row, colors, onOpen }) {
  const project = saleProjectLabel(row);
  return (
    <Pressable
      onPress={() => onOpen?.(row)}
      accessibilityRole="button"
      nativeID={`produktsalg-row-${row.id}`}
      style={[styles.card, { borderBottomColor: colors.line }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }} numberOfLines={1}>{row.name}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
          {[formatDate(row.date, { empty: '' }), row.customerName].filter(Boolean).join(' · ')}
        </Text>
        {project ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{project}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.num, { color: colors.ink, fontWeight: '600' }]}>{formatMoney(row.amountInclVat)}</Text>
        <SaleStatusBadge status={row.status} colors={colors} />
      </View>
    </Pressable>
  );
}

export function ProductSalesList({
  colors,
  ready = true,
  rows = [],
  totalCount = 0,
  query = '',
  onQuery,
  status = '',
  onStatus,
  counts = null,
  project = '',
  onProject,
  customer = '',
  onCustomer,
  filterOptions = null,
  sort = { key: 'date', dir: 'desc' },
  onSort,
  limit = rows.length,
  onMore,
  onShowAll,
  onOpen,
  onOpenProject,
  onExport,
  exporting = false,
  narrow = false,
}) {
  const [boxWidth, setBoxWidth] = useState(0);
  const totals = saleTotals(rows);
  const filters = [{ id: '', label: 'Alle' }, ...SALE_STATUSES];
  const shown = rows.slice(0, Math.max(0, limit));
  const projectOptions = filterOptions?.projects || [];
  const customerOptions = filterOptions?.customers || [];
  const filtered = !!(query || status || project || customer);
  return (
    <View style={styles.stack} nativeID="produktsalg-liste">
      <View style={styles.toolbar}>
        <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            nativeID="produktsalg-search"
            value={query}
            onChangeText={onQuery}
            placeholder="Søk i produkt, varenr, kunde, prosjekt eller dato"
            placeholderTextColor={colors.placeholder || colors.muted}
            accessibilityLabel="Søk i produktsalg"
            style={[styles.searchInput, { color: colors.ink }]}
          />
        </View>
        {projectOptions.length ? (
          <View style={styles.picker} nativeID="produktsalg-filter-prosjekt">
            <OptionPicker
              options={projectOptions}
              value={project}
              onChange={(id) => onProject?.(id || '')}
              placeholder="Alle prosjekter"
              clearLabel="Alle prosjekter"
              chipLimit={0}
              title="Prosjekt"
              accessibilityLabel="Filtrer på prosjekt"
            />
          </View>
        ) : null}
        {customerOptions.length ? (
          <View style={styles.picker} nativeID="produktsalg-filter-kunde">
            <OptionPicker
              options={customerOptions}
              value={customer}
              onChange={(id) => onCustomer?.(id || '')}
              placeholder="Alle kunder"
              clearLabel="Alle kunder"
              chipLimit={0}
              title="Kunde"
              accessibilityLabel="Filtrer på kunde"
            />
          </View>
        ) : null}
        {onExport ? (
          <TouchableOpacity
            onPress={onExport}
            disabled={exporting || !rows.length}
            accessibilityRole="button"
            accessibilityLabel="Eksporter til Excel"
            nativeID="produktsalg-eksport"
            style={[styles.exportBtn, { borderColor: colors.line, backgroundColor: colors.card, opacity: exporting || !rows.length ? 0.55 : 1 }]}
          >
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{exporting ? 'Eksporterer…' : 'Eksporter til Excel'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.chips}>
        {filters.map((row) => {
          const on = status === row.id;
          const count = counts ? counts[row.id || 'all'] : null;
          return (
            <TouchableOpacity
              key={row.id || 'all'}
              nativeID={`produktsalg-status-${row.id || 'all'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onStatus?.(row.id)}
              style={[styles.chip, {
                borderColor: on ? colors.brand : colors.line,
                backgroundColor: on ? `${colors.brand}18` : colors.card,
              }]}
            >
              <Text style={{ color: colors.ink, fontSize: 13 }}>
                {row.label}
                {count != null ? <Text style={{ color: colors.muted }}>{` ${count}`}</Text> : null}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="produktsalg-summary">
        {!ready
          ? 'Henter produktsalg…'
          : !totalCount
            ? 'Ingen produktsalg er registrert ennå.'
            : `${rows.length === totalCount && !filtered ? `${totalCount} salg` : `${rows.length} av ${totalCount}`} · ${formatMoney(totals.inclVat)} inkl. mva · ${formatMoney(totals.exVat)} eks. mva`}
      </Text>
      {!ready ? null : !totalCount ? (
        <Text style={{ color: colors.muted }} nativeID="produktsalg-empty">
          Når et produkt registreres under Produkt og selges til en kunde, vises salget i tabellen. Salg fra timelisten kommer også hit.
        </Text>
      ) : !rows.length ? (
        <Text style={{ color: colors.muted }} nativeID="produktsalg-no-hits">
          Ingen produktsalg treffer søket.
        </Text>
      ) : narrow ? (
        <View nativeID="produktsalg-table" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {shown.map((row) => (
            <SaleCard key={row.id || `${row.date}-${row.name}`} row={row} colors={colors} onOpen={onOpen} />
          ))}
        </View>
      ) : (
        <View onLayout={(event) => setBoxWidth(event?.nativeEvent?.layout?.width || 0)}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View
              nativeID="produktsalg-table"
              accessibilityRole="table"
              style={[styles.table, { width: Math.max(MIN_WIDTH, boxWidth), borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <View style={[styles.line, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}>
                {COLUMNS.map((col) => (
                  <SortHead key={col.key} col={col} sort={sort} onSort={onSort} colors={colors} />
                ))}
                <View style={{ width: OPEN_WIDTH }} />
              </View>
              {shown.map((row) => (
                <SaleRow
                  key={row.id || `${row.date}-${row.name}`}
                  row={row}
                  colors={colors}
                  onOpen={onOpen}
                  onOpenProject={onOpenProject}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      {ready && rows.length > shown.length ? (
        <View style={styles.more} nativeID="produktsalg-mer">
          <Text style={{ color: colors.muted, fontSize: 13 }}>{`Viser ${shown.length} av ${rows.length}`}</Text>
          {onMore ? (
            <TouchableOpacity onPress={onMore} accessibilityRole="button" style={[styles.moreBtn, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 13 }}>Vis flere</Text>
            </TouchableOpacity>
          ) : null}
          {onShowAll ? (
            <TouchableOpacity onPress={onShowAll} accessibilityRole="button" style={styles.moreLink}>
              <Text style={{ color: colors.brand, fontSize: 13 }}>Vis alle</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  search: { flexGrow: 1, flexShrink: 1, flexBasis: 320, maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, minHeight: 40 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  picker: { flexBasis: 220, flexGrow: 0, flexShrink: 1, minWidth: 180 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, minHeight: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  table: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  line: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cell: { paddingHorizontal: 10, paddingVertical: 10, fontSize: 13 },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  more: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  moreBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  moreLink: { paddingVertical: 8 },
});
