/**
 * Auth-fri demo for manuell/automatisk UI-test av Faktura-modulen.
 * Åpnes på /faktura-demo (samme mønster som /dashboard-themes).
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { normalizeInvoice, sortInvoices } from '../../src/economy/invoices.js';
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
  if (typeof sessionStorage === 'undefined') return;
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

function createMemoryStorage(seed = []) {
  let rows = sortInvoices(loadDemoSeed(seed).map((row) => normalizeInvoice(row)));
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
      const byId = new Map(rows.map((row) => [row.id, row]));
      const now = new Date().toISOString();
      for (let index = 0; index < (invoices || []).length; index += 1) {
        const row = invoices[index];
        const next = normalizeInvoice({
          ...row,
          id: row.id || `inv_${row.invoiceNumber}`,
          updatedAt: now,
          createdAt: row.createdAt || now,
        });
        list.push(next);
        byId.set(next.id, next);
        if ((index + 1) % 400 === 0) {
          onProgress?.(index + 1, invoices.length);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      onProgress?.(list.length, list.length);
      rows = sortInvoices([...byId.values()]);
      await new Promise((resolve) => setTimeout(resolve, 0));
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

export default function FakturaDemoScreen() {
  const colors = useColors();
  const storage = useMemo(() => createMemoryStorage([]), []);
  const [note] = useState('Demo: minnelagring (ingen Firestore). Bruk Importer Excel for å teste flyten.');

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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
