import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { useLayout } from '../../src/theme';
import { touchHit } from '../../src/ui/touchTarget';
import { showSaveToast } from '../../src/ui/saveToast';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import ConfirmDialog from '../../components/ConfirmDialog';
import FilterMenu from '../../components/FilterMenu';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { ImportResult } from '../../components/ImportReview';
import InvoiceImportReview from '../../components/InvoiceImportReview';
import ColumnSettingsMenu from '../../components/project/ColumnSettingsMenu';
import ReportTable from '../../components/table/ReportTable';
import useReportColumns from '../../components/table/useReportColumns';
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  INVOICE_IMPORT_ACCEPT,
  buildInvoiceImportReview,
  linkImportPlanCustomer,
  linkImportPlanProject,
  toggleInvoiceReviewRow,
} from '../../src/economy/invoiceImport.js';
import { readInvoiceImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import {
  canDeleteInvoice,
  formatDate,
  formatMoney,
  isInvoiceOverdue,
  isInvoiceSent,
} from '../../src/economy/invoices.js';
import {
  INVOICE_PERIODS,
  INVOICE_REPORT_COLUMNS,
  filterInvoiceReport,
  invoiceFilterOptions,
  invoiceOutstanding,
  invoiceReportStatus,
  invoiceReportSummary,
  invoiceStatusChoices,
  reportStatusLabel,
} from '../../src/economy/invoiceReport.js';
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
import * as invoiceStorage from '../../src/economy/invoiceStorage.js';
import { releaseInvoicedWork } from '../../src/economy/invoiceRelease.js';
import { loadAnbudState } from '../../src/anbud/storage';
import { loadProjectState } from '../../src/project/storage';
import { invoiceIndexWarning } from '../../src/indeksregulering/groups';
import { mergeIndexSnapshot } from '../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../src/indeksregulering/remoteSsb';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { dueByContractId, osloDate } from '../../src/indeksregulering/watch';
import InvoicePage from './invoice/InvoicePage';
import { useShellDetail } from '../../src/navigation/shellDetail';
import { DetailMissing } from '../../src/ui/BackLink';
import { DeleteDraftDialog, PaymentDialog } from './invoice/InvoiceDialogs';
import { deleteDraft, payment } from './invoice/invoiceActions';
import PowerOfficeSyncLine from './PowerOfficeSyncLine';
import { loadPowerOfficeStatus, syncPowerOfficeInvoices, transferInvoiceToPowerOffice } from '../../src/economy/powerOfficeClient.js';
import { syncCountsText } from '../../src/economy/powerOfficeView.js';
import { isCreditNote, isDraftInvoice } from '../../src/economy/invoiceFlow.js';
import { resolveProjectInvoiceSettings } from '../../src/project/invoiceSettings.js';
import { resolveCompanyInvoiceDefaults } from '../../src/economy/companyInvoiceDefaults.js';
import { resolveCompanyAccounts } from '../../src/economy/companyChart.js';
import { useCompanyAiGuard } from '../../src/privacy/useCompanyAi';

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

// Tabellen tegner en side om gangen. Tusenvis av rader på én gang låser nettleseren.
const PAGE_SIZE = 100;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ACTION_WIDTH = 44;
const DEFAULT_SORT = { key: 'invoiceDate', dir: 'desc' };
// Mobil har ingen kolonneoverskrifter. Sorteringen ligger i filtermenyen, som i prosjektlisten.
const PHONE_SORTS = [
  { id: 'invoiceDate:desc', label: 'Nyeste fakturadato' },
  { id: 'invoiceDate:asc', label: 'Eldste fakturadato' },
  { id: 'dueDate:asc', label: 'Tidligste forfall' },
  { id: 'amountInclVat:desc', label: 'Største beløp' },
  { id: 'outstanding:desc', label: 'Mest utestående' },
  { id: 'customerName:asc', label: 'Kunde A–Å' },
];

function statusTone(status, colors) {
  if (status === 'paid' || status === 'approved') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'overdue' || status === 'written_off') return { bg: '#fee4e2', fg: colors.danger || '#b42318' };
  if (status === 'sent' || status === 'issued' || status === 'transferred') return { bg: '#e0f2fe', fg: '#075985' };
  if (status === 'partly_paid') return { bg: '#fef3c7', fg: '#92400e' };
  if (status === 'credited' || status === 'partly_credited' || status === 'credit_note') return { bg: '#f3e8ff', fg: '#6b21a8' };
  return { bg: colors.sunken || '#f1f5f9', fg: colors.ink || '#334155' };
}

function InvoiceStatusBadge({ status, colors }) {
  const tone = statusTone(status, colors);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: '600' }}>{reportStatusLabel(status)}</Text>
    </View>
  );
}

