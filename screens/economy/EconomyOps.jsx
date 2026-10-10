/**
 * Økonomi · Utlegg / Kjørebok / Produkter — registrering, godkjenning, CSV.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { formatMoney } from '../../src/economy/invoices.js';
import {
  EXPENSE_CATEGORIES,
  emptyExpense,
  expensesToCsv,
} from '../../src/economy/expenses.js';
import {
  MILEAGE_RATE_TAX_FREE,
  TRIP_PURPOSES,
  emptyTrip,
  tripsToCsv,
  yearlyDutyKm,
} from '../../src/economy/mileage.js';
import {
  PRODUCT_KINDS,
  emptyProduct,
  productsToCsv,
  saleFromProduct,
} from '../../src/economy/products.js';
import {
  setExpenseStatus,
  setSaleStatus,
  setTripStatus,
  upsertExpense,
  upsertProduct,
  upsertSale,
  upsertTrip,
} from '../../src/economy/opsState.js';

function downloadCsv(name, csv) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Field({ label, value, onChange, colors, placeholder, keyboardType }) {
  return (
    <View style={{ minWidth: 140, flexGrow: 1, flexBasis: 160 }}>
      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType || 'default'}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function Chip({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, {
        borderColor: active ? colors.brand : colors.line,
        backgroundColor: active ? `${colors.brand}18` : colors.card,
      }]}
    >
      <Text style={{ color: colors.ink, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function EconomyOps({ kind = 'expenses' }) {
  const colors = useColors();
  const { familyId, requestShellTab } = useApp();
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState(kind === 'produkter' || kind === 'products' ? 'catalog' : 'list');

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (ready) saveProjectState(state, familyId).catch(() => {});
  }, [state, ready, familyId]);

  const title = kind === 'mileage' ? 'Kjørebok' : kind === 'products' ? 'Produkter og varesalg' : 'Utlegg';
  const expenses = state.expenses || [];
  const trips = state.mileageTrips || [];
  const products = state.products || [];
  const sales = state.sales || [];
  const dutyKm = useMemo(() => yearlyDutyKm(trips, new Date().getFullYear()), [trips]);

  function apply(result) {
    setError(result.ok ? '' : result.error);
    setNote(result.ok ? 'Lagret.' : '');
    if (result.ok) setState(result.state);
    return result.ok;
  }

  function saveExpense() {
    apply(upsertExpense(state, {
      ...emptyExpense(draft),
      date: draft.date || new Date().toISOString().slice(0, 10),
    }));
  }

  function saveTrip() {
    apply(upsertTrip(state, {
      ...emptyTrip(draft),
      date: draft.date || new Date().toISOString().slice(0, 10),
      notes: draft.notes || draft.purposeText || '',
    }));
  }

  function saveProduct() {
    apply(upsertProduct(state, emptyProduct(draft)));
  }

  function sellProduct(product) {
    apply(upsertSale(state, saleFromProduct(product, {
      date: new Date().toISOString().slice(0, 10),
      quantity: Number(draft.quantity) || 1,
      customerName: draft.customerName || '',
      customerNumber: draft.customerNumber || '',
      projectName: draft.projectName || '',
      projectNumber: draft.projectNumber || '',
    })));
  }

  if (!ready) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Laster…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: colors.bg }]} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {kind === 'expenses' ? (
        <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 720 }}>
          Ansattutlegg med kategori, MVA og viderefakturering. Kvittering kreves over 1 000 kr ved innsatsfaktor (bokføringsforskriften).
        </Text>
      ) : null}
      {kind === 'mileage' ? (
        <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 720 }}>
          Yrkeskjøring med fra/til, formål og km. Sats 2026: {MILEAGE_RATE_TAX_FREE.toFixed(2)} kr/km (skattefri). I år: {dutyKm} km yrkeskjøring
          {dutyKm >= 6000 ? ' — over 6 000 km: vurder faktiske bilutgifter.' : '.'}
        </Text>
      ) : null}
      {kind === 'products' ? (
        <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 720 }}>
          Produktkatalog og stykk-salg mot kunde/prosjekt. Godkjente linjer havner i Fakturagrunnlag.
        </Text>
      ) : null}

      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}

      {kind === 'products' ? (
        <View style={styles.row}>
          <Chip label="Katalog" active={tab === 'catalog'} onPress={() => setTab('catalog')} colors={colors} />
          <Chip label="Salg" active={tab === 'sales'} onPress={() => setTab('sales')} colors={colors} />
        </View>
      ) : null}

      {kind === 'expenses' ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 8 }}>Nytt utlegg</Text>
          <View style={styles.row}>
            <Field label="Dato" value={draft.date || ''} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} colors={colors} placeholder="ÅÅÅÅ-MM-DD" />
            <Field label="Beløp eks. mva" value={String(draft.amountExVat ?? '')} onChange={(v) => setDraft((d) => ({ ...d, amountExVat: v }))} colors={colors} keyboardType="decimal-pad" />
            <Field label="Beskrivelse" value={draft.description || ''} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} colors={colors} />
            <Field label="Formål" value={draft.purpose || ''} onChange={(v) => setDraft((d) => ({ ...d, purpose: v }))} colors={colors} />
            <Field label="Kvittering (URI)" value={draft.receiptUri || ''} onChange={(v) => setDraft((d) => ({ ...d, receiptUri: v }))} colors={colors} placeholder="fil:// eller https://" />
            <Field label="Påslag %" value={String(draft.markupPercent ?? '')} onChange={(v) => setDraft((d) => ({ ...d, markupPercent: v }))} colors={colors} keyboardType="decimal-pad" />
            <Field label="Kunde" value={draft.customerName || ''} onChange={(v) => setDraft((d) => ({ ...d, customerName: v }))} colors={colors} />
            <Field label="Prosjekt" value={draft.projectName || ''} onChange={(v) => setDraft((d) => ({ ...d, projectName: v }))} colors={colors} />
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            {EXPENSE_CATEGORIES.map((row) => (
              <Chip key={row.id} label={row.label} active={(draft.category || 'other') === row.id} onPress={() => setDraft((d) => ({ ...d, category: row.id }))} colors={colors} />
            ))}
          </View>
          <TouchableOpacity onPress={saveExpense} style={[styles.btn, { backgroundColor: colors.brand, marginTop: 12, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre utlegg</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === 'mileage' ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 8 }}>Ny kjøretur</Text>
          <View style={styles.row}>
            <Field label="Dato" value={draft.date || ''} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} colors={colors} placeholder="ÅÅÅÅ-MM-DD" />
            <Field label="Fra" value={draft.from || ''} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} colors={colors} />
            <Field label="Til" value={draft.to || ''} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} colors={colors} />
            <Field label="Formål / besøk" value={draft.notes || ''} onChange={(v) => setDraft((d) => ({ ...d, notes: v }))} colors={colors} placeholder="Byggeplass / firma" />
            <Field label="Km" value={String(draft.km ?? '')} onChange={(v) => setDraft((d) => ({ ...d, km: v }))} colors={colors} keyboardType="decimal-pad" />
            <Field label="Teller start" value={String(draft.odometerStart ?? '')} onChange={(v) => setDraft((d) => ({ ...d, odometerStart: v }))} colors={colors} keyboardType="number-pad" />
            <Field label="Teller slutt" value={String(draft.odometerEnd ?? '')} onChange={(v) => setDraft((d) => ({ ...d, odometerEnd: v }))} colors={colors} keyboardType="number-pad" />
            <Field label="Bom" value={String(draft.tolls ?? '')} onChange={(v) => setDraft((d) => ({ ...d, tolls: v }))} colors={colors} keyboardType="decimal-pad" />
            <Field label="Kunde" value={draft.customerName || ''} onChange={(v) => setDraft((d) => ({ ...d, customerName: v }))} colors={colors} />
            <Field label="Prosjekt" value={draft.projectName || ''} onChange={(v) => setDraft((d) => ({ ...d, projectName: v }))} colors={colors} />
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            {TRIP_PURPOSES.map((row) => (
              <Chip key={row.id} label={row.label} active={(draft.purpose || 'duty') === row.id} onPress={() => setDraft((d) => ({ ...d, purpose: row.id }))} colors={colors} />
            ))}
          </View>
          <TouchableOpacity onPress={saveTrip} style={[styles.btn, { backgroundColor: colors.brand, marginTop: 12, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre tur</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === 'products' && tab === 'catalog' ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700', marginBottom: 8 }}>Nytt produkt</Text>
          <View style={styles.row}>
            <Field label="Navn" value={draft.name || ''} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} colors={colors} />
            <Field label="Varenr" value={draft.sku || ''} onChange={(v) => setDraft((d) => ({ ...d, sku: v }))} colors={colors} />
            <Field label="Pris eks. mva" value={String(draft.priceExVat ?? '')} onChange={(v) => setDraft((d) => ({ ...d, priceExVat: v }))} colors={colors} keyboardType="decimal-pad" />
            <Field label="Lager" value={String(draft.stock ?? '')} onChange={(v) => setDraft((d) => ({ ...d, stock: v, trackStock: true }))} colors={colors} keyboardType="decimal-pad" />
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            {PRODUCT_KINDS.map((row) => (
              <Chip key={row.id} label={row.label} active={(draft.kind || 'goods_resale') === row.id} onPress={() => setDraft((d) => ({ ...d, kind: row.id }))} colors={colors} />
            ))}
          </View>
          <TouchableOpacity onPress={saveProduct} style={[styles.btn, { backgroundColor: colors.brand, marginTop: 12, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre produkt</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === 'expenses' ? expenses.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.description || row.purpose} · {formatMoney(row.amountInclVat)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{row.date} · {row.status} · {row.customerName || 'uten kunde'}</Text>
          <View style={[styles.row, { marginTop: 8 }]}>
            {row.status !== 'approved' && row.status !== 'invoiced' ? (
              <TouchableOpacity onPress={() => apply(setExpenseStatus(state, row.id, 'approved'))} style={[styles.btnGhost, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Godkjenn</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )) : null}

      {kind === 'mileage' ? trips.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.from} → {row.to} · {row.km} km</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {row.date} · {formatMoney(row.amount)} · {row.status} · {row.notes}
          </Text>
          {row.status !== 'approved' && row.status !== 'invoiced' ? (
            <TouchableOpacity onPress={() => apply(setTripStatus(state, row.id, 'approved'))} style={[styles.btnGhost, { borderColor: colors.line, marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={{ color: colors.ink }}>Godkjenn</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )) : null}

      {kind === 'products' && tab === 'catalog' ? products.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.sku ? `${row.sku} · ` : ''}{row.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {formatMoney(row.priceExVat)} eks. · {row.vatCode}
            {row.trackStock ? ` · lager ${row.stock}` : ''}
          </Text>
          <View style={[styles.row, { marginTop: 8 }]}>
            <Field label="Antall" value={String(draft.quantity ?? '1')} onChange={(v) => setDraft((d) => ({ ...d, quantity: v }))} colors={colors} keyboardType="decimal-pad" />
            <Field label="Kunde på salg" value={draft.customerName || ''} onChange={(v) => setDraft((d) => ({ ...d, customerName: v }))} colors={colors} />
          </View>
          <TouchableOpacity onPress={() => sellProduct(row)} style={[styles.btn, { backgroundColor: colors.brand, marginTop: 8, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Registrer salg</Text>
          </TouchableOpacity>
        </View>
      )) : null}

      {kind === 'products' && tab === 'sales' ? sales.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.name} · {row.quantity} {row.unit}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{row.date} · {formatMoney(row.amountInclVat)} · {row.status}</Text>
          {row.status !== 'approved' && row.status !== 'invoiced' ? (
            <TouchableOpacity onPress={() => apply(setSaleStatus(state, row.id, 'approved'))} style={[styles.btnGhost, { borderColor: colors.line, marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={{ color: colors.ink }}>Merk klar for faktura</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )) : null}

      <View style={styles.row}>
        {kind === 'expenses' ? (
          <TouchableOpacity onPress={() => downloadCsv('utlegg.csv', expensesToCsv(expenses))} style={[styles.btnGhost, { borderColor: colors.line }]}>
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Eksporter CSV</Text>
          </TouchableOpacity>
        ) : null}
        {kind === 'mileage' ? (
          <TouchableOpacity onPress={() => downloadCsv('kjorebok.csv', tripsToCsv(trips))} style={[styles.btnGhost, { borderColor: colors.line }]}>
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Eksporter kjørebok</Text>
          </TouchableOpacity>
        ) : null}
        {kind === 'products' ? (
          <TouchableOpacity onPress={() => downloadCsv('produkter.csv', productsToCsv(products))} style={[styles.btnGhost, { borderColor: colors.line }]}>
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Eksporter katalog</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => requestShellTab?.('okonomi', 'fakturagrunnlag')} style={[styles.btnGhost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink }}>Fakturagrunnlag</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnGhost: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
