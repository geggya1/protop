import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { ImportResult } from '../../components/ImportReview';
import InvoiceImportReview from '../../components/InvoiceImportReview';
import { importResult } from '../../src/imports/review';
import { pickDocument, uploadFile } from '../../src/utils/media';
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
  filterInvoices,
  filterInvoicesByPeriod,
  formatDate,
  formatMoney,
  invoiceAmountGroups,
  invoiceDetailSections,
  invoicePaymentSummary,
  invoiceTotals,
  INVOICE_STATUSES,
  isInvoiceOverdue,
  isInvoiceSent,
  parseMoney,
  statusLabel,
} from '../../src/economy/invoices.js';
import * as invoiceStorage from '../../src/economy/invoiceStorage.js';
import { buildEhfXml } from '../../src/economy/ehf.js';
import { validateKid } from '../../src/economy/kid.js';

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

const PERIODS = [
  { id: 'all', label: 'Alle' },
  { id: '7', label: 'Siste 7 dager' },
  { id: '30', label: 'Siste 30 dager' },
  { id: '100', label: 'Siste 100 dager' },
  { id: 'year', label: 'I år' },
];

const COLUMNS = [
  { key: 'invoiceNumber', label: 'Fakturanr', width: 88 },
  { key: 'docs', label: 'PDF', width: 52 },
  { key: 'invoiceDate', label: 'Fakturadato', width: 100 },
  { key: 'dueDate', label: 'Forfall', width: 100 },
  { key: 'customerNumber', label: 'Kundenr', width: 84 },
  { key: 'customerName', label: 'Kunde', flex: true, minWidth: 160 },
  { key: 'projectNumber', label: 'Prosjektnr', width: 88 },
  { key: 'projectName', label: 'Prosjekt', flex: true, minWidth: 160 },
  { key: 'sent', label: 'Sendt', width: 56 },
  { key: 'currency', label: 'Valuta', width: 56 },
  { key: 'amountExVat', label: 'Eks. mva', width: 108 },
  { key: 'vat', label: 'MVA', width: 96 },
  { key: 'amountInclVat', label: 'Ink. mva', width: 112 },
  { key: 'outstanding', label: 'Utestående', width: 112 },
  { key: 'loss', label: 'Tap', width: 72 },
];

const TABLE_MIN = COLUMNS.reduce((sum, column) => sum + (column.minWidth || column.width), 0);

function columnStyle(column) {
  if (column.flex) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  }
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

function moneyTone(value, colors, { dangerWhenPositive = false } = {}) {
  const amount = parseMoney(value);
  if (dangerWhenPositive && amount != null && amount > 0) return colors.danger || '#b42318';
  return colors.ink;
}

function Fact({ label, value, colors, emphasize }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, emphasize && styles.factEmphasize, { color: colors.ink }]}>{value || '—'}</Text>
    </View>
  );
}

