/**
 * Auth-fri demo for manuell/automatisk UI-test av Faktura-modulen.
 * Åpnes på /faktura-demo (samme mønster som /dashboard-themes).
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { emptyInvoice, normalizeInvoice, sortInvoices } from '../../src/economy/invoices.js';
import { buildKid } from '../../src/economy/kid.js';
import { calcLineVat, roundMoney } from '../../src/economy/vat.js';
import { attachVoucherSnapshot, voucherFromInvoice } from '../../src/economy/vouchers.js';
import EconomyInvoices from './EconomyInvoices';

const DEMO_STORE_KEY = 'protop.fakturaDemo.invoiceIndex';

/** Kun id + fakturanr — full dump sprenger sessionStorage-kvoten. */
function loadDemoSeed(seed = []) {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(DEMO_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map((row) => ({
            id: row.id || `inv_${row.invoiceNumber}`,
            invoiceNumber: String(row.invoiceNumber || ''),
            customerName: row.customerName || '',
            amountInclVat: row.amountInclVat ?? 0,
          })).filter((row) => row.invoiceNumber);
        }
      }
    } catch {
      // ignore corrupt cache
    }
  }
  return seed || [];
}

function persistDemoRows(rows) {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const light = (rows || []).map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName || '',
        amountInclVat: row.amountInclVat ?? 0,
      }));
      sessionStorage.setItem(DEMO_STORE_KEY, JSON.stringify(light));
    } catch {
      // ignore quota
    }
  }
}

