/**
 * Utlegg (UX-17): én side for utlegg på prosjekt og interne utlegg, med filteret
 * «Prosjekt / Internt / Alle». Før var dette to sider for de samme radene: Økonomi → Utlegg
 * (registrering og godkjenning) og Prosjektutlegg under Arbeid (filter og import).
 *
 * Siden leser det samme som Til fakturering og prosjektfanen: utlegg registrert i appen
 * (projects/state.expenses) og importerte (families/{id}/projectExpenses), slått sammen med
 * combineExpenses. Endringer går dit raden hører hjemme (expenseSave.js og opsState.js).
 * Ansattsiden bruker samme liste for én person (lockedEmployeeId, embedded), uten filter og skjema.
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
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { useLayout } from '../../src/theme';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import OptionPicker from '../../components/OptionPicker';
import { useProjectStateEditor } from '../../src/project/useProjectStateEditor';
import { loadAnbudState } from '../../src/anbud/storage';
import { useCompanyRefs, useEmployees } from '../../src/context/CompanyDataContext';
import { freshRows, hydrateRows, liveCustomerList } from '../../src/company/companyData.js';
import { formatMoney, parseDate } from '../../src/economy/invoices.js';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CHARGE_TYPES,
  EXPENSE_STATUSES,
  emptyExpense,
  expensesToCsv,
  validateExpense,
} from '../../src/economy/expenses.js';
import { formatDate } from '../../src/economy/hoursList.js';
import {
  EXPENSE_PERIODS,
  EXPENSE_SORT_OPTIONS,
  expenseStatusLabel,
  expensesForEmployee,
  filterExpenses,
  sortExpenses,
} from '../../src/economy/expenseList.js';
import { expenseRegistryPatch } from '../../src/economy/expenseRegistry.js';
import {
  expenseDraftProblem,
  expenseRowActions,
  expenseScopeFromSearch,
  expenseScopeSearch,
  expenseScopesFor,
  filterExpenseScope,
  isProjectExpense,
  resolveExpenseScope,
} from '../../src/economy/expenseScope.js';
import {
  EXPENSE_IMPORT_ACCEPT,
  buildExpenseImportReview,
  linkExpenseImportPlanCustomer,
  linkExpenseImportPlanEmployee,
  linkExpenseImportPlanProject,
  readExpenseImport,
  toggleExpenseReviewRow,
} from '../../src/economy/expenseImport.js';
import { isExternalExpense, loadProjectExpenses, mergeExpenseLists, saveProjectExpenses } from '../../src/economy/expenseStorage.js';
import { combineExpenses, removeExpenseRow, saveExpenseChange } from '../../src/economy/expenseSave.js';
import { deleteExpense, setExpenseStatus, upsertExpense } from '../../src/economy/opsState.js';
import { shellPathFor } from '../../src/navigation/shellPaths';
import { createId } from '../../src/project/engine';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import { isPhoneWidth } from '../../src/ui/reportTable';
import { Button, Field, Sheet, TextIn } from '../../src/ui';
import ExpenseImportReview from '../../components/economy/ExpenseImportReview';
import Breadcrumb from '../../components/Breadcrumb';
import ReportTable from '../../components/table/ReportTable';
import InlineError from '../../src/ui/InlineError';
import Skeleton from '../../src/ui/Skeleton';
import { radius, space, type } from '../../src/ui/tokens';

function money(value) {
  return typeof formatMoney === 'function' ? formatMoney(value) : String(value ?? '');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function bytesFromFile(file) {
  if (file?.bytes instanceof Uint8Array) return file.bytes;
  if (typeof file?.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  if (file?.uri && typeof fetch === 'function') {
    const response = await fetch(file.uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error('Kunne ikke lese filen.');
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

// Filteret i adressen (/hjem/okonomi/utlegg?vis=internt), bare på selve siden.
function scopeFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  return expenseScopeFromSearch(window.location.search);
}

// Status i tabellen og på telefonkortet: grønn når utlegget er godkjent eller betalt, rød når det er avvist.
function statusTone(status, colors) {
  if (status === 'approved' || status === 'invoiced' || status === 'reimbursed') return colors.successInk || colors.success;
  if (status === 'rejected') return colors.dangerInk || colors.danger;
  if (status === 'submitted') return colors.brandInk || colors.brand;
  return colors.muted;
}

// Sorteringen i panelet («date-desc») og i tabellhodet ({ key, dir }) er den samme.
function sortState(sort) {
  const [key, dir] = String(sort || '').split('-');
  return { key: key || 'date', dir: dir === 'desc' ? 'desc' : 'asc' };
}

function Choice({ label, on, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.choice, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.card }]}
    >
      <Text style={[styles.choiceText, { color: on ? colors.onBrand || colors.card : colors.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Skjema for nytt utlegg, og for å se, endre, godkjenne og slette ett (samme felt som
 * Økonomi → Utlegg hadde, med ansatt, prosjekt og kunde fra registrene, DRIFT-24).
 */
