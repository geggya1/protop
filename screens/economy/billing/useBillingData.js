/**
 * Data til Til fakturering og fakturasiden: prosjekter, timer, utlegg, kjøring, salg,
 * fakturaer (live), kunder, avtaler, indeksvarsler og om PowerOffice er koblet.
 * Timer hentes for et vindu bakover (eller hele prosjektet), ikke hele historikken.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emptyProjectState } from '../../../src/project/engine';
import { loadProjectState } from '../../../src/project/storage';
import { loadTimeEntries, projectHoursQuery } from '../../../src/economy/timeEntryStorage.js';
import { loadProjectExpenses } from '../../../src/economy/expenseStorage.js';
import { loadProductSales } from '../../../src/economy/productSalesStorage.js';
import { combineExpenses } from '../../../src/economy/expenseSave.js';
import { combineSales } from '../../../src/economy/productSaleSave.js';
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
import { useCompanyRefs } from '../../../src/context/CompanyDataContext';
import { freshRows, hydrateRows, liveCustomerList } from '../../../src/company/companyData.js';

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
export default function useBillingData({ familyId, projectId = '', project = null, canSeePowerOffice = true, storage = null, demo = null } = {}) {
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
  // Kunder, prosjekter og personer fra skallets lyttere (ikke i demoen).
  const shared = !demo && !!familyId && familyId !== '__demo__';
  const refs = useCompanyRefs(familyId, { people: shared, customers: shared, projects: shared });

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
    // Prosjektets timer på id og nummer, så eldre og importerte timer også kommer med.
    const hours = projectId
      ? loadTimeEntries(familyId, project?.id === projectId ? projectHoursQuery(project) : { projectId })
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
      // Utlegg og salg ligger to steder; samme sammenslåing som resten av appen (DS-13).
      setExpenses(combineExpenses(projects?.expenses, remoteExpenses));
      setSales(combineSales(projects?.sales, remoteSales));
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

  const customers = liveCustomerList(refs.customers, anbud?.customers || []);
  const projects = useMemo(() => freshRows(state.projects || [], refs.projects), [state.projects, refs.projects]);
  // Navn på medarbeider, kunde og prosjekt slås opp før grunnlaget bygges og listen
  // filtreres (DS-08). Kopiene på radene er reserve for slettede personer og kunder.
  const lookup = useMemo(
    () => ({ directory: refs.directory, customers, projects }),
    [refs.directory, customers, projects],
  );
  const shownEntries = useMemo(() => hydrateRows(timeEntries, lookup), [timeEntries, lookup]);
  const shownExpenses = useMemo(() => hydrateRows(expenses, lookup), [expenses, lookup]);
  const shownTrips = useMemo(() => hydrateRows(state.mileageTrips || [], lookup), [state.mileageTrips, lookup]);
  const shownSales = useMemo(() => hydrateRows(sales, lookup), [sales, lookup]);
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
    projects,
    timeEntries: shownEntries,
    expenses: shownExpenses,
    trips: shownTrips,
    sales: shownSales,
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
