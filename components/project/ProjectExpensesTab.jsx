import React, { useEffect, useMemo, useState } from 'react';
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
import OptionPicker, { CHIP_LIMIT } from '../OptionPicker';
import { formatDate, formatMoney } from '../../src/economy/invoices.js';
import { EXPENSE_CATEGORIES, EXPENSE_CHARGE_TYPES, emptyExpense, expenseCategory } from '../../src/economy/expenses.js';
import { expenseStatusLabel, filterExpenses } from '../../src/economy/expenseList.js';
import { deleteExpense, upsertExpense } from '../../src/economy/opsState.js';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { expenseSummaryForProject } from '../../src/project/projectDashboard.js';
import { projectExpenseRows } from '../../src/economy/expenseScope.js';
import { isExternalExpense, loadProjectExpenses, mergeExpenseLists } from '../../src/economy/expenseStorage.js';
import { removeExpenseRow, saveExpenseChange } from '../../src/economy/expenseSave.js';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { showSaveToast } from '../../src/ui/saveToast';

function statusTone(status) {
  if (status === 'invoiced') return { bg: '#dcfce7', fg: '#166534', label: 'Fakturert' };
  return { bg: '#ffedd5', fg: '#9a3412', label: status === 'approved' ? 'Ikke fakturert' : expenseStatusLabel(status) };
}

/**
 * Prosjektutlegg med filter, oppsummering og full CRUD.
 * Samme utlegg som Økonomi → Utlegg og Til fakturering (UX-17): registrerte i prosjektdokumentet
 * og importerte (families/{id}/projectExpenses). Importerte endres og slettes der de ligger.
 */
