/**
 * Auth-fri demo for manuell/automatisk UI-test av Faktura-modulen.
 * Åpnes på /faktura-demo (samme mønster som /dashboard-themes).
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { emptyInvoice, normalizeInvoice, sortInvoices } from '../../src/economy/invoices.js';
import { normalizeLine } from '../../src/economy/invoiceLines.js';
import { issueInvoice, recalcInvoice, recordDelivery } from '../../src/economy/invoiceFlow.js';
import { emptyProjectState } from '../../src/project/engine';
import EconomyInvoices from './EconomyInvoices';
import EconomyBilling from './EconomyBilling';

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
    async removeInvoice(_companyId, invoiceId) {
      const id = String(invoiceId || '');
      if (!id) return;
      rows = sortInvoices(rows.filter((row) => row.id !== id));
      emit();
    },
  };
}

const DEMO_CUSTOMERS = [
  { id: 'c-sola', name: 'Sola Kommune', customerNumber: '10027', orgnr: '948243113', address: 'Postboks 99', postalCode: '4097', place: 'Sola', email: 'faktura@sola.kommune.no', contactName: 'Buster Skjødt' },
  { id: 'c-sa', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137', address: 'Postboks 583', postalCode: '4305', place: 'Sandnes', email: 'faktura@sandnes.kommune.no' },
  { id: 'c-c1', name: 'Consult1 Sør AS', customerNumber: '10088', orgnr: '', address: '', email: '' },
  { id: 'c-ry', name: 'RYFYLKE EIENDOM AS', customerNumber: '10231', orgnr: '983858635', address: 'Strandgata 12', postalCode: '4005', place: 'Stavanger', email: 'post@ryfylke-eiendom.no' },
];

const DEMO_PROJECTS = [
  { id: 'p-jas', number: '10791', name: 'Jåsund Skole', customerId: 'c-sola', client: 'Sola Kommune', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1090 }, manager: 'Geir Ove Andersen', department: 'Energi & teknisk' },
  { id: 'p-kino', number: '10610', name: 'Kino Kino', customerId: 'c-sa', client: 'Sandnes Kommune', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1137 }, manager: 'Geir Ove Andersen' },
  { id: 'p-leir', number: '10908', name: '01 E39 Leirvika–Renndalen [SAK]', customerId: 'c-c1', client: 'Consult1 Sør AS', pricingModel: 'hourly', pricingSettings: {} },
  { id: 'p-gol', number: '10869', name: 'Golhaug VVA - Kontroll VA', customerId: 'c-ry', client: 'RYFYLKE EIENDOM AS', pricingModel: 'fixed', pricingSettings: { fixedFee: 120000 } },
];

/** Fast demo-leverandør slik at PDF og EHF kan lages uten Firestore-selskap. */
export const DEMO_SUPPLIER = {
  name: 'ProTop Demo AS',
  orgnr: '912345678',
  address: 'Storgata 1',
  city: 'Oslo',
  postalCode: '0150',
  bankAccount: '12345678903',
  bankName: 'Demo Bank',
  email: 'faktura@protop-demo.no',
  phone: '+47 22 00 00 00',
  vatRegistered: true,
  inForetaksregisteret: true,
};

function entry(id, projectId, employeeId, employeeName, date, hours, status, description) {
  const project = DEMO_PROJECTS.find((row) => row.id === projectId);
  return {
    id, projectId, employeeId, employeeName, date, hours, status, description,
    activityName: 'Hovedaktivitet', projectNumber: project.number, projectName: project.name,
    customerId: project.customerId, billable: true, invoiceId: null,
  };
}

const DEMO_ENTRIES = [
  entry('t1', 'p-jas', 'e-lin', 'Linda Øie', '2026-09-01', 1, 'godkjent', 'Kommunikasjon med BHO, info om trafikk-kontroll'),
  entry('t2', 'p-jas', 'e-lin', 'Linda Øie', '2026-09-10', 2.5, 'registrert', 'BH-møte + forberedelse'),
  entry('t3', 'p-jas', 'e-lin', 'Linda Øie', '2026-09-17', 2, 'registrert', 'Byggemøte inkl kommunikasjon og oppfølging'),
  entry('t4', 'p-jas', 'e-lin', 'Linda Øie', '2026-09-21', 5, 'registrert', 'VR/SHA-oppfølging'),
  entry('t5', 'p-jas', 'e-sil', 'Silje Bore Håland', '2026-09-28', 2.5, 'godkjent', 'Omvisning og orientering av systemer'),
  entry('t6', 'p-jas', 'e-sil', 'Silje Bore Håland', '2026-09-30', 2.5, 'godkjent', 'Byggeplass, oppfølging'),
  entry('t7', 'p-jas', 'e-ulv', 'Ulv-Erik Nordby', '2026-09-02', 3, 'godkjent', 'Oppfølging'),
  entry('t8', 'p-jas', 'e-ulv', 'Ulv-Erik Nordby', '2026-09-15', 2, 'godkjent', 'Gjennomgang dalux, byggeplass'),
  entry('t9', 'p-jas', 'e-ulv', 'Ulv-Erik Nordby', '2026-09-24', 3, 'godkjent', 'Div oppfølging kvalitetssikring'),
  entry('t10', 'p-kino', 'e-ulv', 'Ulv-Erik Nordby', '2026-09-12', 0.75, 'godkjent', 'Befaring'),
  entry('t11', 'p-leir', 'e-lin', 'Linda Øie', '2026-09-08', 4, 'godkjent', 'Prosjektering'),
];

