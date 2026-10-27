import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  applyCustomerKind,
  companyFollowUpPeople,
  customerDraftFromBrreg,
  enrichCustomerFromBrreg,
  enrichCustomerImportPlan,
  formatOrgnr,
  identityFieldsForKind,
  customerImportReviewRows,
  customerInvoiceGaps,
  customersFromProjectLinks,
  importCustomers,
  maskPersonnummer,
  nextCustomerNumber,
  planCustomerImport,
  normalizeOrgnr,
  ownerLabel,
  projectLinkSummary,
  relatedContractsForCustomer,
  relatedProjectsForCustomer,
  upsertCustomer,
  withCustomerNumbers,
} from '../../src/anbud/customers';
import { CUSTOMER_IMPORT_ACCEPT } from '../../src/anbud/customerImport';
import { readCustomerImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { importResult } from '../../src/imports/review';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import CreateMenu from '../../components/CreateMenu';
import FilterMenu from '../../components/FilterMenu';
import ColumnSettingsMenu from '../../components/project/ColumnSettingsMenu';
import ReportTable from '../../components/table/ReportTable';
import useReportColumns from '../../components/table/useReportColumns';
import {
  CUSTOMER_INVOICE_FILTERS,
  CUSTOMER_PROJECT_FILTERS,
  CUSTOMER_REPORT_COLUMNS,
  customerKindCounts,
  customerKindMatches,
  customerOwnerOptions,
  customerReportRows,
  customerReportSummary,
  filterCustomerReport,
} from '../../src/anbud/customerReport';
import { INVOICE_PERIODS } from '../../src/economy/invoiceReport';
import { formatMoney } from '../../src/economy/invoices';
import { watchInvoices } from '../../src/economy/invoiceStorage';
import {
  hasColumnFilter,
  matchesColumnFilters,
  nextReportSort,
  reportExportRows,
  reportTotals,
  sortReportRows,
  visibleColumns,
} from '../../src/ui/reportTable';
import { dateKey } from '../../src/utils/dates';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { formatNok } from '../../src/anbud/model';
import { withCustomers } from '../../src/anbud/customerRegistry';
import { formatNumberId } from '../../src/anbud/numbering';
import { loadAnbudState, loadCustomerList, peekAnbudState, saveAnbudState, saveCustomers } from '../../src/anbud/storage';
import { loadProjectState } from '../../src/project/storage';
import { fetchBrregEnhet, searchBrregCompanies, searchBrregUnderenheter } from '../../src/utils/boligmappaApis';
import { pickDocument } from '../../src/utils/media';
import OwnerPicker from '../anbud/OwnerPicker';
import IndexLetterTable from '../../components/economy/IndexLetterTable';
import { lettersForCustomer } from '../../src/indeksregulering/groups';
import CustomerPhoneRow from './CustomerPhoneRow';

// Tabellen tegner en side om gangen. Tusenvis av rader på én gang låser nettleseren.
const PAGE_SIZE = 100;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Mobil har ingen kolonneoverskrifter. Sorteringen ligger i filtermenyen, som i prosjektlisten.
const PHONE_SORTS = [
  { id: 'customerNumber:asc', label: 'Kundenummer' },
  { id: 'name:asc', label: 'Navn A–Å' },
  { id: 'projectCount:desc', label: 'Flest prosjekter' },
  { id: 'invoiced:desc', label: 'Mest fakturert', invoice: true },
  { id: 'outstanding:desc', label: 'Mest utestående', invoice: true },
];

const KIND_FILTERS = [
  { id: '', label: 'Alle typer', nativeID: 'customer-filter-kind-all' },
  { id: 'org', label: 'Virksomhet', nativeID: 'customer-filter-kind-org' },
  { id: 'person', label: 'Privat', nativeID: 'customer-filter-kind-person' },
];

async function lookupBrregCustomer(orgnr) {
  const id = normalizeOrgnr(orgnr);
  if (!id) return null;
  try {
    const enhet = await fetchBrregEnhet(id);
    if (enhet?.organisasjonsnummer) return enhet;
  } catch {
    /* underenhet eller ikke funnet */
  }
  try {
    const under = await searchBrregUnderenheter(id, { size: 1 });
    return under.results?.[0] || null;
  } catch {
    return null;
  }
}

const EMPTY = {
  name: '',
  kind: 'org',
  orgnr: '',
  personnummer: '',
  address: '',
  place: '',
  postalCode: '',
  contactName: '',
  email: '',
  phone: '',
  notes: '',
  ownerUid: '',
  ownerName: '',
};

const FORM_FIELDS = [
  ['name', 'Navn'],
  ['orgnr', 'Organisasjonsnummer'],
  ['personnummer', 'Personnummer'],
  ['address', 'Adresse'],
  ['postalCode', 'Postnummer'],
  ['place', 'Sted'],
  ['contactName', 'Kontaktperson'],
  ['email', 'E-post'],
  ['phone', 'Telefon'],
  ['notes', 'Notat'],
];

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function fillFromBrreg(current, hit) {
  const draft = customerDraftFromBrreg(hit);
  if (!draft) return current;
  const take = (key) => current[key] || draft[key] || '';
  return applyCustomerKind({
    ...current,
    name: draft.name || current.name,
    orgnr: draft.orgnr || current.orgnr,
    address: take('address'),
    postalCode: take('postalCode'),
    place: take('place'),
    email: take('email'),
    phone: take('phone'),
    notes: current.notes || draft.notes,
  }, 'org');
}

export default function CustomersScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId, requestShellTab, shellIntent, clearShellIntent, members, uid } = useApp();
  const access = useCompanyAccess();
  // Import av kundelister krever Admin på Kunder.
  const canImport = canImportList(useCompanyAccess(), 'customers');
  // Fakturatallene per kunde vises bare for dem som kan se Faktura.
  const canSeeInvoices = !!access?.ready && !!access.canView?.('economyInvoices');
  const [state, setState] = useState(null);
  const [projects, setProjects] = useState([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [importReport, setImportReport] = useState(null);
  const [kindFilter, setKindFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [period, setPeriod] = useState('all');
  const [colFilter, setColFilter] = useState({});
  const [sort, setSort] = useState({ key: 'customerNumber', dir: 'asc' });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [exporting, setExporting] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [loadProblem, setLoadProblem] = useState(false);
  const [listReady, setListReady] = useState(false);
  const lookupRef = useRef('');
  const numberSave = useRef('');

  useEffect(() => {
    if (!familyId) {
      setState(null);
      setProjects([]);
      setLoadProblem(false);
      setListReady(false);
      return undefined;
    }
    let live = true;
    setLoadProblem(false);
    const peeked = peekAnbudState(familyId);
    if (peeked?.customers?.length) {
      setState(peeked);
      setListReady(true);
    } else {
      setListReady(false);
    }
    loadCustomerList(familyId, {
      onCache: (rows) => {
        if (!live || !rows.length) return;
        setState((current) => withCustomers(current, rows));
        setListReady(true);
        setLoadProblem(false);
      },
    }).then(async (picked) => {
      if (!live) return;
      if (picked.customers.length) {
        setState((current) => withCustomers(current, picked.customers));
        setListReady(true);
        setLoadProblem(false);
        return;
      }
      setListReady(true);
      if (picked.status === 'error') {
        setLoadProblem(true);
        return;
      }
      const projectState = await loadProjectState(familyId).catch(() => ({ projects: [] }));
      if (!live) return;
      const recovered = customersFromProjectLinks(projectState?.projects || []);
      if (recovered.length) {
        setState((current) => withCustomers(current, recovered));
        setNote('Kundelisten er hentet inn igjen fra prosjektene.');
        saveCustomers(familyId, recovered).catch(() => {});
        return;
      }
      const loaded = await loadAnbudState(familyId);
      if (!live) return;
      if (loaded?.customers?.length) {
        setState(loaded);
        setLoadProblem(false);
      }
    }).catch(() => {
      if (!live) return;
      setListReady(true);
      setLoadProblem(true);
    });
    loadProjectState(familyId).then((loaded) => {
      if (live) setProjects(loaded?.projects || []);
    }).catch(() => {
      if (live) setProjects([]);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (shellIntent?.type === 'openCustomer' && shellIntent.customerId) {
      setSelectedId(shellIntent.customerId);
      setView('detail');
      clearShellIntent?.();
    }
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    if (!familyId || !canSeeInvoices) {
      setInvoices([]);
      return undefined;
    }
    return watchInvoices(familyId, setInvoices, () => setInvoices([]));
  }, [familyId, canSeeInvoices]);

  const orgnrDigits = normalizeOrgnr(form.orgnr) || String(form.orgnr || '').replace(/\D/g, '').slice(0, 9);

  useEffect(() => {
    if (view !== 'edit' || form.kind !== 'org') {
      setHits([]);
      return undefined;
    }
    const q = orgnrDigits.length === 9 ? orgnrDigits : form.name.trim();
    if (q.length < 2) {
      setHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchBrregCompanies(q, { size: 8 });
        if (!live) return;
        setHits(res.results || []);
        const exact = (res.results || []).find((row) => row.organisasjonsnummer === orgnrDigits);
        if (exact && lookupRef.current !== orgnrDigits) {
          lookupRef.current = orgnrDigits;
          setForm((current) => fillFromBrreg(current, exact));
        }
      } catch (cause) {
        if (live) setHits([]);
        if (live && orgnrDigits.length === 9) {
          setError(cause?.message || 'Søket mot Brønnøysund feilet.');
        }
      } finally {
        if (live) setSearching(false);
      }
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [view, form.kind, form.name, orgnrDigits]);

  const customers = state?.customers || [];
  const contracts = state?.contracts || [];
  const followPeople = useMemo(() => companyFollowUpPeople(members), [members]);
  const numbered = useMemo(() => withCustomerNumbers(customers), [customers]);
  const reportColumns = useMemo(
    () => (canSeeInvoices ? CUSTOMER_REPORT_COLUMNS : CUSTOMER_REPORT_COLUMNS.filter((col) => !col.invoice)),
    [canSeeInvoices],
  );
  const [columnKeys, setColumnKeys, resetColumns] = useReportColumns('customers', uid, CUSTOMER_REPORT_COLUMNS);
  const listColumns = useMemo(() => visibleColumns(reportColumns, columnKeys), [reportColumns, columnKeys]);
  const reportRows = useMemo(
    () => customerReportRows(numbered, {
      projects,
      contracts,
      invoices: canSeeInvoices ? invoices : null,
      people: followPeople,
      period,
    }),
    [numbered, projects, contracts, canSeeInvoices, invoices, followPeople, period],
  );
  const ownerOptions = useMemo(() => customerOwnerOptions(reportRows), [reportRows]);
  // Søket filtrerer etter at tastetrykket er tegnet, så feltet ikke henger med mange rader.
  const searchQuery = useDeferredValue(query);
  const columnQuery = useDeferredValue(colFilter);
  // Alle filtre unntatt type, så hver typeknapp kan vise sitt antall.
  const unkinded = useMemo(
    () => filterCustomerReport(reportRows, {
      query: searchQuery,
      owner: ownerFilter,
      project: projectFilter,
      invoice: canSeeInvoices ? invoiceFilter : '',
    }).filter((row) => matchesColumnFilters(row, columnQuery, listColumns)),
    [reportRows, searchQuery, ownerFilter, projectFilter, canSeeInvoices, invoiceFilter, columnQuery, listColumns],
  );
  const kindCounts = useMemo(() => customerKindCounts(unkinded), [unkinded]);
  const visible = useMemo(
    () => sortReportRows(unkinded.filter((row) => customerKindMatches(row, kindFilter)), sort, reportColumns),
    [unkinded, kindFilter, sort, reportColumns],
  );
  const summary = useMemo(() => customerReportSummary(visible), [visible]);
  const totals = useMemo(() => {
    const sums = reportTotals(visible, listColumns);
    return Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, formatMoney(value)]));
  }, [visible, listColumns]);
  const filtered = !!(query || kindFilter || ownerFilter || projectFilter || (canSeeInvoices && invoiceFilter) || hasColumnFilter(colFilter));
  const projectSummary = useMemo(
    () => projectLinkSummary(projects, numbered),
    [projects, numbered],
  );
  const upcomingNumber = nextCustomerNumber(numbered);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, kindFilter, ownerFilter, projectFilter, invoiceFilter, period, colFilter, sort]);

  useEffect(() => {
    if (!state || !familyId || loadProblem) return undefined;
    const next = withCustomerNumbers(state.customers || []);
    const before = (state.customers || []).map((row) => `${row.id}|${row.customerNumber}|${row.notes}`).join('\n');
    const after = next.map((row) => `${row.id}|${row.customerNumber}|${row.notes}`).join('\n');
    if (before === after || numberSave.current === after) return undefined;
    numberSave.current = after;
    let live = true;
    saveCustomers(familyId, next).then((customers) => {
      if (live) setState((current) => withCustomers(current, customers));
    }).catch(() => {
      numberSave.current = '';
    });
    return () => {
      live = false;
    };
  }, [state, familyId, loadProblem]);
  const selected = numbered.find((row) => row.id === selectedId) || null;
  const related = selected ? relatedContractsForCustomer(contracts, selected) : [];
  const relatedProjects = selected ? relatedProjectsForCustomer(projects, selected) : [];
  const identity = identityFieldsForKind(form.kind);
  const brregFillRef = useRef('');

  useEffect(() => {
    if (view !== 'detail' || !selected?.id || !familyId) return undefined;
    const orgnr = normalizeOrgnr(selected.orgnr);
    if (!orgnr || selected.kind === 'person') return undefined;
    const key = `${selected.id}:${orgnr}:${selected.address || ''}:${selected.email || ''}:${selected.phone || ''}`;
    if (brregFillRef.current === key) return undefined;
    if (selected.address && selected.postalCode && selected.place && (selected.email || selected.phone)) {
      brregFillRef.current = key;
      return undefined;
    }
    let live = true;
    enrichCustomerFromBrreg(selected, { lookup: lookupBrregCustomer }).then(async ({ customer, changed }) => {
      if (!live || !changed) {
        if (live) brregFillRef.current = key;
        return;
      }
      const loaded = await loadAnbudState(familyId);
      const result = upsertCustomer(loaded, { ...customer, id: selected.id });
      if (!result.ok || !live) return;
      const saved = await saveAnbudState(result.state, familyId);
      if (!live) return;
      setState(saved);
      brregFillRef.current = `${selected.id}:${orgnr}:${customer.address || ''}:${customer.email || ''}:${customer.phone || ''}`;
      setNote('Adresse og kontakt er hentet fra Brønnøysund.');
    }).catch(() => {
      if (live) brregFillRef.current = key;
    });
    return () => {
      live = false;
    };
  }, [view, selected, familyId]);

  function patch(part) {
    setForm((current) => ({ ...current, ...part }));
    setError('');
  }

  function setKind(kind) {
    lookupRef.current = '';
    setHits([]);
    setForm((current) => applyCustomerKind(current, kind));
  }

  async function save() {
    const loaded = await loadAnbudState(familyId);
    const result = upsertCustomer(loaded, {
      ...form,
      id: view === 'edit' && selected ? selected.id : form.id,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = await saveAnbudState(result.state, familyId);
    setState(saved);
    setSelectedId(result.customer.id);
    setView('detail');
    setNote('Kunden er lagret.');
    showSaveToast('Kunden er lagret.');
    setError('');
  }

  function startNew() {
    lookupRef.current = '';
    setHits([]);
    setForm(EMPTY);
    setSelectedId('');
    setView('edit');
    setNote('');
    setError('');
  }

  function startEdit(customer) {
    lookupRef.current = normalizeOrgnr(customer.orgnr);
    setHits([]);
    setForm({
      ...EMPTY,
      ...customer,
      id: customer.id,
    });
    setSelectedId(customer.id);
    setView('edit');
  }

  function chooseHit(hit) {
    lookupRef.current = hit.organisasjonsnummer || '';
    setForm((current) => fillFromBrreg(current, hit));
    setHits([]);
    setNote('Feltene er fylt fra Brønnøysund. Kontroller og lagre.');
  }

  async function importFile() {
    if (!canImport) return;
    setError('');
    const file = await pickDocument({ accept: CUSTOMER_IMPORT_ACCEPT });
    if (!file) return;
    setImporting(true);
    try {
      const bytes = await bytesFromFile(file);
      const interpreted = await readCustomerImport(bytes, file.name, {
        familyId,
        ask: (payload) => askImportInterpret(payload),
      });
      const loaded = await loadAnbudState(familyId, { force: true });
      const planned = planCustomerImport(loaded, interpreted.rows);
      if (!planned.rows.length) {
        setError('Fant ingen kunder i filen.');
        return;
      }
      const plan = await enrichCustomerImportPlan(planned, { lookup: lookupBrregCustomer });
      const filled = plan.rows.filter((row) => row.action === 'create' && row.customer?.address).length;
      const understood = interpreted.engine && interpreted.engine !== 'lokal'
        ? (interpreted.engine.includes('ocr') ? ' Dokumentet er lest med OCR og AI.' : ' Ukjente kolonner er tolket med AI.')
        : '';
      const brregNote = filled
        ? ` Adresse og kontakt er hentet fra Brønnøysund der org.nr fantes.`
        : '';
      setImportPlan({ ...plan, understood: `${understood}${brregNote}` });
      setDropped(new Set());
      setImportReport(null);
      setNote('');
      setView('import');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese kundelisten.'));
    } finally {
      setImporting(false);
    }
  }

  function toggleCustomer(id) {
    setDropped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmCustomerImport() {
    if (!importPlan || importing) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      if (row.action !== 'create' && row.action !== 'update') {
        leftOut.push({
          name: row.name,
          reason: row.reason || 'Kan ikke importeres.',
        });
        return;
      }
      if (dropped.has(id) || !row.customer) {
        leftOut.push({
          name: row.name,
          reason: dropped.has(id) ? 'Valgt bort før lagring.' : 'Kan ikke importeres.',
        });
        return;
      }
      chosen.push(row);
    });
    if (!chosen.length) {
      setError('Ingen kunder er valgt for import.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const loaded = await loadAnbudState(familyId);
      const result = importCustomers(loaded, chosen.map((row) => row.customer));
      if (!result.created.length) {
        setError(result.error || 'Ingen kunder ble lagret.');
        return;
      }
      const saved = await saveAnbudState(result.state, familyId);
      setState(saved);
      const remaining = [...result.created];
      const imported = [];
      for (const row of chosen) {
        const index = remaining.findIndex((customer) => (
          (row.customer?.id && customer.id === row.customer.id)
          || customer.name === row.name
          || (
            row.customer?.customerNumber
            && customer.customerNumber === row.customer.customerNumber
          )
        ));
        if (index >= 0) {
          const [customer] = remaining.splice(index, 1);
          imported.push({ name: customer.name, issues: row.issues || [] });
        } else {
          leftOut.push({ name: row.name, reason: 'Ble ikke lagret.' });
        }
      }
      setImportReport(importResult(imported, leftOut));
      setImportPlan(null);
      setDropped(new Set());
      setView('list');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre kundelisten.');
    } finally {
      setImporting(false);
    }
  }

  const customerReviewRows = customerImportReviewRows(importPlan?.rows, dropped);

  function resetFilters() {
    setQuery('');
    setKindFilter('');
    setOwnerFilter('');
    setProjectFilter('');
    setInvoiceFilter('');
    setPeriod('all');
    setColFilter({});
  }

  function openCustomer(row) {
    setSelectedId(row.id);
    setView('detail');
  }

  async function exportRows() {
    if (!visible.length || exporting) return;
    setExporting(true);
    setError('');
    try {
      // Excel-byggeren lastes først når noen eksporterer.
      const { buildXlsx, downloadBytes } = await import('../../src/indeksregulering/office.js');
      const bytes = buildXlsx([{ name: 'Kunder', rows: reportExportRows(visible, reportColumns) }]);
      downloadBytes(`kunder-${dateKey(new Date())}.xlsx`, bytes, XLSX_MIME);
      showSaveToast(`${visible.length} kunder er eksportert.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke eksportere kundelisten.');
    } finally {
      setExporting(false);
    }
  }

  // Navnet får varsel når kunden må rettes før fakturering. Resten tegnes som tekst av tabellen.
  function renderCell(row, column) {
    if (column.key !== 'name') return undefined;
    return (
      <View style={styles.nameCell}>
        {row.gaps?.length ? (
          <Ionicons
            name="warning"
            size={16}
            color={colors.danger || '#b45309'}
            accessibilityLabel="Må rettes før fakturering"
          />
        ) : null}
        <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13, flex: 1 }} numberOfLines={2}>{row.name}</Text>
      </View>
    );
  }

  function cellTone(row, column) {
    if ((column.key === 'outstanding' || column.key === 'overdue') && row[column.key] > 0) return colors.danger || '#b42318';
    return null;
  }

  const summaryText = !listReady
    ? 'Henter kunder…'
    : loadProblem
      ? `Kunderegisteret ble ikke hentet · ${projectSummary.total} aktive i systemet`
      : [
        filtered ? `${visible.length} av ${numbered.length} kunder` : `${numbered.length} kunder`,
        `${projectSummary.linked} prosjekt på kunder`,
        `${projectSummary.total} aktive i systemet${projectSummary.unlinked ? ` (${projectSummary.unlinked} uten kunde)` : ''}`,
        canSeeInvoices ? `Fakturert eks. mva ${formatMoney(summary.invoiced)}` : '',
        canSeeInvoices ? `Utestående ${formatMoney(summary.outstanding)}` : '',
        `neste ledige er ${upcomingNumber}`,
      ].filter(Boolean).join(' · ');

  const filterGroups = [
    {
      id: 'kind',
      label: 'Type',
      value: kindFilter,
      onChange: (id) => setKindFilter(id || ''),
      options: KIND_FILTERS.map((row) => ({
        ...row,
        label: `${row.label} (${kindCounts[row.id] || 0})`,
      })),
    },
    ...(ownerOptions.length ? [{
      id: 'owner',
      label: 'Ansvarlig',
      nativeID: 'customer-filter-owner',
      dropdown: true,
      value: ownerFilter,
      onChange: (id) => setOwnerFilter(id || ''),
      options: [{ id: '', label: 'Alle ansvarlige' }, ...ownerOptions],
    }] : []),
    {
      id: 'project',
      label: 'Prosjekt',
      value: projectFilter,
      onChange: (id) => setProjectFilter(id || ''),
      options: [{ id: '', label: 'Med og uten prosjekt' }, ...CUSTOMER_PROJECT_FILTERS],
    },
    ...(canSeeInvoices ? [
      {
        id: 'invoice',
        label: 'Faktura',
        nativeID: 'customer-filter-invoice',
        dropdown: true,
        value: invoiceFilter,
        onChange: (id) => setInvoiceFilter(id || ''),
        options: [{ id: '', label: 'Med og uten faktura' }, ...CUSTOMER_INVOICE_FILTERS],
      },
      {
        id: 'period',
        label: 'Periode for fakturatall',
        nativeID: 'customer-filter-period',
        value: period,
        idle: 'all',
        onChange: (id) => setPeriod(id || 'all'),
        options: INVOICE_PERIODS,
      },
    ] : []),
    ...(isPhone ? [{
      id: 'sort',
      label: 'Sortering',
      value: `${sort.key}:${sort.dir}`,
      idle: 'customerNumber:asc',
      onChange: (value) => {
        const [key, dir] = String(value || '').split(':');
        setSort(key ? { key, dir: dir === 'desc' ? 'desc' : 'asc' } : { key: 'customerNumber', dir: 'asc' });
      },
      options: PHONE_SORTS.filter((row) => canSeeInvoices || !row.invoice),
    }] : []),
  ];
  const searchProps = {
    value: query,
    onChange: setQuery,
    placeholder: 'Søk i kundenr, navn, org.nr, sted, e-post, telefon',
    nativeID: 'customer-search',
    accessibilityLabel: 'Søk i kunder',
  };
  const exportButton = (
    <TouchableOpacity
      onPress={exportRows}
      disabled={exporting || !visible.length}
      accessibilityRole="button"
      accessibilityLabel="Eksporter til Excel"
      nativeID="customer-export"
      style={[styles.exportBtn, { borderColor: colors.line, backgroundColor: colors.card, opacity: exporting || !visible.length ? 0.55 : 1 }]}
    >
      <Ionicons name="download-outline" size={16} color={colors.ink} />
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{exporting ? 'Eksporterer…' : 'Eksporter til Excel'}</Text>
    </TouchableOpacity>
  );
  const resetLink = filtered ? (
    <TouchableOpacity onPress={resetFilters} accessibilityRole="button" nativeID="customer-filter-reset" style={styles.resetLink}>
      <Text style={{ color: colors.brand, fontSize: 13 }}>Nullstill filtre</Text>
    </TouchableOpacity>
  ) : null;

  const listBody = view === 'list' ? (
    <>
      <CreateMenu
        label="Ny kunde"
        title="Ny kunde"
        info={[
          'Org.nr hentes fra Brønnøysund. Privatkunder bruker personnummer.',
          'Import kjenner igjen eksisterende kunder på kundenummer, organisasjonsnummer og personnummer. Adresse og kontakt hentes fra Brønnøysund når org.nr finnes. Privatkunder uten kontakt merkes på kundekortet.',
        ]}
        actions={[
          { id: 'new', label: 'Registrer kunde', primary: true, onPress: startNew },
          ...(canImport ? [{ id: 'import', label: importing ? 'Tolker filen…' : 'Importer fil', onPress: importFile, disabled: importing }] : []),
        ]}
      />
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {importReport ? <ImportResult colors={colors} result={importReport} /> : null}
      {isPhone ? (
        <View style={styles.filters}>
          <View style={styles.toolRow}>
            <View style={styles.phoneMenu}>
              <FilterMenu search={searchProps} groups={filterGroups} />
            </View>
            {exportButton}
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="customer-summary">{summaryText}</Text>
          {resetLink}
        </View>
      ) : (
        <View style={styles.filters}>
          <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              nativeID={searchProps.nativeID}
              value={query}
              onChangeText={setQuery}
              placeholder={searchProps.placeholder}
              placeholderTextColor={colors.placeholder}
              accessibilityLabel={searchProps.accessibilityLabel}
              style={[styles.searchInput, { color: colors.ink }]}
            />
          </View>
          <FilterMenu row groups={filterGroups} />
          <View style={styles.toolRow}>
            <Text style={{ color: colors.muted, fontSize: 13, flex: 1, minWidth: 240 }} nativeID="customer-summary">{summaryText}</Text>
            {resetLink}
            <ColumnSettingsMenu
              columns={reportColumns}
              visibleKeys={columnKeys}
              onChange={setColumnKeys}
              onReset={resetColumns}
              nativeID="customer-column-settings"
            />
            {exportButton}
          </View>
        </View>
      )}
      {loadProblem ? (
        <Text style={{ color: colors.danger || '#b42318' }}>
          Kunne ikke hente kunderegisteret. Last siden på nytt.
        </Text>
      ) : null}
      {listReady && !loadProblem && !numbered.length ? (
        <Text style={{ color: colors.muted }}>Ingen kunder er registrert ennå.</Text>
      ) : null}
      {numbered.length ? (
        <ReportTable
          nativeID="customer-list"
          colors={colors}
          columns={listColumns}
          rows={visible}
          sort={sort}
          onSort={(column) => setSort((current) => nextReportSort(current, column))}
          filters={colFilter}
          onFilter={(key, value) => setColFilter((current) => ({ ...current, [key]: value }))}
          onOpen={openCustomer}
          rowNativeID={(row) => `customer-row-${row.id}`}
          rowLabel={(row) => `${row.customerNumber} ${row.name}${row.gaps?.length ? ' Må rettes før fakturering' : ''}`}
          renderCell={renderCell}
          cellTone={cellTone}
          limit={limit}
          onMore={() => setLimit((current) => current + PAGE_SIZE)}
          onShowAll={() => setLimit(visible.length)}
          totals={canSeeInvoices ? totals : null}
          phone={isPhone}
          renderCard={(row) => (
            <CustomerPhoneRow
              customer={row}
              people={followPeople}
              projectCount={row.projectCount}
              colors={colors}
              onPress={() => openCustomer(row)}
            />
          )}
          empty="Ingen kunder treffer søket eller filteret."
        />
      ) : null}
    </>
  ) : null;

  const busyOverlay = (
    <BrandBusyOverlay
      visible={importing}
      label={importPlan ? 'Lagrer kunder…' : 'Leser fil…'}
      detail="Vent til operasjonen er ferdig før du går videre."
    />
  );

  // Bred skjerm: listen fyller siden og tabellen ruller selv, som prosjektlisten.
  if (view === 'list' && !isPhone) {
    return (
      <>
        <View style={[styles.screen, styles.screenDesk, { backgroundColor: colors.bg }]}>
          <View style={[styles.inner, styles.innerDesk]}>
            {listBody}
          </View>
        </View>
        {busyOverlay}
      </>
    );
  }

  return (
    <>
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
      keyboardShouldPersistTaps="handled"
    >
      {(view === 'import' || (view === 'detail' && selected)) ? (
        <Text style={[styles.title, { color: colors.ink }]}>
          {view === 'import' ? 'Kontroller import' : selected.name}
        </Text>
      ) : null}
      {view === 'import' && importPlan ? (
        <ImportReview
          nativeID="customers-import-plan"
          colors={colors}
          lead={`Ingenting er lagret ennå. Kunder som finnes fra før hoppes over. Virksomheter fylles fra Brønnøysund når org.nr finnes.${importPlan.understood || ''}`}
          rows={customerReviewRows}
          busy={importing}
          confirmLabel={(count) => `Importer ${count} kunder`}
          onToggle={toggleCustomer}
          onConfirm={confirmCustomerImport}
          onOpenExisting={(customerId) => {
            setImportPlan(null);
            setDropped(new Set());
            setQuery('');
            setKindFilter('');
            setSelectedId(customerId);
            setView('detail');
            setNote('Kunden finnes allerede i registeret — her er kortet.');
          }}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); setView('list'); }}
        />
      ) : null}

      {listBody}

      {view === 'edit' ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{form.id ? 'Endre kunde' : 'Ny kunde'}</Text>
          <Text style={{ color: colors.ink }}>
            {`Kundenummer ${form.id ? (form.customerNumber || selected?.customerNumber || '') : upcomingNumber}`}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Nummeret følger rekkefølgen. En ny kunde får automatisk neste ledige.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setKind('org')} accessibilityRole="button">
              <Text style={{ color: form.kind === 'org' ? colors.brand : colors.ink }}>Virksomhet</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setKind('person')} accessibilityRole="button">
              <Text style={{ color: form.kind === 'person' ? colors.brand : colors.ink }}>Privatkunde</Text>
            </TouchableOpacity>
          </View>
          {form.kind === 'org' ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Skriv ni siffer i org.nr, eller firmanavn, så hentes navn og adresse fra Brønnøysund.
            </Text>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Privatkunder registreres med personnummer. Organisasjonsnummer brukes ikke.
            </Text>
          )}
          {FORM_FIELDS.filter(([key]) => {
            if (key === 'orgnr') return identity.orgnr;
            if (key === 'personnummer') return identity.personnummer;
            return true;
          }).map(([key, label]) => (
            <View key={key} style={{ gap: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
              <TextInput
                value={form[key]}
                onChangeText={(value) => patch({ [key]: value })}
                placeholder={key === 'orgnr' ? 'Ni siffer eller søk på navn over' : ''}
                placeholderTextColor={colors.placeholder}
                keyboardType={key === 'orgnr' || key === 'personnummer' || key === 'postalCode' || key === 'phone' ? 'number-pad' : 'default'}
                multiline={key === 'notes'}
                style={[styles.input, key === 'notes' && { minHeight: 80 }, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          ))}
          {form.kind === 'org' && (searching || hits.length) ? (
            <View style={{ gap: 8 }}>
              <View style={styles.row}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Brønnøysund</Text>
                {searching ? <ActivityIndicator size="small" color={colors.brand} /> : null}
              </View>
              {hits.slice(0, 6).map((hit) => (
                <TouchableOpacity
                  key={hit.organisasjonsnummer || hit.navn}
                  onPress={() => chooseHit(hit)}
                  accessibilityRole="button"
                  style={[styles.hit, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink }}>{hit.navn}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {[hit.organisasjonsnummerFormatted || hit.organisasjonsnummer, hit.organisasjonsform, hit.addressLabel].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <OwnerPicker
            colors={colors}
            people={followPeople}
            value={form.ownerUid}
            onChange={(person) => patch({
              ownerUid: person ? (person.uid || person.id) : '',
              ownerName: person ? person.name : '',
            })}
          />
          <View style={styles.row}>
            <TouchableOpacity onPress={save} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Lagre kunde</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setView(selected ? 'detail' : 'list')} accessibilityRole="button">
              <Text style={{ color: colors.muted }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {view === 'detail' && !state ? (
        <Text style={{ color: colors.muted }}>Laster kunde…</Text>
      ) : null}
      {view === 'detail' && state && !selected ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink }}>Kunden finnes ikke i registeret.</Text>
          <TouchableOpacity onPress={() => { setView('list'); setSelectedId(''); }} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Til kundelisten</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {view === 'detail' && selected ? (
        <View style={{ gap: 12 }}>
          <TouchableOpacity onPress={() => setView('list')} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Til kundelisten</Text>
          </TouchableOpacity>
          {customerInvoiceGaps(selected).length ? (
            <View
              nativeID="customer-invoice-gaps"
              style={[styles.card, { borderColor: colors.danger || '#b45309', backgroundColor: colors.card, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }]}
            >
              <Ionicons name="warning" size={20} color={colors.danger || '#b45309'} accessibilityLabel="Må rettes før fakturering" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.danger || '#b45309', fontWeight: '700' }}>Må rettes før fakturering</Text>
                {customerInvoiceGaps(selected).map((issue) => (
                  <Text key={issue} style={{ color: colors.ink }}>{issue}</Text>
                ))}
              </View>
            </View>
          ) : null}
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Kundeforhold</Text>
            <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '600' }}>{selected.name}</Text>
            <Text style={{ color: colors.ink }}>{`Kundenummer ${selected.customerNumber || '—'}`}</Text>
            <Text style={{ color: colors.ink }}>{selected.kind === 'person' ? 'Privatkunde' : 'Virksomhet'}</Text>
            {selected.kind !== 'person' && selected.orgnr ? <Text style={{ color: colors.ink }}>Org.nr {formatOrgnr(selected.orgnr)}</Text> : null}
            {selected.kind === 'person' && selected.personnummer ? <Text style={{ color: colors.ink }}>Personnummer {maskPersonnummer(selected.personnummer)}</Text> : null}
            {selected.address ? <Text style={{ color: colors.ink }}>{selected.address}</Text> : null}
            {selected.place ? <Text style={{ color: colors.ink }}>{[selected.postalCode, selected.place].filter(Boolean).join(' ')}</Text> : null}
            {selected.contactName ? <Text style={{ color: colors.ink }}>Kontakt {selected.contactName}</Text> : null}
            {selected.email ? <Text style={{ color: colors.ink }}>{selected.email}</Text> : null}
            {selected.phone ? <Text style={{ color: colors.ink }}>{selected.phone}</Text> : null}
            {ownerLabel(selected, followPeople) ? (
              <Text style={{ color: colors.ink }}>Ansvarlig {ownerLabel(selected, followPeople)}</Text>
            ) : (
              <Text style={{ color: colors.muted }}>Ingen ansvarlig er tildelt.</Text>
            )}
            <OwnerPicker
              colors={colors}
              people={followPeople}
              value={selected.ownerUid}
              onChange={async (person) => {
                const loaded = await loadAnbudState(familyId);
                const result = upsertCustomer(loaded, {
                  ...selected,
                  ownerUid: person ? (person.uid || person.id) : '',
                  ownerName: person ? person.name : '',
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                const saved = await saveAnbudState(result.state, familyId);
                setState(saved);
                setNote(person ? `Ansvarlig: ${person.name}.` : 'Ansvarlig er fjernet.');
                showSaveToast(person ? `Ansvarlig: ${person.name}.` : 'Ansvarlig er fjernet.');
              }}
            />
            {selected.notes ? <Text style={{ color: colors.muted }}>{selected.notes}</Text> : null}
            <TouchableOpacity onPress={() => startEdit(selected)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Endre kunde</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>
              Avtaler{related.length ? ` (${related.length})` : ''}
            </Text>
            {related.length ? related.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => requestShellTab?.('kontrakt', null, { type: 'openContract', contractId: row.id })}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.ink }}>{kindLabel(row.kind) || 'Avtale'} · {row.title}</Text>
                <Text style={{ color: colors.muted }}>
                  {[formatNumberId(row.systemId) && `System ${formatNumberId(row.systemId)}`, formatNumberId(row.oppdragId) && `Oppdrag ${formatNumberId(row.oppdragId)}`].filter(Boolean).join(' · ')}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {[row.start, row.end].filter(Boolean).join(' – ') || 'Uten periode'}
                  {row.value ? ` · ${formatNok(row.value)}` : ''}
                </Text>
              </TouchableOpacity>
            )) : <Text style={{ color: colors.muted }}>Ingen avtaler er knyttet til kunden ennå.</Text>}
            <TouchableOpacity
              onPress={() => requestShellTab?.('kontrakt', null, { type: 'composeAgreement', customerId: selected.id })}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand }}>Registrer avtale</Text>
            </TouchableOpacity>
          </View>
          <View nativeID="customer-index-letters" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Økonomi</Text>
            <IndexLetterTable
              rows={lettersForCustomer(selected, contracts)}
              colors={colors}
              title="Indeksreguleringer"
              empty="Ingen indeksbrev er lagret på kundens avtaler."
            />
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>
              Prosjekt{relatedProjects.length ? ` (${relatedProjects.length})` : ''}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Prosjekt der kunden er oppført som oppdragsgiver, vises her automatisk.
            </Text>
            {relatedProjects.length ? relatedProjects.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => requestShellTab?.('projects', null, { type: 'openProject', projectId: row.id })}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.ink }}>
                  {[row.number, row.name || 'Prosjekt uten navn'].filter(Boolean).join(' · ')}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {[
                    row.projectStatus || row.phase,
                    [row.start, row.end].filter(Boolean).join(' – '),
                    row.place || [row.street, row.placeName].filter(Boolean).join(', '),
                    row.manager,
                  ].filter(Boolean).join(' · ') || 'Uten status'}
                </Text>
              </TouchableOpacity>
            )) : <Text style={{ color: colors.muted }}>Ingen prosjekt er knyttet til kunden ennå.</Text>}
          </View>
        </View>
      ) : null}
    </ScrollView>
    {busyOverlay}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  title: { fontSize: 22, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  hit: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 2 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, backgroundColor: '#fff' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  // Blir toppen høyere enn skjermen, ruller siden. Ellers fyller tabellen resten.
  screenDesk: { minHeight: 0, ...(Platform.OS === 'web' ? { overflowY: 'auto' } : null) },
  innerDesk: { flex: 1, minHeight: 0, paddingBottom: 16 },
  filters: { gap: 10, flexShrink: 0 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 42 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 9 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  phoneMenu: { flexShrink: 1, maxWidth: '72%' },
  resetLink: { paddingVertical: 6, paddingHorizontal: 4, alignSelf: 'flex-start' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
