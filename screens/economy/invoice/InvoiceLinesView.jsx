/**
 * Fakturalinjene i seksjoner (Timer, Utlegg, Adm. kostnader …) og summeringen,
 * slik de står på fakturaen.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { periodLabel, sectionsOf } from '../../../src/economy/invoiceLines.js';
import { invoiceTotals, paidAmountOf } from '../../../src/economy/invoiceFlow.js';
import { MiniTable, money } from '../billing/ui';

function num(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value) {
  const n = Number(value) || 0;
  return n ? `${num(n)} %` : '';
}

export function InvoiceLinesView({ invoice, colors, stacked = false }) {
  const sections = sectionsOf(invoice?.lines || []);
  const currency = invoice?.currency || 'NOK';
  if (!sections.length) {
    return (
      <Text style={{ color: colors.muted }}>
        Fakturaen har ingen linjer. Importerte fakturaer har bare summene fra importen.
      </Text>
    );
  }
  const anyMarkup = (invoice.lines || []).some((line) => Number(line.markupPercent));
  const anyDiscount = (invoice.lines || []).some((line) => Number(line.discountPercent));
  const columns = [
    { key: 'period', label: 'Periode', width: 72, render: (line) => periodLabel(line.periodStart, line.periodEnd) || '—' },
    { key: 'description', label: 'Tekst', flex: 3, wrap: true, render: (line) => (
      <View>
        <Text style={{ color: colors.ink, fontSize: 13 }}>{line.description || '—'}</Text>
        {line.account ? <Text style={{ color: colors.muted, fontSize: 11 }}>Konto {line.account}</Text> : null}
      </View>
    ) },
    { key: 'quantity', label: 'Antall', width: 80, align: 'right', render: (line) => (line.locked && line.section === 'admin' ? '' : `${num(line.quantity)} ${line.unit === 't' ? 't' : line.unit}`) },
    { key: 'unitPrice', label: 'Enhetspris', width: 104, align: 'right', render: (line) => (line.locked && line.section === 'admin' ? '' : num(line.unitPrice)) },
    ...(anyMarkup ? [{ key: 'markup', label: 'Påslag', width: 70, align: 'right', render: (line) => pct(line.markupPercent) }] : []),
    ...(anyDiscount ? [{ key: 'discount', label: 'Rabatt', width: 70, align: 'right', render: (line) => pct(line.discountPercent) }] : []),
    { key: 'amount', label: 'Totalt eks. mva', width: 120, align: 'right', render: (line) => (
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{num(line.amountExVat)}</Text>
    ) },
    { key: 'vat', label: 'Mva %', width: 60, align: 'right', render: (line) => `${num(line.vatPercent)}` },
  ];
  return (
    <View style={{ gap: 18 }}>
      {sections.map((section) => (
        <View key={section.id} style={{ gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{section.label}</Text>
          <MiniTable columns={columns} rows={section.lines} colors={colors} stacked={stacked} rowKey={(line) => line.id} />
        </View>
      ))}
      <Text style={{ color: colors.muted, fontSize: 11 }}>{`Beløp i ${currency}.`}</Text>
    </View>
  );
}

export function InvoiceTotalsView({ invoice, colors }) {
  const totals = invoiceTotals(invoice);
  const currency = invoice?.currency || 'NOK';
  const paid = paidAmountOf(invoice);
  const credited = Math.abs(Number(invoice?.creditedAmount) || 0);
  const loss = Math.abs(Number(invoice?.loss) || 0);
  const outstanding = Number(invoice?.outstandingAmount ?? totals.totalDue - paid);
  const rows = [
    ['Fakturabeløp eks. mva', money(totals.amountExVat, currency)],
    ['Mva', money(totals.vat, currency)],
    ['Fakturabeløp ink. mva', money(totals.amountInclVat, currency)],
    ['Øreavrunding', money(totals.rounding, currency)],
    [totals.totalDue < 0 ? `Til gode ${currency}` : `Totalt å betale ${currency}`, money(Math.abs(totals.totalDue), currency), true],
    ['Har betalt', paid ? money(paid, currency) : '–'],
    credited ? ['Kreditert', money(credited, currency)] : null,
    loss ? ['Ført som tap', money(loss, currency)] : null,
    ['Igjen å betale', money(Number.isFinite(outstanding) ? outstanding : totals.totalDue, currency), true],
  ].filter(Boolean);
  return (
    <View style={styles.totals}>
      {rows.map(([label, value, strong]) => (
        <View key={label} style={styles.totalRow}>
          <Text style={{ color: strong ? colors.ink : colors.muted, fontWeight: strong ? '700' : '400', flex: 1, textAlign: 'right' }}>{label}:</Text>
          <Text style={{ color: colors.ink, fontWeight: strong ? '700' : '400', width: 140, textAlign: 'right' }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  totals: { alignSelf: 'flex-end', gap: 4, minWidth: 320 },
  totalRow: { flexDirection: 'row', gap: 12 },
});
