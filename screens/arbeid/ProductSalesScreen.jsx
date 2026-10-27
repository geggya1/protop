import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import HoursImportReview from '../../components/arbeid/HoursImportReview';
import { ImportResult } from '../../components/ImportReview';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import ProductSaleSheet from '../../components/sales/ProductSaleSheet';
import { loadCustomerList } from '../../src/anbud/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { formatMoney } from '../../src/economy/invoices.js';
import {
  PRODUCT_SALES_IMPORT_ACCEPT,
  buildProductSalesImportReview,
  importProductSales,
  linkSaleImportPlanCustomer,
  linkSaleImportPlanEmployee,
  linkSaleImportPlanProject,
  planProductSalesImport,
  readProductSalesTable,
  saleRowReady,
  toggleProductSaleReviewRow,
} from '../../src/economy/productSalesImport.js';
import { removeSale, saveSaleChange } from '../../src/economy/productSaleSave.js';
import {
  filterProductSales,
  productSalesExportRows,
  productSalesForViewer,
  saleFilterOptions,
  sortProductSales,
} from '../../src/economy/productSalesView.js';
import {
  loadProductSales,
  mergeRowsById,
  mergeSaleLists,
  peekProductSales,
  productSalesToStore,
  saveProductSales,
  withoutExternalSales,
} from '../../src/economy/productSalesStorage.js';
import { useProductSales } from '../../src/economy/useProductSales.js';
import { displayName } from '../../src/employees/model.js';
import { watchEmployees } from '../../src/employees/storage';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, patchProjectOperations, peekProjectState } from '../../src/project/storage.js';
import { importResult } from '../../src/imports/review';
import { showSaveToast } from '../../src/ui/saveToast';
import { dateKey } from '../../src/utils/dates';
import { pickDocument } from '../../src/utils/media';
import { ProductSalesList } from './ProductSalesList';

