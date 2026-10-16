import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import HoursImportReview from '../../components/arbeid/HoursImportReview';
import { ImportResult } from '../../components/ImportReview';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { loadAnbudState } from '../../src/anbud/storage';
import { useColors } from '../../src/context/ThemeContext';
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
import { filterProductSales, productSalesForViewer } from '../../src/economy/productSalesView.js';
import { displayName } from '../../src/employees/model.js';
import { importResult } from '../../src/imports/review';
import { showSaveToast } from '../../src/ui/saveToast';
import { pickDocument } from '../../src/utils/media';
import { ProductSalesList } from './ProductSalesList';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

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

export function ProductSalesScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [customers, setCustomers] = useState([]);
  const [view, setView] = useState('list');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    loadAnbudState(workspace.workspaceId).then((loaded) => {
      if (!live) return;
      setCustomers(loaded?.customers || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [workspace.workspaceId]);

  const owned = useMemo(
    () => productSalesForViewer(workspace.state?.sales),
    [workspace.state?.sales],
  );
  const rows = useMemo(() => filterProductSales(owned, query, status), [owned, query, status]);
  const review = useMemo(
    () => (importPlan ? buildProductSalesImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: PRODUCT_SALES_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await bytesFromFile(file);
      const table = await readProductSalesTable(bytes, file.name);
      const plan = planProductSalesImport(
        workspace.state?.sales || [],
        workspace.employees || [],
        customers,
        workspace.state?.projects || [],
        table,
        workspace.state?.products || [],
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

  function confirmImport() {
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
    const result = importProductSales(workspace.state, chosen);
    workspace.setState(result.state);
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
    const productNote = result.productsAdded.length ? ` ${result.productsAdded.length} produkter er lagt i katalogen.` : '';
    setNote(`${result.added.length} produktsalg er lagret.${productNote}`);
    showSaveToast(`${result.added.length} produktsalg er lagret.`);
  }

  if (view === 'import' && importPlan && review) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="produktsalg-import">
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        <HoursImportReview
          colors={colors}
          review={review}
          employees={workspace.employees || []}
          customers={customers}
          projects={workspace.state?.projects || []}
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="mine-produktsalg">
      {hostedHero ? null : (
        <>
          <Text style={[styles.crumb, { color: colors.muted }]}>Produkt / Produktsalg</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Produktsalg</Text>
        </>
      )}
      <TouchableOpacity
        onPress={importFile}
        disabled={busy || !workspace.ready}
        accessibilityRole="button"
        accessibilityLabel="Importer produktsalg"
        nativeID="produktsalg-import-button"
        style={[styles.importBtn, { backgroundColor: colors.brand, opacity: busy || !workspace.ready ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Leser…' : 'Importer'}</Text>
      </TouchableOpacity>
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {importReport ? <ImportResult colors={colors} result={importReport} /> : null}
      <ProductSalesList
        colors={colors}
        ready={workspace.ready}
        rows={rows}
        totalCount={owned.length}
        query={query}
        onQuery={setQuery}
        status={status}
        onStatus={setStatus}
      />
      {workspace.error ? <Text style={{ color: colors.danger || '#b42318' }}>{workspace.error}</Text> : null}
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Linjer merket Fakturert i filen får status Fakturert. Salg fra Produkt og timelisten vises i samme tabell.
      </Text>
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
