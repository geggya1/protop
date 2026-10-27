/**
 * Økonomi · Utlegg / Kjørebok — registrering, godkjenning, CSV.
 * Produkter har egen side (ProductCatalog).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import OptionPicker from '../../components/OptionPicker';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { showSaveToast } from '../../src/ui/saveToast';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { loadAnbudState } from '../../src/anbud/storage';
import { formatMoney } from '../../src/economy/invoices.js';
import {
  EXPENSE_CATEGORIES,
  emptyExpense,
  expensesToCsv,
} from '../../src/economy/expenses.js';
import {
  MILEAGE_RATE_TAX_FREE,
  tripsToCsv,
  yearlyDutyKm,
} from '../../src/economy/mileage.js';
import { setMileageRate } from '../../src/equipment/state';
import { mileageRate } from '../../src/mileage/flow';
import {
  deleteTrip,
  setExpenseStatus,
  setTripStatus,
  upsertExpense,
} from '../../src/economy/opsState.js';
import MileageWizard from './MileageWizard';

const TRIP_COLUMNS = [
  { key: 'date', label: 'Dato', width: 96 },
  { key: 'employeeName', label: 'Person', width: 120 },
  { key: 'vehicleName', label: 'Kjøretøy', width: 120 },
  { key: 'from', label: 'Fra', width: 150 },
  { key: 'to', label: 'Til', width: 150 },
  { key: 'km', label: 'Km', width: 64, numeric: true },
  { key: 'tolls', label: 'Bom', width: 72, numeric: true },
  { key: 'ferries', label: 'Ferje', width: 72, numeric: true },
  { key: 'amount', label: 'Beløp', width: 88, numeric: true, money: true },
];

function TripActions({ row, colors, pending, onOpen, onDelete, onApprove, children }) {
  return (
    <View style={{ gap: 4, paddingTop: 4 }}>
      {children || null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <TouchableOpacity onPress={() => onOpen(row)} accessibilityRole="button" accessibilityLabel="Rediger tur">
          <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '700' }}>Rediger</Text>
        </TouchableOpacity>
        {row.status !== 'approved' && row.status !== 'invoiced' ? (
          <TouchableOpacity onPress={() => onApprove?.(row)} accessibilityRole="button">
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>Godkjenn</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => onDelete(row)} accessibilityRole="button" accessibilityLabel="Slett tur">
          <Text style={{ color: colors.danger || '#b42318', fontSize: 14, fontWeight: '700' }}>
            {pending ? 'Slett nå' : 'Slett'}
          </Text>
        </TouchableOpacity>
      </View>
      {pending ? (
        <Text style={{ color: colors.ink, fontSize: 13 }}>
          Trykk «Slett nå» for å fjerne kjøreturen fra kjøreboken, utlegget og prosjektet.
        </Text>
      ) : null}
    </View>
  );
}

function tripSortValue(row, key) {
  if (['km', 'tolls', 'ferries', 'amount'].includes(key)) return Number(row?.[key]) || 0;
  return String(row?.[key] || '').toLowerCase();
}

function TripReport({ trips, colors, onOpen, onDelete, onApprove, pendingId }) {
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const filtered = (trips || []).filter((row) => {
      if (!needle) return true;
      return TRIP_COLUMNS.some((col) => String(row[col.key] ?? '').toLowerCase().includes(needle));
    });
    filtered.sort((a, b) => {
      const av = tripSortValue(a, sort.key);
      const bv = tripSortValue(b, sort.key);
      const base = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'desc' ? -base : base;
    });
    return filtered;
  }, [trips, needle, sort]);

  function toggleSort(key) {
    setSort((current) => (
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'date' ? 'desc' : 'asc' }
    ));
  }

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Kjørebok</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Filtrer på dato, person, kjøretøy, fra eller til"
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg, alignSelf: 'stretch' }]}
      />
      {narrow ? (
        <View style={{ gap: 8 }}>
          {rows.map((row) => (
            <TripActions
              key={row.id}
              row={row}
              colors={colors}
              pending={pendingId === row.id}
              onOpen={onOpen}
              onDelete={onDelete}
              onApprove={onApprove}
            >
              <TouchableOpacity onPress={() => onOpen(row)} accessibilityRole="button" accessibilityLabel={`Åpne tur ${row.date}`}>
                <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '700' }}>{row.date} · {formatMoney(row.amount)}</Text>
                <Text style={{ color: colors.ink, fontSize: 13 }}>{row.from || '—'} → {row.to || '—'}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {[row.employeeName, row.vehicleName, `${row.km || 0} km`].filter(Boolean).join(' · ')}
                </Text>
              </TouchableOpacity>
            </TripActions>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[styles.tableHead, { borderBottomColor: colors.line }]}>
              {TRIP_COLUMNS.map((col) => {
                const mark = sort.key === col.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
                return (
                  <TouchableOpacity key={col.key} onPress={() => toggleSort(col.key)} style={{ width: col.width }}>
                    <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>{col.label}{mark}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {rows.map((row) => (
              <View key={row.id} style={[styles.tableRow, { borderBottomColor: colors.line, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={{ flexDirection: 'row' }}>
                  {TRIP_COLUMNS.map((col) => (
                    <TouchableOpacity key={col.key} onPress={() => onOpen(row)} style={{ width: col.width }} accessibilityRole="button" accessibilityLabel={`Åpne tur ${row.date}`}>
                      <Text style={{ color: colors.ink, fontSize: 13 }} numberOfLines={2}>
                        {col.money ? formatMoney(row.amount) : col.numeric ? String(row[col.key] ?? 0) : (row[col.key] || '—')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TripActions
                  row={row}
                  colors={colors}
                  pending={pendingId === row.id}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onApprove={onApprove}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      {!rows.length ? (
        <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 10 }}>
          {needle ? 'Ingen turer matcher filteret.' : 'Ingen kjøreturer er registrert.'}
        </Text>
      ) : null}
    </View>
  );
}

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

export default function EconomyOps({ kind = 'expenses', company = null }) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const [state, setState] = useState(emptyProjectState());
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [rateOpen, setRateOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState('');
  const [draft, setDraft] = useState({});
  const [editingTrip, setEditingTrip] = useState(null);
  const [pendingDelete, setPendingDelete] = useState('');

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    loadAnbudState(familyId).then((loaded) => {
      if (!live) return;
      setCustomers(loaded?.customers || []);
      setContracts(loaded?.contracts || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (ready) saveProjectState(state, familyId).catch(() => {});
  }, [state, ready, familyId]);

  const title = kind === 'mileage' ? 'Kjørebok' : 'Utlegg';
  const expenses = state.expenses || [];
  const trips = state.mileageTrips || [];
  const dutyKm = useMemo(() => yearlyDutyKm(trips, new Date().getFullYear()), [trips]);
  const rateInfo = mileageRate(state.mileagePolicies);
  const canEditRate = access.canAdmin('mileage') || access.canAdmin('economySettings');

  useEffect(() => {
    const current = (state.mileagePolicies || []).find((row) => row.id === 'company');
    setRateDraft(current?.ratePerKm ? String(current.ratePerKm) : '');
  }, [state.mileagePolicies]);

  function apply(result) {
    setError(result.ok ? '' : result.error);
    setNote(result.ok ? 'Lagret.' : '');
    if (result.ok) {
      setState(result.state);
      showSaveToast('Lagret.');
    }
    return result;
  }

  function openTrip(trip) {
    setPendingDelete('');
    setEditingTrip(trip);
  }

  function removeTrip(trip, confirmed = false) {
    if (!confirmed && pendingDelete !== trip.id) {
      setPendingDelete(trip.id);
      return;
    }
    setPendingDelete('');
    const result = apply(deleteTrip(state, trip.id));
    if (result.ok && editingTrip?.id === trip.id) setEditingTrip(null);
  }

  function saveExpense() {
    apply(upsertExpense(state, {
      ...emptyExpense(draft),
      date: draft.date || new Date().toISOString().slice(0, 10),
    }));
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
      {hostedHero ? null : (
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      )}
      {kind === 'expenses' ? (
        <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 720 }}>
          Ansattutlegg med kategori, MVA og viderefakturering. Kvittering kreves over 1 000 kr ved innsatsfaktor (bokføringsforskriften).
        </Text>
      ) : null}
      {kind === 'mileage' ? (
        <View style={{ gap: 8, maxWidth: 720 }}>
          <View style={[styles.row, { alignItems: 'center' }]}>
            <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>
              {hostedHero ? '' : 'Yrkeskjøring med fra/til, formål og km. '}
              {rateInfo.label}: {rateInfo.rate.toFixed(2)} kr/km
              {rateInfo.source === 'statutory' ? ' (skattefri)' : ''}. I år: {dutyKm} km yrkeskjøring
              {dutyKm >= 6000 ? ' — over 6 000 km: vurder faktiske bilutgifter.' : '.'}
            </Text>
            {canEditRate ? (
              <TouchableOpacity
                onPress={() => setRateOpen((open) => !open)}
                style={[styles.btnGhost, { borderColor: colors.line, flexDirection: 'row', gap: 6, alignItems: 'center' }]}
              >
                <Ionicons name="settings-outline" size={16} color={colors.ink} />
                <Text style={{ color: colors.ink }}>Innstillinger</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {rateOpen ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Kjøresats</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Tomt felt bruker statens regulativ, {MILEAGE_RATE_TAX_FREE.toFixed(2)} kr/km skattefritt.
              </Text>
              <View style={styles.row}>
                <Field
                  label="Selskapssats kr/km"
                  value={rateDraft}
                  onChange={setRateDraft}
                  colors={colors}
                  placeholder="Tom = statens sats"
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  onPress={() => {
                    apply(setMileageRate(state, rateDraft));
                    setRateOpen(false);
                  }}
                  style={[styles.btn, { backgroundColor: colors.brand }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre sats</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}

      {editingTrip ? (
        <MileageWizard
          key={editingTrip.id}
          colors={colors}
          state={state}
          company={company}
          customers={customers}
          contracts={contracts}
          launch={false}
          editingTrip={editingTrip}
          onDismiss={() => setEditingTrip(null)}
          onDelete={() => removeTrip(editingTrip, true)}
          onApply={apply}
          onOpenBilling={() => requestShellTab?.('okonomi', 'fakturagrunnlag')}
        />
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
          <View style={{ marginTop: 8 }}>
            <OptionPicker
              options={EXPENSE_CATEGORIES.map((row) => ({ id: row.id, label: row.label }))}
              value={draft.category || 'other'}
              onChange={(id) => { if (id) setDraft((d) => ({ ...d, category: id })); }}
              title="Kategori"
              clearable={false}
            />
          </View>
          <TouchableOpacity onPress={saveExpense} style={[styles.btn, { backgroundColor: colors.brand, marginTop: 12, alignSelf: 'flex-start' }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre utlegg</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === 'mileage' ? (
        <MileageWizard
          colors={colors}
          state={state}
          company={company}
          customers={customers}
          contracts={contracts}
          onApply={apply}
          onOpenBilling={() => requestShellTab?.('okonomi', 'fakturagrunnlag')}
        />
      ) : null}

      {kind === 'expenses' ? expenses.map((row) => {
        const trip = row.tripId ? trips.find((item) => item.id === row.tripId) : null;
        return (
          <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.description || row.purpose} · {formatMoney(row.amountInclVat)}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{row.date} · {row.status} · {row.customerName || 'uten kunde'}</Text>
            <View style={[styles.row, { marginTop: 8 }]}>
              {trip ? (
                <>
                  <TouchableOpacity onPress={() => openTrip(trip)} style={[styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]}>
                    <Text style={{ color: colors.ink }}>Rediger tur</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeTrip(trip)} style={[styles.btnGhost, { borderColor: colors.line, alignSelf: 'flex-start' }]} accessibilityRole="button" accessibilityLabel="Slett tur">
                    <Text style={{ color: colors.danger || '#b42318', fontWeight: '700' }}>{pendingDelete === trip.id ? 'Slett nå' : 'Slett tur'}</Text>
                  </TouchableOpacity>
                  {pendingDelete === trip.id ? (
                    <Text style={{ color: colors.ink, fontSize: 13, flexBasis: '100%' }}>
                      Trykk «Slett nå» for å fjerne kjøreturen fra utlegg, kjørebok og prosjekt.
                    </Text>
                  ) : null}
                </>
              ) : null}
              {!trip && row.status !== 'approved' && row.status !== 'invoiced' ? (
                <TouchableOpacity onPress={() => apply(setExpenseStatus(state, row.id, 'approved'))} style={[styles.btnGhost, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink }}>Godkjenn</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      }) : null}

      {kind === 'mileage' ? (
        <TripReport
          trips={trips}
          colors={colors}
          pendingId={pendingDelete}
          onOpen={openTrip}
          onDelete={removeTrip}
          onApprove={(row) => apply(setTripStatus(state, row.id, 'approved'))}
        />
      ) : null}

      <View style={[styles.row, { alignSelf: 'flex-start' }]}>
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
    alignSelf: 'flex-start',
    gap: 6,
  },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingBottom: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
});