function ExpenseSheet({
  draft, setDraft, can, colors, people, projectOptions, customerOptions, canPickEmployee, canInternal,
  error, busy, pendingDelete, onPick, onSave, onApprove, onDelete, onOpenTrip, onClose,
}) {
  const isNew = !draft.id;
  const editable = isNew || can.edit;
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const employeeName = people.find((row) => row.id === draft.employeeId)?.label || draft.employeeName || '';
  const charge = EXPENSE_CHARGE_TYPES.find((row) => row.id === (draft.chargeType || 'reinvoice'));
  const label = draft.description || draft.purpose || 'utlegget';
  // Feilen står over knappene, så den synes også når skjemaet er rullet (telefon).
  const footer = [
    ...(error ? [
      <Text key="error" style={[styles.sheetError, { color: colors.dangerInk || colors.danger }]} accessibilityRole="alert" nativeID="expense-sheet-error">{error}</Text>,
    ] : []),
    <Button key="cancel" label={editable ? 'Avbryt' : 'Lukk'} onPress={onClose} />,
  ];
  if (!isNew && can.trip) {
    footer.push(<Button key="trip" label="Åpne i Kjørebok" icon="car-outline" onPress={onOpenTrip} />);
  }
  if (!isNew && can.remove) {
    footer.push(
      <Button
        key="delete"
        variant="danger"
        label={pendingDelete ? 'Slett nå' : 'Slett'}
        accessibilityLabel={pendingDelete ? `Bekreft sletting av ${label}` : `Slett ${label}`}
        nativeID="expense-sheet-delete"
        busy={busy}
        onPress={onDelete}
      />,
    );
  }
  if (!isNew && can.approve) {
    footer.push(<Button key="approve" label="Godkjenn" icon="checkmark" nativeID="expense-sheet-approve" busy={busy} onPress={onApprove} />);
  }
  if (editable) {
    footer.push(<Button key="save" variant="primary" label="Lagre utlegg" nativeID="expense-sheet-save" busy={busy} onPress={onSave} />);
  }
  return (
    <Sheet visible title={isNew ? 'Nytt utlegg' : (editable ? 'Endre utlegg' : 'Utlegg')} onClose={onClose} footer={footer} wide>
      {!isNew ? (
        <Text style={[styles.sheetMeta, { color: colors.muted }]}>
          {`Status: ${expenseStatusLabel(draft.status)}${can.trip ? ' · Kjøring: endres i Kjørebok' : ''}`}
        </Text>
      ) : null}
      {pendingDelete ? (
        <Text style={[styles.sheetMeta, { color: colors.ink }]} accessibilityLiveRegion="polite">
          Trykk «Slett nå» for å slette utlegget. Det kan ikke angres.
        </Text>
      ) : null}
      <View style={styles.sheetGrid}>
        <View style={styles.sheetCell}>
          <Field label="Dato" required>
            <TextIn value={draft.date || ''} onChangeText={set('date')} placeholder="ÅÅÅÅ-MM-DD" editable={editable} />
          </Field>
        </View>
        <View style={styles.sheetCell}>
          <Field label="Beløp eks. mva" required>
            <TextIn value={String(draft.amountExVat ?? '')} onChangeText={set('amountExVat')} keyboardType="decimal-pad" editable={editable} />
          </Field>
        </View>
      </View>
      <Field label="Beskrivelse" required>
        <TextIn value={draft.description || ''} onChangeText={set('description')} editable={editable} />
      </Field>
      <Field
        label="Prosjekt"
        required={!canInternal}
        hint={canInternal ? 'Uten prosjekt blir utlegget internt.' : ''}
        error={!canInternal && error && !draft.projectId ? error : ''}
      >
        <OptionPicker
          options={projectOptions}
          value={draft.projectId || ''}
          onChange={(id) => onPick('project', id)}
          title="Prosjekt"
          placeholder={canInternal ? 'Uten prosjekt (internt)' : 'Velg prosjekt'}
          clearable={canInternal}
          clearLabel="Uten prosjekt (internt)"
          disabled={!editable}
          accessibilityLabel="Prosjekt"
        />
      </Field>
      <Field label="Kunde">
        <OptionPicker
          options={customerOptions}
          value={draft.customerId || ''}
          onChange={(id) => onPick('customer', id)}
          title="Kunde"
          placeholder="Velg kunde"
          clearLabel="Uten kunde"
          disabled={!editable}
          accessibilityLabel="Kunde"
        />
      </Field>
      <Field label="Ansatt">
        {canPickEmployee ? (
          <OptionPicker
            options={people}
            value={draft.employeeId || ''}
            onChange={(id) => onPick('employee', id)}
            title="Ansatt"
            placeholder="Velg ansatt"
            disabled={!editable}
            accessibilityLabel="Ansatt som har lagt ut"
          />
        ) : (
          <Text style={[styles.sheetValue, { color: colors.ink }]}>{employeeName || 'Deg'}</Text>
        )}
      </Field>
      <View style={styles.sheetGrid}>
        <View style={styles.sheetCell}>
          <Field label="Kategori">
            <OptionPicker
              options={EXPENSE_CATEGORIES.map((row) => ({ id: row.id, label: row.label }))}
              value={draft.category || 'other'}
              onChange={(id) => { if (id) set('category')(id); }}
              title="Kategori"
              clearable={false}
              disabled={!editable}
            />
          </Field>
        </View>
        <View style={styles.sheetCell}>
          <Field label="Påslag %">
            <TextIn value={String(draft.markupPercent ?? '')} onChangeText={set('markupPercent')} keyboardType="decimal-pad" editable={editable && draft.chargeType !== 'outlay'} />
          </Field>
        </View>
      </View>
      <Field label="Faktureres som" hint={charge?.hint}>
        <OptionPicker
          options={EXPENSE_CHARGE_TYPES.map((row) => ({ id: row.id, label: row.label }))}
          value={draft.chargeType || 'reinvoice'}
          onChange={(id) => { if (id) setDraft((current) => ({ ...current, chargeType: id, ...(id === 'outlay' ? { markupPercent: 0 } : {}) })); }}
          title="Faktureres som"
          clearable={false}
          disabled={!editable}
        />
      </Field>
      <Field label="Formål">
        <TextIn value={draft.purpose || ''} onChangeText={set('purpose')} editable={editable} />
      </Field>
      <Field label="Kvittering (lenke)" hint="Kvittering kreves over 1 000 kr ved innsatsfaktor (bokføringsforskriften).">
        <TextIn value={draft.receiptUri || ''} onChangeText={set('receiptUri')} placeholder="fil:// eller https://" editable={editable} />
      </Field>
    </Sheet>
  );
}

