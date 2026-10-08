import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  INVOICE_IMPORT_ACCEPT,
  linkImportPlanCustomer,
  linkImportPlanProject,
  reviewRowsForInvoicePlan,
  suggestCustomers,
  toggleInvoiceReviewRow,
} from '../../src/economy/invoiceImport.js';
import { readInvoiceImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import {
  filterInvoices,
  formatDate,
  formatMoney,
  invoiceDetailSections,
  invoiceTotals,
  INVOICE_STATUSES,
  statusLabel,
} from '../../src/economy/invoices.js';
import * as invoiceStorage from '../../src/economy/invoiceStorage.js';

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

const COLUMNS = [
  { key: 'invoiceNumber', label: 'Fakturanr', width: 96 },
  { key: 'invoiceDate', label: 'Dato', width: 104 },
  { key: 'customerName', label: 'Kunde', flex: true, minWidth: 180 },
  { key: 'projectName', label: 'Prosjekt', flex: true, minWidth: 180 },
  { key: 'amount', label: 'Beløp', width: 120 },
  { key: 'status', label: 'Status', width: 100 },
];

const TABLE_MIN = COLUMNS.reduce((sum, column) => sum + (column.minWidth || column.width), 0);

function columnStyle(column) {
  if (column.flex) return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

function Fact({ label, value, colors }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value || '—'}</Text>
    </View>
  );
}

