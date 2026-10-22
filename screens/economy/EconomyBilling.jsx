import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { showSaveToast } from '../../src/ui/saveToast';
import { useColors } from '../../src/context/ThemeContext';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import {
  isExternalExpense,
  loadProjectExpenses,
  mergeExpenseLists,
  saveProjectExpenses,
  withoutExternalExpenses,
} from '../../src/economy/expenseStorage.js';
import {
  isExternalSale,
  loadProductSales,
  mergeSaleLists,
  saveProductSales,
  withoutExternalSales,
} from '../../src/economy/productSalesStorage.js';
import * as invoiceStorage from '../../src/economy/invoiceStorage.js';
import { createCreditNoteFromInvoice } from '../../src/economy/billingFromHours.js';
import {
  buildOperationsProposals,
  createInvoiceFromOperations,
  markProposalInvoiced,
  proposalSummary,
} from '../../src/economy/billingFromOperations.js';
import { draftPriceWarnings } from '../../src/economy/billingFromHours.js';
import {
  attachVoucherSnapshot,
  creditVoucherFromInvoice,
  voucherFromInvoice,
} from '../../src/economy/vouchers.js';
import { buildEhfXml, supplierFromCompany } from '../../src/economy/ehf.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { loadAnbudState } from '../../src/anbud/storage';
import { invoiceIndexWarning } from '../../src/indeksregulering/groups';
import { mergeIndexSnapshot } from '../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../src/indeksregulering/remoteSsb';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { dueByContractId, osloDate } from '../../src/indeksregulering/watch';
import IndexWarning from './IndexWarning';
import { VAT_CODES as VAT_TABLE } from '../../src/economy/vat.js';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { effectiveCreditDays } from '../../src/project/invoiceSettings.js';

/**
 * Økonomi · Fakturagrunnlag — godkjente timer → faktura → bilag → EHF.
 */
