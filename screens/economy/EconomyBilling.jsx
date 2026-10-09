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
import { useColors } from '../../src/context/ThemeContext';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import * as invoiceStorage from '../../src/economy/invoiceStorage.js';
import {
  buildBillingProposals,
  createInvoiceFromProposal,
  markEntriesInvoiced,
} from '../../src/economy/billingFromHours.js';
import { voucherFromInvoice } from '../../src/economy/vouchers.js';
import { buildEhfXml } from '../../src/economy/ehf.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { VAT_CODES as VAT_TABLE } from '../../src/economy/vat.js';

/**
 * Økonomi · Fakturagrunnlag — godkjente timer → faktura → bilag → EHF.
 */
export default function EconomyBilling() {
  const colors = useColors();
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

  useEffect(() => {
    let live = true;
    Promise.all([
      loadProjectState(familyId),
      invoiceStorage.loadInvoices(familyId),
    ]).then(([projects, inv]) => {
      if (!live) return;
      setProjectState(projects);
      setInvoices(inv);
      setReady(true);
    }).catch(() => setReady(true));
    return () => { live = false; };
  }, [familyId]);

  const proposals = useMemo(
    () => buildBillingProposals(projectState, { onlyApproved }),
    [projectState, onlyApproved],
  );

  const supplier = useMemo(() => ({
    name: family?.company?.navn || family?.name || 'Selskap',
    orgnr: family?.company?.organisasjonsnummer || '',
    address: family?.company?.forretningsadresse?.adresse || '',
    city: family?.company?.forretningsadresse?.poststed || '',
    postalCode: family?.company?.forretningsadresse?.postnummer || '',
    bankAccount: family?.company?.bankAccount || family?.company?.kontonummer || '',
  }), [family]);

  async function createInvoice(proposal) {
    setBusyKey(proposal.key);
    setError('');
    setNote('');
    try {
      const created = createInvoiceFromProposal(proposal, {
        existingInvoices: invoices,
        vatCode,
        groupBy: 'activity',
        bankAccount: supplier.bankAccount,
      });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      let invoice = created.invoice;

      const voucher = voucherFromInvoice(invoice);
      if (voucher.ok) {
        invoice = { ...invoice, voucherId: voucher.voucher.id };
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
      } else {
        // Fortsett uten EHF hvis orgnr mangler — faktura lagres likevel
        setNote(`Faktura opprettet. EHF: ${ehf.error}`);
      }

      await invoiceStorage.saveInvoice(familyId, invoice);
      const nextState = markEntriesInvoiced(projectState, invoice.timeEntryIds, invoice.id);
      await saveProjectState(nextState, familyId);
      setProjectState(nextState);
      setInvoices(await invoiceStorage.loadInvoices(familyId));
      setNote(`Faktura ${invoice.invoiceNumber} opprettet (${formatMoney(invoice.amountInclVat)}). KID ${invoice.kid || '—'}.${voucher.ok ? ' Bilag bokført.' : ''}`);
    } catch (cause) {
      setError(String(cause?.message || cause) || 'Kunne ikke opprette faktura.');
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
      <Text style={[styles.title, { color: colors.ink }]}>Fakturagrunnlag</Text>
      <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 640 }}>
        Godkjente fakturerbare timer samles per kunde/prosjekt. Opprett faktura med linjer, MVA, KID, bilag og EHF-XML (Peppol BIS Billing 3.0).
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

      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {!proposals.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.muted }}>
            Ingen timer klare for fakturering. Godkjenn føringer under Prosjekt → Timerapport, eller før timer i Arbeid.
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
            {proposal.entries.length} føringer · {formatHours(proposal.hours)} · eks. mva {formatMoney(proposal.amountExVat)}
          </Text>
          <ScrollView horizontal style={{ marginTop: 8 }}>
            {proposal.entries.slice(0, 8).map((row) => (
              <View key={row.id} style={[styles.mini, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontSize: 11 }}>{row.date}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{formatHours(row._hours)} · {row.employeeName}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            onPress={() => createInvoice(proposal)}
            disabled={busyKey === proposal.key}
            style={[styles.btn, { backgroundColor: colors.brand, marginTop: 12, alignSelf: 'flex-start' }]}
          >
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {busyKey === proposal.key ? 'Oppretter…' : 'Opprett faktura'}
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
