import React, { useMemo, useState } from 'react';
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
import ProductSaleSheet from '../sales/ProductSaleSheet';
import SaleStatusBadge from '../sales/SaleStatusBadge';
import { formatMoney } from '../../src/economy/invoices.js';
import { emptySale } from '../../src/economy/products.js';
import { deleteSale, upsertSale } from '../../src/economy/opsState.js';
import { replaceSaleInState } from '../../src/economy/productSaleEdit.js';
import { removeSale, saveSaleChange } from '../../src/economy/productSaleSave.js';
import { isExternalSale } from '../../src/economy/productSalesStorage.js';
import { saleIsLocked, sortProductSales } from '../../src/economy/productSalesView.js';
import { salesSummaryForProject } from '../../src/project/projectDashboard.js';
import { showSaveToast } from '../../src/ui/saveToast';

const COLUMNS = [
  { key: 'date', label: 'Dato', width: 96, sort: 'date' },
  { key: 'name', label: 'Produkt', width: 220, flex: 2, sort: 'name' },
  { key: 'quantity', label: 'Antall', width: 80, num: true, sort: 'quantity' },
  { key: 'unitPrice', label: 'Enhetspris', width: 110, num: true },
  { key: 'discount', label: 'Rabatt', width: 70, num: true },
  { key: 'amount', label: 'Sum eks. mva', width: 120, num: true, sort: 'amount' },
  { key: 'margin', label: 'Margin', width: 70, num: true },
  { key: 'employee', label: 'Medarbeider', width: 140, sort: 'employee' },
  { key: 'status', label: 'Status', width: 112, sort: 'status' },
];
const MIN_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, 28);

function cellBox(col) {
  return col.flex ? { flex: col.flex, minWidth: col.width } : { width: col.width };
}

function rowMargin(row) {
  const cost = (Number(row.purchaseUnitPrice) || Number(row.costExVat) || 0) * (Number(row.quantity) || 0);
  const amount = Number(row.amountExVat) || 0;
  if (!(amount > 0) || !(cost > 0)) return '—';
  return `${Math.round(((amount - cost) / amount) * 100)}%`;
}

/**
 * Produktsalg på prosjekt: alle salg koblet til prosjektet, også importerte.
 * Et trykk på en rad åpner salget. Fakturert salg er låst.
 */
