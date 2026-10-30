/**
 * Fakturalinjene i seksjoner (Timer, Utlegg, Adm. kostnader …) og summeringen,
 * slik de står på fakturaen.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../../../src/economy/invoices.js';
import { type } from '../../../src/ui/tokens';
import { periodLabel, sectionsOf } from '../../../src/economy/invoiceLines.js';
import { invoiceTotals, paidAmountOf } from '../../../src/economy/invoiceFlow.js';
import { sentFromPowerOffice } from '../../../src/economy/powerOfficeView.js';
import { MiniTable, money } from '../billing/ui';

function num(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value) {
  const n = Number(value) || 0;
  return n ? `${num(n)} %` : '';
}

/**
 * Skuffen under en timelinje: timene bak linjen, med dato, medarbeider, aktivitet og hva som er gjort.
 * loadEntries(ids) henter timene første gang skuffen åpnes.
 */
function HoursDrawer({ line, colors, stacked, state }) {
  if (!state) return null;
  if (state.loading) return <Text style={[type.caption, { color: colors.muted }]}>Henter timene …</Text>;
  if (state.error) return <Text style={[type.caption, { color: colors.danger }]}>{state.error}</Text>;
  const rows = [...(state.rows || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!rows.length) return <Text style={[type.caption, { color: colors.muted }]}>Fant ikke timene bak linjen.</Text>;
  const hours = rows.reduce((sum, row) => sum + (Number(row.billableHours ?? row.hours) || 0), 0);
  return (
    <View style={[styles.drawer, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID={`invoice-line-hours-${line.id}`}>
      <MiniTable
        colors={colors}
        stacked={stacked}
        rows={rows}
        rowKey={(row, index) => row.id || index}
        columns={[
          { key: 'date', label: 'Dato', width: 84, render: (row) => formatDate(row.date) },
          { key: 'employee', label: 'Medarbeider', flex: 1, wrap: true, render: (row) => row.employeeName || '—' },
          { key: 'activity', label: 'Aktivitet', flex: 1, wrap: true, render: (row) => row.activityName || '' },
          { key: 'description', label: 'Hva som er gjort', flex: 3, wrap: true, render: (row) => row.description || row.comment || '' },
          { key: 'hours', label: 'Timer', width: 64, align: 'right', render: (row) => num(row.billableHours ?? row.hours) },
        ]}
      />
      <Text style={[type.caption, { color: colors.muted }]}>{`${rows.length} ${rows.length === 1 ? 'føring' : 'føringer'}, ${num(hours)} timer.`}</Text>
    </View>
  );
}

export function InvoiceLinesView({ invoice, colors, stacked = false, loadEntries = null }) {
  const [open, setOpen] = useState({});
  const sections = sectionsOf(invoice?.lines || []);
  const toggle = async (line) => {
    const id = line.id;
    if (open[id]) {
      setOpen((current) => ({ ...current, [id]: null }));
      return;
    }
    setOpen((current) => ({ ...current, [id]: { loading: true } }));
    try {
      const rows = await loadEntries(line.timeEntryIds || []);
      setOpen((current) => (current[id] ? { ...current, [id]: { rows: rows || [] } } : current));
    } catch (cause) {
      setOpen((current) => (current[id] ? { ...current, [id]: { error: String(cause?.message || 'Kunne ikke hente timene.') } } : current));
    }
  };
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
        {loadEntries && (line.timeEntryIds || []).length ? (
          <TouchableOpacity
            onPress={() => toggle(line)}
            accessibilityRole="button"
            accessibilityState={{ expanded: !!open[line.id] }}
            style={styles.drawerToggle}
            nativeID={`invoice-line-toggle-${line.id}`}
          >
            <Ionicons name={open[line.id] ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.brand} />
            <Text style={[type.caption, { color: colors.brand }]}>
              {`${open[line.id] ? 'Skjul' : 'Vis'} timene (${line.timeEntryIds.length})`}
            </Text>
          </TouchableOpacity>
        ) : null}
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
          {/* Timene vises rett under linjen som er åpnet. */}
          <MiniTable
            columns={columns}
            rows={section.lines}
            colors={colors}
            stacked={stacked}
            rowKey={(line) => line.id}
            renderAfter={(line) => (open[line.id] ? (
              <View style={styles.drawerWrap}>
                <Text style={[type.label, { color: colors.ink }]}>
                  {`Timer bak «${line.description || 'linjen'}»${periodLabel(line.periodStart, line.periodEnd) ? `, ${periodLabel(line.periodStart, line.periodEnd)}` : ''}`}
                </Text>
                <HoursDrawer line={line} colors={colors} stacked={stacked} state={open[line.id]} />
              </View>
            ) : null)}
          />
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
  // Sendt fra PowerOffice: Go runder ikke av, og beløpet på fakturaen der er det som gjelder.
  const fromPowerOffice = sentFromPowerOffice(invoice) && Number.isFinite(Number(invoice?.amountInclVat));
  const totalDue = fromPowerOffice ? Number(invoice.amountInclVat) : totals.totalDue;
  const outstanding = Number(invoice?.outstandingAmount ?? totalDue - paid);
  const rows = [
    ['Fakturabeløp eks. mva', money(totals.amountExVat, currency)],
    ['Mva', money(totals.vat, currency)],
    ['Fakturabeløp ink. mva', money(totals.amountInclVat, currency)],
    fromPowerOffice ? null : ['Øreavrunding', money(totals.rounding, currency)],
    [totalDue < 0 ? `Til gode ${currency}` : `Totalt å betale ${currency}`, money(Math.abs(totalDue), currency), true],
    ['Har betalt', paid ? money(paid, currency) : '–'],
    credited ? ['Kreditert', money(credited, currency)] : null,
    loss ? ['Ført som tap', money(loss, currency)] : null,
    ['Igjen å betale', money(Number.isFinite(outstanding) ? outstanding : totalDue, currency), true],
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
  drawerToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' },
  drawerWrap: { gap: 4, paddingVertical: 8 },
  drawer: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  totals: { alignSelf: 'flex-end', gap: 4, minWidth: 320 },
  totalRow: { flexDirection: 'row', gap: 12 },
});