function InvoicePreviewPanel({ invoice, colors }) {
  const ready = !!(invoice?.previewReady && invoice?.attachment?.url);
  return (
    <View
      nativeID="invoice-preview-panel"
      style={[styles.preview, { borderColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}
    >
      <Text style={[styles.previewTitle, { color: colors.ink }]}>Fakturafremvisning</Text>
      {ready ? (
        <Text style={{ color: colors.muted }}>
          Vedlegg: {invoice.attachment.name || 'faktura.pdf'}
          {'\n'}
          Åpning av PDF-vedlegg kommer når filen er lastet opp.
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>
          Ingen PDF er knyttet til denne fakturaen ennå. På sikt kan du laste opp fakturaen som vedlegg
          (PDF) — da vises forhåndsvisning her.
        </Text>
      )}
    </View>
  );
}

function InvoiceDetail({ invoice, colors, onBack, onOpenCustomer, onOpenProject }) {
  const sections = useMemo(() => invoiceDetailSections(invoice), [invoice]);
  return (
    <ScrollView
      nativeID="economy-invoice-detail"
      style={{ flex: 1 }}
      contentContainerStyle={styles.detailInner}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={onBack} accessibilityRole="button">
        <Text style={{ color: colors.brand, fontWeight: '600' }}>← Tilbake til listen</Text>
      </TouchableOpacity>
      <Text style={[styles.detailTitle, { color: colors.ink }]}>
        Faktura {invoice.invoiceNumber || '—'}
      </Text>
      <Text style={{ color: colors.muted }}>
        {statusLabel(invoice.status)}
        {invoice.customerName ? ` · ${invoice.customerName}` : ''}
        {invoice.projectName ? ` · ${invoice.projectName}` : ''}
      </Text>
      <View style={styles.detailActions}>
        {invoice.customerId ? (
          <TouchableOpacity onPress={() => onOpenCustomer?.(invoice.customerId)} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Åpne kunde</Text>
          </TouchableOpacity>
        ) : null}
        {invoice.projectId ? (
          <TouchableOpacity onPress={() => onOpenProject?.(invoice.projectId)} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Åpne prosjekt</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.detailHero}>
        <Fact label="Beløp ink. mva" value={formatMoney(invoice.amountInclVat, invoice.currency)} colors={colors} />
        <Fact label="Utestående" value={invoice.outstanding || formatMoney(invoice.outstandingAmount, invoice.currency)} colors={colors} />
        <Fact label="Forfall" value={formatDate(invoice.dueDate)} colors={colors} />
        <Fact label="KID" value={invoice.kid} colors={colors} />
      </View>
      <InvoicePreviewPanel invoice={invoice} colors={colors} />
      {sections.map((section) => (
        <View key={section.id} style={[styles.section, { borderColor: colors.line }]}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
          {section.rows.map(([label, value]) => (
            <View key={`${section.id}-${label}`} style={[styles.detailRow, { borderBottomColor: colors.line }]}>
              <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
              <Text style={[styles.detailValue, { color: colors.ink }]}>{value}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

export default function EconomyInvoices({
  familyId,
  customers = [],
  projects = [],
  onOpenCustomer,
  onOpenProject,
  storage = null,
}) {
  const store = storage || invoiceStorage;
  const {
    loadInvoice,
    saveInvoiceImport,
    watchInvoices,
  } = store;
  const colors = useColors();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < TABLE_MIN;

  const [invoices, setInvoices] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});

  useEffect(() => {
    const stop = watchInvoices(familyId, (rows) => {
      setInvoices(rows);
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
    const summary = invoices.find((row) => row.id === selectedId) || null;
    if (summary) setSelected(summary);
    loadInvoice(familyId, selectedId).then((row) => {
      if (live && row) setSelected(row);
    }).catch(() => {});
    return () => { live = false; };
  }, [selectedId, familyId, invoices]);

  const [pageSize, setPageSize] = useState(80);
  const visible = useMemo(
    () => filterInvoices(invoices, query, statusFilter),
    [invoices, query, statusFilter],
  );
  const pageRows = useMemo(() => visible.slice(0, pageSize), [visible, pageSize]);
  const totals = useMemo(() => invoiceTotals(visible), [visible]);
  const reviewRows = useMemo(
    () => (importPlan ? reviewRowsForInvoicePlan(importPlan, { dropped }) : []),
    [importPlan, dropped],
  );

  useEffect(() => {
    setPageSize(80);
  }, [query, statusFilter, invoices.length]);

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: INVOICE_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    setProgress('Leser fil…');
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readInvoiceImport(bytes, file.name, {
        familyId,
        existingInvoices: invoices,
        customers,
        projects,
      }, (payload) => askImportInterpret(payload));
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
      setProgress('');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese fakturalisten.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      if (row.severity === 'block' || dropped.has(id) || !row.invoice) {
        leftOut.push({
          name: row.title || 'Uten fakturanr',
          reason: row.severity === 'block'
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
    try {
      const result = await saveInvoiceImport(
        familyId,
        chosen.map((row) => row.invoice),
        {
          onProgress: (done, total) => setProgress(`Lagrer ${done} av ${total}…`),
        },
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
      setView('list');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre fakturaene.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function openInvoice(row) {
    setSelectedId(row.id);
    setView('detail');
    setError('');
    setImportReport(null);
  }

  function renderListRow({ item: row, index }) {
    if (stackRows) {
      return (
        <TouchableOpacity
          onPress={() => openInvoice(row)}
          accessibilityRole="button"
          accessibilityLabel={`Faktura ${row.invoiceNumber}`}
          style={[styles.phoneRow, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
        >
          <Text style={[styles.phoneName, { color: colors.ink }]}>
            {row.invoiceNumber} · {formatDate(row.invoiceDate)}
          </Text>
          <Text style={[styles.phoneIdentity, { color: colors.ink }]} numberOfLines={1}>
            {row.customerName || '—'}
          </Text>
          <Text style={[styles.phoneMeta, { color: colors.muted }]} numberOfLines={2}>
            {[
              row.projectName,
              formatMoney(row.amountInclVat, row.currency),
              statusLabel(row.status),
            ].filter(Boolean).join(' · ')}
          </Text>
        </TouchableOpacity>
      );
    }
    const cells = {
      invoiceNumber: row.invoiceNumber || '—',
      invoiceDate: formatDate(row.invoiceDate),
      customerName: row.customerName || '—',
      projectName: row.projectName || row.projectNumber || '—',
      amount: formatMoney(row.amountInclVat, row.currency),
      status: statusLabel(row.status),
    };
    return (
      <TouchableOpacity
        onPress={() => openInvoice(row)}
        accessibilityRole="button"
        style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
      >
        {COLUMNS.map((column) => (
          <Text
            key={column.key}
            style={[styles.td, columnStyle(column), { color: colors.ink }]}
            numberOfLines={column.key === 'customerName' || column.key === 'projectName' ? 2 : 1}
          >
            {cells[column.key]}
          </Text>
        ))}
      </TouchableOpacity>
    );
  }

  if (view === 'detail' && selected) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
        <InvoiceDetail
          invoice={selected}
          colors={colors}
          onBack={() => { setView('list'); setSelectedId(''); }}
          onOpenCustomer={onOpenCustomer}
          onOpenProject={onOpenProject}
        />
      </View>
    );
  }

  if (view === 'import' && importPlan) {
    return (
      <ScrollView
        nativeID="economy-invoices-import"
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: colors.ink }]}>Kontroller fakturaimport</Text>
        <Text style={{ color: colors.muted }}>
          Sjekk kobling til kunde og prosjekt før lagring. Summeringsrader importeres ikke.
          PDF-vedlegg kan knyttes senere per faktura.
        </Text>
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
        <ImportReview
          colors={colors}
          nativeID="invoice-import-review"
          lead="Fjern rader du ikke vil ha med. Grupper med samme avvik kan tas ut samlet."
          rows={reviewRows}
          busy={busy}
          confirmLabel={() => {
            const count = importPlan.rows.filter((row, index) => (
              row.severity !== 'block' && !dropped.has(String(index)) && row.invoice
            )).length;
            return `Importer ${count} fakturaer`;
          }}
          onToggle={(id) => {
            const row = reviewRows.find((item) => item.id === id);
            if (!row) return;
            setDropped((current) => toggleInvoiceReviewRow(current, row, importPlan));
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
          renderRowExtra={(row) => {
            if (row.severity === 'block' || row.severity === 'ok') return null;
            const planRow = importPlan.rows[row.rowIndex];
            if (!planRow || planRow.customerId) return null;
            const q = linkQuery[row.id] || '';
            const suggestions = suggestCustomers(customers, {
              ...planRow,
              client: planRow.customerName,
              query: q,
            }, 6);
            return (
              <View style={{ gap: 6, marginTop: 4 }}>
                <TextInput
                  value={q}
                  onChangeText={(value) => setLinkQuery((current) => ({ ...current, [row.id]: value }))}
                  placeholder="Søk kunde for å koble…"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                />
                {suggestions.map((customer) => (
                  <TouchableOpacity
                    key={customer.id}
                    onPress={() => {
                      setImportPlan((current) => linkImportPlanCustomer(current, row.rowIndex, customer, { applyGroup: true }));
                      setNote(`Koblet til ${customer.name}.`);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>
                      {customer.name}
                      {customer.customerNumber ? ` · ${customer.customerNumber}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
                {projects.length && planRow && !planRow.projectId ? (
                  <TouchableOpacity
                    onPress={() => {
                      const hit = projects.find((project) => (
                        String(project.number) === String(planRow.projectNumber)
                        || (planRow.projectName && project.name === planRow.projectName)
                      ));
                      if (hit) {
                        setImportPlan((current) => linkImportPlanProject(current, row.rowIndex, hit));
                        setNote(`Koblet prosjekt ${hit.number}.`);
                      } else {
                        setError('Fant ikke prosjektet i registeret. Importer prosjektlisten først, eller knytt etterpå.');
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>Prøv å koble prosjekt fra registeret</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
      <View style={styles.inner}>
        <View style={styles.toolbar}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heading, { color: colors.ink }]}>Faktura</Text>
            <Text style={{ color: colors.muted }}>
              {ready
                ? `${invoices.length} registrerte fakturaer. Importer Excel-liste og fordel på kunde og prosjekt.`
                : 'Laster fakturaer…'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={importFile}
            disabled={busy || !familyId}
            accessibilityRole="button"
            accessibilityLabel="Importer fakturaer"
            style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: busy || !familyId ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? 'Jobber…' : 'Importer Excel'}</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
        {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
        <ImportResult colors={colors} result={importReport} />

        <View style={styles.filters}>
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              if (importReport) setImportReport(null);
            }}
            placeholder="Søk fakturanr, kunde, prosjekt, KID…"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { flex: 1, color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
            <TouchableOpacity
              onPress={() => setStatusFilter('')}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: !statusFilter ? colors.brand : colors.card }]}
            >
              <Text style={{ color: !statusFilter ? '#fff' : colors.ink }}>Alle</Text>
            </TouchableOpacity>
            {INVOICE_STATUSES.map((status) => (
              <TouchableOpacity
                key={status.id}
                onPress={() => setStatusFilter(status.id)}
                style={[styles.chip, { borderColor: colors.line, backgroundColor: statusFilter === status.id ? colors.brand : colors.card }]}
              >
                <Text style={{ color: statusFilter === status.id ? '#fff' : colors.ink }}>{status.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Text style={{ color: colors.muted }}>
          Viser {visible.length}
          {' · '}
          Sum ink. mva {formatMoney(totals.amountInclVat)}
          {' · '}
          Utestående {formatMoney(totals.outstanding)}
        </Text>

        {!ready ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <View
            style={[
              styles.tableWrap,
              stackRows ? styles.tableWrapPhone : styles.tableWrapWide,
              { borderColor: colors.line, backgroundColor: colors.card },
            ]}
          >
            {!stackRows ? (
              <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                {COLUMNS.map((column) => (
                  <Text key={column.key} style={[styles.th, columnStyle(column), { color: colors.muted }]}>{column.label}</Text>
                ))}
              </View>
            ) : null}
            <FlatList
              data={pageRows}
              keyExtractor={(row) => row.id}
              renderItem={renderListRow}
              style={{ maxHeight: stackRows ? 640 : 720 }}
              initialNumToRender={24}
              maxToRenderPerBatch={24}
              windowSize={7}
              ListEmptyComponent={(
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.muted }}>
                    Ingen fakturaer ennå. Bruk «Importer Excel» for å hente listen fra regnskapssystemet.
                  </Text>
                </View>
              )}
              ListFooterComponent={visible.length > pageRows.length ? (
                <TouchableOpacity
                  onPress={() => setPageSize((n) => n + 80)}
                  accessibilityRole="button"
                  style={{ padding: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.brand, fontWeight: '600' }}>
                    Vis flere ({pageRows.length} av {visible.length})
                  </Text>
                </TouchableOpacity>
              ) : null}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'flex-start', gap: 14 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  heading: { fontSize: 22, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  filters: { gap: 10 },
  statusChips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tableWrapWide: { minWidth: TABLE_MIN },
  tableWrapPhone: {},
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  head: {},
  th: { fontSize: 12, fontWeight: '700' },
  td: { fontSize: 13 },
  phoneRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  phoneName: { fontSize: 15, fontWeight: '700' },
  phoneIdentity: { fontSize: 14 },
  phoneMeta: { fontSize: 13 },
  detailInner: { padding: 16, paddingBottom: 48, gap: 14, maxWidth: 920 },
  detailTitle: { fontSize: 24, fontWeight: '700' },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  detailHero: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  fact: { minWidth: 140, gap: 2 },
  factLabel: { fontSize: 12, fontWeight: '600' },
  factValue: { fontSize: 16, fontWeight: '700' },
  preview: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6, minHeight: 120 },
  previewTitle: { fontWeight: '700', fontSize: 15 },
  section: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  sectionTitle: { fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  detailRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { width: 180, flexShrink: 0, fontSize: 13 },
  detailValue: { flex: 1, fontSize: 13 },
});