function InvoicePreviewPanel({ invoice, colors, onUpload, uploading }) {
  const ready = !!(invoice?.previewReady && invoice?.attachment?.url);
  const url = invoice?.attachment?.url || '';
  return (
    <View
      nativeID="invoice-preview-panel"
      style={[styles.preview, { borderColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}
    >
      <Text style={[styles.previewTitle, { color: colors.ink }]}>Fakturafremvisning</Text>
      {ready ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>
            {invoice.attachment.name || `Faktura-${invoice.invoiceNumber}.pdf`}
          </Text>
          {Platform.OS === 'web' && url ? (
            <View style={[styles.pdfFrame, { borderColor: colors.line, backgroundColor: colors.card }]}>
              {React.createElement('iframe', {
                title: `Faktura ${invoice.invoiceNumber}`,
                src: url,
                style: { border: 0, width: '100%', height: 360 },
              })}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>PDF er knyttet. Åpne fra «Last ned».</Text>
          )}
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>
          Ingen PDF er knyttet ennå. Last opp faktura-PDF her — på sikt kan systemet også generere den.
        </Text>
      )}
      <TouchableOpacity
        onPress={onUpload}
        disabled={uploading}
        accessibilityRole="button"
        style={[styles.secondaryBtn, { borderColor: colors.line, opacity: uploading ? 0.6 : 1 }]}
      >
        <Text style={{ color: colors.brand, fontWeight: '600' }}>
          {uploading ? 'Laster opp…' : (ready ? 'Bytt PDF-vedlegg' : 'Last opp faktura-PDF')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function AmountGroups({ invoice, colors }) {
  const groups = invoiceAmountGroups(invoice);
  if (!groups.length) {
    return (
      <Text style={{ color: colors.muted }}>
        Detaljerte fakturalinjer mangler i Excel-importen. Aggregerte beløp vises i summeringen.
      </Text>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {groups.map((group) => (
        <View key={group.id} style={[styles.section, { borderColor: colors.line }]}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{group.title}</Text>
          <View style={[styles.lineHead, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {['Periode', 'Tekst', 'Antall', 'Enhetspris', 'Totalt eks. mva'].map((label) => (
              <Text key={label} style={[styles.lineTh, { color: colors.muted }]}>{label}</Text>
            ))}
          </View>
          {group.lines.map((line, index) => (
            <View key={`${group.id}-${index}`} style={[styles.lineRow, { borderBottomColor: colors.line }]}>
              <Text style={[styles.lineTd, { color: colors.ink }]}>{line.period}</Text>
              <Text style={[styles.lineTd, styles.lineText, { color: colors.ink }]}>{line.text}</Text>
              <Text style={[styles.lineTd, { color: colors.ink }]}>{line.qty}</Text>
              <Text style={[styles.lineTd, { color: colors.ink }]}>{formatMoney(line.unitPrice, invoice.currency)}</Text>
              <Text style={[styles.lineTd, { color: colors.ink }]}>{formatMoney(line.totalExVat, invoice.currency)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function InvoiceDetail({
  invoice,
  invoices = [],
  colors,
  wide,
  onBack,
  onOpenCustomer,
  onOpenProject,
  onNavigate,
  onUploadPdf,
  uploading,
  supplier = {},
}) {
  const [tab, setTab] = useState('overview');
  const [ehfNote, setEhfNote] = useState('');
  const sections = useMemo(() => invoiceDetailSections(invoice), [invoice]);
  const payment = useMemo(() => invoicePaymentSummary(invoice), [invoice]);
  const overdue = isInvoiceOverdue(invoice);
  const kidCheck = invoice.kid ? validateKid(invoice.kid) : null;
  const index = invoices.findIndex((row) => row.id === invoice.id);
  const prev = index > 0 ? invoices[index - 1] : null;
  const next = index >= 0 && index < invoices.length - 1 ? invoices[index + 1] : null;

  function downloadEhf() {
    const built = invoice.ehfXml
      ? { ok: true, xml: invoice.ehfXml }
      : buildEhfXml(invoice, { supplier });
    if (!built?.ok || !built.xml) {
      setEhfNote(built?.error || 'Kan ikke lage EHF (mangler org.nr eller data).');
      return;
    }
    setEhfNote('EHF XML generert.');
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const blob = new Blob([built.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faktura-${invoice.invoiceNumber || 'ehf'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const overview = (
    <View style={{ gap: 16 }}>
      <View style={styles.detailMetaGrid}>
        <View style={[styles.metaCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.metaHeading, { color: colors.ink }]}>Kunde</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {invoice.customerName || '—'}
            {invoice.customerNumber ? ` (${invoice.customerNumber})` : ''}
          </Text>
          <Text style={{ color: colors.muted }}>Org.nr. {invoice.orgnr || '—'}</Text>
          {invoice.customerId ? (
            <TouchableOpacity onPress={() => onOpenCustomer?.(invoice.customerId)}>
              <Text style={{ color: colors.brand }}>Åpne kunde</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={[styles.metaCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.metaHeading, { color: colors.ink }]}>Prosjekt og sending</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {invoice.projectName || '—'}
            {invoice.projectNumber ? ` (${invoice.projectNumber})` : ''}
          </Text>
          <Text style={{ color: colors.muted }}>Aktivitet: {invoice.activities || '—'}</Text>
          <Text style={{ color: colors.muted }}>
            Fakturadato {formatDate(invoice.invoiceDate)} · Forfall{' '}
            <Text style={{ color: overdue ? (colors.danger || '#b42318') : colors.muted, fontWeight: overdue ? '700' : '400' }}>
              {formatDate(invoice.dueDate)}
            </Text>
          </Text>
          <Text style={{ color: colors.muted }}>
            KID {invoice.kid || '—'}
            {kidCheck ? (kidCheck.ok ? ' ✓' : ` (${kidCheck.error})`) : ''}
            {' · '}
            {invoice.deliveryMethod || statusLabel(invoice.status)}
          </Text>
          {invoice.voucherId ? (
            <Text style={{ color: colors.muted }}>
              Bilag: {invoice.voucherId}
              {Array.isArray(invoice.voucherLines) && invoice.voucherLines.length
                ? ` (${invoice.voucherLines.length} linjer)`
                : ''}
            </Text>
          ) : null}
          {invoice.projectId ? (
            <TouchableOpacity onPress={() => onOpenProject?.(invoice.projectId)}>
              <Text style={{ color: colors.brand }}>Åpne prosjekt</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={downloadEhf} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.brand }}>Last ned EHF (Peppol BIS 3.0)</Text>
          </TouchableOpacity>
          {ehfNote ? <Text style={{ color: colors.muted, fontSize: 12 }}>{ehfNote}</Text> : null}
        </View>
      </View>

      {Array.isArray(invoice.lines) && invoice.lines.length ? (
        <View style={[styles.section, { borderColor: colors.line, padding: 12, gap: 8 }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Fakturalinjer</Text>
          {invoice.lines.map((line) => (
            <View key={line.id} style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.ink, flex: 2, minWidth: 140 }}>{line.description}</Text>
              <Text style={{ color: colors.muted }}>{line.quantity} {line.unit}</Text>
              <Text style={{ color: colors.muted }}>à {formatMoney(line.unitPrice, invoice.currency)}</Text>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{formatMoney(line.amountExVat, invoice.currency)}</Text>
              <Text style={{ color: colors.muted }}>MVA {line.vatPercent ?? '—'}%</Text>
            </View>
          ))}
        </View>
      ) : null}

      <AmountGroups invoice={invoice} colors={colors} />

      <View style={[styles.payBox, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.metaHeading, { color: colors.ink }]}>Summering</Text>
        {[
          ['Fakturabeløp eks. mva', formatMoney(payment.amountExVat, payment.currency)],
          ['Mva', formatMoney(payment.vat, payment.currency)],
          ['Fakturabeløp ink. mva', formatMoney(payment.amountInclVat, payment.currency)],
          ['Øreavrunding', formatMoney(payment.rounding, payment.currency)],
          ['Totalt å betale', formatMoney(payment.totalDue, payment.currency)],
          ['Har betalt', payment.paid != null ? formatMoney(payment.paid, payment.currency) : '—'],
          ['Igjen å betale', formatMoney(payment.remaining, payment.currency)],
        ].map(([label, value], index, list) => (
          <View
            key={label}
            style={[
              styles.payRow,
              { borderBottomColor: colors.line },
              index === list.length - 1 && styles.payRowLast,
            ]}
          >
            <Text style={{ color: colors.muted }}>{label}</Text>
            <Text style={{ color: colors.ink, fontWeight: index >= list.length - 3 ? '700' : '500' }}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const paymentsTab = (
    <View style={[styles.section, { borderColor: colors.line, padding: 12, gap: 8 }]}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Betalinger og tap</Text>
      <Fact label="Betalingsdato" value={formatDate(invoice.paidAt)} colors={colors} />
      <Fact label="Utestående" value={invoice.outstanding || formatMoney(invoice.outstandingAmount, invoice.currency)} colors={colors} />
      <Fact label="Tap" value={formatMoney(invoice.loss, invoice.currency)} colors={colors} />
      <Fact label="Dager mellom sendt og betalt" value={invoice.daysSentToPaid == null ? '—' : String(invoice.daysSentToPaid)} colors={colors} />
      <Text style={{ color: colors.muted }}>
        Registrering av delbetalinger og kreditnota kommer når systemet også kan opprette egne fakturaer.
      </Text>
    </View>
  );

  const fieldsTab = (
    <View style={{ gap: 12 }}>
      {sections.map((section) => (
        <View key={section.id} style={[styles.section, { borderColor: colors.line }]}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
          {section.rows.map(([label, value]) => (
            <View key={`${section.id}-${label}`} style={[styles.detailRow, !wide && styles.detailRowStack, { borderBottomColor: colors.line }]}>
              <Text style={[styles.detailLabel, !wide && styles.detailLabelStack, { color: colors.muted }]}>{label}</Text>
              <Text style={[styles.detailValue, { color: colors.ink }]}>{value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );

  const sidebar = (
    <View style={styles.detailSide}>
      <View style={[styles.metaCard, { borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}>
        <Text style={[styles.metaHeading, { color: colors.ink }]}>Status</Text>
        <Text style={{ color: overdue ? (colors.danger || '#b42318') : colors.ink, fontWeight: '700' }}>
          {statusLabel(invoice.status)}
          {overdue ? ' · forfalt' : ''}
        </Text>
        <Text style={{ color: colors.muted }}>{invoice.exportStatus || '—'}</Text>
      </View>
      <InvoicePreviewPanel
        invoice={invoice}
        colors={colors}
        onUpload={onUploadPdf}
        uploading={uploading}
      />
      <View style={[styles.metaCard, { borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}>
        <Text style={[styles.metaHeading, { color: colors.ink }]}>Last ned</Text>
        {invoice.attachment?.url ? (
          <TouchableOpacity onPress={() => Linking.openURL(invoice.attachment.url)} accessibilityRole="link">
            <Text style={{ color: colors.brand }}>
              {invoice.attachment.name || `Faktura-${invoice.invoiceNumber}.pdf`}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: colors.muted }}>Ingen generert PDF ennå.</Text>
        )}
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Timespesifikasjon og «faktura med timespesifikasjon» genereres når systemet lager egne fakturaer.
        </Text>
      </View>
      <View style={[styles.metaCard, { borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}>
        <Text style={[styles.metaHeading, { color: colors.ink }]}>Vedlegg</Text>
        {invoice.attachment?.url ? (
          <Text style={{ color: colors.ink }}>
            {invoice.attachment.name || 'faktura.pdf'}
            {invoice.attachment.uploadedAt ? ` · ${formatDate(invoice.attachment.uploadedAt.slice(0, 10))}` : ''}
          </Text>
        ) : (
          <Text style={{ color: colors.muted }}>Ingen vedlegg.</Text>
        )}
        <TouchableOpacity
          onPress={onUploadPdf}
          disabled={uploading}
          style={[styles.uploadZone, { borderColor: colors.brand }]}
          accessibilityRole="button"
        >
          <Ionicons name="cloud-upload-outline" size={20} color={colors.brand} />
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Last opp fakturavedlegg</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView
      nativeID="economy-invoice-detail"
      style={{ flex: 1 }}
      contentContainerStyle={[styles.detailInner, wide && styles.detailInnerWide]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.detailTop}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '600' }}>← Økonomi / Fakturaer</Text>
        </TouchableOpacity>
        <View style={styles.navRow}>
          <TouchableOpacity disabled={!prev} onPress={() => prev && onNavigate(prev)} style={{ opacity: prev ? 1 : 0.4 }}>
            <Text style={{ color: colors.brand }}>Forrige</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!next} onPress={() => next && onNavigate(next)} style={{ opacity: next ? 1 : 0.4 }}>
            <Text style={{ color: colors.brand }}>Neste</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.detailTitle, { color: colors.ink }]}>
        Faktura #{invoice.invoiceNumber || '—'}
      </Text>

      <View style={styles.tabs}>
        {[
          ['overview', 'Fakturaoversikt'],
          ['payments', 'Betalinger og tap'],
          ['fields', 'Alle felt'],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && { borderBottomColor: colors.brand }]}
          >
            <Text style={{ color: tab === id ? colors.brand : colors.muted, fontWeight: tab === id ? '700' : '500' }}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.detailBody, wide && styles.detailBodyWide]}>
        <View style={styles.detailMain}>
          {tab === 'overview' ? overview : null}
          {tab === 'payments' ? paymentsTab : null}
          {tab === 'fields' ? fieldsTab : null}
        </View>
        {wide ? sidebar : (
          <View style={{ marginTop: 8 }}>{sidebar}</View>
        )}
      </View>
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
  supplier = {},
}) {
  const store = storage || invoiceStorage;
  const {
    loadInvoice,
    saveInvoice,
    saveInvoiceImport,
    watchInvoices,
  } = store;
  const colors = useColors();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 720;
  const wideDetail = !isPhone && contentWidth >= 900;

  const [invoices, setInvoices] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [period, setPeriod] = useState('all');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [pageSize, setPageSize] = useState(80);

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

  const visible = useMemo(() => {
    const byPeriod = filterInvoicesByPeriod(invoices, period);
    return filterInvoices(byPeriod, query, statusFilter);
  }, [invoices, query, statusFilter, period]);
  const pageRows = useMemo(() => visible.slice(0, pageSize), [visible, pageSize]);
  const totals = useMemo(() => invoiceTotals(visible), [visible]);
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
    setPageSize(80);
  }, [query, statusFilter, period, invoices.length]);

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
    try {
      const result = await saveInvoiceImport(
        familyId,
        chosen.map((row) => row.invoice),
        { onProgress: (done, total) => setProgress(`Lagrer ${done} av ${total}…`) },
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

  async function uploadPdf() {
    if (!selected || !familyId || uploading || typeof saveInvoice !== 'function') return;
    const file = await pickDocument({
      accept: '.pdf,application/pdf',
    });
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      let url = '';
      let storagePath = '';
      if (familyId === '__demo__') {
        const bytes = await bytesFromFile(file);
        const blob = new Blob([bytes], { type: file.mimeType || 'application/pdf' });
        url = URL.createObjectURL(blob);
      } else {
        storagePath = `families/${familyId}/invoices/${selected.id}/${file.name || `Faktura-${selected.invoiceNumber || 'vedlegg'}.pdf`}`;
        url = await uploadFile(storagePath, file, file.mimeType || 'application/pdf');
      }
      const next = await saveInvoice(familyId, {
        ...selected,
        attachment: {
          url,
          name: file.name || `Faktura-${selected.invoiceNumber}.pdf`,
          mime: file.mimeType || 'application/pdf',
          storagePath,
          uploadedAt: new Date().toISOString(),
        },
        previewReady: true,
      });
      setSelected(next);
      setNote('PDF-vedlegg er lagret på fakturaen.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke laste opp PDF.');
    } finally {
      setUploading(false);
    }
  }

  function openInvoice(row) {
    setSelectedId(row.id);
    setView('detail');
    setError('');
    setImportReport(null);
  }

  function renderListRow({ item: row, index }) {
    const overdue = isInvoiceOverdue(row);
    const sent = isInvoiceSent(row);
    const danger = colors.danger || '#b42318';
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
              overdue ? 'Forfalt' : '',
            ].filter(Boolean).join(' · ')}
          </Text>
        </TouchableOpacity>
      );
    }

    const cells = {
      invoiceNumber: row.invoiceNumber || '—',
      docs: row.previewReady || row.attachment?.url ? 'pdf' : '',
      invoiceDate: formatDate(row.invoiceDate),
      dueDate: formatDate(row.dueDate),
      customerNumber: row.customerNumber || '—',
      customerName: row.customerName || '—',
      projectNumber: row.projectNumber || '—',
      projectName: row.projectName || '—',
      sent: sent ? 'yes' : '',
      currency: row.currency || 'NOK',
      amountExVat: formatMoney(row.amountExVat, row.currency),
      vat: formatMoney(row.vat, row.currency),
      amountInclVat: formatMoney(row.amountInclVat, row.currency),
      outstanding: row.outstanding || formatMoney(row.outstandingAmount, row.currency),
      loss: formatMoney(row.loss, row.currency),
    };

    return (
      <TouchableOpacity
        onPress={() => openInvoice(row)}
        accessibilityRole="button"
        accessibilityLabel={`Faktura ${row.invoiceNumber}`}
        style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
      >
        {COLUMNS.map((column) => {
          if (column.key === 'docs') {
            return (
              <View key={column.key} style={[columnStyle(column), styles.docCell]}>
                <Ionicons
                  name={cells.docs ? 'document-text' : 'document-text-outline'}
                  size={16}
                  color={cells.docs ? colors.brand : colors.muted}
                />
                <Ionicons name="eye-outline" size={16} color={colors.muted} />
              </View>
            );
          }
          if (column.key === 'sent') {
            return (
              <View key={column.key} style={[columnStyle(column), styles.docCell]}>
                {sent ? <Ionicons name="checkmark-circle" size={18} color="#15803d" /> : <Text style={{ color: colors.muted }}>—</Text>}
              </View>
            );
          }
          const tone = column.key === 'dueDate' && overdue
            ? danger
            : column.key === 'outstanding'
              ? moneyTone(row.outstandingAmount ?? row.outstanding, colors, { dangerWhenPositive: true })
              : colors.ink;
          return (
            <Text
              key={column.key}
              style={[styles.td, columnStyle(column), { color: tone }, column.key === 'invoiceNumber' && { fontWeight: '700' }]}
              numberOfLines={column.key === 'customerName' || column.key === 'projectName' ? 2 : 1}
            >
              {cells[column.key]}
            </Text>
          );
        })}
      </TouchableOpacity>
    );
  }

  if (view === 'detail' && selected) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
        <InvoiceDetail
          invoice={selected}
          invoices={visible}
          colors={colors}
          wide={wideDetail}
          supplier={supplier}
          onBack={() => { setView('list'); setSelectedId(''); }}
          onOpenCustomer={onOpenCustomer}
          onOpenProject={onOpenProject}
          onNavigate={(row) => openInvoice(row)}
          onUploadPdf={uploadPdf}
          uploading={uploading}
        />
      </View>
    );
  }

  if (view === 'import' && importPlan && importReview) {
    return (
      <ScrollView
        nativeID="economy-invoices-import"
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
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
          lead="Sjekk kobling til kunde og prosjekt før lagring. Summeringsrader importeres ikke. PDF-vedlegg kan knyttes på hver faktura etter import."
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
            setError('');
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkImportPlanProject(current, rowIndex, project, { applyGroup: true }));
            setNote(`Koblet prosjekt ${project.number || project.name}.`);
            setError('');
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
        />
      </ScrollView>
    );
  }

  const table = (
    <View
      style={[
        styles.tableWrap,
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
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
      <View style={styles.inner}>
        <View style={styles.toolbar}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heading, { color: colors.ink }]}>Fakturaer</Text>
            <Text style={{ color: colors.muted }}>
              {ready
                ? `${invoices.length} registrerte fakturaer. Fordelt på kunde og prosjekt — klikk for full oversikt.`
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
            placeholder="Søk på fakturanummer, kunde, prosjekt, KID…"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { flex: 1, color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
            {PERIODS.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setPeriod(item.id)}
                style={[styles.chip, { borderColor: colors.line, backgroundColor: period === item.id ? colors.brand : colors.card }]}
              >
                <Text style={{ color: period === item.id ? '#fff' : colors.ink }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
            <TouchableOpacity
              onPress={() => setStatusFilter('')}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: !statusFilter ? colors.brand : colors.card }]}
            >
              <Text style={{ color: !statusFilter ? '#fff' : colors.ink }}>Alle statuser</Text>
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
          Eks. mva {formatMoney(totals.amountExVat)}
          {' · '}
          Ink. mva {formatMoney(totals.amountInclVat)}
          {' · '}
          Utestående {formatMoney(totals.outstanding)}
        </Text>

        {!ready ? (
          <ActivityIndicator color={colors.brand} />
        ) : stackRows ? table : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ minWidth: TABLE_MIN }}>
              {table}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 1280, width: '100%', alignSelf: 'flex-start', gap: 14 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  heading: { fontSize: 22, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  filters: { gap: 10 },
  statusChips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  head: {},
  th: { fontSize: 11, fontWeight: '700' },
  td: { fontSize: 12 },
  docCell: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  phoneRow: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  phoneName: { fontSize: 15, fontWeight: '700' },
  phoneIdentity: { fontSize: 14 },
  phoneMeta: { fontSize: 13 },
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