export function ExpensesScreen({ lockedEmployeeId = '', embedded = false, canImport: canImportProp, scope: startScope = '' } = {}) {
  const colors = useColors();
  const { familyId, user, requestShellTab, shellIntent, clearShellIntent } = useApp();
  const access = useCompanyAccess();
  // Import av utleggslister krever Admin på Prosjektutlegg.
  const adminImport = canImportList(access, 'economyProjectExpenses');
  const canImport = adminImport && canImportProp !== false;
  const { width } = useLayout();
  // Brede skjermer: filter og sortering i høyre marg, som på Timer.
  const sideFilters = width >= 1100;
  const phone = isPhoneWidth(width);
  const hostedHero = useModuleHeroHosted();
  const companyId = familyId;
  const lockedId = String(lockedEmployeeId || '').trim();
  const [customers, setCustomers] = useState([]);
  const [remoteExpenses, setRemoteExpenses] = useState([]);
  const [remoteReady, setRemoteReady] = useState(false);
  const [query, setQuery] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [pageSize, setPageSize] = useState(60);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [linkQuery, setLinkQuery] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [wantedScope, setWantedScope] = useState(() => startScope || scopeFromUrl());
  // Skjemaet: null = lukket, ellers utlegget som registreres eller vises.
  const [draft, setDraft] = useState(null);
  const [draftError, setDraftError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lagrer bare etter endringer her, ikke når siden åpnes.
  const { state, setState } = useProjectStateEditor(companyId, {
    load: { hours: false },
    onError: (cause) => setError(String(cause?.message || '') || 'Kunne ikke lagre utlegget.'),
  });
  const staff = useEmployees(companyId);
  const employees = staff?.employees || [];
  const refs = useCompanyRefs(companyId);

  // Utlegg gir alle tre filtrene. Prosjektutlegg alene gir bare Prosjekt (som den gamle siden).
  const seesAll = access.canView('economyExpenses');
  const scopes = expenseScopesFor({ all: seesAll, project: !seesAll });
  const activeScope = resolveExpenseScope(wantedScope, scopes);
  const canManage = access.canEdit('economyExpenses') || access.canAdmin('economyProjectExpenses');
  const canRegister = !embedded && (seesAll || access.canEdit('economyProjectExpenses'));

  useEffect(() => {
    let live = true;
    loadAnbudState(companyId).then((loaded) => {
      if (live) setCustomers(loaded?.customers || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [companyId]);

  useEffect(() => {
    let live = true;
    setRemoteReady(false);
    setError('');
    loadProjectExpenses(companyId).then((rows) => {
      if (!live) return;
      setRemoteExpenses(rows);
      setRemoteReady(true);
    }).catch((cause) => {
      if (!live) return;
      setRemoteReady(true);
      setError(String(cause?.message || '') || 'Kunne ikke laste importerte utlegg.');
    });
    return () => { live = false; };
  }, [companyId, reloadKey]);

  // Fra en gammel adresse (Arbeid → Prosjektutlegg) eller prosjektfanen: filteret og ev. prosjektet.
  useEffect(() => {
    if (embedded || shellIntent?.type !== 'expenseScope') return;
    if (shellIntent.scope) setWantedScope(shellIntent.scope);
    if (shellIntent.project) setProjectQuery(String(shellIntent.project));
    clearShellIntent?.();
  }, [embedded, shellIntent, clearShellIntent]);

  // Web: filteret står i adressen (?vis=prosjekt), så lenker og bokmerker åpner samme utvalg.
  // Etter skallet: det skriver stien når fanen byttes (også fra den gamle adressen).
  useEffect(() => {
    if (embedded || !access.ready || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const timer = setTimeout(() => {
      if (window.location.pathname !== shellPathFor('okonomi', 'utlegg')) return;
      const search = expenseScopeSearch(window.location.search, activeScope);
      if (search === window.location.search) return;
      try {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(timer);
  }, [embedded, access.ready, activeScope]);

  // Person, kunde og prosjekt slås opp når listen vises (DS-08). Kopien på raden er reserve.
  const lookup = useMemo(() => ({
    directory: refs.directory,
    customers: liveCustomerList(refs.customers, customers),
    projects: freshRows(state.projects || [], refs.projects),
  }), [refs, customers, state.projects]);
  // Ansatt, kunde og prosjekt velges fra registrene, så utlegget er koblet (DRIFT-24).
  const people = useMemo(() => (refs.directory?.rows || [])
    .filter((row) => row.employeeId && row.active !== false)
    .map((row) => ({ id: row.employeeId, label: row.name || 'Uten navn', uid: row.uid })), [refs.directory]);
  const projectOptions = useMemo(() => (lookup.projects || [])
    .filter((row) => row?.id && row.status !== 'arkivert')
    .map((row) => ({ id: row.id, label: [row.number ? `#${row.number}` : '', row.name].filter(Boolean).join(' ') })), [lookup.projects]);
  const customerOptions = useMemo(() => (lookup.customers || [])
    .filter((row) => row?.id)
    .map((row) => ({ id: row.id, label: [row.customerNumber || row.number, row.name].filter(Boolean).join(' · ') })), [lookup.customers]);
  const myEmployeeId = people.find((row) => row.uid && row.uid === user?.uid)?.id || '';

  const allRows = useMemo(() => {
    // Registrerte og importerte, med samme regel som Til fakturering og prosjektfanen.
    const merged = hydrateRows(combineExpenses(state.expenses, remoteExpenses), lookup);
    if (!lockedId) return merged;
    // Ansattsiden: det personen har registrert, også importerte rader uten kobling.
    const person = employees.find((row) => row.id === lockedId) || { id: lockedId };
    return expensesForEmployee(merged, person);
  }, [state.expenses, remoteExpenses, lookup, lockedId, employees]);

  const scopedRows = useMemo(
    () => (embedded || lockedId ? allRows : filterExpenseScope(allRows, activeScope)),
    [allRows, embedded, lockedId, activeScope],
  );

  const visible = useMemo(() => sortExpenses(filterExpenses(scopedRows, {
    query,
    employeeQuery: lockedId ? '' : employeeQuery,
    customerQuery,
    projectQuery,
    status,
    period,
    fromDate,
    toDate,
  }), sort), [scopedRows, query, employeeQuery, customerQuery, projectQuery, status, period, fromDate, toDate, sort, lockedId]);

  const importReview = useMemo(
    () => (importPlan ? buildExpenseImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );

  async function importFile() {
    if (!canImport) return;
    setError('');
    const file = await pickDocument({ accept: EXPENSE_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readExpenseImport(bytes, file.name, {
        existingExpenses: allRows,
        employees,
        customers,
        projects: state.projects || [],
      });
      setImportPlan(plan);
      setDropped(new Set());
      setLinkQuery({});
      setNote('Kontroller koblinger. Utlegg som allerede finnes hoppes over.');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lese utleggsfilen.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    importPlan.rows.forEach((row, index) => {
      if (row.severity === 'block' || row.severity === 'existing' || dropped.has(String(index)) || !row.entry) return;
      chosen.push(row.entry);
    });
    if (!chosen.length) {
      setError('Ingen utlegg er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const stamp = new Date().toISOString();
      const entries = chosen.map((row) => ({
        ...row,
        id: row.id || createId('utl'),
        externalStore: true,
        storage: 'projectExpenses',
        createdAt: row.createdAt || stamp,
        updatedAt: stamp,
      }));
      await saveProjectExpenses(companyId, entries, {});
      setRemoteExpenses((current) => mergeExpenseLists(current, entries));
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${entries.length} utlegg er lagret.`);
      showSaveToast(`${entries.length} utlegg er lagret.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre utleggene.');
    } finally {
      setBusy(false);
    }
  }

  // Raden slik den er lagret (uten navn slått opp fra registrene).
  function storedRow(row) {
    const list = isExternalExpense(row) ? remoteExpenses : (state.expenses || []);
    return list.find((item) => item.id === row.id) || row;
  }

  function rowActions(row) {
    return expenseRowActions(row, { canManage, myEmployeeId });
  }

  function openNew() {
    setDraftError('');
    setPendingDelete(false);
    setDraft({
      date: today(),
      employeeId: myEmployeeId,
      category: 'other',
      chargeType: 'reinvoice',
    });
  }

  function openRow(row) {
    setDraftError('');
    setPendingDelete(false);
    setDraft({ ...storedRow(row) });
  }

  function closeDraft() {
    setDraft(null);
    setDraftError('');
    setPendingDelete(false);
  }

  function pickInDraft(kind, id) {
    setDraft((current) => ({
      ...current,
      ...expenseRegistryPatch(kind, id, {
        people,
        projects: lookup.projects || [],
        customers: lookup.customers || [],
        current,
      }),
    }));
  }

  /** Lagre skjemaet. approve: lagre og godkjenne i samme trykk. */
  async function saveDraft({ approve = false } = {}) {
    if (!draft || saving) return;
    const problem = expenseDraftProblem(draft, { needsProject: !seesAll });
    if (problem) {
      setDraftError(problem);
      return;
    }
    // Uten godkjenningsrett registrerer man bare egne utlegg.
    const employeeId = canManage ? (draft.employeeId || '') : (draft.employeeId || myEmployeeId);
    const employee = people.find((row) => row.id === employeeId);
    const input = emptyExpense({
      ...draft,
      employeeId,
      employeeName: employee?.label || draft.employeeName || '',
      date: parseDate(draft.date) || draft.date || today(),
      ...(approve ? { status: 'approved' } : {}),
    });
    const check = validateExpense(input);
    if (!check.ok) {
      setDraftError(check.error);
      return;
    }
    const isNew = !draft.id;
    if (isExternalExpense(input)) {
      setSaving(true);
      const result = await saveExpenseChange(companyId, input);
      setSaving(false);
      if (!result.ok) {
        setDraftError(result.error);
        return;
      }
      setRemoteExpenses((current) => mergeExpenseLists(current, [input]));
    } else {
      const result = upsertExpense(state, input);
      if (!result.ok) {
        setDraftError(result.error);
        return;
      }
      if (!setState(result.state)) return;
    }
    closeDraft();
    if (approve) showSaveToast('Utlegget er godkjent.');
    else showSaveToast(isNew ? 'Utlegget er registrert. Det venter på godkjenning.' : 'Utlegget er lagret.');
  }

  async function approveRow(row) {
    setError('');
    if (isExternalExpense(row)) {
      const next = { ...storedRow(row), status: 'approved' };
      const result = await saveExpenseChange(companyId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemoteExpenses((current) => mergeExpenseLists(current, [next]));
      showSaveToast('Utlegget er godkjent.');
      return;
    }
    const result = setExpenseStatus(state, row.id, 'approved');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (setState(result.state)) showSaveToast('Utlegget er godkjent.');
  }

  // Første trykk på «Slett» spør («Slett nå»), andre sletter (DRIFT-24).
  async function deleteDraft() {
    if (!draft?.id || saving) return;
    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }
    const row = storedRow(draft);
    if (isExternalExpense(row)) {
      setSaving(true);
      const result = await removeExpenseRow(companyId, row);
      setSaving(false);
      if (!result.ok) {
        setDraftError(result.error);
        return;
      }
      setRemoteExpenses((current) => current.filter((item) => item.id !== row.id));
    } else {
      const result = deleteExpense(state, row.id);
      if (!result.ok) {
        setDraftError(result.error);
        return;
      }
      if (!setState(result.state)) return;
    }
    closeDraft();
    showSaveToast('Utlegget er slettet.');
  }

  function toggleSort(key) {
    const map = {
      date: sort === 'date-desc' ? 'date-asc' : 'date-desc',
      employee: 'employee',
      customer: 'customer',
      project: 'project',
      amount: sort === 'amount-desc' ? 'amount-asc' : 'amount-desc',
      status: 'status',
    };
    setSort(map[key] || 'date-desc');
  }

  if (importPlan && importReview) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
        {!!error && <Text style={{ color: colors.dangerInk || colors.danger }}>{error}</Text>}
        <ExpenseImportReview
          colors={colors}
          review={importReview}
          employees={employees}
          customers={customers}
          projects={state.projects || []}
          busy={busy}
          readyCount={importReview.readyCount}
          linkQuery={linkQuery}
          setLinkQuery={setLinkQuery}
          onToggleCard={(card) => setDropped((current) => toggleExpenseReviewRow(current, card))}
          onToggleOkRow={(id) => setDropped((current) => toggleExpenseReviewRow(current, { id }))}
          onLinkEmployee={(rowIndex, person) => {
            setImportPlan((current) => linkExpenseImportPlanEmployee(current, rowIndex, person, { applyGroup: true }));
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkExpenseImportPlanProject(current, rowIndex, project, { applyGroup: true, customers }));
          }}
          onLinkCustomer={(rowIndex, customer) => {
            setImportPlan((current) => linkExpenseImportPlanCustomer(current, rowIndex, customer, { applyGroup: true }));
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); }}
        />
      </ScrollView>
    );
  }

  // På ansattsiden er medarbeideren gitt. Under «Internt» er kunde og prosjekt tomme.
  const showEmployee = !lockedId;
  const showProject = embedded || lockedId || activeScope !== 'internt';
  // Felles rapporttabell (UX-24): tabell på bred skjerm, kort med beskrivelse, dato, kunde,
  // beløp og status på telefon. Minstebreddene får plass ved siden av filterpanelet på PC.
  const columns = [
    { key: 'date', label: 'Dato', width: 92, kind: 'date', text: (row) => formatDate(row.date), phone: 'meta' },
    ...(showEmployee ? [{ key: 'employee', label: 'Medarbeider', width: 120, flex: 1, text: (row) => row.employeeName || '', phone: 'meta' }] : []),
    ...(showProject ? [
      { key: 'customer', label: 'Kunde', width: 120, flex: 1, text: (row) => row.customerName || '', phone: 'meta' },
      {
        key: 'project',
        label: 'Prosjekt',
        width: 140,
        flex: 1,
        // Under «Alle» står interne utlegg som «Internt».
        text: (row) => `${row.projectNumber ? `#${row.projectNumber} ` : ''}${row.projectName || ''}`.trim() || (isProjectExpense(row) ? '' : 'Internt'),
        phone: 'meta',
      },
    ] : []),
    { key: 'description', label: 'Beskrivelse', width: 170, flex: 1.5, text: (row) => row.purpose || row.description || '', sortable: false, phone: 'title' },
    { key: 'amount', label: 'Beløp', width: 110, kind: 'money', value: (row) => row.amountInclVat, text: (row) => money(row.amountInclVat), phone: 'amount' },
    { key: 'status', label: 'Status', width: 100, text: (row) => expenseStatusLabel(row.status), phone: 'badge' },
  ];
  const totalAmount = visible.reduce((sum, row) => sum + (Number(row.amountInclVat) || 0), 0);
  // Godkjenn rett i listen på PC. På telefon åpnes utlegget, og knappene står i skjemaet.
  const quickApprove = !embedded && canManage && !phone;
  const canOpenRows = !embedded;
  const showBilling = !embedded && access.tabAllowed('okonomi', 'fakturagrunnlag');

  const filterPanel = (
    <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="expense-filters">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i beskrivelse, kunde, prosjekt…"
        placeholderTextColor={colors.placeholder || colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
      <Text style={[styles.label, { color: colors.muted }]}>Periode</Text>
      <View style={styles.rowWrap}>
        {EXPENSE_PERIODS.map((item) => (
          <Choice key={item.id} label={item.label} on={period === item.id} onPress={() => setPeriod(item.id)} colors={colors} />
        ))}
      </View>
      {period === 'custom' ? (
        <View style={styles.rowWrap}>
          <TextInput
            value={fromDate}
            onChangeText={setFromDate}
            onBlur={() => setFromDate((value) => parseDate(value) || value)}
            placeholder="Fra dato"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.dateInput, { color: colors.ink, borderColor: colors.line }]}
          />
          <TextInput
            value={toDate}
            onChangeText={setToDate}
            onBlur={() => setToDate((value) => parseDate(value) || value)}
            placeholder="Til dato"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.dateInput, { color: colors.ink, borderColor: colors.line }]}
          />
        </View>
      ) : null}
      <Text style={[styles.label, { color: colors.muted }]}>Sortering</Text>
      <OptionPicker
        options={EXPENSE_SORT_OPTIONS}
        value={sort}
        onChange={(id) => { if (id) setSort(id); }}
        title="Sortering"
        clearable={false}
        small
      />
      <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
      <OptionPicker
        options={[{ id: '', label: 'Alle' }, ...EXPENSE_STATUSES.map((item) => ({ id: item.id, label: item.label }))]}
        value={status || ''}
        onChange={(id) => setStatus(id || '')}
        placeholder="Alle"
        title="Status"
        clearable={false}
        small
      />
      {lockedId ? null : (
        <TextInput
          value={employeeQuery}
          onChangeText={setEmployeeQuery}
          placeholder="Filtrer medarbeider"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
        />
      )}
      {showProject ? (
        <>
          <TextInput
            value={customerQuery}
            onChangeText={setCustomerQuery}
            placeholder="Filtrer kunde"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
          <TextInput
            value={projectQuery}
            onChangeText={setProjectQuery}
            placeholder="Filtrer prosjekt"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
        </>
      ) : null}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="utlegg">
      <View style={sideFilters ? styles.desk : styles.stack}>
      <View style={sideFilters ? styles.mainCol : styles.stack}>
      {hostedHero || embedded ? null : (
        <>
          <Breadcrumb tab="okonomi" subView="utlegg" />
          <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">Utlegg</Text>
        </>
      )}
      {!embedded && scopes.length > 1 ? (
        <View nativeID="expense-scope" accessibilityLabel="Utvalg" style={styles.scopeRow}>
          <OptionPicker
            options={scopes}
            value={activeScope}
            onChange={(id) => { if (id) setWantedScope(id); }}
            title="Utvalg"
            clearable={false}
          />
        </View>
      ) : null}
      <View style={styles.toolbar}>
        {canRegister ? (
          <Button variant="primary" icon="add" label="Nytt utlegg" nativeID="expense-new" onPress={openNew} />
        ) : null}
        {sideFilters ? null : (
          <Button
            label={filtersOpen ? 'Skjul filter' : 'Filter og sortering'}
            icon="options-outline"
            onPress={() => setFiltersOpen((open) => !open)}
          />
        )}
        {canImport ? (
          <Button
            label={busy ? 'Leser…' : 'Importer fra fil'}
            icon="cloud-upload-outline"
            accessibilityLabel="Importer prosjektutlegg"
            nativeID="expense-import-open"
            disabled={busy}
            onPress={importFile}
          />
        ) : null}
        {!embedded ? (
          <Button label="Eksporter CSV" icon="download-outline" onPress={() => downloadCsv('utlegg.csv', expensesToCsv(visible))} />
        ) : null}
        {showBilling ? (
          <Button label="Til fakturering" icon="receipt-outline" onPress={() => requestShellTab?.('okonomi', 'fakturagrunnlag')} />
        ) : null}
      </View>
      {!embedded ? (
        <Text style={[styles.lead, { color: colors.muted }]}>
          {activeScope === 'internt'
            ? 'Utlegg uten prosjekt. De faktureres ikke, men godkjennes og bokføres.'
            : 'Godkjente utlegg på prosjekt kommer med i Til fakturering og vises på prosjektet.'}
        </Text>
      ) : null}
      <InlineError
        message={error}
        nativeID="expense-error"
        onRetry={remoteReady ? () => { setError(''); setReloadKey((n) => n + 1); } : undefined}
      />
      {!!note && <Text style={{ color: colors.muted }}>{note}</Text>}
      <Text style={{ color: colors.muted }}>
        {remoteReady ? `${visible.length} av ${scopedRows.length} utlegg` : 'Laster utlegg…'}
      </Text>

      {!sideFilters && filtersOpen ? filterPanel : null}

      {!remoteReady && !allRows.length ? (
        <Skeleton.Table rows={5} columns={columns.length} label="Laster utlegg" />
      ) : (
        <ReportTable
          nativeID="expense-table"
          colors={colors}
          columns={columns}
          rows={visible}
          rowKey={(row) => row.id || row.importFingerprint}
          sort={sortState(sort)}
          onSort={(col) => toggleSort(col.key)}
          onOpen={canOpenRows ? openRow : undefined}
          rowNativeID={canOpenRows ? (row) => `expense-row-${row.id}` : undefined}
          rowLabel={(row) => [row.purpose || row.description, formatDate(row.date), money(row.amountInclVat), expenseStatusLabel(row.status)].filter(Boolean).join(', ')}
          renderCell={(row, col) => (col.key === 'status' ? (
            <Text style={[styles.status, { color: statusTone(row.status, colors), borderColor: colors.line }]} numberOfLines={1}>
              {expenseStatusLabel(row.status)}
            </Text>
          ) : undefined)}
          renderAction={quickApprove ? (row) => (rowActions(row).approve ? (
            <Button
              size="sm"
              label="Godkjenn"
              accessibilityLabel={`Godkjenn ${row.description || row.purpose || 'utlegget'}`}
              nativeID={`expense-approve-${row.id}`}
              onPress={() => approveRow(row)}
            />
          ) : null) : undefined}
          actionWidth={quickApprove ? 104 : 0}
          limit={pageSize}
          onMore={() => setPageSize((n) => n + 60)}
          totals={visible.length ? { amount: money(totalAmount) } : null}
          empty={allRows.length ? 'Ingen utlegg i dette utvalget.' : 'Ingen utlegg er registrert.'}
        />
      )}
      </View>
      {sideFilters ? <View style={styles.side}>{filterPanel}</View> : null}
      </View>
      {draft ? (
        <ExpenseSheet
          draft={draft}
          setDraft={setDraft}
          can={draft.id ? rowActions(storedRow(draft)) : { edit: true }}
          colors={colors}
          people={people}
          projectOptions={projectOptions}
          customerOptions={customerOptions}
          canPickEmployee={canManage}
          canInternal={seesAll}
          error={draftError}
          busy={saving}
          pendingDelete={pendingDelete}
          onPick={pickInDraft}
          onSave={() => saveDraft()}
          onApprove={() => saveDraft({ approve: true })}
          onDelete={deleteDraft}
          onOpenTrip={() => { closeDraft(); requestShellTab?.('okonomi', 'kjorebok'); }}
          onClose={closeDraft}
        />
      ) : null}
    </ScrollView>
  );
}

/** Ansattsiden (Prosjektutlegg-fanen) bruker samme liste, låst til personen. */
export const ProjectExpensesScreen = ExpensesScreen;

export default ExpensesScreen;

const styles = StyleSheet.create({
  body: { padding: space.md, gap: 10, paddingBottom: 48 },
  stack: { gap: 10 },
  desk: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 10 },
  side: { width: 300, flexShrink: 0 },
  title: { ...type.h1 },
  lead: { ...type.caption, maxWidth: 720 },
  scopeRow: { alignSelf: 'flex-start' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' },
  panel: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  label: { ...type.caption, fontWeight: '600', marginTop: space.xxs },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  choice: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 6 },
  choiceText: { ...type.caption },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.xs },
  dateInput: { minWidth: 140, flexGrow: 1 },
  status: { alignSelf: 'flex-start', ...type.caption, fontWeight: '600', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.xs, paddingVertical: 2, overflow: 'hidden' },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sheetCell: { flexGrow: 1, flexBasis: 200, minWidth: 0 },
  sheetMeta: { ...type.caption },
  sheetError: { ...type.caption, flexBasis: '100%', textAlign: 'right' },
  sheetValue: { ...type.body },
});