export default function EconomyInvoices({
  familyId,
  customers = [],
  projects = [],
  onOpenCustomer,
  onOpenProject,
  openInvoiceId = '',
  onConsumeIntent,
  storage = null,
  supplier = {},
  isAdmin = false,
  demoProjectState = null,
}) {
  const store = storage || invoiceStorage;
  const {
    loadInvoice,
    saveInvoice,
    saveInvoiceImport,
    removeInvoice,
    watchInvoices,
  } = store;
  const colors = useColors();
  const { requestShellTab, uid, family, activeProfile } = useApp();
  const actor = useMemo(() => ({ byUid: uid || '', byName: activeProfile?.name || '' }), [uid, activeProfile?.name]);
  const access = useCompanyAccess();
  // Import av fakturalister krever Admin på Faktura.
  const canImport = canImportList(useCompanyAccess(), 'economyInvoices');
  const hostedHero = useModuleHeroHosted();
  const {
    width, isPhone, hasRail, railWidth, isTouch,
  } = useLayout();
  // Ikonknappene ved raden: 18 px ikon med padding 4; trykkflaten er 44 px på berøringsskjerm (UX-26).
  const rowHit = touchHit(18, 20, { touch: isTouch, os: Platform.OS, inset: 4 });
  const rowHitSlop = rowHit.hitSlop || { top: 8, bottom: 8, left: 8, right: 8 };
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 720;
  const wideDetail = !isPhone && contentWidth >= 900;
  // Utkast lages, godkjennes og ferdigstilles av alle med redigeringstilgang til Faktura.
  const canManage = !!isAdmin || !!demoProjectState || !!access?.canEdit?.('economyInvoices');
  const guardAi = useCompanyAiGuard();
  const [columnKeys, setColumnKeys, resetColumns] = useReportColumns('invoices', uid, INVOICE_REPORT_COLUMNS);
  const listColumns = useMemo(() => visibleColumns(INVOICE_REPORT_COLUMNS, columnKeys), [columnKeys]);

  const [invoices, setInvoices] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [period, setPeriod] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [colFilter, setColFilter] = useState({});
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftDelete, setDraftDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [paymentRow, setPaymentRow] = useState(null);
  const [fullId, setFullId] = useState('');
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [watch, setWatch] = useState(null);
  const [poStatus, setPoStatus] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState(null); // { label, done?, total? }
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Fakturaen i en lenke som ikke finnes her eller ikke kan leses.
  const [missingId, setMissingId] = useState('');
  const hiddenIds = useRef(new Set());
  // Fakturaen har egen adresse (/hjem/okonomi/faktura/:id). Tilbake i nettleseren går til listen.
  const link = useShellDetail('invoice', view === 'detail' ? selectedId : '', {
    onOpen: (id) => {
      setSelectedId(id);
      setView('detail');
      setError('');
    },
    onClose: () => {
      setView('list');
      setSelectedId('');
    },
  });

  useEffect(() => {
    let live = true;
    if (demoProjectState) {
      setWatch({ contracts: [], projectState: demoProjectState, timeEntries: demoProjectState.timeEntries || [], dueById: {} });
      return undefined;
    }
    Promise.all([
      loadAnbudState(familyId).catch(() => null),
      loadProjectState(familyId).catch(() => null),
      loadCases(familyId).catch(() => []),
      loadIndexCache().catch(() => null),
      loadRemoteIndexSnapshot().catch(() => null),
    ]).then(([anbud, projectState, cases, cache, remote]) => {
      if (!live) return;
      const contracts = anbud?.contracts || [];
      setWatch({
        contracts,
        projectState: projectState || null,
        timeEntries: projectState?.timeEntries || [],
        dueById: dueByContractId(contracts, cases, mergeIndexSnapshot(cache?.series, remote)),
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId, demoProjectState]);

  useEffect(() => {
    const id = String(openInvoiceId || '').trim();
    if (!id) return;
    setSelectedId(id);
    setView('detail');
    setError('');
    onConsumeIntent?.();
  }, [openInvoiceId, onConsumeIntent]);

  useEffect(() => {
    const stop = watchInvoices(familyId, (rows) => {
      const hidden = hiddenIds.current;
      setInvoices(hidden.size ? rows.filter((row) => !hidden.has(row.id)) : rows);
      setReady(true);
    }, () => setReady(true));
    return stop;
  }, [familyId]);

  useEffect(() => {
    if (!selectedId || !familyId) {
      setSelected(null);
      return;
    }
    let live = true;
    // Listeraden mangler linjer. Den vises til hele fakturaen er hentet, og handlingene venter.
    // En faktura som allerede er åpen, byttes ikke tilbake til listeraden.
    const summary = invoices.find((row) => row.id === selectedId) || null;
    if (summary) setSelected((current) => (current?.id === selectedId ? current : summary));
    loadInvoice(familyId, selectedId).then((row) => {
      if (!live) return;
      if (!row) {
        if (!summary) setMissingId(selectedId);
        return;
      }
      setMissingId('');
      if (row.partial) {
        setSelected((current) => (current?.id === row.id ? current : row));
        return;
      }
      setSelected(row);
      setFullId(row.id);
    }).catch(() => {
      if (live && !summary) setMissingId(selectedId);
    });
    return () => { live = false; };
  }, [selectedId, familyId, invoices]);

  useEffect(() => {
    let live = true;
    setPoStatus(null);
    if (!canManage || !familyId) return undefined;
    loadPowerOfficeStatus(familyId).then((next) => {
      if (live) setPoStatus(next);
    }).catch(() => {});
    return () => { live = false; };
  }, [canManage, familyId]);

  // Søket filtrerer etter at tastetrykket er tegnet, så feltet ikke henger med mange rader.
  const searchQuery = useDeferredValue(query);
  const columnQuery = useDeferredValue(colFilter);
  const filterOptions = useMemo(() => invoiceFilterOptions(invoices), [invoices]);
  // Alle filtre unntatt status, så hver statusknapp kan vise sitt antall.
  const unstatused = useMemo(
    () => filterInvoiceReport(invoices, {
      query: searchQuery,
      period,
      customer: customerFilter,
      project: projectFilter,
    }).filter((row) => matchesColumnFilters(row, columnQuery, listColumns)),
    [invoices, searchQuery, period, customerFilter, projectFilter, columnQuery, listColumns],
  );
  const statusChoices = useMemo(() => {
    const choices = invoiceStatusChoices(unstatused);
    if (!statusFilter || choices.some((row) => row.id === statusFilter)) return choices;
    return [...choices, { id: statusFilter, label: reportStatusLabel(statusFilter), count: 0 }];
  }, [unstatused, statusFilter]);
  const visible = useMemo(
    () => sortReportRows(
      statusFilter ? unstatused.filter((row) => invoiceReportStatus(row) === statusFilter) : unstatused,
      sort,
      INVOICE_REPORT_COLUMNS,
    ),
    [unstatused, statusFilter, sort],
  );
  const summary = useMemo(() => invoiceReportSummary(visible), [visible]);
  const totals = useMemo(() => {
    const sums = reportTotals(visible, listColumns);
    return Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, formatMoney(value)]));
  }, [visible, listColumns]);
  const filtered = !!(query || statusFilter || period !== 'all' || customerFilter || projectFilter || hasColumnFilter(colFilter));
  const importReview = useMemo(
    () => (importPlan ? buildInvoiceImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );
  const importReadyCount = useMemo(() => {
    if (!importPlan) return 0;
    return importPlan.rows.filter((row, index) => (
      row.severity !== 'block'
      && row.severity !== 'existing'
      && !dropped.has(String(index))
      && row.invoice
    )).length;
  }, [importPlan, dropped]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, statusFilter, period, customerFilter, projectFilter, colFilter, sort, invoices.length]);

  function resetFilters() {
    setQuery('');
    setStatusFilter('');
    setPeriod('all');
    setCustomerFilter('');
    setProjectFilter('');
    setColFilter({});
  }

  async function exportRows() {
    if (!visible.length || exporting) return;
    setExporting(true);
    setError('');
    try {
      // Excel-byggeren lastes først når noen eksporterer.
      const { buildXlsx, downloadBytes } = await import('../../src/indeksregulering/office.js');
      const bytes = buildXlsx([{ name: 'Fakturaer', rows: reportExportRows(visible, INVOICE_REPORT_COLUMNS) }]);
      downloadBytes(`fakturaer-${dateKey(new Date())}.xlsx`, bytes, XLSX_MIME);
      showSaveToast(`${visible.length} fakturaer er eksportert.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke eksportere fakturaene.');
    } finally {
      setExporting(false);
    }
  }

  async function importFile() {
    if (!canImport) return;
    setError('');
    const file = await pickDocument({ accept: INVOICE_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    setProgress({ label: 'Leser fil…' });
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readInvoiceImport(bytes, file.name, {
        familyId,
        existingInvoices: invoices,
        customers,
        projects,
      }, guardAi((payload) => askImportInterpret(payload)));
      if (!plan.rows.length) {
        setError('Fant ingen fakturaer i filen.');
        return;
      }
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setLinkQuery({});
      const engine = plan.interpretation?.engine;
      setNote(engine && engine !== 'lokal'
        ? `Listen er tolket (${engine}). Kontroller koblinger før import.`
        : '');
      setView('import');
      setProgress(null);
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese fakturalisten.'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      if (row.severity === 'existing' || row.severity === 'block' || dropped.has(id) || !row.invoice) {
        leftOut.push({
          name: row.title || 'Uten fakturanr',
          reason: row.severity === 'existing'
            ? (row.issues?.[0] || 'Finnes allerede.')
            : row.severity === 'block'
              ? (row.issues?.[0] || 'Kan ikke importeres.')
              : 'Valgt bort før lagring.',
        });
        return;
      }
      chosen.push(row);
    });
    if (!chosen.length) {
      setError('Ingen fakturaer er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress({ label: 'Lagrer fakturaer…', done: 0, total: chosen.length });
    try {
      const result = await saveInvoiceImport(
        familyId,
        chosen.map((row) => row.invoice),
        { onProgress: (done, total) => setProgress({ label: 'Lagrer fakturaer…', done, total }) },
      );
      const withIssues = chosen.filter((row) => (row.issues || []).length).length;
      const without = chosen.length - withIssues;
      const report = importResult(
        [{ name: `${chosen.length} fakturaer`, issues: withIssues ? [`${withIssues} med avvik mot kunde/prosjekt`] : [] }],
        leftOut,
      );
      report.saved = chosen.length;
      report.total = chosen.length + leftOut.length;
      report.complete = !leftOut.length && !withIssues;
      report.attention = withIssues
        ? [{
          name: `${withIssues} fakturaer importert med avvik`,
          issues: [
            'Kunde eller prosjekt mangler kobling. Åpne fakturaen i listen for detaljer, eller importer prosjekt-/kunderegister først.',
            without ? `${without} uten avvik.` : '',
          ].filter(Boolean),
        }]
        : [];
      setImportReport(report);
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${result.saved} fakturaer er lagret.`);
      showSaveToast(`${result.saved} fakturaer er lagret.`);
      setView('list');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre fakturaene.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const busyOverlay = (
    <BrandBusyOverlay
      visible={busy}
      label={progress?.label || 'Jobber…'}
      detail="Vent til operasjonen er ferdig før du går videre."
      done={progress?.done}
      total={progress?.total}
    />
  );

  function openInvoice(row) {
    setSelectedId(row.id);
    setView('detail');
    setError('');
    setImportReport(null);
  }

  async function confirmDeleteInvoice() {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target?.id || !canManage || typeof removeInvoice !== 'function') return;
    hiddenIds.current.add(target.id);
    setInvoices((rows) => rows.filter((row) => row.id !== target.id));
    if (selectedId === target.id) {
      setView('list');
      setSelectedId('');
      setSelected(null);
    }
    setDeleting(false);
    setError('');
    try {
      let source = target;
      if (!Array.isArray(target.timeEntryIds) && typeof loadInvoice === 'function') {
        source = await loadInvoice(familyId, target.id) || target;
      }
      await removeInvoice(familyId, target.id);
      setNote(`Faktura ${target.invoiceNumber || target.id} er slettet.`);
      showSaveToast(`Faktura ${target.invoiceNumber || ''} er slettet.`);
      void releaseInvoicedWork(familyId, source).catch(() => {});
    } catch (cause) {
      hiddenIds.current.delete(target.id);
      setInvoices((rows) => (rows.some((row) => row.id === target.id) ? rows : [target, ...rows]));
      setError(cause?.message || 'Kunne ikke slette fakturaen.');
    }
  }

  const indexWarning = useMemo(() => {
    if (!selected?.projectId || !watch) return null;
    return invoiceIndexWarning({
      projectId: selected.projectId,
      projects,
      contracts: watch.contracts,
      timeEntries: watch.timeEntries,
      dueById: watch.dueById,
      today: osloDate(),
    });
  }, [selected?.projectId, watch, projects]);

  /** Overfør utkastet. Fakturasiden viser resultatet, så feil kastes videre dit. */
  async function reloadSelected() {
    const row = typeof loadInvoice === 'function' && selected ? await loadInvoice(familyId, selected.id).catch(() => null) : null;
    if (row) {
      setSelected(row);
      setInvoices((rows) => rows.map((item) => (item.id === row.id ? { ...item, ...row } : item)));
    }
  }

  /**
   * Overfør utkastet, og send det fra Go når send er satt eller bedriften sender automatisk.
   * Fakturasiden viser resultatet, så feil kastes videre dit.
   */
  async function transferSelectedInvoice({ again = false, send = false, attachments = null, skipped = [] } = {}) {
    if (!selected || !canManage || transferring || deleting) return null;
    setTransferring(true);
    try {
      const result = await transferInvoiceToPowerOffice(familyId, selected.id, { again, send, attachments, actorName: actor.byName });
      await reloadSelected();
      const orderNo = result?.poweroffice?.orderNo;
      const where = orderNo ? ` som utkast nr. ${orderNo}` : '';
      const notAttached = [
        ...(result?.attached?.failed || []).map((row) => row.name),
        ...(result?.attached?.skipped || []),
        ...(skipped || []),
      ];
      const attachedText = [
        result?.attached?.added?.length ? ` ${result.attached.added.length} vedlegg er lagt ved (fakturaspesifikasjon og vedlegg).` : '',
        notAttached.length ? ` Ikke lagt ved: ${notAttached.join(', ')}. Legg dem ved i PowerOffice Go.` : '',
      ].join('');
      if (result?.sendError) {
        throw new Error(`${result.already ? 'Utkastet ligger i PowerOffice' : `Overført til PowerOffice${where}`}, men ble ikke sendt: ${result.sendError} Send fakturaen fra PowerOffice Go, eller prøv «Send nå» igjen.${attachedText}`);
      }
      if (result?.sent) {
        return { message: `${result.already ? 'Utkastet' : `Overført til PowerOffice${where}, og`} sendes nå fra PowerOffice. Fakturanummer og KID kommer ved neste synk.${attachedText}` };
      }
      return {
        message: result?.already
          ? `Utkastet ligger allerede i PowerOffice.${attachedText}`
          : `Overført til PowerOffice${where}. Kontroller og send fakturaen der.${attachedText}`,
      };
    } finally {
      setTransferring(false);
    }
  }

  /** Synk med PowerOffice fra fakturasiden, og vis fakturaen slik den er etterpå. */
  async function syncSelectedPowerOffice() {
    const result = await syncPowerOfficeInvoices(familyId);
    await reloadSelected();
    return { message: `Synket med PowerOffice: ${syncCountsText(result?.counts)}.` };
  }

  function requestDelete(row) {
    if (!canManage || !canDeleteInvoice(row) || deleting) return;
    if (!isDraftInvoice(row) && !isAdmin && !demoProjectState) return;
    if (isDraftInvoice(row)) {
      setDraftDelete(row);
      return;
    }
    setConfirmDelete(row);
  }

  // Utkast slettes av alle som kan arbeide med fakturaer. Importerte fakturaer bare av administrator.
  function deleteButton(row) {
    if (!canManage || !canDeleteInvoice(row)) return null;
    if (!isDraftInvoice(row) && !isAdmin && !demoProjectState) return null;
    return (
      <TouchableOpacity
        onPress={() => requestDelete(row)}
        accessibilityRole="button"
        accessibilityLabel={`Slett faktura ${row.invoiceNumber}`}
        hitSlop={rowHitSlop}
        style={[styles.rowDelete, rowHit.style]}
      >
        <Ionicons name="trash-outline" size={18} color={colors.danger || '#b42318'} />
      </TouchableOpacity>
    );
  }

  function canRegisterPayment(row) {
    if (!canManage || isDraftInvoice(row) || isCreditNote(row)) return false;
    if (row.status === 'paid' || row.status === 'credited' || row.status === 'written_off') return false;
    return (invoiceOutstanding(row) || 0) > 0;
  }

  // Listeraden har lite av fakturaen. Betalingen regnes på hele dokumentet.
  async function openPayment(row) {
    const full = typeof loadInvoice === 'function' ? await loadInvoice(familyId, row.id).catch(() => null) : row;
    if (!full || full.partial) {
      setError('Kunne ikke hente fakturaen. Sjekk nettet og prøv igjen.');
      return;
    }
    setPaymentRow(full);
  }

  // Ved siden av raden: slett for utkast og importerte, betaling for ubetalte fakturaer.
  function rowAction(row) {
    if (canManage && canDeleteInvoice(row)) return deleteButton(row);
    if (!canRegisterPayment(row)) return null;
    return (
      <TouchableOpacity
        onPress={() => openPayment(row)}
        accessibilityRole="button"
        accessibilityLabel={`Registrer betaling på faktura ${row.invoiceNumber}`}
        hitSlop={rowHitSlop}
        style={[styles.rowDelete, rowHit.style]}
        nativeID={`invoice-row-pay-${row.id}`}
      >
        <Ionicons name="cash-outline" size={18} color={colors.success || '#15803d'} />
      </TouchableOpacity>
    );
  }

  function linkCell(label, onPress, a11y) {
    return (
      <TouchableOpacity onPress={onPress} accessibilityRole="link" accessibilityLabel={a11y}>
        <Text style={{ color: colors.brand, fontSize: 13 }} numberOfLines={2}>{label}</Text>
      </TouchableOpacity>
    );
  }

  // Celler med ikon, merke eller lenke. Resten tegnes som tekst av tabellen.
  function renderCell(row, column) {
    if (column.key === 'docs') {
      const has = !!(row.previewReady || row.attachment?.url);
      return (
        <View style={styles.docCell}>
          <Ionicons
            name={has ? 'document-text' : 'document-text-outline'}
            size={16}
            color={has ? colors.brand : colors.muted}
            accessibilityLabel={has ? 'PDF er knyttet' : 'Ingen PDF'}
          />
        </View>
      );
    }
    if (column.key === 'status') return <InvoiceStatusBadge status={invoiceReportStatus(row)} colors={colors} />;
    if (column.key === 'sent') {
      return isInvoiceSent(row)
        ? <Ionicons name="checkmark-circle" size={18} color="#15803d" accessibilityLabel="Sendt" />
        : <Text style={{ color: colors.muted }}>—</Text>;
    }
    if (column.key === 'customerName' && row.customerId && row.customerName && onOpenCustomer) {
      return linkCell(row.customerName, () => onOpenCustomer(row.customerId), `Åpne kunde ${row.customerName}`);
    }
    if (column.key === 'projectName' && row.projectId && row.projectName && onOpenProject) {
      return linkCell(row.projectName, () => onOpenProject(row.projectId), `Åpne prosjekt ${row.projectName}`);
    }
    return undefined;
  }

  function cellTone(row, column) {
    const danger = colors.danger || '#b42318';
    if (column.key === 'dueDate' && isInvoiceOverdue(row)) return danger;
    if (column.key === 'daysOverdue') return danger;
    if (column.key === 'outstanding' && (invoiceOutstanding(row) || 0) > 0) return danger;
    return null;
  }

  // Slett ligger ved siden av raden, ikke inni den: en knapp kan ikke inneholde en knapp.
  function renderCard(row) {
    const overdue = invoiceReportStatus(row) === 'overdue';
    return (
      <View style={[styles.phoneRow, styles.rowWithAction, { borderBottomColor: colors.line }]}>
        <TouchableOpacity
          onPress={() => openInvoice(row)}
          accessibilityRole="button"
          accessibilityLabel={`Faktura ${row.invoiceNumber}`}
          nativeID={`invoice-row-${row.id}`}
          style={styles.rowOpen}
        >
          <Text style={[styles.phoneName, { color: colors.ink }]}>
            {row.invoiceNumber} · {formatDate(row.invoiceDate)}
          </Text>
          <Text style={[styles.phoneIdentity, { color: colors.ink }]} numberOfLines={1}>
            {row.customerName || '—'}
          </Text>
          <Text style={[styles.phoneMeta, { color: colors.muted }]} numberOfLines={2}>
            {[row.projectName, formatMoney(row.amountInclVat, row.currency)].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.phoneStatus}>
            <InvoiceStatusBadge status={invoiceReportStatus(row)} colors={colors} />
            {overdue ? (
              <Text style={{ color: colors.danger || '#b42318', fontSize: 12 }}>
                {`Forfalt ${formatDate(row.dueDate)}`}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        {rowAction(row)}
      </View>
    );
  }

  const draftDeleteDialog = (
    <DeleteDraftDialog
      visible={!!draftDelete}
      invoice={draftDelete}
      colors={colors}
      busy={deleting}
      onCancel={() => setDraftDelete(null)}
      onConfirm={async (choice) => {
        const target = draftDelete;
        setDeleting(true);
        setError('');
        try {
          const full = (typeof loadInvoice === 'function' ? await loadInvoice(familyId, target.id).catch(() => null) : null) || target;
          const result = await deleteDraft({ familyId, store, actor }, full, choice);
          hiddenIds.current.add(target.id);
          setInvoices((rows) => rows.filter((row) => row.id !== target.id));
          setNote(result.message);
          showSaveToast(result.message);
          setDraftDelete(null);
        } catch (cause) {
          setError(cause?.message || 'Kunne ikke slette utkastet.');
        } finally {
          setDeleting(false);
        }
      }}
    />
  );

  const paymentDialog = (
    <PaymentDialog
      visible={!!paymentRow}
      invoice={paymentRow}
      colors={colors}
      busy={paying}
      onCancel={() => setPaymentRow(null)}
      onConfirm={async (input) => {
        setPaying(true);
        setError('');
        try {
          const result = await payment({ familyId, store, actor }, paymentRow, input);
          setInvoices((rows) => rows.map((row) => (row.id === result.invoice.id ? { ...row, ...result.invoice } : row)));
          setNote(result.message);
          showSaveToast(result.message);
          setPaymentRow(null);
        } catch (cause) {
          setError(cause?.message || 'Kunne ikke registrere betalingen.');
        } finally {
          setPaying(false);
        }
      }}
    />
  );

  const deleteDialog = (
    <ConfirmDialog
      visible={!!confirmDelete}
      title="Slett faktura?"
      message={(() => {
        if (!confirmDelete) return '';
        if (confirmDelete.poweroffice?.env === 'demo') {
          return `Faktura ${confirmDelete.invoiceNumber || ''} kommer fra PowerOffice sin testklient og er ikke ekte. Den slettes fra ProTop, og timer og poster går tilbake til Til fakturering. I testklienten blir den liggende.`;
        }
        return `Faktura ${confirmDelete.invoiceNumber || ''} er importert og slettes fra listen i ProTop. Tilknyttede timer og poster frigjøres hvis de var låst til denne fakturaen.${
          confirmDelete.poweroffice?.state === 'draft' ? ' Utkastet i PowerOffice må slettes der.' : ''}`;
      })()}
      confirmText="Slett"
      cancelText="Avbryt"
      danger
      onCancel={() => setConfirmDelete(null)}
      onConfirm={confirmDeleteInvoice}
      onClose={() => setConfirmDelete(null)}
    />
  );

  if (view === 'detail' && !selected && selectedId && missingId === selectedId) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
        <DetailMissing list={link.list} thing={link.thing} onBack={() => { setView('list'); setSelectedId(''); }} />
      </View>
    );
  }

  if (view === 'detail' && selected) {
    const projectState = watch?.projectState || null;
    const project = (projectState?.projects || []).find((row) => row.id === selected.projectId) || null;
    const settings = project && projectState
      ? resolveProjectInvoiceSettings(projectState, project).effective
      : resolveCompanyInvoiceDefaults(projectState);
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
        <InvoicePage
          invoice={selected}
          invoices={visible}
          allInvoices={invoices}
          familyId={familyId}
          store={store}
          supplier={supplier}
          logo={family?.company?.logo || null}
          settings={settings}
          chart={resolveCompanyAccounts(projectState)}
          customers={customers}
          contracts={watch?.contracts || []}
          mode={poStatus?.connected ? 'poweroffice' : 'protop'}
          poStatus={poStatus}
          canManage={canManage && (fullId === selected.id || !!demoProjectState)}
          wide={wideDetail}
          stacked={stackRows}
          actor={actor}
          companyName={supplier?.name || family?.name || ''}
          indexWarning={indexWarning}
          colors={colors}
          onBack={() => { setView('list'); setSelectedId(''); }}
          onNavigate={(row) => openInvoice(row)}
          onOpenCustomer={onOpenCustomer}
          onOpenProject={onOpenProject}
          onOpenInvoiceId={(id) => { if (id) { setSelectedId(id); setView('detail'); } }}
          onChanged={(row) => {
            setSelected(row);
            setInvoices((rows) => rows.map((item) => (item.id === row.id ? { ...item, ...row } : item)));
          }}
          onDeleted={(message) => {
            hiddenIds.current.add(selected.id);
            setInvoices((rows) => rows.filter((row) => row.id !== selected.id));
            setView('list');
            setSelectedId('');
            setSelected(null);
            setNote(message || '');
          }}
          onTransfer={transferSelectedInvoice}
          onSyncPowerOffice={syncSelectedPowerOffice}
          transferring={transferring}
        />
        {busyOverlay}
      </View>
    );
  }

  if (view === 'import' && importPlan && importReview) {
    return (
      <>
      <ScrollView
        nativeID="economy-invoices-import"
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        <InvoiceImportReview
          colors={colors}
          review={importReview}
          customers={customers}
          projects={projects}
          busy={busy}
          readyCount={importReadyCount}
          linkQuery={linkQuery}
          setLinkQuery={setLinkQuery}
          title="Kontroller fakturaimport"
          lead="Sjekk kobling til kunde og prosjekt før lagring. Alle kolonner fra Excel-filen importeres (datoer, beløp, kontoer, tagger m.m.) — tabellen under er bare en kontrollvisning. Summeringsrader importeres ikke. PDF-vedlegg kan knyttes på hver faktura etter import."
          confirmLabel={(count) => `Importer ${count} fakturaer`}
          onToggleCard={(card) => {
            setDropped((current) => toggleInvoiceReviewRow(current, card, importPlan));
          }}
          onToggleOkRow={(id) => {
            setDropped((current) => toggleInvoiceReviewRow(current, { id }, importPlan));
          }}
          onLinkCustomer={(rowIndex, customer) => {
            setImportPlan((current) => linkImportPlanCustomer(current, rowIndex, customer, { applyGroup: true }));
            setNote(`Koblet til ${customer.name}.`);
            showSaveToast(`Koblet til ${customer.name}.`);
            setError('');
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkImportPlanProject(current, rowIndex, project, { applyGroup: true }));
            setNote(`Koblet prosjekt ${project.number || project.name}.`);
            showSaveToast(`Koblet prosjekt ${project.number || project.name}.`);
            setError('');
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
        />
      </ScrollView>
      {busyOverlay}
      </>
    );
  }

  const filterGroups = [
    {
      id: 'status',
      label: 'Status',
      nativeID: 'invoice-filter-status',
      value: statusFilter,
      onChange: (id) => setStatusFilter(id || ''),
      options: statusChoices.map((row) => ({
        id: row.id,
        label: row.id ? `${row.label} (${row.count})` : 'Alle statuser',
        nativeID: `invoice-status-${row.id || 'all'}`,
      })),
    },
    ...(filterOptions.customers.length ? [{
      id: 'customer',
      label: 'Kunde',
      nativeID: 'invoice-filter-customer',
      dropdown: true,
      value: customerFilter,
      onChange: (id) => setCustomerFilter(id || ''),
      options: [{ id: '', label: 'Alle kunder' }, ...filterOptions.customers],
    }] : []),
    ...(filterOptions.projects.length ? [{
      id: 'project',
      label: 'Prosjekt',
      nativeID: 'invoice-filter-project',
      dropdown: true,
      value: projectFilter,
      onChange: (id) => setProjectFilter(id || ''),
      options: [{ id: '', label: 'Alle prosjekter' }, ...filterOptions.projects],
    }] : []),
    {
      id: 'period',
      label: 'Periode',
      nativeID: 'invoice-filter-period',
      value: period,
      idle: 'all',
      onChange: (id) => setPeriod(id || 'all'),
      options: INVOICE_PERIODS,
    },
    ...(stackRows ? [{
      id: 'sort',
      label: 'Sortering',
      value: `${sort.key}:${sort.dir}`,
      idle: `${DEFAULT_SORT.key}:${DEFAULT_SORT.dir}`,
      onChange: (value) => {
        const [key, dir] = String(value || '').split(':');
        setSort(key ? { key, dir: dir === 'asc' ? 'asc' : 'desc' } : DEFAULT_SORT);
      },
      options: PHONE_SORTS,
    }] : []),
  ];

  const summaryText = !ready
    ? 'Laster fakturaer…'
    : [
      filtered ? `${summary.count} av ${invoices.length} fakturaer` : `${summary.count} fakturaer`,
      `Eks. mva ${formatMoney(summary.exVat)}`,
      `Ink. mva ${formatMoney(summary.inclVat)}`,
      `Utestående ${formatMoney(summary.outstanding)}`,
      summary.overdueCount ? `${summary.overdueCount} forfalt (${formatMoney(summary.overdueAmount)})` : '',
    ].filter(Boolean).join(' · ');

  const exportButton = (
    <TouchableOpacity
      onPress={exportRows}
      disabled={exporting || !visible.length}
      accessibilityRole="button"
      accessibilityLabel="Eksporter til Excel"
      nativeID="invoice-export"
      style={[styles.exportBtn, { borderColor: colors.line, backgroundColor: colors.card, opacity: exporting || !visible.length ? 0.55 : 1 }]}
    >
      <Ionicons name="download-outline" size={16} color={colors.ink} />
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{exporting ? 'Eksporterer…' : 'Eksporter til Excel'}</Text>
    </TouchableOpacity>
  );
  const resetLink = filtered ? (
    <TouchableOpacity onPress={resetFilters} accessibilityRole="button" nativeID="invoice-filter-reset" style={styles.resetLink}>
      <Text style={{ color: colors.brand, fontSize: 13 }}>Nullstill filtre</Text>
    </TouchableOpacity>
  ) : null;
  const searchProps = {
    value: query,
    onChange: (value) => {
      setQuery(value);
      if (importReport) setImportReport(null);
    },
    placeholder: 'Søk på nummer (eller 16700-16720), kunde, prosjekt, KID…',
    nativeID: 'invoice-search',
    accessibilityLabel: 'Søk i fakturaer',
  };

  // Mobil: søk og filter i én meny som prosjektlisten. Bred skjerm: søk, filtre side om side og verktøylinje.
  const filterBar = stackRows ? (
    <View style={styles.filters}>
      <View style={styles.toolRow}>
        <View style={styles.phoneMenu}>
          <FilterMenu search={searchProps} groups={filterGroups} />
        </View>
        {exportButton}
      </View>
      <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="invoice-summary">{summaryText}</Text>
      {resetLink}
    </View>
  ) : (
    <View style={styles.filters}>
      <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          nativeID={searchProps.nativeID}
          value={query}
          onChangeText={searchProps.onChange}
          placeholder={searchProps.placeholder}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={searchProps.accessibilityLabel}
          style={[styles.searchInput, { color: colors.ink }]}
        />
      </View>
      <FilterMenu row groups={filterGroups} />
      <View style={styles.toolRow}>
        <Text style={{ color: colors.muted, fontSize: 13, flex: 1, minWidth: 240 }} nativeID="invoice-summary">{summaryText}</Text>
        {resetLink}
        <ColumnSettingsMenu
          columns={INVOICE_REPORT_COLUMNS}
          visibleKeys={columnKeys}
          onChange={setColumnKeys}
          onReset={resetColumns}
          nativeID="invoice-column-settings"
        />
        {exportButton}
      </View>
    </View>
  );

  const table = !ready ? (
    <ActivityIndicator color={colors.brand} />
  ) : !invoices.length ? (
    <Text style={{ color: colors.muted }} nativeID="invoice-empty">
      {canImport
        ? 'Ingen fakturaer ennå. Bruk «Importer Excel» for å hente listen fra regnskapssystemet.'
        : 'Ingen fakturaer ennå.'}
    </Text>
  ) : (
    <ReportTable
      nativeID="invoice-table"
      colors={colors}
      columns={listColumns}
      rows={visible}
      sort={sort}
      onSort={(column) => setSort((current) => nextReportSort(current, column))}
      filters={colFilter}
      onFilter={(key, value) => setColFilter((current) => ({ ...current, [key]: value }))}
      onOpen={openInvoice}
      rowNativeID={(row) => `invoice-row-${row.id}`}
      rowLabel={(row) => `Faktura ${row.invoiceNumber}`}
      renderCell={renderCell}
      cellTone={cellTone}
      renderAction={canManage ? rowAction : undefined}
      actionWidth={canManage ? ACTION_WIDTH : 0}
      limit={limit}
      onMore={() => setLimit((current) => current + PAGE_SIZE)}
      onShowAll={() => setLimit(visible.length)}
      totals={totals}
      phone={stackRows}
      renderCard={renderCard}
      empty="Ingen fakturaer treffer søket eller filteret."
    />
  );

  const top = (
    <>
      <View style={styles.toolbar}>
        <View style={{ flex: 1, gap: 4 }}>
          {hostedHero ? null : (
            <Text style={[styles.heading, { color: colors.ink }]}>Fakturaer</Text>
          )}
          <Text style={{ color: colors.muted }}>
            {stackRows
              ? 'Trykk en faktura for full oversikt.'
              : 'Sorter og filtrer i kolonnene, velg kolonner og eksporter utvalget til Excel. Trykk en faktura for full oversikt.'}
          </Text>
        </View>
        {canImport ? (
        <TouchableOpacity
          onPress={importFile}
          disabled={busy || !familyId}
          accessibilityRole="button"
          accessibilityLabel="Importer fakturaer"
          style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: busy || !familyId ? 0.6 : 1 }]}
        >
          <Text style={styles.primaryBtnText}>{busy ? 'Jobber…' : 'Importer Excel'}</Text>
        </TouchableOpacity>
        ) : null}
      </View>

      {canManage && familyId ? (
        <PowerOfficeSyncLine familyId={familyId} colors={colors} status={poStatus} onStatus={setPoStatus} />
      ) : null}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
      <ImportResult colors={colors} result={importReport} />
      {filterBar}
    </>
  );

  // Mobil: kort i en side som ruller. Bred skjerm: tabellen fyller resten av siden som prosjektlisten.
  if (stackRows) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
        <ScrollView style={styles.screen} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          {top}
          {table}
        </ScrollView>
        {busyOverlay}
        {deleteDialog}
        {draftDeleteDialog}
        {paymentDialog}
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.screenDesk, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
      <View style={[styles.inner, styles.innerDesk]}>
        {top}
        {table}
      </View>
      {busyOverlay}
      {deleteDialog}
      {draftDeleteDialog}
      {paymentDialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Blir toppen høyere enn skjermen, ruller siden. Ellers fyller tabellen resten.
  screenDesk: { minHeight: 0, ...(Platform.OS === 'web' ? { overflowY: 'auto' } : null) },
  inner: { padding: 16, paddingBottom: 48, width: '100%', alignSelf: 'stretch', gap: 12 },
  innerDesk: { flex: 1, minHeight: 0, paddingBottom: 16 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  heading: { fontSize: 22, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  filters: { gap: 10, flexShrink: 0 },
  toolRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 42 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 9 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  phoneMenu: { flexShrink: 1, maxWidth: '72%' },
  resetLink: { paddingVertical: 6, paddingHorizontal: 4, alignSelf: 'flex-start' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  docCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  phoneStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  phoneName: { fontSize: 15, fontWeight: '700' },
  phoneIdentity: { fontSize: 14 },
  phoneMeta: { fontSize: 13 },
  rowDelete: { padding: 4 },
  rowWithAction: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowOpen: { flex: 1, minWidth: 0, gap: 2 },
  primaryAction: {
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  dangerAction: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  detailInner: { padding: 16, paddingBottom: 48, gap: 14, maxWidth: 1200, width: '100%' },
  detailInnerWide: { alignSelf: 'flex-start' },
  detailTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  navRow: { flexDirection: 'row', gap: 16 },
  detailTitle: { fontSize: 24, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d0d5dd' },
  tab: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  detailBody: { gap: 16 },
  detailBodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  detailMain: { flex: 1, gap: 16, minWidth: 0 },
  detailSide: { width: '100%', maxWidth: 320, gap: 12 },
  detailMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaCard: { flexGrow: 1, flexBasis: 240, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  metaHeading: { fontWeight: '700', fontSize: 14 },
  payBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4, maxWidth: 420, alignSelf: 'flex-end', width: '100%' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  payRowLast: { borderBottomWidth: 0 },
  fact: { minWidth: 140, gap: 2 },
  factLabel: { fontSize: 12, fontWeight: '600' },
  factValue: { fontSize: 16, fontWeight: '600' },
  factEmphasize: { fontWeight: '700', fontSize: 18 },
  preview: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8, minHeight: 120 },
  previewTitle: { fontWeight: '700', fontSize: 15 },
  pdfFrame: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  uploadZone: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  section: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  sectionTitle: { fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  detailRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  detailRowStack: { flexDirection: 'column', gap: 2 },
  detailLabel: { width: 180, flexShrink: 0, fontSize: 13 },
  detailLabelStack: { width: 'auto' },
  detailValue: { flex: 1, fontSize: 13 },
  lineHead: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  lineRow: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  lineTh: { flex: 1, fontSize: 11, fontWeight: '700' },
  lineTd: { flex: 1, fontSize: 12 },
  lineText: { flex: 1.4 },
});
