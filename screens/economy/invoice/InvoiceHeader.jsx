/**
 * Hodet på fakturaen: mottaker og fakturainformasjon, lese- og redigeringsvisning.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import OptionPicker from '../../../components/OptionPicker';
import DateField from '../../../components/DateField';
import { dateKey } from '../../../src/utils/dates';
import { formatDate } from '../../../src/economy/invoices.js';
import { DELIVERY_CHANNELS, daysBetween, dueDateFor, isCreditNote } from '../../../src/economy/invoiceFlow.js';
import { INVOICE_LANGUAGE_OPTIONS } from '../../../src/economy/companyInvoiceDefaults.js';
import { Field, LinkText } from '../billing/ui';

function Fact({ label, children, colors }) {
  if (children == null || children === '' || children === '—') return null;
  return (
    <View style={styles.fact}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      {typeof children === 'string' || typeof children === 'number'
        ? <Text style={{ color: colors.ink, fontSize: 14 }}>{children}</Text>
        : children}
    </View>
  );
}

function account(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}` : String(value || '');
}

function addressLines(invoice) {
  const addr = invoice?.customerAddress || {};
  return [
    invoice?.addressLineAbove,
    addr.street,
    [addr.postalCode, addr.city].filter(Boolean).join(' '),
    addr.country && addr.country !== 'NO' ? addr.country : '',
  ].filter(Boolean);
}

export function InvoiceHeaderView({ invoice, colors, wide, onOpenCustomer, onOpenProject }) {
  const credit = isCreditNote(invoice);
  return (
    <View style={[styles.grid, wide && styles.gridWide]}>
      <View style={[styles.col, wide && styles.colWide]}>
        <Fact label="Kunde" colors={colors}>
          <View>
            <TouchableOpacity disabled={!invoice.customerId || !onOpenCustomer} onPress={() => onOpenCustomer?.(invoice.customerId)}>
              <Text style={{ color: invoice.customerId ? colors.brand : colors.ink, fontSize: 14 }}>
                {invoice.customerName || '—'}
                {invoice.customerNumber ? <Text style={{ color: colors.muted }}>{` (${invoice.customerNumber})`}</Text> : null}
              </Text>
            </TouchableOpacity>
            {invoice.addressLineBelow ? <Text style={{ color: colors.ink }}>{invoice.addressLineBelow}</Text> : null}
            {invoice.customerContact ? <Text style={{ color: colors.ink }}>{`v/ ${invoice.customerContact}`}</Text> : null}
            {addressLines(invoice).map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>)}
          </View>
        </Fact>
        <Fact label="Kunde-org.nr." colors={colors}>{invoice.orgnr}</Fact>
        <Fact label="Mva-nummer" colors={colors}>{invoice.customerVatNumber}</Fact>
        <Fact label="Faktura-e-post" colors={colors}>{invoice.customerEmail}</Fact>
        <Fact label="Deres referanse" colors={colors}>{invoice.customerReference}</Fact>
        <Fact label="Kontraktsreferanse" colors={colors}>{invoice.contractReference}</Fact>
        <Fact label="Ordrereferanse" colors={colors}>{invoice.orderReference}</Fact>
      </View>
      <View style={[styles.col, wide && styles.colWide]}>
        <Fact label={credit ? 'Dato' : 'Fakturadato'} colors={colors}>{formatDate(invoice.invoiceDate)}</Fact>
        {credit ? <Fact label="Krediterer" colors={colors}>{`Faktura ${invoice.creditNoteForNumber}`}</Fact> : null}
        {credit && invoice.creditReason ? <Fact label="Årsak" colors={colors}>{invoice.creditReason}</Fact> : null}
        <Fact label="Avdeling" colors={colors}>{invoice.department}</Fact>
        <Fact label="Prosjekt" colors={colors}>
          {invoice.projectName || invoice.projectNumber ? (
            <TouchableOpacity disabled={!invoice.projectId || !onOpenProject} onPress={() => onOpenProject?.(invoice.projectId)}>
              <Text style={{ color: invoice.projectId ? colors.brand : colors.ink, fontSize: 14 }}>
                {invoice.projectName || '—'}
                {invoice.projectNumber ? <Text style={{ color: colors.muted }}>{` (${invoice.projectNumber})`}</Text> : null}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Fact>
        <Fact label="Eksternt prosjektnummer" colors={colors}>{invoice.externalProjectNumber}</Fact>
        <Fact label="Aktivitet" colors={colors}>{invoice.activities}</Fact>
        <Fact label="Prosjekttagger" colors={colors}>{invoice.projectTags}</Fact>
        <Fact label="Antall fakturaer på prosjekt" colors={colors}>{invoice.projectInvoiceCount ? String(invoice.projectInvoiceCount) : ''}</Fact>
        <Fact label="Vår referanse" colors={colors}>{invoice.ourReference}</Fact>
        {credit ? null : <Fact label="Betalingsfrist" colors={colors}>{formatDate(invoice.dueDate)}</Fact>}
        {credit ? null : <Fact label="Kontonr" colors={colors}>{account(invoice.bankAccount)}</Fact>}
        {credit ? null : <Fact label="KID-nummer" colors={colors}>{invoice.kid}</Fact>}
      </View>
    </View>
  );
}

export function InvoiceTexts({ invoice, colors }) {
  if (!invoice.invoiceText) return null;
  return (
    <View style={[styles.textBox, { borderColor: colors.line }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Fakturatekst</Text>
      <Text style={{ color: colors.ink, lineHeight: 20 }}>{invoice.invoiceText}</Text>
    </View>
  );
}

/** Redigering av mottaker og fakturainformasjon. patch(next) lagrer feltene lokalt. */
export function InvoiceHeaderEditor({ invoice, colors, wide, customers = [], onPatch }) {
  const addr = invoice.customerAddress || {};
  const customerOptions = (customers || []).map((row) => ({
    id: row.id,
    label: [row.customerNumber ? `#${row.customerNumber}` : '', row.name, row.orgnr ? `(${row.orgnr})` : ''].filter(Boolean).join(' '),
  }));
  function pickCustomer(id) {
    const customer = (customers || []).find((row) => row.id === id);
    if (!customer) return;
    onPatch({
      customerId: customer.id,
      customerNumber: customer.customerNumber || '',
      customerName: customer.name,
      orgnr: customer.orgnr || '',
      customerEmail: customer.invoiceEmail || customer.email || invoice.customerEmail,
      customerContact: customer.contactName || '',
      customerAddress: { street: customer.address || '', postalCode: customer.postalCode || '', city: customer.place || '', country: 'NO' },
    });
  }
  const setAddr = (key, value) => onPatch({ customerAddress: { ...addr, [key]: value } });
  // Fristen følger fakturadatoen og kredittiden til den velges selv.
  function setInvoiceDate(day) {
    onPatch({
      invoiceDate: day,
      invoiceDateSet: true,
      ...(invoice.dueDateSet ? {} : { dueDate: dueDateFor({ invoiceDate: day }, { creditDays: invoice.creditDays ?? 0 }) }),
    });
  }
  function setDueDate(day) {
    const days = daysBetween(invoice.invoiceDate, day);
    onPatch({ dueDate: day, dueDateSet: true, ...(days != null && days >= 0 ? { creditDays: days } : {}) });
  }
  function setCreditDays(value) {
    const days = value === '' ? null : Number(value.replace(/\D/g, '')) || 0;
    onPatch({
      creditDays: days,
      dueDateSet: false,
      ...(invoice.invoiceDate ? { dueDate: dueDateFor({ invoiceDate: invoice.invoiceDate }, { creditDays: days ?? 0 }) } : {}),
    });
  }
  const dueBeforeDate = !!(invoice.invoiceDate && invoice.dueDate && invoice.dueDate < invoice.invoiceDate);
  return (
    <View style={[styles.grid, wide && styles.gridWide]}>
      <View style={[styles.box, wide && styles.boxWide, { borderColor: colors.line }]}>
        <Text style={[styles.boxTitle, { color: colors.ink }]}>Mottaker</Text>
        <View style={styles.fieldWrap}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Kunde</Text>
          <OptionPicker
            options={customerOptions}
            value={invoice.customerId}
            onChange={pickCustomer}
            clearable={false}
            chipLimit={0}
            placeholder={invoice.customerName || 'Velg kunde'}
            accessibilityLabel="Kunde"
          />
        </View>
        <View style={styles.row}>
          <Field grow label="Kundenavn" value={invoice.customerName} onChangeText={(v) => onPatch({ customerName: v })} colors={colors} />
          <Field label="Kundenr" value={invoice.customerNumber} onChangeText={(v) => onPatch({ customerNumber: v })} colors={colors} width={110} />
        </View>
        <View style={styles.row}>
          <Field grow label="Kunde-org.nr." value={invoice.orgnr} onChangeText={(v) => onPatch({ orgnr: v.replace(/\s/g, '') })} colors={colors} keyboardType="number-pad" />
          <Field grow label="Mva-nummer (utland)" value={invoice.customerVatNumber} onChangeText={(v) => onPatch({ customerVatNumber: v })} colors={colors} />
        </View>
        <Field label="Adresse" value={addr.street} onChangeText={(v) => setAddr('street', v)} colors={colors} />
        <View style={styles.row}>
          <Field label="Postnr." value={addr.postalCode} onChangeText={(v) => setAddr('postalCode', v)} colors={colors} width={100} />
          <Field grow label="Sted" value={addr.city} onChangeText={(v) => setAddr('city', v)} colors={colors} />
          <Field label="Land" value={addr.country} onChangeText={(v) => setAddr('country', v.toUpperCase().slice(0, 2))} colors={colors} width={70} />
        </View>
        <Field label="Tilleggslinje over mottakers navn" value={invoice.addressLineAbove} onChangeText={(v) => onPatch({ addressLineAbove: v })} colors={colors} />
        <Field label="Tilleggslinje under mottakers navn" value={invoice.addressLineBelow} onChangeText={(v) => onPatch({ addressLineBelow: v })} colors={colors} />
        <View style={styles.row}>
          <Field grow label="Deres referanse" value={invoice.customerReference} onChangeText={(v) => onPatch({ customerReference: v })} colors={colors} nativeID="invoice-edit-their-ref" />
          <Field grow label="Vår referanse" value={invoice.ourReference} onChangeText={(v) => onPatch({ ourReference: v })} colors={colors} />
        </View>
        <View style={styles.row}>
          <Field grow label="Kundekontakt" value={invoice.customerContact} onChangeText={(v) => onPatch({ customerContact: v })} colors={colors} />
          <Field grow label="Faktura-e-post" value={invoice.customerEmail} onChangeText={(v) => onPatch({ customerEmail: v.trim() })} colors={colors} keyboardType="email-address" />
        </View>
        <View style={styles.row}>
          <Field grow label="Ordrereferanse" value={invoice.orderReference} onChangeText={(v) => onPatch({ orderReference: v })} colors={colors} />
          <Field grow label="Kontraktsreferanse" value={invoice.contractReference} onChangeText={(v) => onPatch({ contractReference: v })} colors={colors} />
        </View>
      </View>
      <View style={[styles.box, wide && styles.boxWide, { borderColor: colors.line }]}>
        <Text style={[styles.boxTitle, { color: colors.ink }]}>Fakturainformasjon</Text>
        <View style={styles.row}>
          <Field grow label="Fakturanummer" value="Settes ved ferdigstilling" colors={colors} editable={false} />
        </View>
        <View style={styles.row}>
          <View style={[styles.fieldWrap, styles.fieldGrow]}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Fakturadato</Text>
            <DateField
              value={invoice.invoiceDate}
              onChange={(date) => date && setInvoiceDate(dateKey(date))}
              style={[styles.date, { borderColor: colors.line, backgroundColor: colors.card }]}
            />
          </View>
          <View style={[styles.fieldWrap, styles.fieldGrow]}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Betalingsfrist</Text>
            <DateField
              value={invoice.dueDate}
              onChange={(date) => date && setDueDate(dateKey(date))}
              style={[styles.date, { borderColor: dueBeforeDate ? (colors.danger || '#b42318') : colors.line, backgroundColor: colors.card }]}
            />
          </View>
          <Field label="Kredittid (dager)" value={invoice.creditDays ?? ''} onChangeText={setCreditDays} colors={colors} keyboardType="number-pad" width={130} />
        </View>
        {dueBeforeDate ? (
          <Text style={{ color: colors.danger || '#b42318', fontSize: 12 }}>Betalingsfristen er før fakturadatoen.</Text>
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
          {invoice.invoiceDateSet
            ? 'Fakturaen får datoene du har valgt her. Loggen viser når den faktisk ble ferdigstilt og sendt.'
            : 'Velger du ingen fakturadato, får fakturaen dagens dato når den ferdigstilles, og fristen regnes fra kredittiden.'}
        </Text>
        {invoice.invoiceDateSet || invoice.dueDateSet ? (
          <LinkText
            label="Bruk datoen fakturaen ferdigstilles i stedet"
            onPress={() => onPatch({ invoiceDateSet: false, dueDateSet: false })}
            colors={colors}
            nativeID="invoice-edit-dates-reset"
          />
        ) : null}
        <View style={styles.row}>
          <Field grow label="Prosjekt" value={[invoice.projectNumber, invoice.projectName].filter(Boolean).join(' ')} colors={colors} editable={false} />
          <Field grow label="Eksternt prosjektnummer" value={invoice.externalProjectNumber} onChangeText={(v) => onPatch({ externalProjectNumber: v })} colors={colors} />
        </View>
        <View style={styles.row}>
          <Field grow label="Avdeling" value={invoice.department} onChangeText={(v) => onPatch({ department: v })} colors={colors} />
          <Field grow label="Aktivitet" value={invoice.activities} onChangeText={(v) => onPatch({ activities: v })} colors={colors} />
        </View>
        <View style={styles.row}>
          <Field grow label="Kontonr" value={invoice.bankAccount} onChangeText={(v) => onPatch({ bankAccount: v })} colors={colors} keyboardType="number-pad" />
        </View>
        <View style={styles.fieldWrap}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Forsendelse</Text>
          <OptionPicker
            options={DELIVERY_CHANNELS}
            value={invoice.deliveryMethod}
            onChange={(id) => id && onPatch({ deliveryMethod: id })}
            clearable={false}
            accessibilityLabel="Forsendelse"
          />
        </View>
        <View style={styles.fieldWrap}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>Fakturaspråk</Text>
          <OptionPicker
            options={INVOICE_LANGUAGE_OPTIONS}
            value={invoice.language}
            onChange={(id) => id && onPatch({ language: id })}
            clearable={false}
            accessibilityLabel="Fakturaspråk"
          />
        </View>
      </View>
      <View style={[styles.box, wide && styles.boxWide, styles.full, { borderColor: colors.line }]}>
        <Field label="Fakturatekst" value={invoice.invoiceText} onChangeText={(v) => onPatch({ invoiceText: v })} colors={colors} multiline nativeID="invoice-edit-text" />
        <Field label="Bunntekst" value={invoice.footerText} onChangeText={(v) => onPatch({ footerText: v })} colors={colors} multiline />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 16 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  col: { gap: 10 },
  colWide: { flex: 1, minWidth: 260 },
  fact: { gap: 2 },
  textBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  box: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
  boxWide: { flex: 1, minWidth: 320 },
  full: { flexBasis: '100%' },
  boxTitle: { fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fieldWrap: { gap: 4 },
  fieldGrow: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  date: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
});