function createMemoryStorage(seed = []) {
  // Full seed always wins for known demo ids (sessionStorage only keeps a light index).
  const seedNorm = (seed || []).map((row) => normalizeInvoice(row));
  const seedById = new Map(seedNorm.map((row) => [row.id, row]));
  const cached = loadDemoSeed([]).map((row) => normalizeInvoice(row));
  const extras = cached.filter((row) => !seedById.has(row.id));
  let rows = sortInvoices([...seedNorm, ...extras]);
  const listeners = new Set();
  const emit = () => {
    const snapshot = sortInvoices(rows);
    persistDemoRows(snapshot);
    listeners.forEach((fn) => fn(snapshot));
  };
  return {
    watchInvoices(_companyId, onData) {
      onData(sortInvoices(rows));
      listeners.add(onData);
      return () => listeners.delete(onData);
    },
    async loadInvoice(_companyId, invoiceId) {
      return rows.find((row) => row.id === invoiceId) || null;
    },
    async saveInvoice(_companyId, invoice) {
      const next = normalizeInvoice({
        ...invoice,
        id: invoice?.id || `inv_${invoice?.invoiceNumber || Date.now()}`,
        updatedAt: new Date().toISOString(),
        createdAt: invoice?.createdAt || new Date().toISOString(),
      });
      rows = sortInvoices([...rows.filter((row) => row.id !== next.id), next]);
      emit();
      return next;
    },
    async saveInvoiceImport(_companyId, invoices, { onProgress } = {}) {
      const list = [];
      for (let i = 0; i < (invoices || []).length; i += 1) {
        const next = normalizeInvoice({
          ...invoices[i],
          id: invoices[i]?.id || `inv_${invoices[i]?.invoiceNumber || Date.now()}_${i}`,
          updatedAt: new Date().toISOString(),
          createdAt: invoices[i]?.createdAt || new Date().toISOString(),
        });
        rows = sortInvoices([...rows.filter((row) => row.id !== next.id), next]);
        list.push(next);
        onProgress?.({ done: i + 1, total: invoices.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      emit();
      return { saved: list.length, invoices: list };
    },
  };
}

const DEMO_CUSTOMERS = [
  { id: 'c-ry', name: 'RYFYLKE EIENDOM AS', customerNumber: '10231', orgnr: '983858635' },
  { id: 'c-sa', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137' },
  { id: 'c-be', name: 'AS Betong', customerNumber: '10121', orgnr: '828855832' },
];

const DEMO_PROJECTS = [
  { id: 'p-gol', number: '10869', name: 'Golhaug VVA - Kontroll VA', customerId: 'c-ry' },
  { id: 'p-sk', number: '10857', name: 'Sikker skolevei Hommersåk', customerId: 'c-sa' },
  { id: 'p-sto', number: '10865', name: '31097 - Storåna bru', customerId: 'c-be' },
];

/** Fast demo-leverandør slik at EHF kan genereres uten Firestore-selskap. */
export const DEMO_SUPPLIER = {
  name: 'ProTop Demo AS',
  orgnr: '912345678',
  address: 'Storgata 1',
  city: 'Oslo',
  postalCode: '0150',
  bankAccount: '12345678903',
};

function buildDemoSeedInvoice() {
  const ordinary = calcLineVat({
    quantity: 7.5,
    unitPrice: 1359,
    vatCode: 'HIGH',
  });
  const overtime = calcLineVat({
    quantity: 2,
    unitPrice: 2038.5, // 1359 * 1.5
    vatCode: 'HIGH',
  });
  const lines = [
    {
      id: 'line_1',
      description: 'Befaring — ordinær',
      quantity: ordinary.quantity,
      unit: 't',
      unitPrice: ordinary.unitPrice,
      vatCode: 'HIGH',
      vatPercent: ordinary.vatPercent,
      amountExVat: ordinary.amountExVat,
      vatAmount: ordinary.vatAmount,
      amountInclVat: ordinary.amountInclVat,
      account: '3000',
    },
    {
      id: 'line_2',
      description: 'Kveldsarbeid — overtid 50 %',
      quantity: overtime.quantity,
      unit: 't',
      unitPrice: overtime.unitPrice,
      vatCode: 'HIGH',
      vatPercent: overtime.vatPercent,
      amountExVat: overtime.amountExVat,
      vatAmount: overtime.vatAmount,
      amountInclVat: overtime.amountInclVat,
      account: '3000',
    },
  ];
  const amountExVat = roundMoney(lines.reduce((s, l) => s + l.amountExVat, 0));
  const vat = roundMoney(lines.reduce((s, l) => s + l.vatAmount, 0));
  const amountInclVat = roundMoney(lines.reduce((s, l) => s + l.amountInclVat, 0));
  const kid = buildKid({
    customerNumber: '10231',
    invoiceNumber: '10001',
    customerWidth: 5,
    invoiceWidth: 5,
  });
  let invoice = emptyInvoice({
    id: 'inv_demo_10001',
    invoiceNumber: '10001',
    invoiceDate: '2026-10-06',
    dueDate: '2026-10-20',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-07',
    customerNumber: '10231',
    customerName: 'RYFYLKE EIENDOM AS',
    orgnr: '983858635',
    customerId: 'c-ry',
    projectNumber: '10869',
    projectName: 'Golhaug VVA - Kontroll VA',
    projectId: 'p-gol',
    activities: 'Prosjektering',
    kid,
    vatCode: 'HIGH',
    bankAccount: DEMO_SUPPLIER.bankAccount,
    deliveryMethod: 'EHF',
    lines,
    amountExVat,
    vat,
    amountInclVat,
    outstandingAmount: amountInclVat,
    outstanding: String(amountInclVat),
    currency: 'NOK',
    status: 'registered',
    notes: 'Demo-faktura fra godkjente timer (ordinær + overtid).',
    createdAt: '2026-10-06T10:00:00.000Z',
    updatedAt: '2026-10-06T10:00:00.000Z',
  });
  const voucher = voucherFromInvoice(invoice);
  if (voucher.ok) {
    invoice = attachVoucherSnapshot(invoice, voucher);
  }
  return invoice;
}

export default function FakturaDemoScreen() {
  const colors = useColors();
  const seed = useMemo(() => [buildDemoSeedInvoice()], []);
  const storage = useMemo(() => createMemoryStorage(seed), [seed]);
  const [note] = useState(
    'Demo: minnelagring (ingen Firestore). Seed-faktura #10001 med linjer, KID, bilag og EHF.',
  );

  return (
    <View nativeID="faktura-demo" style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.banner, { backgroundColor: colors.sunken || colors.card, borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Faktura-demo</Text>
        <Text style={{ color: colors.muted }}>{note}</Text>
      </View>
      <EconomyInvoices
        familyId="__demo__"
        customers={DEMO_CUSTOMERS}
        projects={DEMO_PROJECTS}
        storage={storage}
        supplier={DEMO_SUPPLIER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
