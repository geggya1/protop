import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '../../src/economy/invoices.js';
import { emptySale, saleStatusLabel } from '../../src/economy/products.js';
import { deleteSale, upsertSale } from '../../src/economy/opsState.js';
import { salesSummaryForProject } from '../../src/project/projectDashboard.js';
import { showSaveToast } from '../../src/ui/saveToast';

function statusTone(status) {
  if (status === 'invoiced') return { bg: '#dcfce7', fg: '#166534', label: 'Fakturert' };
  return { bg: '#ffedd5', fg: '#9a3412', label: status === 'approved' ? 'Ikke fakturert' : saleStatusLabel(status) };
}

/**
 * Produktsalg på prosjekt — tabell, oppsummering og CRUD.
 */
export default function ProjectSalesTab({
  state,
  project,
  colors,
  isAdmin,
  // Uten Admin: bare egne rader.
  employeeId = '',
  onChangeState,
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState(null);
  const [menuId, setMenuId] = useState('');
  const [error, setError] = useState('');

  const all = useMemo(
    () => (state.sales || []).filter((row) => (
      row.projectId === project.id && (!employeeId || row.employeeId === employeeId)
    )),
    [state.sales, project.id, employeeId],
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((row) => {
      if (status && row.status !== status) return false;
      if (!q) return true;
      return [row.name, row.description, row.sku].join(' ').toLowerCase().includes(q);
    });
  }, [all, query, status]);
  const summary = useMemo(() => salesSummaryForProject(all, project.id), [all, project.id]);

  function openNew() {
    setEditor(emptySale({
      date: new Date().toISOString().slice(0, 10),
      projectId: project.id,
      projectNumber: project.number,
      projectName: project.name,
      customerId: project.customerId || '',
      customerName: project.client || '',
      billable: true,
      status: 'approved',
      name: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
    }));
    setError('');
  }

  function save() {
    if (!editor) return;
    const qty = Number(String(editor.quantity).replace(',', '.')) || 0;
    const unit = Number(String(editor.unitPrice).replace(/\s/g, '').replace(',', '.')) || 0;
    const discount = Number(String(editor.discountPercent || 0).replace(',', '.')) || 0;
    const unitAfter = unit * (1 - discount / 100);
    const result = upsertSale(state, {
      ...editor,
      quantity: qty,
      unitPrice: unitAfter,
      projectId: project.id,
      projectNumber: project.number,
      projectName: project.name,
      discountPercent: discount,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setEditor(null);
    showSaveToast('Produktsalg lagret.');
  }

  function remove(id) {
    const result = deleteSale(state, id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setMenuId('');
    showSaveToast('Salgslinje slettet.');
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
            { id: 'approved', label: 'Ikke fakturert' },
            { id: 'invoiced', label: 'Fakturert' },
            { id: 'draft', label: 'Utkast' },
          ].map((opt) => {
            const on = status === opt.id;
            return (
              <TouchableOpacity
                key={opt.id || 'all'}
                onPress={() => setStatus(opt.id)}
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

      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={[styles.tableHead, { borderColor: colors.line }]}>
          {['Produkt', 'Beskrivelse', 'Antall', 'Enhetspris', 'Rabatt', 'Sum (eks. mva)', 'Margin', 'Status', ''].map((h) => (
            <Text key={h || 'x'} style={[styles.th, { color: colors.muted }]}>{h}</Text>
          ))}
        </View>
        {rows.map((row) => {
          const tone = statusTone(row.status);
          const cost = (Number(row.purchaseUnitPrice) || Number(row.costExVat) || 0) * (Number(row.quantity) || 0);
          const amount = Number(row.amountExVat) || 0;
          const margin = amount > 0 ? Math.round(((amount - cost) / amount) * 100) : 0;
          return (
            <View key={row.id} style={[styles.tableRow, { borderColor: colors.line }]}>
              <Text style={[styles.td, { color: colors.ink, fontWeight: '600' }]} numberOfLines={1}>{row.name}</Text>
              <Text style={[styles.td, { color: colors.muted }]} numberOfLines={1}>{row.description || '—'}</Text>
              <Text style={[styles.td, { color: colors.ink }]}>{row.quantity}</Text>
              <Text style={[styles.td, { color: colors.ink }]}>{formatMoney(row.unitPrice)}</Text>
              <Text style={[styles.td, { color: colors.ink }]}>{row.discountPercent != null ? `${row.discountPercent}%` : '—'}</Text>
              <Text style={[styles.td, { color: colors.ink, fontWeight: '600' }]}>{formatMoney(amount)}</Text>
              <Text style={[styles.td, { color: colors.ink }]}>{margin}%</Text>
              <View style={styles.td}>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={{ color: tone.fg, fontSize: 11, fontWeight: '600' }}>{tone.label}</Text>
                </View>
              </View>
              <View style={styles.td}>
                {isAdmin ? (
                  <TouchableOpacity onPress={() => setMenuId(menuId === row.id ? '' : row.id)}>
                    <Ionicons name="ellipsis-vertical" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {menuId === row.id ? (
                <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  <TouchableOpacity onPress={() => { setEditor({ ...row, discountPercent: row.discountPercent || 0 }); setMenuId(''); }} style={styles.menuItem}>
                    <Text style={{ color: colors.ink }}>Rediger</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(row.id)} style={styles.menuItem}>
                    <Text style={{ color: colors.danger || '#b42318' }}>Slett</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}
        {!rows.length ? <Text style={{ color: colors.muted, paddingVertical: 16 }}>Ingen produktsalg på prosjektet.</Text> : null}
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard colors={colors} title="Totalt produktsalg" value={formatMoney(summary.total)} sub="Eks. mva" tone="#dbeafe" />
        <SummaryCard colors={colors} title="Fakturert" value={formatMoney(summary.billed)} sub={`${summary.billedCount} produkter`} tone="#dcfce7" />
        <SummaryCard colors={colors} title="Ikke fakturert" value={formatMoney(summary.unbilled)} sub={`${summary.unbilledCount} produkter`} tone="#ffedd5" />
        <SummaryCard colors={colors} title="Snittmargin" value={`${summary.margin}%`} sub="På prosjektet" tone="#dcfce7" />
      </View>

      <Modal transparent visible={!!editor} animationType="fade" onRequestClose={() => setEditor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditor(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>{editor?.id ? 'Rediger produktsalg' : 'Nytt produktsalg'}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {[
                ['name', 'Produkt'],
                ['description', 'Beskrivelse'],
                ['quantity', 'Antall'],
                ['unitPrice', 'Enhetspris eks. mva'],
                ['discountPercent', 'Rabatt %'],
                ['purchaseUnitPrice', 'Kostpris eks. mva'],
              ].map(([key, label]) => (
                <View key={key}>
                  <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 4, fontSize: 12 }}>{label}</Text>
                  <TextInput
                    value={editor ? String(editor[key] ?? '') : ''}
                    onChangeText={(v) => setEditor((e) => ({ ...e, [key]: v }))}
                    keyboardType={key === 'name' || key === 'description' ? 'default' : 'numeric'}
                    style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                  />
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setEditor(null)} style={[styles.ghost, { borderColor: colors.line, flex: 1, alignItems: 'center' }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={[styles.primary, { backgroundColor: colors.brand, flex: 1, alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  panel: { borderWidth: 1, borderRadius: 12, padding: 12 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 8, gap: 6 },
  tableRow: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 6, alignItems: 'center' },
  th: { flex: 1, fontSize: 11 },
  td: { flex: 1, fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  menu: { width: '100%', borderWidth: 1, borderRadius: 8, padding: 6 },
  menuItem: { paddingVertical: 8 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summary: { flexGrow: 1, flexBasis: 160, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  summaryIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 12, padding: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  ghost: { borderWidth: 1, borderRadius: 8, paddingVertical: 10 },
});
