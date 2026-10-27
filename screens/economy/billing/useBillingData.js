/**
 * Data til Til fakturering og fakturasiden: prosjekter, timer, utlegg, kjøring, salg,
 * fakturaer (live), kunder, avtaler, indeksvarsler og om PowerOffice er koblet.
 * Timer hentes for et vindu bakover (eller hele prosjektet), ikke hele historikken.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyProjectState } from '../../../src/project/engine';
import { loadProjectState } from '../../../src/project/storage';
import { loadTimeEntries } from '../../../src/economy/timeEntryStorage.js';
import { loadProjectExpenses, mergeExpenseLists } from '../../../src/economy/expenseStorage.js';
import { loadProductSales, mergeSaleLists } from '../../../src/economy/productSalesStorage.js';
import * as invoiceStorage from '../../../src/economy/invoiceStorage.js';
import { loadAnbudState } from '../../../src/anbud/storage';
import { mergeIndexSnapshot } from '../../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../../src/indeksregulering/remoteSsb';
import { loadCases, loadIndexCache } from '../../../src/indeksregulering/storage';
import { dueByContractId } from '../../../src/indeksregulering/watch';
import { loadPowerOfficeStatus } from '../../../src/economy/powerOfficeClient.js';
import { resolveProjectInvoiceSettings } from '../../../src/project/invoiceSettings.js';
import { resolveCompanyAccounts } from '../../../src/economy/companyChart.js';
import { resolveCompanyInvoiceDefaults } from '../../../src/economy/companyInvoiceDefaults.js';

/** Hvor langt bakover åpne timer hentes. Eldre ufakturert arbeid er over fristen uansett. */
export const HOURS_WINDOW_MONTHS = 18;

function windowStart(today = new Date()) {
  const date = new Date(today);
  date.setMonth(date.getMonth() - HOURS_WINDOW_MONTHS);
  return date.toISOString().slice(0, 10);
}

/**
 * demo: { state, timeEntries, expenses, sales, customers, contracts } brukes i stedet for skyen
 * (demosiden /faktura-demo). Fakturaene kommer fortsatt fra storage.
 */
export default function useBillingData({ familyId, projectId = '', canSeePowerOffice = true, storage = null, demo = null } = {}) {
  const store = storage || invoiceStorage;
  const [state, setState] = useState(emptyProjectState());
  const [timeEntries, setTimeEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [anbud, setAnbud] = useState(null);
  const [dueById, setDueById] = useState({});
  const [poStatus, setPoStatus] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [stamp, setStamp] = useState(0);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  useEffect(() => {
    if (demo) {
      setState(demo.state || emptyProjectState());
      setTimeEntries(demo.timeEntries || []);
      setExpenses(demo.expenses || []);
      setSales(demo.sales || []);
      setAnbud({ customers: demo.customers || [], contracts: demo.contracts || [] });
      setReady(true);
      return undefined;
    }
    if (!familyId) {
      setReady(true);
      return undefined;
    }
    let active = true;
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const hours = projectId
      ? loadTimeEntries(familyId, { projectId })
      : loadTimeEntries(familyId, { fromDate: windowStart(), toDate: today });
    Promise.all([
      loadProjectState(familyId, { force: stamp > 0 }),
      hours.catch(() => []),
      loadProjectExpenses(familyId).catch(() => []),
      loadProductSales(familyId).catch(() => []),
      loadAnbudState(familyId).catch(() => null),
    ]).then(([projects, entries, remoteExpenses, remoteSales, loadedAnbud]) => {
      if (!active) return;
      setState(projects || emptyProjectState());
      setTimeEntries(entries || []);
      setExpenses(mergeExpenseLists(remoteExpenses, projects?.expenses || []));
      setSales(mergeSaleLists(remoteSales, projects?.sales || []));
      setAnbud(loadedAnbud);
      setReady(true);
    }).catch((cause) => {
      if (!active) return;
      setError(String(cause?.message || 'Kunne ikke hente grunnlaget.'));
      setReady(true);
    });
    return () => { active = false; };
  }, [familyId, projectId, stamp, demo]);

  useEffect(() => {
    if (!familyId || demo) return undefined;
    let active = true;
    Promise.all([
      loadCases(familyId).catch(() => []),
      loadIndexCache().catch(() => null),
      loadRemoteIndexSnapshot().catch(() => null),
      loadAnbudState(familyId).catch(() => null),
    ]).then(([cases, cache, remote, loadedAnbud]) => {
      if (!active) return;
      const contracts = loadedAnbud?.contracts || [];
      setDueById(dueByContractId(contracts, cases, mergeIndexSnapshot(cache?.series, remote)));
    }).catch(() => {});
    return () => { active = false; };
  }, [familyId]);

  useEffect(() => {
    if (!familyId || typeof store.watchInvoices !== 'function') return undefined;
    return store.watchInvoices(familyId, (rows) => {
      if (live.current) setInvoices(rows || []);
    }, () => {});
  }, [familyId, store]);

  useEffect(() => {
    let active = true;
    if (!familyId || !canSeePowerOffice || familyId === '__demo__') {
      setPoStatus(null);
      return undefined;
    }
    loadPowerOfficeStatus(familyId).then((next) => {
      if (active) setPoStatus(next);
    }).catch(() => {});
    return () => { active = false; };
  }, [familyId, canSeePowerOffice]);

  const reload = useCallback(() => setStamp((value) => value + 1), []);

  const customers = anbud?.customers || [];
  const contracts = anbud?.contracts || [];
  const companyDefaults = useMemo(() => resolveCompanyInvoiceDefaults(state), [state]);
  const chart = useMemo(() => resolveCompanyAccounts(state), [state]);
  const settingsFor = useCallback(
    (project) => resolveProjectInvoiceSettings(state, project).effective,
    [state],
  );
  const mode = poStatus?.connected ? 'poweroffice' : 'protop';

  return {
    ready,
    error,
    state,
    projects: state.projects || [],
    timeEntries,
    expenses,
    trips: state.mileageTrips || [],
    sales,
    invoices,
    customers,
    contracts,
    dueById,
    poStatus,
    mode,
    companyDefaults,
    chart,
    settingsFor,
    timesheetLocks: state.timesheetLocks || [],
    reload,
    setInvoices,
  };
}
