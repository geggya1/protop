/**
 * Fakturasiden: utkast, faktura og kreditnota.
 * Hovedfeltet viser fakturaen (eller redigering av utkastet). Sidepanelet har status,
 * sjekkliste, handlinger, notater, logg, PDF og vedlegg.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { showSaveToast } from '../../../src/ui/saveToast';
import { pickDocument } from '../../../src/utils/media';
import { formatDate, invoiceDetailSections } from '../../../src/economy/invoices.js';
import {
  isCreditNote,
  isDraftInvoice,
  isEditableDraft,
  isLockedInvoice,
  isManagedInvoice,
  issueChecks,
  isTransferredToPowerOffice,
  recalcInvoice,
  removeNote,
} from '../../../src/economy/invoiceFlow.js';
import { buildEhfXml } from '../../../src/economy/ehf.js';
import { invoicePdfName } from '../../../src/economy/invoicePdf.js';
import {
  downloadFile,
  friendlyCallError,
  lookupPeppolReceiver,
  openFileUrl,
  previewUrl as makePreviewUrl,
} from '../../../src/economy/invoiceDelivery.js';
import { canSendFromPowerOffice, POWEROFFICE_GUI, powerOfficeSummary } from '../../../src/economy/powerOfficeView.js';
import { fetchPowerOfficeDocument } from '../../../src/economy/powerOfficeClient.js';
import { accountsFrom } from '../../../src/economy/invoiceDraft.js';
import { withRegistryCustomer } from '../../../src/economy/invoiceCustomer.js';
import { Banner, Button, LinkText, money } from '../billing/ui';
import { InvoiceHeaderEditor, InvoiceHeaderView, InvoiceTexts } from './InvoiceHeader';
import { InvoiceLinesView, InvoiceTotalsView } from './InvoiceLinesView';
import InvoiceLinesEditor from './InvoiceLinesEditor';
import InvoiceSidebar from './InvoiceSidebar';
import { CollectionDialog, CreditDialog, DeleteDraftDialog, LossDialog, PaymentDialog, SendDialog } from './InvoiceDialogs';
import * as actions from './invoiceActions';
import { SHELL_DETAILS } from '../../../src/navigation/shellPaths';
import BackLink from '../../../src/ui/BackLink';

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') blob = await (await fetch(file.uri)).blob();
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('Kunne ikke lese filen.');
  return new Uint8Array(await blob.arrayBuffer());
}

function bytesFromBase64(base64) {
  const binary = atob(String(base64 || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function titleOf(invoice) {
  const credit = isCreditNote(invoice);
  if (isDraftInvoice(invoice)) return credit ? 'Kreditnotautkast' : 'Fakturautkast';
  return `${credit ? 'Kreditnota' : 'Faktura'} #${invoice.invoiceNumber || '—'}`;
}

export default function InvoicePage({
  invoice: storedInvoice,
  invoices = [],
  allInvoices = [],
  familyId,
  store,
  supplier = {},
  logo = null,
  settings = {},
  chart = [],
  customers = [],
  contracts = [],
  mode: companyMode = 'protop',
  modeReady = true,
  poStatus = null,
  canManage = false,
  wide = false,
  stacked = false,
  actor = null,
  companyName = '',
  indexWarning = null,
  colors,
  onBack,
  onNavigate,
  onOpenCustomer,
  onOpenProject,
  onOpenInvoiceId,
  onChanged,
  onDeleted,
  onTransfer,
  onSyncPowerOffice,
  transferring = false,
}) {
  // Utkast viser kunden slik den står i registeret nå; den kopieres for godt ved ferdigstilling (DS-09).
  const invoice = useMemo(() => withRegistryCustomer(storedInvoice, customers), [storedInvoice, customers]);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // En faktura som ligger i PowerOffice, behandles som PowerOffice-faktura uansett om statusen
  // for bedriften er lastet ennå. Ellers blinker knappene for en vanlig ProTop-faktura.
  const inPowerOffice = isTransferredToPowerOffice(invoice);
  const mode = inPowerOffice ? 'poweroffice' : companyMode;
  const modeKnown = modeReady || inPowerOffice;
  const [dialog, setDialog] = useState('');
  const [collectionKind, setCollectionKind] = useState('');
  const [refresh, setRefresh] = useState(null);
  const [peppol, setPeppol] = useState(null);
  const [preview, setPreview] = useState('');
  const peppolCache = useRef(new Map());
  const previewRef = useRef('');

  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setError('');
    setNote('');
    setDialog('');
    setTab('overview');
  }, [invoice?.id]);

  const shown = editing && draft ? draft : invoice;
  const editable = canManage && isEditableDraft(invoice);
  const locked = isLockedInvoice(invoice);
  const ctx = useMemo(() => ({
    familyId,
    store,
    supplier,
    logo,
    settings,
    chart,
    actor,
    invoices: allInvoices,
    customers,
    contracts,
    mode,
    companyName: companyName || supplier.name,
  }), [familyId, store, supplier, logo, settings, chart, actor, allInvoices, customers, contracts, mode, companyName]);

  const checks = useMemo(() => (isDraftInvoice(shown)
    ? issueChecks(shown, { supplier, settings, mode, indexWarning })
    : null), [shown, supplier, settings, mode, indexWarning]);

  // PDF-forhåndsvisning: arkivkopien for utstedte fakturaer, ellers laget av dataene her.
  useEffect(() => {
    let alive = true;
    const archived = !isDraftInvoice(invoice) && (invoice?.archive?.pdf?.url || (!isManagedInvoice(invoice) && invoice?.attachment?.url));
    if (archived) {
      setPreview(archived);
      return undefined;
    }
    const timer = setTimeout(() => {
      try {
        const original = isCreditNote(shown) ? allInvoices.find((row) => row.id === shown.creditNoteForId) : null;
        const bytes = actions.pdfFor(ctx, recalcInvoice(shown), original ? formatDate(original.invoiceDate) : '');
        const url = makePreviewUrl(bytes);
        if (!alive) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (previewRef.current && previewRef.current.startsWith('blob:')) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreview(url);
      } catch {
        setPreview('');
      }
    }, editing ? 500 : 50);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [shown, ctx, editing, invoice?.archive?.pdf?.url, invoice?.attachment?.url]);

  useEffect(() => () => {
    if (previewRef.current && previewRef.current.startsWith('blob:')) URL.revokeObjectURL(previewRef.current);
  }, []);

  const index = invoices.findIndex((row) => row.id === invoice.id);
  const prev = index > 0 ? invoices[index - 1] : null;
  const next = index >= 0 && index < invoices.length - 1 ? invoices[index + 1] : null;
  const nextDraft = invoices.slice(index + 1).find((row) => isDraftInvoice(row)) || invoices.find((row) => isDraftInvoice(row) && row.id !== invoice.id) || null;
  const last = invoices.length ? invoices[invoices.length - 1] : null;

  async function run(key, fn, { close = true } = {}) {
    setBusy(key);
    setError('');
    try {
      const result = await fn();
      if (result?.invoice) onChanged?.(result.invoice);
      if (result?.message) {
        setNote(result.message);
        showSaveToast(result.message);
      }
      if (close) setDialog('');
      return result;
    } catch (cause) {
      setError(friendlyCallError(cause, 'Noe gikk galt.'));
      return null;
    } finally {
      setBusy('');
    }
  }

  async function lookup() {
    const orgnr = String(invoice?.orgnr || '').replace(/\D/g, '');
    if (orgnr.length !== 9) {
      setPeppol({ loading: false, connected: false, receiver: { found: false } });
      return;
    }
    if (peppolCache.current.has(orgnr)) {
      setPeppol(peppolCache.current.get(orgnr));
      return;
    }
    setPeppol({ loading: true });
    try {
      const result = await lookupPeppolReceiver(familyId, orgnr);
      const value = { loading: false, connected: !!result.connected, receiver: result.receiver || { found: false }, error: result.error };
      peppolCache.current.set(orgnr, value);
      setPeppol(value);
    } catch {
      setPeppol({ loading: false, connected: false, receiver: { found: false } });
    }
  }

  function onAction(key) {
    setError('');
    if (key === 'delete') setDialog('delete');
    if (key === 'approve') run('approve', () => actions.toggleApproval(ctx, invoice));
    if (key === 'finalize' || key === 'transfer') {
      setDialog('finalize');
      if (key === 'finalize') lookup();
    }
    if (key === 'send') {
      setDialog('send');
      lookup();
    }
    if (key === 'credit') setDialog('credit');
    if (key === 'payment') setDialog('payment');
    if (key === 'loss') setDialog('loss');
    if (key === 'refresh') {
      run('refresh', async () => {
        const result = await actions.refreshPreview(ctx, invoice);
        setRefresh(result);
        setDialog('refresh');
        return null;
      }, { close: false });
    }
  }

  /** Spesifikasjon og vedlegg til utkastet i PowerOffice, når det er slått på og ikke gjort før. */
  async function powerOfficeFiles() {
    if (poStatus?.attachDocs === false || invoice?.poweroffice?.attachmentsAddedAt) return {};
    const { files, skipped } = await actions.powerOfficeAttachments(ctx, invoice);
    return { attachments: files, skipped };
  }

  async function finalizeAndSend(options) {
    // Kreditnota ferdigstilles og sendes fra ProTop, også når PowerOffice er koblet.
    if (mode === 'poweroffice' && !isCreditNote(invoice)) {
      // Resultatet og feilen fra PowerOffice vises øverst på fakturaen.
      setDialog('');
      await run('transfer', async () => onTransfer?.({
        again: invoice?.poweroffice?.state === 'missing',
        ...(await powerOfficeFiles()),
      }), { close: false });
      return;
    }
    setBusy('finalize');
    setError('');
    try {
      const done = await actions.finalize(ctx, invoice, { date: options.date, dueDate: options.dueDate });
      onChanged?.(done.invoice);
      let message = done.message;
      if (options.send) {
        try {
          const sent = await actions.send(ctx, done.invoice, options);
          onChanged?.(sent.invoice);
          message = `${done.message} ${sent.message}`;
        } catch (cause) {
          setError(`${done.message} ${friendlyCallError(cause, 'Sendingen feilet.')} Prøv «Send faktura» på nytt, eller velg en annen kanal.`);
        }
      }
      setNote(message);
      showSaveToast(message);
      setDialog('');
    } catch (cause) {
      setError(friendlyCallError(cause, 'Kunne ikke ferdigstille.'));
    } finally {
      setBusy('');
    }
  }

  async function download(kind, file) {
    setError('');
    try {
      if (kind === 'file' || kind === 'attachment') {
        openFileUrl(file?.url || invoice.attachment?.url);
        return;
      }
      if (kind === 'po-pdf' || kind === 'po-ehf') {
        const file = await fetchPowerOfficeDocument(familyId, invoice.id, kind === 'po-ehf' ? 'ehf' : 'pdf');
        if (!file?.base64) throw new Error('PowerOffice sendte ikke noe dokument.');
        downloadFile(bytesFromBase64(file.base64), file.name, file.mime);
        return;
      }
      if (kind === 'pdf') {
        const stored = !isDraftInvoice(invoice) && (invoice.archive?.pdf?.url || (!isManagedInvoice(invoice) && invoice.attachment?.url));
        if (stored) {
          openFileUrl(stored);
          return;
        }
        downloadFile(actions.pdfFor(ctx, recalcInvoice(shown)), invoicePdfName(shown), 'application/pdf');
        return;
      }
      if (kind === 'timespec') {
        if (invoice.archive?.timeSpec?.url && !isDraftInvoice(invoice)) {
          openFileUrl(invoice.archive.timeSpec.url);
          return;
        }
        downloadFile(await actions.timeSpecFor(ctx, shown), `Timespesifikasjon-${shown.invoiceNumber || 'utkast'}.pdf`, 'application/pdf');
        return;
      }
      if (kind === 'combined') {
        downloadFile(await actions.invoiceWithTimeSpecFor(ctx, shown), invoicePdfName(shown).replace('.pdf', '-med-timespesifikasjoner.pdf'), 'application/pdf');
        return;
      }
      if (kind === 'ehf') {
        if (invoice.archive?.xml?.url) {
          openFileUrl(invoice.archive.xml.url);
          return;
        }
        const built = buildEhfXml(recalcInvoice(shown), { supplier });
        if (!built.ok) throw new Error(built.error);
        downloadFile(new TextEncoder().encode(built.xml), invoicePdfName(shown).replace('.pdf', '-EHF.xml'), 'application/xml');
      }
    } catch (cause) {
      setError(String(cause?.message || cause) || 'Kunne ikke laste ned.');
    }
  }

  async function upload() {
    const file = await pickDocument({ accept: '.pdf,application/pdf,image/png,image/jpeg' });
    if (!file) return;
    run('upload', async () => actions.uploadAttachment(ctx, invoice, file, await bytesFromFile(file)), { close: false });
  }

  function startEdit() {
    setDraft(recalcInvoice(invoice));
    setEditing(true);
    setTab('overview');
  }

  function patchDraft(patch) {
    setDraft((current) => recalcInvoice({ ...current, ...patch }));
  }

  async function saveEdit() {
    const result = await run('save', () => actions.saveDraft(ctx, invoice, draft), { close: false });
    if (result) {
      setEditing(false);
      setDraft(null);
    }
  }

  const supplierRows = [
    ['Fakturaspråk', { nb: 'Norsk bokmål', nn: 'Norsk nynorsk', en: 'English' }[shown.language] || 'Norsk bokmål'],
    ['Bank', supplier.bankName],
    ['Adresse', [supplier.name, supplier.address, [supplier.postalCode, supplier.city].filter(Boolean).join(' ')].filter(Boolean).join('\n')],
    ['E-post', supplier.email],
    ['Telefon', supplier.phone],
    ['Org.nr', supplier.orgnr],
  ].filter(([, value]) => value);

  const main = (
    <View style={[styles.main, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {tab === 'overview' && !editing ? (
        <View style={{ gap: 18 }}>
          {editable ? (
            <View style={styles.editRow}>
              <LinkText label="Rediger" icon="create-outline" onPress={startEdit} colors={colors} nativeID="invoice-edit" />
            </View>
          ) : null}
          <InvoiceHeaderView invoice={shown} colors={colors} wide={wide} onOpenCustomer={onOpenCustomer} onOpenProject={onOpenProject} />
          <InvoiceTexts invoice={shown} colors={colors} />
          <InvoiceLinesView
            invoice={shown}
            colors={colors}
            stacked={stacked}
            loadEntries={(ids) => actions.timeEntriesFor(ctx, { ...shown, lines: [{ timeEntryIds: ids }], timeEntryIds: ids })}
          />
          <InvoiceTotalsView invoice={shown} colors={colors} />
          {supplierRows.length ? (
            <View style={[styles.supplier, { borderTopColor: colors.line }]}>
              {supplierRows.map(([label, value]) => (
                <View key={label} style={styles.supplierCell}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
                  <Text style={{ color: colors.ink, fontSize: 12 }}>{value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {tab === 'overview' && editing && draft ? (
        <View style={{ gap: 18 }} nativeID="invoice-editor">
          <InvoiceHeaderEditor invoice={draft} colors={colors} wide={wide} customers={customers} onPatch={patchDraft} />
          <InvoiceLinesEditor
            lines={draft.lines}
            onChange={(lines) => patchDraft({ lines })}
            colors={colors}
            chart={chart}
            accountsBySlot={accountsFrom(settings, { foreign: draft.customerAddress?.country && draft.customerAddress.country !== 'NO' })}
            stacked={stacked}
          />
          <InvoiceTotalsView invoice={draft} colors={colors} />
          <View style={styles.editActions}>
            <Button label="Avbryt" tone="ghost" colors={colors} onPress={() => { setEditing(false); setDraft(null); }} disabled={busy === 'save'} />
            <Button label="Lagre utkast" colors={colors} onPress={saveEdit} busy={busy === 'save'} nativeID="invoice-save" />
          </View>
        </View>
      ) : null}
      {tab === 'payments' ? (
        <View style={{ gap: 12 }}>
          <InvoiceTotalsView invoice={shown} colors={colors} />
          {(shown.payments || []).length ? (
            <View style={{ gap: 6 }}>
              {(shown.payments || []).map((row) => (
                <View key={row.id} style={[styles.payment, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink, flex: 1 }}>{`${formatDate(row.date)}${row.note ? ` · ${row.note}` : ''}${row.byName ? ` · ${row.byName}` : ''}`}</Text>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>{money(row.amount, shown.currency)}</Text>
                  {canManage && row.source !== 'poweroffice' ? (
                    <TouchableOpacity onPress={() => run('payment', () => actions.deletePayment(ctx, invoice, row.id), { close: false })} accessibilityLabel="Fjern betalingen" hitSlop={6}>
                      <Ionicons name="trash-outline" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : <Text style={{ color: colors.muted }}>Ingen betalinger er registrert.</Text>}
          {shown.loss ? (
            <Banner tone="block" colors={colors} title={`Ført som tap ${formatDate(shown.lossAt)}`}>
              {`${money(shown.loss, shown.currency)}${shown.lossReason ? ` · ${shown.lossReason}` : ''}`}
            </Banner>
          ) : null}
          {shown.reminderPostponedTo ? (
            <Text style={{ color: colors.muted }}>{`Påminnelser er utsatt til ${formatDate(shown.reminderPostponedTo)}.`}</Text>
          ) : null}
          {canManage && !isDraftInvoice(shown) && !isCreditNote(shown) && (Number(shown.outstandingAmount) || 0) > 0 ? (
            <View style={styles.editActions}>
              <Button label="Registrer betaling" icon="cash-outline" tone="success" colors={colors} onPress={() => setDialog('payment')} />
            </View>
          ) : null}
        </View>
      ) : null}
      {tab === 'fields' ? (
        <View style={{ gap: 12 }}>
          {invoiceDetailSections(shown).map((section) => (
            <View key={section.id} style={{ gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{section.title}</Text>
              {section.rows.map(([label, value]) => (
                <View key={`${section.id}-${label}`} style={[styles.fieldRow, { borderBottomColor: colors.line }]}>
                  <Text style={{ color: colors.muted, width: 200 }}>{label}</Text>
                  <Text style={{ color: colors.ink, flex: 1 }}>{value}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const sidebar = (
    <InvoiceSidebar
      invoice={shown}
      colors={colors}
      mode={mode}
      modeReady={modeKnown}
      canManage={canManage}
      checks={checks}
      busy={busy || (transferring ? 'transfer' : '')}
      previewUrl={preview}
      editing={editing}
      locked={locked}
      canUpload={canManage && (!locked || (!isManagedInvoice(invoice) && !isDraftInvoice(invoice)))}
      editable={editable}
      onAction={onAction}
      onCollection={(kind) => { setError(''); setCollectionKind(kind); setDialog('collection'); }}
      onCollectionHold={(hold) => run('hold', () => actions.holdCollection(ctx, invoice, hold), { close: false })}
      onAddNote={(text) => run('note', () => actions.addNoteAction(ctx, invoice, text), { close: false })}
      onRemoveNote={(id) => run('note', async () => ({ invoice: await store.saveInvoice(familyId, removeNote(invoice, id)), message: 'Notatet er slettet.' }), { close: false })}
      onAddEvent={(text) => run('event', () => actions.addEventAction(ctx, invoice, text), { close: false })}
      onDownload={download}
      onUpload={upload}
      onToggleAttachment={(id) => run('attachment', () => actions.saveDraft(ctx, invoice, {
        attachments: (invoice.attachments || []).map((row) => (row.id === id ? { ...row, include: row.include === false } : row)),
      }), { close: false })}
      onRemoveAttachment={(id) => run('attachment', () => actions.saveDraft(ctx, invoice, {
        attachments: (invoice.attachments || []).filter((row) => row.id !== id),
      }), { close: false })}
      onOpenOriginal={() => onOpenInvoiceId?.(invoice.creditNoteForId)}
      onOpenCredit={(id) => onOpenInvoiceId?.(id)}
      powerOfficeSummary={powerOfficeSummary(invoice)}
      powerOfficeUrl={poStatus?.connected ? (POWEROFFICE_GUI[poStatus.env] || POWEROFFICE_GUI.prod) : ''}
      onPowerOfficeSend={canManage && canSendFromPowerOffice(invoice, poStatus) && onTransfer
        ? () => run('posend', async () => onTransfer({ send: true, ...(await powerOfficeFiles()) }), { close: false })
        : null}
      onPowerOfficeSync={poStatus?.connected && invoice?.poweroffice?.salesOrderId && onSyncPowerOffice
        ? () => run('posync', () => onSyncPowerOffice(), { close: false })
        : null}
      settings={settings}
    />
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.inner, wide && styles.innerWide]} keyboardShouldPersistTaps="handled" nativeID="economy-invoice-detail">
      <View style={styles.top}>
        <BackLink label={SHELL_DETAILS.invoice.list} onPress={onBack} nativeID="invoice-back" />
        <View style={[styles.nav, { borderColor: colors.line }]}>
          {[
            ['Forrige', prev],
            ['Neste', next],
            ['Neste utkast', nextDraft],
            ['Siste', last && last.id !== invoice.id ? last : null],
          ].map(([label, target]) => (
            <TouchableOpacity
              key={label}
              disabled={!target || editing}
              onPress={() => target && onNavigate?.(target)}
              accessibilityRole="button"
              style={[styles.navButton, { borderColor: colors.line, opacity: target && !editing ? 1 : 0.4 }]}
            >
              <Text style={{ color: colors.ink, fontSize: 13 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={[styles.title, { color: colors.ink }]} nativeID="invoice-title">{titleOf(invoice)}</Text>
      <View style={[styles.tabs, { borderBottomColor: colors.line }]}>
        {[
          ['overview', isDraftInvoice(invoice) ? 'Utkast' : 'Fakturaoversikt'],
          ['payments', 'Betalinger og tap'],
          ['fields', 'Alle felt'],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            nativeID={`invoice-tab-${id}`}
            onPress={() => !editing && setTab(id)}
            style={[styles.tab, tab === id && { borderBottomColor: colors.brand }]}
          >
            <Text style={{ color: tab === id ? colors.brand : colors.muted, fontWeight: tab === id ? '700' : '500' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? <Banner tone="block" colors={colors}>{error}</Banner> : null}
      {note && !error ? <Banner tone="ok" colors={colors}>{note}</Banner> : null}
      {indexWarning && isDraftInvoice(invoice) ? (
        <Banner tone="warn" colors={colors} title="Ny indeks på avtalen">
          Indeksregulering bør gjøres før fakturaen ferdigstilles, så timeprisen er riktig.
        </Banner>
      ) : null}
      <View style={[styles.body, wide && styles.bodyWide]}>
        <View style={wide ? { flex: 1, minWidth: 0 } : null}>{main}</View>
        <View style={wide ? styles.sideWide : null}>{sidebar}</View>
      </View>

      <DeleteDraftDialog
        visible={dialog === 'delete'}
        invoice={invoice}
        colors={colors}
        busy={busy === 'delete'}
        onCancel={() => setDialog('')}
        onConfirm={async (choice) => {
          const result = await run('delete', () => actions.deleteDraft(ctx, invoice, choice));
          if (result) onDeleted?.(result.message);
        }}
      />
      <SendDialog
        visible={dialog === 'finalize' || dialog === 'send'}
        invoice={invoice}
        mode={dialog === 'finalize' ? 'finalize' : 'send'}
        colors={colors}
        supplier={supplier}
        settings={settings}
        peppol={peppol}
        checks={dialog === 'finalize' ? checks : null}
        powerOffice={mode === 'poweroffice' && dialog === 'finalize' && !isCreditNote(invoice)}
        powerOfficeAutoSend={!!poStatus?.autoSend}
        busy={busy === 'finalize' || busy === 'send'}
        onCancel={() => setDialog('')}
        onConfirm={(options) => (dialog === 'finalize'
          ? finalizeAndSend(options)
          : run('send', () => actions.send(ctx, invoice, options)))}
      />
      <CreditDialog
        visible={dialog === 'credit'}
        invoice={invoice}
        colors={colors}
        busy={busy === 'credit'}
        onCancel={() => setDialog('')}
        onConfirm={async (choice) => {
          const result = await run('credit', () => actions.createCredit(ctx, invoice, choice));
          if (result?.invoice) onOpenInvoiceId?.(result.invoice.id);
        }}
      />
      <CollectionDialog
        visible={dialog === 'collection'}
        kind={collectionKind}
        invoice={invoice}
        settings={settings}
        colors={colors}
        busy={busy === 'collection'}
        error={dialog === 'collection' ? error : ''}
        onCancel={() => setDialog('')}
        onPreview={async (input) => {
          try {
            const { pdf, name } = await actions.collectionLetterPdf(ctx, invoice, { kind: collectionKind, ...input });
            downloadFile(pdf, name, 'application/pdf');
          } catch (cause) {
            setError(friendlyCallError(cause, 'Kunne ikke lage PDF-en.'));
          }
        }}
        onSend={async (input) => {
          if (collectionKind === 'interest') {
            const result = await run('collection', () => actions.createInterestInvoice(ctx, invoice, { includeFees: input.includeFees }));
            if (result?.invoice) onOpenInvoiceId?.(result.invoice.id);
            return;
          }
          const result = await run('collection', () => actions.sendCollection(ctx, invoice, {
            kind: collectionKind, ...input, replyTo: settings?.emailReplyTo || '',
          }));
          if (result?.pdf) downloadFile(result.pdf, result.name, 'application/pdf');
        }}
      />
      <PaymentDialog
        visible={dialog === 'payment'}
        invoice={invoice}
        colors={colors}
        busy={busy === 'payment'}
        onCancel={() => setDialog('')}
        onConfirm={(input) => run('payment', () => actions.payment(ctx, invoice, input))}
      />
      <LossDialog
        visible={dialog === 'loss'}
        invoice={invoice}
        colors={colors}
        busy={busy === 'loss'}
        onCancel={() => setDialog('')}
        onConfirm={(input) => run('loss', () => actions.loss(ctx, invoice, input))}
      />
      <ConfirmDialog
        visible={dialog === 'refresh' && !!refresh}
        title="Oppdater utkast"
        message={refresh
          ? (refresh.changed
            ? `Grunnlaget er hentet på nytt. ${refresh.added ? `${refresh.added} nye poster legges til. ` : ''}${refresh.removed ? `${refresh.removed} poster er ikke lenger gyldige og fjernes. ` : ''}Linjer du har lagt inn selv, beholdes.`
            : 'Utkastet er allerede oppdatert med grunnlaget. Linjene bygges likevel på nytt etter innstillingene.')
          : ''}
        confirmText="Oppdater utkast"
        cancelText="Avbryt"
        onCancel={() => { setDialog(''); setRefresh(null); }}
        onConfirm={() => {
          const data = refresh;
          setRefresh(null);
          run('refresh', () => actions.applyRefresh(ctx, invoice, data));
        }}
        onClose={() => {}}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, gap: 12, paddingBottom: 48 },
  innerWide: { paddingHorizontal: 24 },
  top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  nav: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  navButton: { paddingHorizontal: 12, paddingVertical: 7, borderRightWidth: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  body: { gap: 16 },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  sideWide: { width: 400 },
  main: { borderWidth: 1, borderRadius: 10, padding: 18 },
  editRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  supplier: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  supplierCell: { minWidth: 160, gap: 2 },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 10 },
  fieldRow: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
});