const DEMO_EXPENSES = [
  {
    id: 'x1', projectId: 'p-jas', projectNumber: '10791', date: '2026-09-30', description: 'Utlegg : iTech (ITB)',
    amountExVat: 60807.21, markupPercent: 15, status: 'approved', billable: true,
    receiptUri: 'https://firebasestorage.googleapis.com/v0/b/demo/o/families%2F__demo__%2Fkvittering.jpeg', receiptName: 'img418769196 (1).jpeg',
  },
  { id: 'x2', projectId: 'p-kino', projectNumber: '10610', date: '2026-09-20', description: 'Parkering', amountExVat: 300, status: 'approved', billable: true },
];

const DEMO_STATE = {
  ...emptyProjectState(),
  projects: DEMO_PROJECTS,
  timesheetLocks: [
    { employeeId: 'e-lin', throughDate: '2026-07-31' },
    { employeeId: 'e-sil', throughDate: '2026-06-12' },
    { employeeId: 'e-ulv', throughDate: '2026-09-30' },
  ],
  companyInvoiceDefaults: {
    creditDays: 28,
    adminAmount: 95,
    groupHoursBy: 'employee',
    attachTimeSpec: true,
    markupExpenseHourly: 10,
    invoiceNumberStart: 16720,
    kidFormat: 'invoice',
  },
};

function buildDemoSeedInvoices() {
  const sent = issueInvoice(recalcInvoice(emptyInvoice({
    id: 'inv_demo_16719',
    status: 'draft',
    customerId: 'c-sa',
    customerNumber: '10025',
    customerName: 'Sandnes Kommune',
    orgnr: '964965137',
    customerAddress: { street: 'Postboks 583', postalCode: '4305', city: 'Sandnes', country: 'NO' },
    customerEmail: 'faktura@sandnes.kommune.no',
    customerReference: '5611001',
    projectId: 'p-kino',
    projectNumber: '10610',
    projectName: 'Kino Kino',
    bankAccount: DEMO_SUPPLIER.bankAccount,
    creditDays: 28,
    lines: [
      normalizeLine({ section: 'hours', description: 'Ulv-Erik Nordby', quantity: 6, unit: 't', unitPrice: 1137, periodStart: '2026-08-01', periodEnd: '2026-08-31', account: '3000' }),
      normalizeLine({ section: 'admin', description: 'Adm. kostnader', quantity: 1, unit: 'stk', unitPrice: 95, locked: true, account: '3000' }),
    ],
  })), { number: '16719', date: '2026-09-02', creditDays: 28, kidFormat: 'invoice', projectInvoiceCount: 5 }).invoice;
  const delivered = recordDelivery(sent, { channel: 'email', to: ['faktura@sandnes.kommune.no'], at: '2026-09-02T10:00:00.000Z' });
  return [delivered];
}

export default function FakturaDemoScreen() {
  const colors = useColors();
  const seed = useMemo(() => buildDemoSeedInvoices(), []);
  const storage = useMemo(() => createMemoryStorage(seed), [seed]);
  const [tab, setTab] = useState('billing');
  const [openId, setOpenId] = useState('');
  const demo = useMemo(() => ({
    state: DEMO_STATE,
    timeEntries: DEMO_ENTRIES,
    expenses: DEMO_EXPENSES,
    sales: [],
    customers: DEMO_CUSTOMERS,
    contracts: [],
    supplier: DEMO_SUPPLIER,
  }), []);

  return (
    <View nativeID="faktura-demo" style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.banner, { backgroundColor: colors.sunken || colors.card, borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Faktura-demo</Text>
        <Text style={{ color: colors.muted }}>Minnelagring, ingen Firestore. Lag utkast i Til fakturering og ferdigstill dem under Fakturaer.</Text>
        <View style={styles.tabs}>
          {[['billing', 'Til fakturering'], ['invoices', 'Fakturaer']].map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setTab(id)} nativeID={`demo-tab-${id}`} style={[styles.tab, { borderColor: tab === id ? colors.brand : colors.line }]}>
              <Text style={{ color: tab === id ? colors.brand : colors.ink, fontWeight: tab === id ? '700' : '500' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {tab === 'billing' ? (
        <EconomyBilling
          demo={demo}
          storage={storage}
          onOpenInvoice={(id) => { setOpenId(id); setTab('invoices'); }}
        />
      ) : (
        <EconomyInvoices
          familyId="__demo__"
          customers={DEMO_CUSTOMERS}
          projects={DEMO_PROJECTS}
          storage={storage}
          supplier={DEMO_SUPPLIER}
          demoProjectState={DEMO_STATE}
          openInvoiceId={openId}
          onConsumeIntent={() => setOpenId('')}
          isAdmin
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
});