export default function ProjectSalesTab({
  state,
  project,
  // Salg på prosjektet fra prosjektstate og importen. Uten listen brukes prosjektstate.
  sales,
  salesReady = true,
  employees = [],
  customers = [],
  familyId = '',
  colors,
  isAdmin,
  // Uten Admin: bare egne rader.
  employeeId = '',
  onChangeState,
  onOpenInvoice,
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [opened, setOpened] = useState(null);
  const [boxWidth, setBoxWidth] = useState(0);

  const all = useMemo(
    () => (sales || (state.sales || []).filter((row) => row.projectId === project.id))
      .filter((row) => !employeeId || row.employeeId === employeeId),
    [sales, state.sales, project.id, employeeId],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = all.filter((row) => {
      if (status === 'open' && row.status === 'invoiced') return false;
      if (status && status !== 'open' && row.status !== status) return false;
      if (!q) return true;
      return [row.name, row.title, row.sku, row.employeeName, row.customerName, row.date].join(' ').toLowerCase().includes(q);
    });
    return sortProductSales(hits, sort);
  }, [all, query, status, sort]);
  const summary = useMemo(() => salesSummaryForProject(all, project.id), [all, project.id]);
  // Panelet viser alltid siste versjon av salget, også etter lagring.
  const current = useMemo(() => {
    if (!opened) return null;
    if (opened.isNew) return opened.sale;
    return all.find((row) => row.id === opened.sale.id) || opened.sale;
  }, [opened, all]);

  function openNew() {
    setOpened({
      isNew: true,
      sale: emptySale({
        date: new Date().toISOString().slice(0, 10),
        projectId: project.id,
        projectNumber: project.number,
        projectName: project.name,
        customerId: project.customerId || '',
        customerName: project.client || '',
        billable: true,
        status: 'approved',
      }),
    });
  }

  function toggleSort(key) {
    setSort((now) => (now.key === key
      ? { key, dir: now.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'date' || key === 'amount' || key === 'quantity' ? 'desc' : 'asc' }));
  }

  async function save(next) {
    if (opened?.isNew) {
      const result = upsertSale(state, next);
      if (!result.ok) return result;
      onChangeState(result.state);
      showSaveToast('Produktsalg lagret.');
      return result;
    }
    if (isExternalSale(next)) {
      const result = await saveSaleChange(familyId, next);
      if (result.ok) showSaveToast('Produktsalg lagret.');
      return result;
    }
    const result = replaceSaleInState(state, next);
    if (!result.ok) return result;
    onChangeState(result.state);
    showSaveToast('Produktsalg lagret.');
    return result;
  }

  async function remove(sale) {
    if (isExternalSale(sale)) {
      const result = await removeSale(familyId, sale);
      if (!result.ok) return result;
    } else {
      const result = deleteSale(state, sale.id);
      if (!result.ok) return result;
      onChangeState(result.state);
    }
    setOpened(null);
    showSaveToast('Salgslinje slettet.');
    return { ok: true };
  }

  return (
    <View style={styles.wrap} nativeID="project-sales-tab">
      <View style={styles.toolbar}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Søk i produkter..."
          placeholderTextColor={colors.muted}
          style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <View style={styles.chipRow}>
          {[
            { id: '', label: 'Alle status' },
            { id: 'open', label: 'Ikke fakturert' },
            { id: 'invoiced', label: 'Fakturert' },
            { id: 'draft', label: 'Utkast' },
          ].map((opt) => {
            const on = status === opt.id;
            return (
              <TouchableOpacity
                key={opt.id || 'all'}
                onPress={() => setStatus(opt.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
              >
                <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 12 }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {isAdmin ? (
          <TouchableOpacity onPress={openNew} style={[styles.primary, { backgroundColor: colors.brand }]} nativeID="project-sale-add">
            <Text style={{ color: '#fff', fontWeight: '700' }}>+ Nytt produktsalg</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard colors={colors} title="Totalt produktsalg" value={formatMoney(summary.total)} sub={`${summary.count} salg · eks. mva`} tone="#dbeafe" />
        <SummaryCard colors={colors} title="Fakturert" value={formatMoney(summary.billed)} sub={`${summary.billedCount} salg`} tone="#dcfce7" />
        <SummaryCard colors={colors} title="Ikke fakturert" value={formatMoney(summary.unbilled)} sub={`${summary.unbilledCount} salg`} tone="#ffedd5" />
        <SummaryCard colors={colors} title="Snittmargin" value={`${summary.margin}%`} sub="På prosjektet" tone="#dcfce7" />
      </View>

      <View onLayout={(event) => setBoxWidth(event?.nativeEvent?.layout?.width || 0)}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View
            nativeID="project-sales-table"
            style={[styles.panel, { width: Math.max(MIN_WIDTH, boxWidth), backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <View style={[styles.tableRow, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
              {COLUMNS.map((col) => {
                const on = col.sort && sort.key === col.sort;
                return (
                  <TouchableOpacity
                    key={col.key}
                    disabled={!col.sort}
                    onPress={() => toggleSort(col.sort)}
                    accessibilityRole={col.sort ? 'button' : undefined}
                    accessibilityLabel={col.sort ? `Sorter på ${col.label}` : undefined}
                    style={[styles.cell, styles.head, cellBox(col), col.num ? { justifyContent: 'flex-end' } : null]}
                  >
                    <Text style={{ color: on ? colors.ink : colors.muted, fontSize: 11, fontWeight: '600' }}>{col.label}</Text>
                    {on ? <Ionicons name={sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={11} color={colors.ink} /> : null}
                  </TouchableOpacity>
                );
              })}
              <View style={{ width: 28 }} />
            </View>
            {rows.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => setOpened({ isNew: false, sale: row })}
                accessibilityRole="button"
                accessibilityLabel={`Åpne salg ${row.name}`}
                nativeID={`project-sale-${row.id}`}
                style={({ hovered }) => [
                  styles.tableRow,
                  { borderBottomColor: colors.line },
                  hovered ? { backgroundColor: colors.sunken || colors.bg } : null,
                ]}
              >
                <Text style={[styles.cell, cellBox(COLUMNS[0]), { color: colors.ink }]}>{row.date || '—'}</Text>
                <View style={[styles.cell, cellBox(COLUMNS[1])]}>
                  <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>{row.name}</Text>
                  {row.title && row.title !== row.name ? (
                    <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={2}>{row.title}</Text>
                  ) : null}
                </View>
                <Text style={[styles.cell, styles.num, cellBox(COLUMNS[2]), { color: colors.ink }]}>{`${row.quantity} ${row.unit || 'stk'}`}</Text>
                <Text style={[styles.cell, styles.num, cellBox(COLUMNS[3]), { color: colors.ink }]}>{formatMoney(row.unitPrice)}</Text>
                <Text style={[styles.cell, styles.num, cellBox(COLUMNS[4]), { color: colors.ink }]}>{row.discountPercent ? `${row.discountPercent}%` : '—'}</Text>
                <Text style={[styles.cell, styles.num, cellBox(COLUMNS[5]), { color: colors.ink, fontWeight: '600' }]}>{formatMoney(row.amountExVat)}</Text>
                <Text style={[styles.cell, styles.num, cellBox(COLUMNS[6]), { color: colors.ink }]}>{rowMargin(row)}</Text>
                <Text style={[styles.cell, cellBox(COLUMNS[7]), { color: colors.ink }]} numberOfLines={1}>{row.employeeName || '—'}</Text>
                <View style={[styles.cell, cellBox(COLUMNS[8])]}>
                  <SaleStatusBadge status={row.status} colors={colors} />
                </View>
                <View style={{ width: 28, alignItems: 'center' }}>
                  <Ionicons name={saleIsLocked(row) ? 'lock-closed-outline' : 'chevron-forward'} size={14} color={colors.muted} />
                </View>
              </Pressable>
            ))}
            {!rows.length ? (
              <Text style={{ color: colors.muted, padding: 16 }}>
                {!salesReady ? 'Henter produktsalg…' : all.length ? 'Ingen produktsalg treffer søket.' : 'Ingen produktsalg på prosjektet.'}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </View>

      <ProductSaleSheet
        sale={current}
        isNew={!!opened?.isNew}
        colors={colors}
        projects={state.projects || []}
        customers={customers}
        employees={employees}
        canEdit={!!isAdmin}
        canDelete={!!isAdmin}
        onSave={save}
        onDelete={remove}
        onOpenInvoice={onOpenInvoice}
        onClose={() => setOpened(null)}
      />
    </View>
  );
}

function SummaryCard({ colors, title, value, sub, tone }) {
  return (
    <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={[styles.summaryIcon, { backgroundColor: tone }]}>
        <Ionicons name="cube-outline" size={18} color={colors.brand} />
      </View>
      <View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{title}</Text>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>{value}</Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  toolbar: { gap: 8 },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  primary: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  panel: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cell: { paddingHorizontal: 8, paddingVertical: 9, fontSize: 12 },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summary: { flexGrow: 1, flexBasis: 160, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  summaryIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
