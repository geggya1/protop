import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { useLayout } from '../../src/theme';
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
  canDeleteInvoice,
  formatDate,
  formatMoney,
  invoiceAmountGroups,
  invoiceDetailSections,
  invoicePaymentSummary,
  isInvoiceOverdue,
  isInvoiceSent,
  markInvoiceAsSent,
  statusLabel,
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
import IndexWarning from './IndexWarning';
import PowerOfficePanel from './PowerOfficePanel';
import { loadPowerOfficeStatus, transferInvoiceToPowerOffice } from '../../src/economy/powerOfficeClient.js';
import { canTransferToPowerOffice, POWEROFFICE_GUI, powerOfficeSummary } from '../../src/economy/powerOfficeView.js';
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
  if (status === 'paid') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'overdue' || status === 'written_off') return { bg: '#fee4e2', fg: colors.danger || '#b42318' };
  if (status === 'sent') return { bg: '#e0f2fe', fg: '#075985' };
  if (status === 'credited') return { bg: '#f3e8ff', fg: '#6b21a8' };
  return { bg: colors.sunken || '#f1f5f9', fg: colors.ink || '#334155' };
}

function InvoiceStatusBadge({ status, colors }) {
  const tone = statusTone(status, colors);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={{ color: tone.fg, fontSize: 12, fontWeight: '600' }}>{statusLabel(status)}</Text>
    </View>
  );
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
  canManage = false,
  onSend,
  onDelete,
  sending = false,
  deleting = false,
  powerOffice = null,
  onTransfer,
  transferring = false,
  error = '',
  note = '',
}) {
  const [tab, setTab] = useState('overview');
  const [ehfNote, setEhfNote] = useState('');
  const sections = useMemo(() => invoiceDetailSections(invoice), [invoice]);
  const payment = useMemo(() => invoicePaymentSummary(invoice), [invoice]);
  const overdue = isInvoiceOverdue(invoice);
  const draft = invoice?.status === 'draft' || /utkast|draft/i.test(String(invoice?.exportStatus || ''));
  // Med PowerOffice sendes fakturaen derfra. Da overføres utkastet i stedet.
  const viaPowerOffice = !!powerOffice?.connected;
  const showSend = canManage && draft && !isInvoiceSent(invoice) && !viaPowerOffice;
  const showTransfer = canManage && canTransferToPowerOffice(invoice, powerOffice);
  const poSummary = powerOfficeSummary(invoice);
  const poState = invoice.poweroffice?.state || '';
  const showDelete = canManage && canDeleteInvoice(invoice);
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
        {poSummary ? (
          <View style={{ gap: 2 }}>
            <Text style={{ color: poSummary.tone === 'warn' ? (colors.danger || '#b42318') : colors.ink, fontWeight: '700' }}>
              {poSummary.title}
            </Text>
            {poSummary.lines.map((line) => (
              <Text key={line} style={{ color: colors.muted, fontSize: 12 }}>{line}</Text>
            ))}
          </View>
        ) : null}
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
        {showTransfer ? (
          <TouchableOpacity
            onPress={onTransfer}
            disabled={transferring || deleting}
            accessibilityRole="button"
            accessibilityLabel="Overfør til PowerOffice"
            style={[styles.primaryAction, { backgroundColor: colors.brand, opacity: transferring || deleting ? 0.6 : 1 }]}
          >
            <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {transferring ? 'Overfører…' : (poState === 'missing' ? 'Overfør på nytt' : 'Overfør til PowerOffice')}
            </Text>
          </TouchableOpacity>
        ) : null}
        {showTransfer && !poState ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Utkastet kontrolleres og sendes fra PowerOffice Go. Fakturanummer, KID og betaling hentes tilbake hit.
          </Text>
        ) : null}
        {viaPowerOffice && poState === 'draft' ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(POWEROFFICE_GUI[invoice.poweroffice?.env] || POWEROFFICE_GUI.prod)}
            accessibilityRole="link"
          >
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne PowerOffice Go</Text>
          </TouchableOpacity>
        ) : null}
        {showSend ? (
          <TouchableOpacity
            onPress={onSend}
            disabled={sending || deleting}
            accessibilityRole="button"
            accessibilityLabel="Send faktura"
            style={[styles.primaryAction, { backgroundColor: colors.brand, opacity: sending || deleting ? 0.6 : 1 }]}
          >
            <Ionicons name="send-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>{sending ? 'Sender…' : 'Send faktura'}</Text>
          </TouchableOpacity>
        ) : null}
        {showDelete ? (
          <TouchableOpacity
            onPress={onDelete}
            disabled={sending || deleting}
            accessibilityRole="button"
            accessibilityLabel="Slett faktura"
            style={[styles.dangerAction, { borderColor: colors.danger || '#b42318', opacity: sending || deleting ? 0.6 : 1 }]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.danger || '#b42318'} />
            <Text style={{ color: colors.danger || '#b42318', fontWeight: '700' }}>
              {deleting ? 'Sletter…' : 'Slett faktura'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {draft && !showSend && !showTransfer && !poSummary ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Fakturaen er et utkast. Send når du er klar.
          </Text>
        ) : null}
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
            nativeID={`invoice-tab-${id}`}
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
  openInvoiceId = '',
  onConsumeIntent,
  storage = null,
  supplier = {},
  isAdmin = false,
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
  const { requestShellTab, uid } = useApp();
  // Import av fakturalister krever Admin på Faktura.
  const canImport = canImportList(useCompanyAccess(), 'economyInvoices');
  const hostedHero = useModuleHeroHosted();
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 720;
  const wideDetail = !isPhone && contentWidth >= 900;
  const canManage = !!isAdmin;
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
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [watch, setWatch] = useState(null);
  const [askIndex, setAskIndex] = useState(false);
  const [poStatus, setPoStatus] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [confirmRetransfer, setConfirmRetransfer] = useState(false);
  const [progress, setProgress] = useState(null); // { label, done?, total? }
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [limit, setLimit] = useState(PAGE_SIZE);
  const hiddenIds = useRef(new Set());

  useEffect(() => {
    let live = true;
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
        timeEntries: projectState?.timeEntries || [],
        dueById: dueByContractId(contracts, cases, mergeIndexSnapshot(cache?.series, remote)),
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

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
    const summary = invoices.find((row) => row.id === selectedId) || null;
    if (summary) setSelected(summary);
    loadInvoice(familyId, selectedId).then((row) => {
      if (live && row) setSelected(row);
    }).catch(() => {});
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
    return [...choices, { id: statusFilter, label: statusLabel(statusFilter), count: 0 }];
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
      visible={busy || uploading}
      label={uploading ? 'Laster opp PDF…' : (progress?.label || 'Jobber…')}
      detail="Vent til operasjonen er ferdig før du går videre."
      done={progress?.done}
      total={progress?.total}
    />
  );

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
      showSaveToast('PDF-vedlegg er lagret på fakturaen.');
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

  async function sendSelectedInvoice(options = {}) {
    if (!selected || !canManage || sending || deleting) return;
    if (indexWarning && !options.force) {
      setAskIndex(true);
      setError('Indeksregulering bør foretas før fakturaen sendes.');
      return;
    }
    setAskIndex(false);
    if (typeof saveInvoice !== 'function') {
      setError('Kan ikke lagre sendt-status i denne visningen.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const next = await saveInvoice(familyId, markInvoiceAsSent(selected));
      setSelected(next);
      setNote(`Faktura ${next.invoiceNumber} er markert som sendt.`);
      showSaveToast(`Faktura ${next.invoiceNumber} er sendt.`);
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke sende fakturaen.');
    } finally {
      setSending(false);
    }
  }

  async function transferSelectedInvoice(options = {}) {
    if (!selected || !canManage || transferring || deleting) return;
    if (indexWarning && !options.force) {
      setAskIndex(true);
      setError('Indeksregulering bør foretas før fakturaen overføres.');
      return;
    }
    const again = selected.poweroffice?.state === 'missing';
    if (again && !options.confirmed) {
      setConfirmRetransfer(true);
      return;
    }
    setAskIndex(false);
    setConfirmRetransfer(false);
    setTransferring(true);
    setError('');
    setNote('');
    try {
      const result = await transferInvoiceToPowerOffice(familyId, selected.id, { again });
      const row = typeof loadInvoice === 'function' ? await loadInvoice(familyId, selected.id).catch(() => null) : null;
      if (row) setSelected(row);
      const orderNo = result?.poweroffice?.orderNo;
      setNote(result?.already
        ? 'Utkastet ligger allerede i PowerOffice.'
        : `Overført til PowerOffice${orderNo ? ` som utkast nr. ${orderNo}` : ''}. Kontroller og send fakturaen der.`);
      showSaveToast('Overført til PowerOffice.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke overføre til PowerOffice.');
    } finally {
      setTransferring(false);
    }
  }

  function requestDelete(row) {
    if (!canManage || !canDeleteInvoice(row) || deleting || sending) return;
    setConfirmDelete(row);
  }

  function deleteButton(row) {
    if (!canManage || !canDeleteInvoice(row)) return null;
    return (
      <TouchableOpacity
        onPress={() => requestDelete(row)}
        accessibilityRole="button"
        accessibilityLabel={`Slett faktura ${row.invoiceNumber}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.rowDelete}
      >
        <Ionicons name="trash-outline" size={18} color={colors.danger || '#b42318'} />
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
        {deleteButton(row)}
      </View>
    );
  }

  const deleteDialog = (
    <ConfirmDialog
      visible={!!confirmDelete}
      title="Slett faktura?"
      message={confirmDelete
        ? `Faktura ${confirmDelete.invoiceNumber || ''} slettes permanent. Tilknyttede timer og poster frigjøres hvis de var låst til denne fakturaen.${
          confirmDelete.poweroffice?.state === 'draft' ? ' Utkastet i PowerOffice må slettes der.' : ''}`
        : ''}
      confirmText="Slett"
      cancelText="Avbryt"
      danger
      onCancel={() => setConfirmDelete(null)}
      onConfirm={confirmDeleteInvoice}
      onClose={() => setConfirmDelete(null)}
    />
  );

  if (view === 'detail' && selected) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-invoices">
        {askIndex ? (
          <View style={{ padding: 16 }}>
            <IndexWarning
              warning={indexWarning}
              colors={colors}
              continueLabel={poStatus?.connected ? 'Overfør likevel' : 'Send faktura likevel'}
              onContinue={() => (poStatus?.connected
                ? transferSelectedInvoice({ force: true })
                : sendSelectedInvoice({ force: true }))}
              onOpenIndex={() => requestShellTab?.('okonomi', 'indeks')}
            />
          </View>
        ) : null}
        <InvoiceDetail
          invoice={selected}
          invoices={visible}
          colors={colors}
          wide={wideDetail}
          supplier={supplier}
          canManage={canManage}
          sending={sending}
          deleting={deleting}
          onBack={() => { setView('list'); setSelectedId(''); }}
          onOpenCustomer={onOpenCustomer}
          onOpenProject={onOpenProject}
          onNavigate={(row) => openInvoice(row)}
          onUploadPdf={uploadPdf}
          uploading={uploading}
          onSend={sendSelectedInvoice}
          onDelete={() => requestDelete(selected)}
          powerOffice={poStatus}
          onTransfer={() => transferSelectedInvoice()}
          transferring={transferring}
          error={error}
          note={note}
        />
        {busyOverlay}
        {deleteDialog}
        <ConfirmDialog
          visible={confirmRetransfer}
          title="Overføre på nytt?"
          message="Utkastet finnes ikke lenger i PowerOffice. Overfør på nytt bare hvis det ble slettet der. Ble det slått sammen med et annet utkast, blir kunden fakturert to ganger."
          confirmText="Overfør på nytt"
          cancelText="Avbryt"
          onCancel={() => setConfirmRetransfer(false)}
          onConfirm={() => transferSelectedInvoice({ force: true, confirmed: true })}
          onClose={() => setConfirmRetransfer(false)}
        />
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
    placeholder: 'Søk på fakturanummer, kunde, prosjekt, KID…',
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
      renderAction={canManage ? deleteButton : undefined}
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
        <PowerOfficePanel familyId={familyId} colors={colors} status={poStatus} onStatus={setPoStatus} />
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