export default function ProjectExpensesTab({
  state,
  project,
  colors,
  isAdmin,
  // Uten Admin: bare egne rader.
  employeeId = '',
  // Den som registrerer. Utlegget vises da under Prosjektutlegg på ansattsiden.
  myEmployeeId = '',
  employees = [],
  familyId = '',
  onChangeState,
}) {
  const { requestShellTab } = useApp();
  const access = useCompanyAccess();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [editor, setEditor] = useState(null);
  const [menuId, setMenuId] = useState('');
  // Sletting krever et ekstra trykk («Slett» → «Ja, slett»).
  const [confirmId, setConfirmId] = useState('');
  const [error, setError] = useState('');
  const [imported, setImported] = useState([]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    loadProjectExpenses(familyId).then((rows) => {
      if (live) setImported(rows);
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  const all = useMemo(
    () => projectExpenseRows(state.expenses, imported, project.id, { employeeId }),
    [state.expenses, imported, project.id, employeeId],
  );
  const rows = useMemo(
    () => filterExpenses(all, { query, status, projectId: project.id }),
    [all, query, status, project.id],
  );
  const filtered = useMemo(() => (
    category ? rows.filter((row) => row.category === category) : rows
  ), [rows, category]);
  const summary = useMemo(() => expenseSummaryForProject(all, project.id), [all, project.id]);
  const people = useMemo(
    () => filterEmployeesForPicker(employees, '')
      .map((row) => ({ id: row.id, label: employeeDisplayName(row) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nb')),
    [employees],
  );

  function personName(id) {
    const row = (employees || []).find((item) => item.id === id);
    return row ? employeeDisplayName(row) : '';
  }

  function openNew() {
    setEditor(emptyExpense({
      date: new Date().toISOString().slice(0, 10),
      projectId: project.id,
      projectNumber: project.number,
      projectName: project.name,
      customerId: project.customerId || '',
      customerName: project.client || '',
      billable: true,
      status: 'approved',
      category: 'travel',
      description: '',
      amountExVat: 0,
      employeeId: myEmployeeId,
      employeeName: personName(myEmployeeId),
    }));
    setError('');
  }

  async function save() {
    if (!editor) return;
    const input = {
      ...editor,
      employeeName: personName(editor.employeeId) || editor.employeeName || '',
      projectId: project.id,
      projectNumber: project.number,
      projectName: project.name,
    };
    if (isExternalExpense(input)) {
      const saved = await saveExpenseChange(familyId, input);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      setImported((current) => mergeExpenseLists(current, [input]));
      setEditor(null);
      showSaveToast('Utlegget er lagret.');
      return;
    }
    const result = upsertExpense(state, input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setEditor(null);
    showSaveToast('Utlegget er lagret.');
  }

  async function remove(id) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    const row = all.find((item) => item.id === id);
    if (isExternalExpense(row)) {
      setConfirmId('');
      const removed = await removeExpenseRow(familyId, row);
      if (!removed.ok) {
        setError(removed.error);
        return;
      }
      setImported((current) => current.filter((item) => item.id !== id));
      setMenuId('');
      showSaveToast('Utlegget er slettet.');
      return;
    }
    const result = deleteExpense(state, id);
    setConfirmId('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setMenuId('');
    showSaveToast('Utlegget er slettet.');
  }

  function exportCsv() {
    const header = ['Dato', 'Beskrivelse', 'Kategori', 'Beløp eks mva', 'Fakturerbar', 'Status'];
    const lines = filtered.map((row) => [
      row.date,
      JSON.stringify(row.description || ''),
      expenseCategory(row.category).label,
      row.amountExVat,
      row.billable ? 'Ja' : 'Nei',
      expenseStatusLabel(row.status),
    ].join(';'));
    const blob = [header.join(';'), ...lines].join('\n');
    if (typeof window !== 'undefined') {
      const url = URL.createObjectURL(new Blob([blob], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `utlegg-${project.number || project.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    showSaveToast('Eksportert.');
  }

  return (
    <View style={styles.wrap} nativeID="project-expenses-tab">
      <View style={styles.toolbar}>
        <View style={styles.filters}>
          <ChipSelect
            colors={colors}
            value={category}
            placeholder="Alle kategorier"
            options={[{ id: '', label: 'Alle kategorier' }, ...EXPENSE_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))]}
            onChange={setCategory}
          />
          <ChipSelect
            colors={colors}
            value={status}
            placeholder="Alle status"
            options={[
              { id: '', label: 'Alle status' },
              { id: 'approved', label: 'Ikke fakturert' },
              { id: 'invoiced', label: 'Fakturert' },
              { id: 'draft', label: 'Utkast' },
            ]}
            onChange={setStatus}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk i utlegg..."
            placeholderTextColor={colors.muted}
            style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
        </View>
        <View style={styles.actions}>
          {access.tabAllowed('okonomi', 'utlegg') ? (
            <TouchableOpacity
              onPress={() => requestShellTab?.('okonomi', 'utlegg', { type: 'expenseScope', scope: 'prosjekt', project: project.number || project.name || '' })}
              style={[styles.ghost, { borderColor: colors.line }]}
              accessibilityRole="link"
              nativeID="project-expenses-open-all"
            >
              <Ionicons name="open-outline" size={16} color={colors.ink} />
              <Text style={{ color: colors.ink }}>Åpne i Utlegg</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={exportCsv} style={[styles.ghost, { borderColor: colors.line }]}>
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Eksporter</Text>
          </TouchableOpacity>
          {isAdmin ? (
            <TouchableOpacity
              onPress={openNew}
              style={[styles.primary, { backgroundColor: colors.brand }]}
              nativeID="project-expense-add"
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>+ Nytt utlegg</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={[styles.tableHead, { borderColor: colors.line }]}>
          {['Dato', 'Beskrivelse', 'Kategori', 'Beløp (eks. mva)', 'Fakturerbar', 'Status', 'Vedlegg', ''].map((h) => (
            <Text key={h || 'a'} style={[styles.th, { color: colors.muted }]}>{h}</Text>
          ))}
        </View>
        {filtered.map((row) => {
          const tone = statusTone(row.status);
          return (
            <View key={row.id} style={[styles.tableRow, { borderColor: colors.line }]}>
              <Text style={[styles.td, { color: colors.ink }]}>{formatDate(row.date)}</Text>
              <Text style={[styles.td, { color: colors.ink, flex: 1.4 }]} numberOfLines={2}>{row.description || '—'}</Text>
              <Text style={[styles.td, { color: colors.ink }]}>{expenseCategory(row.category).label}</Text>
              <Text style={[styles.td, { color: colors.ink, fontWeight: '600' }]}>{formatMoney(row.amountExVat)}</Text>
              <Text style={[styles.td, { color: colors.ink }]}>{row.billable ? (row.chargeType === 'outlay' ? 'Ja, i kundens navn' : 'Ja') : 'Nei'}</Text>
              <View style={styles.td}>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={{ color: tone.fg, fontSize: 11, fontWeight: '600' }}>{tone.label}</Text>
                </View>
              </View>
              <View style={[styles.td, styles.attach]}>
                <Ionicons name="attach" size={14} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>{row.receiptUri ? 1 : 0}</Text>
              </View>
              <View style={styles.td}>
                {isAdmin ? (
                  <TouchableOpacity
                    onPress={() => { setMenuId(menuId === row.id ? '' : row.id); setConfirmId(''); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Valg for utlegget ${row.description || ''}`.trim()}
                    accessibilityState={{ expanded: menuId === row.id }}
                    hitSlop={8}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {menuId === row.id ? (
                <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  <TouchableOpacity onPress={() => { setEditor(row); setMenuId(''); }} style={styles.menuItem}>
                    <Text style={{ color: colors.ink }}>Rediger</Text>
                  </TouchableOpacity>
                  {confirmId === row.id ? (
                    <>
                      <Text style={{ color: colors.ink, paddingVertical: 4 }}>Slette utlegget? Det kan ikke angres.</Text>
                      <TouchableOpacity onPress={() => remove(row.id)} style={styles.menuItem} accessibilityRole="button" nativeID={`project-expense-confirm-delete-${row.id}`}>
                        <Text style={{ color: colors.danger || '#b42318', fontWeight: '700' }}>Ja, slett</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setConfirmId('')} style={styles.menuItem} accessibilityRole="button">
                        <Text style={{ color: colors.ink }}>Avbryt</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => remove(row.id)} style={styles.menuItem} accessibilityRole="button">
                      <Text style={{ color: colors.danger || '#b42318' }}>Slett</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
        {!filtered.length ? (
          <Text style={{ color: colors.muted, paddingVertical: 16 }}>Ingen utlegg på prosjektet.</Text>
        ) : null}
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard colors={colors} icon="document-text" tone="#dbeafe" title="Totalt utlegg" value={formatMoney(summary.total)} sub="Eks. mva" />
        <SummaryCard colors={colors} icon="document" tone="#ffedd5" title="Ikke fakturert" value={formatMoney(summary.unbilled)} sub={`${summary.unbilledCount} utlegg`} />
        <SummaryCard colors={colors} icon="checkmark-circle" tone="#dcfce7" title="Fakturert" value={formatMoney(summary.billed)} sub={`${summary.billedCount} utlegg`} />
      </View>

      <Modal transparent visible={!!editor} animationType="fade" onRequestClose={() => setEditor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setEditor(null)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>{editor?.id ? 'Rediger utlegg' : 'Nytt utlegg'}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Label colors={colors} text="Dato" />
              <TextInput
                value={editor?.date || ''}
                onChangeText={(v) => setEditor((e) => ({ ...e, date: v }))}
                placeholder="ÅÅÅÅ-MM-DD"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
              <Label colors={colors} text="Medarbeider" />
              <OptionPicker
                options={people}
                value={editor?.employeeId || ''}
                onChange={(id) => setEditor((e) => ({ ...e, employeeId: id || '', employeeName: id ? personName(id) : '' }))}
                placeholder="Velg medarbeider"
                title="Medarbeider"
                small
              />
              <Label colors={colors} text="Beskrivelse" />
              <TextInput
                value={editor?.description || ''}
                onChangeText={(v) => setEditor((e) => ({ ...e, description: v }))}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
              <Label colors={colors} text="Kategori" />
              <OptionPicker
                options={EXPENSE_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
                value={editor?.category}
                onChange={(id) => { if (id) setEditor((e) => ({ ...e, category: id })); }}
                title="Kategori"
                clearable={false}
                small
              />
              <Label colors={colors} text="Beløp eks. mva" />
              <TextInput
                keyboardType="numeric"
                value={editor ? String(editor.amountExVat ?? '') : ''}
                onChangeText={(v) => setEditor((e) => ({ ...e, amountExVat: v }))}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
              <TouchableOpacity
                onPress={() => setEditor((e) => ({ ...e, billable: !e.billable }))}
                style={styles.check}
              >
                <Text style={{ color: colors.ink }}>{editor?.billable ? '☑' : '☐'} Fakturerbar</Text>
              </TouchableOpacity>
              {editor?.billable ? (
                <>
                  <Label colors={colors} text="Faktureres som" />
                  {EXPENSE_CHARGE_TYPES.map((type) => {
                    const on = (editor?.chargeType || 'reinvoice') === type.id;
                    return (
                      <TouchableOpacity
                        key={type.id}
                        onPress={() => setEditor((e) => ({ ...e, chargeType: type.id, ...(type.id === 'outlay' ? { markupPercent: 0 } : {}) }))}
                        style={styles.check}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        nativeID={`expense-charge-${type.id}`}
                      >
                        <Text style={{ color: on ? colors.brand : colors.ink }}>{on ? '●' : '○'} {type.label}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 18 }}>{type.hint}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setEditor(null)} style={[styles.ghost, { borderColor: colors.line, flex: 1, justifyContent: 'center' }]}>
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

function Label({ colors, text }) {
  return <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 4, fontSize: 12 }}>{text}</Text>;
}

function ChipSelect({ colors, value, options, onChange, placeholder }) {
  if (options.length > CHIP_LIMIT) {
    // 5 eller flere valg: nedtrekk i stedet for en rad med knapper.
    return (
      <OptionPicker
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        title={placeholder}
        clearable={false}
        small
      />
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((opt) => {
        const on = value === opt.id;
        return (
          <TouchableOpacity
            key={opt.id || 'all'}
            onPress={() => onChange(opt.id)}
            style={[styles.filterChip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 12 }}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function SummaryCard({ colors, icon, tone, title, value, sub }) {
  return (
    <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={[styles.summaryIcon, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={18} color={colors.brand} />
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
  toolbar: { gap: 10 },
  filters: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 180 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  primary: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 12 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 8, gap: 6 },
  tableRow: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 6, alignItems: 'center' },
  th: { flex: 1, fontSize: 11 },
  td: { flex: 1, fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  menu: { width: '100%', borderWidth: 1, borderRadius: 8, padding: 6 },
  menuItem: { paddingVertical: 8 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summary: { flexGrow: 1, flexBasis: 180, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  summaryIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  filterChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 12, padding: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  check: { marginTop: 12 },
});