// Tabellen tegner en side om gangen. Tusenvis av rader på én gang låser nettleseren.
const PAGE_SIZE = 100;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function SaleOkTable({ colors, rows, pageSize, onMore, onToggleRow }) {
  if (!rows.length) return null;
  const head = ['Dato', 'Produkt', 'Antall', 'Kunde', 'Prosjekt', 'Medarbeider', 'Beløp', ''];
  return (
    <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="produktsalg-import-ok">
      <View style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
        {head.map((label) => (
          <Text key={label || 'act'} style={[styles.th, { color: colors.muted }]}>{label}</Text>
        ))}
      </View>
      {rows.slice(0, pageSize).map((row) => (
        <View key={row.id} style={[styles.tr, { borderBottomColor: colors.line, opacity: row.included ? 1 : 0.5 }]}>
          <Text style={[styles.td, { color: colors.ink }]}>{row.date}</Text>
          <Text style={[styles.td, styles.wide, { color: colors.ink }]} numberOfLines={2}>
            {row.sku ? `${row.sku} ` : ''}{row.name}
          </Text>
          <Text style={[styles.td, { color: colors.ink }]}>{row.quantity}</Text>
          <Text style={[styles.td, styles.wide, { color: colors.ink }]} numberOfLines={2}>{row.customerName || '—'}</Text>
          <Text style={[styles.td, styles.wide, { color: colors.ink }]} numberOfLines={2}>
            {row.projectNumber ? `${row.projectNumber} ` : ''}{row.projectName || '—'}
          </Text>
          <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.employeeName || '—'}</Text>
          <Text style={[styles.td, { color: colors.ink }]}>{formatMoney(row.amountInclVat)}</Text>
          <TouchableOpacity onPress={() => onToggleRow(row.id)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontSize: 12 }}>{row.included ? 'Ta ut' : 'Ta med'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {rows.length > pageSize ? (
        <TouchableOpacity onPress={onMore} accessibilityRole="button" style={{ padding: 12 }}>
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Vis flere ({pageSize} av {rows.length})</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ProductSalesScreen() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, requestShellTab } = useApp();
  // Import av salgslister krever Admin på Produktsalg. Endring krever Begrenset redigering.
  const canImport = canImportList(useCompanyAccess(), 'productSales');
  const access = useCompanyAccess();
  const canEdit = !!access?.ready && !!access.canEdit?.('productSales');
  const canDelete = !!access?.ready && !!access.canAdmin?.('productSales');
  const { width } = useWindowDimensions();
  const narrow = width < 720;
  const companyId = String(familyId || '').trim();
  const [projectState, setProjectState] = useState(() => peekProjectState(companyId) || emptyProjectState());
  const [projectReady, setProjectReady] = useState(() => !!peekProjectState(companyId));
  const [employees, setEmployees] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersReady, setCustomersReady] = useState(false);
  const [view, setView] = useState('list');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const { rows: remoteSales, ready: remoteReady, error: salesError } = useProductSales(companyId);

  // Bare prosjektstate uten timer og fravær. Siden trenger prosjekter, katalog og salg.
  useEffect(() => {
    let live = true;
    const warm = peekProjectState(companyId);
    if (warm) {
      setProjectState(warm);
      setProjectReady(true);
    } else {
      setProjectReady(false);
    }
    loadProjectState(companyId, { hours: false }).then((loaded) => {
      if (!live) return;
      setProjectState(loaded || emptyProjectState());
      setProjectReady(true);
    }).catch((cause) => {
      if (!live) return;
      setProjectReady(true);
      setError(String(cause?.message || '') || 'Kunne ikke laste prosjektene.');
    });
    return () => { live = false; };
  }, [companyId]);

  // Kundelisten alene, ikke hele anbudsdokumentet. Trengs til import og redigering.
  useEffect(() => {
    let live = true;
    setCustomersReady(false);
    loadCustomerList(companyId, {
      onCache: (rows) => { if (live) setCustomers(rows); },
    }).then((picked) => {
      if (!live) return;
      setCustomers(picked?.customers || []);
      setCustomersReady(true);
    }).catch(() => {
      if (live) setCustomersReady(true);
    });
    return () => { live = false; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      return undefined;
    }
    let live = true;
    const stop = watchEmployees(companyId, (rows) => {
      if (live && Array.isArray(rows) && rows.length) setEmployees(rows);
    }, () => {});
    return () => {
      live = false;
      stop();
    };
  }, [companyId]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, status, projectFilter, customerFilter, sort]);

  const knownSales = useMemo(
    () => mergeSaleLists(remoteSales, withoutExternalSales(projectState?.sales)),
    [remoteSales, projectState?.sales],
  );
  const owned = useMemo(
    () => productSalesForViewer(knownSales),
    [knownSales],
  );
  const filterOptions = useMemo(() => saleFilterOptions(owned), [owned]);
  // Søket filtrerer etter at tastetrykket er tegnet, så feltet ikke henger med mange rader.
  const searchQuery = useDeferredValue(query);
  const unstatused = useMemo(
    () => filterProductSales(owned, searchQuery, '', { project: projectFilter, customer: customerFilter }),
    [owned, searchQuery, projectFilter, customerFilter],
  );
  const counts = useMemo(() => {
    const out = { all: unstatused.length, draft: 0, approved: 0, invoiced: 0 };
    for (const row of unstatused) out[row.status] = (out[row.status] || 0) + 1;
    return out;
  }, [unstatused]);
  const rows = useMemo(
    () => sortProductSales(status ? unstatused.filter((row) => row.status === status) : unstatused, sort),
    [unstatused, status, sort],
  );
  const opened = useMemo(
    () => (openId ? owned.find((row) => row.id === openId) || null : null),
    [owned, openId],
  );
  const projects = projectState?.projects || [];
  const review = useMemo(
    () => (importPlan ? buildProductSalesImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );
  const listReady = projectReady && remoteReady;

  function toggleSort(key) {
    setSort((current) => (current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'date' || key === 'amount' || key === 'quantity' ? 'desc' : 'asc' }));
  }

  function openProject(projectId) {
    if (!projectId) return;
    setOpenId('');
    requestShellTab?.('projects', null, { type: 'openProject', projectId });
  }

  function openInvoice(invoiceId) {
    if (!invoiceId) return;
    setOpenId('');
    requestShellTab?.('okonomi', 'faktura', { type: 'openInvoice', invoiceId });
  }

  async function saveOpened(next) {
    const result = await saveSaleChange(companyId, next);
    if (!result.ok) return result;
    if (result.patch) setProjectState((current) => ({ ...current, ...result.patch }));
    showSaveToast('Salget er lagret.');
    return result;
  }

  async function deleteOpened(sale) {
    const result = await removeSale(companyId, sale);
    if (!result.ok) return result;
    if (result.patch) setProjectState((current) => ({ ...current, ...result.patch }));
    setOpenId('');
    showSaveToast('Salget er slettet.');
    return result;
  }

  async function exportRows() {
    if (!rows.length || exporting) return;
    setExporting(true);
    setError('');
    try {
      // Excel-byggeren lastes først når noen eksporterer.
      const { buildXlsx, downloadBytes } = await import('../../src/indeksregulering/office.js');
      const bytes = buildXlsx([{ name: 'Produktsalg', rows: productSalesExportRows(rows) }]);
      downloadBytes(`produktsalg-${dateKey(new Date())}.xlsx`, bytes, XLSX_MIME);
      showSaveToast(`${rows.length} salg er eksportert.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke eksportere produktsalget.');
    } finally {
      setExporting(false);
    }
  }

  async function importFile() {
    if (!canImport) return;
    setError('');
    const file = await pickDocument({ accept: PRODUCT_SALES_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await bytesFromFile(file);
      const table = await readProductSalesTable(bytes, file.name);
      const plan = planProductSalesImport(
        knownSales,
        employees,
        customers,
        projects,
        table,
        projectState?.products || [],
      );
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setLinkQuery({});
      setView('import');
      setNote('Salg som allerede finnes hoppes over. Koble prosjekt og kunde før lagring. Nye produkter legges i katalogen.');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lese produktsalget.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      if (!saleRowReady(row, index, dropped)) {
        leftOut.push({
          name: row.title || 'Uten produkt',
          reason: row.severity === 'existing'
            ? (row.issues?.[0] || 'Duplikat — hoppet over.')
            : row.severity === 'block'
              ? (row.issues?.[0] || 'Kan ikke importeres.')
              : dropped.has(String(index))
                ? 'Valgt bort før lagring.'
                : 'Mangler kobling til prosjekt eller kunde.',
        });
        return;
      }
      chosen.push(row.sale);
    });
    if (!chosen.length) {
      setError('Ingen produktsalg er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = importProductSales({ ...projectState, sales: knownSales }, chosen);
      const stored = productSalesToStore(result.added);
      if (!stored.length) {
        setError('Ingen produktsalg kunne lagres.');
        return;
      }
      await saveProductSales(companyId, stored);
      // Uten kjent liste fra før (feil ved lesing) hentes listen på nytt, så importen vises.
      if (!peekProductSales(companyId)) loadProductSales(companyId).catch(() => {});
      const beforeMemberIds = new Set((projectState?.members || []).map((row) => row.id));
      const newMembers = (result.state.members || []).filter((row) => row?.id && !beforeMemberIds.has(row.id));
      let catalogNote = '';
      if (result.productsAdded.length || newMembers.length) {
        const patched = await patchProjectOperations(companyId, (remote) => ({
          products: mergeRowsById(remote.products, result.productsAdded),
          members: mergeRowsById(remote.members, newMembers),
        }));
        if (!patched?.ok) catalogNote = ' Katalogen ble ikke oppdatert.';
        else {
          setProjectState((current) => ({
            ...current,
            products: mergeRowsById(current.products, result.productsAdded),
            members: mergeRowsById(current.members, newMembers),
          }));
        }
      }
      const report = importResult(
        [{ name: `${result.added.length} produktsalg`, issues: [] }],
        leftOut,
      );
      report.saved = result.added.length;
      report.total = chosen.length + leftOut.length;
      report.complete = !leftOut.length;
      setImportReport(report);
      setImportPlan(null);
      setDropped(new Set());
      setView('list');
      const productNote = result.productsAdded.length && !catalogNote
        ? ` ${result.productsAdded.length} produkter er lagt i katalogen.`
        : '';
      setNote(`${stored.length} produktsalg er lagret.${productNote}${catalogNote}`);
      showSaveToast(`${stored.length} produktsalg er lagret.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre produktsalget.');
    } finally {
      setBusy(false);
    }
  }

  if (view === 'import' && importPlan && review) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="produktsalg-import">
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        <HoursImportReview
          colors={colors}
          review={review}
          employees={employees}
          customers={customers}
          projects={projects}
          busy={busy}
          readyCount={review.readyCount}
          linkQuery={linkQuery}
          setLinkQuery={setLinkQuery}
          title="Kontroller produktsalg"
          lead="All informasjon fra filen lagres. Prosjekt, kunde og medarbeider kobles mot registrene. Like linjer i filen beholdes. Senere import hopper over det som allerede er lagret."
          footnote="Duplikat er samme dato, produkt, prosjekt, kunde, antall, pris og tittel. Nye produkter opprettes i katalogen uten å trekke lager. Koblet medarbeider legges på prosjektet."
          existingLabel="salg finnes allerede og hoppes over."
          confirmLabel={(count) => `Importer ${count} produktsalg`}
          renderOkTable={(props) => <SaleOkTable {...props} />}
          onToggleCard={(card) => setDropped((current) => toggleProductSaleReviewRow(current, card))}
          onToggleOkRow={(id) => setDropped((current) => toggleProductSaleReviewRow(current, { id }))}
          onLinkEmployee={(rowIndex, employee) => {
            setImportPlan((current) => linkSaleImportPlanEmployee(current, rowIndex, employee));
            setNote(`Koblet til ${displayName(employee)}.`);
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkSaleImportPlanProject(current, rowIndex, project, { customers }));
            setNote(`Koblet prosjekt ${project.number || project.name}.`);
          }}
          onLinkCustomer={(rowIndex, customer) => {
            setImportPlan((current) => linkSaleImportPlanCustomer(current, rowIndex, customer));
            setNote(`Koblet til ${customer.name}.`);
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); setView('list'); }}
        />
      </ScrollView>
    );
  }

  const importDisabled = busy || !listReady || !customersReady;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="mine-produktsalg">
      {hostedHero ? null : (
        <>
          <Text style={[styles.crumb, { color: colors.muted }]}>Produkt / Produktsalg</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Produktsalg</Text>
        </>
      )}
      {canImport ? (
      <TouchableOpacity
        onPress={importFile}
        disabled={importDisabled}
        accessibilityRole="button"
        accessibilityLabel="Importer produktsalg"
        nativeID="produktsalg-import-button"
        style={[styles.importBtn, { backgroundColor: colors.brand, opacity: importDisabled ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Leser…' : 'Importer'}</Text>
      </TouchableOpacity>
      ) : null}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {!!salesError && <Text style={{ color: colors.danger || '#b42318' }}>{salesError}</Text>}
      {importReport ? <ImportResult colors={colors} result={importReport} /> : null}
      <ProductSalesList
        colors={colors}
        ready={listReady}
        rows={rows}
        totalCount={owned.length}
        query={query}
        onQuery={setQuery}
        status={status}
        onStatus={setStatus}
        counts={counts}
        project={projectFilter}
        onProject={setProjectFilter}
        customer={customerFilter}
        onCustomer={setCustomerFilter}
        filterOptions={filterOptions}
        sort={sort}
        onSort={toggleSort}
        limit={limit}
        onMore={() => setLimit((current) => current + PAGE_SIZE)}
        onShowAll={() => setLimit(rows.length)}
        onOpen={(row) => setOpenId(row.id)}
        onOpenProject={openProject}
        onExport={exportRows}
        exporting={exporting}
        narrow={narrow}
      />
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Linjer merket Fakturert i filen får status Fakturert. Fakturerte salg er låst. Salg fra Produkt og timelisten vises i samme tabell, og hvert salg vises også på prosjektet sitt.
      </Text>
      <ProductSaleSheet
        sale={opened}
        colors={colors}
        projects={projects}
        customers={customers}
        employees={employees}
        canEdit={canEdit}
        canDelete={canDelete}
        onSave={saveOpened}
        onDelete={deleteOpened}
        onOpenProject={openProject}
        onOpenInvoice={openInvoice}
        onClose={() => setOpenId('')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  importBtn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', minWidth: 980 },
  tr: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { width: 100, fontSize: 11, fontWeight: '700' },
  td: { width: 100, fontSize: 12 },
  wide: { width: 160 },
});