export default function EconomyBilling() {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, family, requestShellTab } = useApp();
  const [projectState, setProjectState] = useState(emptyProjectState());
  const [invoices, setInvoices] = useState([]);
  const [ready, setReady] = useState(false);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [vatCode, setVatCode] = useState('HIGH');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [lastEhf, setLastEhf] = useState('');
  const [lastVoucher, setLastVoucher] = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [watch, setWatch] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadProjectState(familyId),
      invoiceStorage.loadInvoices(familyId),
      loadProjectExpenses(familyId).catch(() => []),
      loadProductSales(familyId).catch(() => []),
      loadAnbudState(familyId).catch(() => null),
      loadCases(familyId).catch(() => []),
      loadIndexCache().catch(() => null),
      loadRemoteIndexSnapshot().catch(() => null),
    ]).then(([projects, inv, remoteExpenses, remoteSales, anbud, cases, cache, remote]) => {
      if (!live) return;
      setProjectState({
        ...projects,
        expenses: mergeExpenseLists(remoteExpenses, projects?.expenses || []),
        sales: mergeSaleLists(remoteSales, projects?.sales || []),
      });
      setInvoices(inv);
      const contracts = anbud?.contracts || [];
      setWatch({
        contracts,
        dueById: dueByContractId(contracts, cases, mergeIndexSnapshot(cache?.series, remote)),
      });
      setReady(true);
    }).catch(() => setReady(true));
    return () => { live = false; };
  }, [familyId]);

  const proposals = useMemo(
    () => buildOperationsProposals(projectState, { onlyApproved, contracts: watch?.contracts || [] }),
    [projectState, onlyApproved, watch?.contracts],
  );
  const priceNotes = useMemo(
    () => draftPriceWarnings(invoices, watch?.contracts || []),
    [invoices, watch?.contracts],
  );

  const supplier = useMemo(
    () => supplierFromCompany(family?.company, family?.name),
    [family],
  );

  function warningFor(proposal) {
    if (!watch || !proposal?.projectId) return null;
    return invoiceIndexWarning({
      projectId: proposal.projectId,
      projects: projectState.projects || [],
      contracts: watch.contracts,
      timeEntries: projectState.timeEntries || [],
      dueById: watch.dueById,
      today: osloDate(),
    });
  }

  async function createInvoice(proposal, options = {}) {
    const warning = options.force ? null : warningFor(proposal);
    if (warning) {
      setPending({ warning, proposal });
      return;
    }
    setPending(null);
    setBusyKey(proposal.key);
    setError('');
    setNote('');
    try {
      const project = (projectState.projects || []).find((row) => row.id === proposal.projectId) || null;
      const created = createInvoiceFromOperations(proposal, {
        existingInvoices: invoices,
        vatCode,
        groupBy: 'activity',
        bankAccount: supplier.bankAccount,
        creditDays: effectiveCreditDays(projectState, project, 14),
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      let invoice = created.invoice;

      const voucher = voucherFromInvoice(invoice);
      if (voucher.ok) {
        invoice = attachVoucherSnapshot(invoice, voucher);
        setLastVoucher(voucher.voucher);
      }

      const ehf = buildEhfXml(invoice, { supplier });
      if (ehf.ok) {
        invoice = {
          ...invoice,
          ehfXml: ehf.xml,
          deliveryMethod: 'ehf',
          status: 'draft',
        };
        setLastEhf(ehf.xml);
      }

      // Behold alltid utkast til admin aktivt sender fra fakturalisten.
      invoice = {
        ...invoice,
        status: 'draft',
        exportStatus: invoice.exportStatus || 'utkast',
        sent: '',
        sentAt: '',
      };
      await invoiceStorage.saveInvoice(familyId, invoice);
      const nextState = markProposalInvoiced(projectState, proposal, invoice.id);
      const touched = (nextState.expenses || []).filter((row) => (
        isExternalExpense(row) && (proposal.expenses || []).some((item) => item.id === row.id)
      ));
      if (touched.length) await saveProjectExpenses(familyId, touched);
      const touchedSales = (nextState.sales || []).filter((row) => (
        isExternalSale(row) && (proposal.sales || []).some((item) => item.id === row.id)
      ));
      if (touchedSales.length) await saveProductSales(familyId, touchedSales);
      await saveProjectState({
        ...nextState,
        expenses: withoutExternalExpenses(nextState.expenses),
        sales: withoutExternalSales(nextState.sales),
      }, familyId);
      setProjectState(nextState);
      setInvoices(await invoiceStorage.loadInvoices(familyId));
      setLastInvoice(invoice);
      const parts = [
        `Utkast ${invoice.invoiceNumber} opprettet (${formatMoney(invoice.amountInclVat)}).`,
        'Send fakturaen fra Faktura-listen når den er klar.',
        `KID ${invoice.kid || '—'}.`,
      ];
      if (voucher.ok) parts.push('Bilag bokført.');
      // Fortsett uten EHF hvis orgnr mangler — faktura lagres likevel
      if (ehf.ok) parts.push('EHF klar.');
      else parts.push(`EHF: ${ehf.error}`);
      setNote(parts.join(' '));
      showSaveToast(parts[0] || 'Fakturautkast er opprettet.');
    } catch (cause) {
      setError(String(cause?.message || cause) || 'Kunne ikke opprette faktura.');
    } finally {
      setBusyKey('');
    }
  }

  async function createCreditNote() {
    if (!lastInvoice?.id) return;
    setBusyKey('credit');
    setError('');
    setNote('');
    try {
      const created = createCreditNoteFromInvoice(lastInvoice, {
        existingInvoices: invoices,
        bankAccount: supplier.bankAccount,
        reason: 'Kreditnota fra fakturagrunnlag',
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      let invoice = created.invoice;
      const voucher = creditVoucherFromInvoice(lastInvoice);
      if (voucher.ok) {
        invoice = attachVoucherSnapshot(invoice, voucher);
        setLastVoucher(voucher.voucher);
      }
      const ehf = buildEhfXml(invoice, { supplier });
      if (ehf.ok) {
        invoice = { ...invoice, ehfXml: ehf.xml };
        setLastEhf(ehf.xml);
      }
      await invoiceStorage.saveInvoice(familyId, invoice);
      // Merk original som kreditert (status) uten å låse opp timer
      await invoiceStorage.saveInvoice(familyId, {
        ...lastInvoice,
        status: 'credited',
        updatedAt: new Date().toISOString(),
      });
      setInvoices(await invoiceStorage.loadInvoices(familyId));
      setLastInvoice(null);
      setNote(`Kreditnota ${invoice.invoiceNumber} opprettet for faktura ${lastInvoice.invoiceNumber}.`);
      showSaveToast(`Kreditnota ${invoice.invoiceNumber} opprettet for faktura ${lastInvoice.invoiceNumber}.`);
    } catch (cause) {
      setError(String(cause?.message || cause) || 'Kunne ikke opprette kreditnota.');
    } finally {
      setBusyKey('');
    }
  }

  function downloadEhf() {
    if (!lastEhf || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const blob = new Blob([lastEhf], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'faktura-ehf.xml';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Laster fakturagrunnlag…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: colors.bg }]} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {hostedHero ? null : (
        <Text style={[styles.title, { color: colors.ink }]}>Fakturagrunnlag</Text>
      )}
      <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 640 }}>
        {hostedHero ? '' : 'Godkjente timer, utlegg, kjøreturer og varesalg samles per kunde/prosjekt. '}
        Opprett faktura med linjer, MVA, KID, bilag og EHF-XML.
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => setOnlyApproved((v) => !v)}
          style={[styles.chip, { borderColor: colors.line, backgroundColor: onlyApproved ? `${colors.brand}18` : colors.card }]}
        >
          <Text style={{ color: colors.ink, fontSize: 13 }}>
            {onlyApproved ? 'Kun godkjente' : 'Godkjente + registrerte'}
          </Text>
        </TouchableOpacity>
        {VAT_TABLE.filter((row) => ['HIGH', 'MID', 'LOW', 'ZERO'].includes(row.id)).map((row) => (
          <TouchableOpacity
            key={row.id}
            onPress={() => setVatCode(row.id)}
            style={[styles.chip, {
              borderColor: vatCode === row.id ? colors.brand : colors.line,
              backgroundColor: vatCode === row.id ? `${colors.brand}18` : colors.card,
            }]}
          >
            <Text style={{ color: colors.ink, fontSize: 12 }}>{row.label} {row.percent}%</Text>
          </TouchableOpacity>
        ))}
      </View>

      {priceNotes.slice(0, 3).map((row) => (
        <Text key={row.invoiceId + row.message} style={{ color: colors.warn || '#d97706' }}>{row.message}</Text>
      ))}
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}
      <IndexWarning
        warning={pending?.warning}
        colors={colors}
        continueLabel="Opprett utkast likevel"
        onContinue={() => pending?.proposal && createInvoice(pending.proposal, { force: true })}
        onOpenIndex={() => requestShellTab?.('okonomi', 'indeks')}
      />

      {lastInvoice?.id ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            Siste faktura {lastInvoice.invoiceNumber}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            Opprett kreditnota med speilede linjer, bilag og ny KID.
          </Text>
          <TouchableOpacity
            onPress={createCreditNote}
            disabled={busyKey === 'credit'}
            style={[styles.btnGhost, { borderColor: colors.line, marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center' }]}
          >
            <Ionicons name="return-down-back-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>
              {busyKey === 'credit' ? 'Krediterer…' : 'Opprett kreditnota'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!proposals.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.muted }}>
            Ingen poster klare for fakturering. Godkjenn timer, utlegg, kjøring eller varesalg først.
          </Text>
          <View style={[styles.row, { marginTop: 12 }]}>
            <TouchableOpacity onPress={() => requestShellTab?.('arbeid')} style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Åpne Arbeid</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => requestShellTab?.('okonomi', 'faktura')} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Se fakturaer</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {proposals.map((proposal) => (
        <View key={proposal.key} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>
            {proposal.customerName || 'Uten kunde'} · #{proposal.projectNumber} {proposal.projectName}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 13 }}>
            {(() => {
              const s = proposalSummary(proposal);
              const bits = [];
              if (s.entryCount) bits.push(`${s.entryCount} timer (${formatHours(s.hours)})`);
              if (s.expenseCount) bits.push(`${s.expenseCount} utlegg`);
              if (s.tripCount) bits.push(`${s.tripCount} turer`);
              if (s.saleCount) bits.push(`${s.saleCount} varer`);
              bits.push(`eks. mva ${formatMoney(proposal.amountExVat)}`);
              return bits.join(' · ');
            })()}
          </Text>
          <ScrollView horizontal style={{ marginTop: 8 }}>
            {proposal.entries.slice(0, 8).map((row) => (
              <View key={row.id} style={[styles.mini, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontSize: 11 }}>{row.date}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{formatHours(row._hours)} · {row.employeeName}</Text>
              </View>
            ))}
          </ScrollView>
          {warningFor(proposal) ? (
            <Text style={{ color: colors.danger || '#b45309', marginTop: 8 }}>
              Ny indeks på dette prosjektet. Regulering bør gjøres før fakturaen opprettes.
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => createInvoice(proposal)}
            disabled={busyKey === proposal.key}
            style={[styles.btn, { backgroundColor: colors.brand, marginTop: 12, alignSelf: 'flex-start' }]}
          >
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {busyKey === proposal.key ? 'Oppretter utkast…' : 'Opprett utkast'}
            </Text>
          </TouchableOpacity>
        </View>
      ))}

      {lastVoucher ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Siste bilag</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{lastVoucher.text}</Text>
          {lastVoucher.lines.map((line, i) => (
            <Text key={i} style={{ color: colors.ink, fontSize: 12, marginTop: 2 }}>
              {line.account} {line.accountName}: D {line.debit} / K {line.credit}
            </Text>
          ))}
        </View>
      ) : null}

      {lastEhf ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>EHF XML klar</Text>
            <TouchableOpacity onPress={downloadEhf} style={[styles.btnGhost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Last ned XML</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }} numberOfLines={6}>
            {lastEhf.slice(0, 400)}…
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnGhost: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mini: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginRight: 6,
    minWidth: 100,
  },
});
