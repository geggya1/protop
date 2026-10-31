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

/**
 * Siste grunnlag per selskap (og prosjekt) i denne økten. Neste besøk tegnes fra det med
 * en gang, mens en fersk lesing går i bakgrunnen. Faktura og Til fakturering deler det.
 */
const SNAPSHOTS = new Map();
const SNAPSHOT_CAP = 12;

function snapshotKey(familyId, projectId) {
  return `${familyId || ''}|${projectId || ''}`;
}

function rememberSnapshot(key, patch) {
  const next = { ...(SNAPSHOTS.get(key) || {}), ...patch };
  SNAPSHOTS.delete(key);
  SNAPSHOTS.set(key, next);
  while (SNAPSHOTS.size > SNAPSHOT_CAP) SNAPSHOTS.delete(SNAPSHOTS.keys().next().value);
  return next;
}

/** Test/hjelper: glem lagret grunnlag (alle selskaper, eller ett). */
export function forgetBillingData(familyId = null) {
  if (familyId == null) {
    SNAPSHOTS.clear();
    return;
  }
  for (const key of [...SNAPSHOTS.keys()]) {
    if (key.startsWith(`${familyId}|`)) SNAPSHOTS.delete(key);
  }
}

/** Hvor langt bakover åpne timer hentes. Eldre ufakturert arbeid er over fristen uansett. */
export const HOURS_WINDOW_MONTHS = 18;

const EMPTY = [];

function windowStart(today = new Date()) {
  const date = new Date(today);
  date.setMonth(date.getMonth() - HOURS_WINDOW_MONTHS);
  return date.toISOString().slice(0, 10);
}

/** Lesinger som pågår per selskap/prosjekt. Siden og forhåndslastingen deler dem. */
const INFLIGHT = new Map();
const LATEST = new Map();
let loadSeq = 0;

/**
 * Henter grunnlaget (prosjekter, timer, utlegg, salg og avtaler) og husker det.
 * force: ny lesing selv om en annen pågår (etter godkjenning eller nytt utkast).
 */
export function loadBillingBase(familyId, { projectId = '', project = null, force = false } = {}) {
  const key = snapshotKey(familyId, projectId);
  if (!force && INFLIGHT.has(key)) return INFLIGHT.get(key);
  const seq = ++loadSeq;
  LATEST.set(key, seq);
  const today = new Date().toISOString().slice(0, 10);
  // Prosjektets timer på id og nummer, så eldre og importerte timer også kommer med.
  // Vinduet på 18 måneder leses bare her, så det skrives ikke til nettleserens lager.
  const hours = projectId
    ? loadTimeEntries(familyId, project?.id === projectId ? projectHoursQuery(project) : { projectId })
    : loadTimeEntries(familyId, { fromDate: windowStart(), toDate: today, cache: false });
  const pending = Promise.all([
    loadProjectState(familyId, { force }),
    hours.catch(() => []),
    loadProjectExpenses(familyId).catch(() => []),
    loadProductSales(familyId).catch(() => []),
    loadAnbudState(familyId).catch(() => null),
  ]).then(([projects, entries, remoteExpenses, remoteSales, loadedAnbud]) => {
    const next = {
      state: projects || emptyProjectState(),
      timeEntries: entries || [],
      // Utlegg og salg ligger to steder; samme sammenslåing som resten av appen (DS-13).
      expenses: combineExpenses(projects?.expenses, remoteExpenses),
      sales: combineSales(projects?.sales, remoteSales),
      anbud: loadedAnbud,
    };
    // En eldre lesing som blir ferdig sist, skal ikke overskrive en nyere.
    if (LATEST.get(key) === seq) rememberSnapshot(key, { ...next, loaded: true, at: Date.now() });
    return next;
  });
  INFLIGHT.set(key, pending);
  const done = () => { if (INFLIGHT.get(key) === pending) INFLIGHT.delete(key); };
  pending.then(done, done);
  return pending;
}

/**
 * Etter en godkjenning eller et nytt utkast: en lesing som pågår, kan være fra før endringen.
 * Den brukes ikke og lagres ikke, og forhåndslastingen henter på nytt. Det lagrede grunnlaget
 * vises fortsatt til en fersk lesing er ferdig.
 */
export function staleBillingData(familyId) {
  const prefix = `${familyId || ''}|`;
  for (const key of [...INFLIGHT.keys()]) {
    if (!key.startsWith(prefix)) continue;
    INFLIGHT.delete(key);
    LATEST.set(key, ++loadSeq);
  }
  for (const [key, row] of SNAPSHOTS) {
    if (key.startsWith(prefix)) SNAPSHOTS.set(key, { ...row, at: 0 });
  }
}

/** Lagret grunnlag nyere enn dette hentes ikke på nytt av forhåndslastingen. */
const PREFETCH_FRESH_MS = 2 * 60 * 1000;

/**
 * Start lesingen av Til fakturering i bakgrunnen (f.eks. når Økonomi åpnes),
 * så siden er klar når den åpnes. Feil svelges: siden prøver selv.
 */
export function prefetchBillingData(familyId) {
  if (!familyId || familyId === '__demo__') return;
  const key = snapshotKey(familyId, '');
  const warm = SNAPSHOTS.get(key);
  if (INFLIGHT.has(key) || (warm?.loaded && Date.now() - (warm.at || 0) < PREFETCH_FRESH_MS)) return;
  loadBillingBase(familyId).catch(() => {});
}

/**
 * demo: { state, timeEntries, expenses, sales, customers, contracts } brukes i stedet for skyen
 * (demosiden /faktura-demo). Fakturaene kommer fortsatt fra storage.
 */
export default function useBillingData({ familyId, projectId = '', project = null, canSeePowerOffice = true, storage = null, demo = null } = {}) {
  const store = storage || invoiceStorage;
  // Demo og egne lagre (tester) bruker ikke det delte minnet.
  const cacheable = !demo && !storage && !!familyId && familyId !== '__demo__';
  const key = snapshotKey(familyId, projectId);
  const warm = cacheable ? SNAPSHOTS.get(key) || null : null;
  const [state, setState] = useState(() => warm?.state || emptyProjectState());
  const [timeEntries, setTimeEntries] = useState(() => warm?.timeEntries || []);
  const [expenses, setExpenses] = useState(() => warm?.expenses || []);
  const [sales, setSales] = useState(() => warm?.sales || []);
  const [invoices, setInvoices] = useState(() => warm?.invoices || []);
  const [anbud, setAnbud] = useState(() => warm?.anbud || null);
  const [dueById, setDueById] = useState(() => warm?.dueById || {});
  const [poStatus, setPoStatus] = useState(() => warm?.poStatus || null);
  const [ready, setReady] = useState(() => !!warm?.loaded);
  // true mens grunnlaget hentes på nytt bak det som allerede vises.
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [stamp, setStamp] = useState(0);
  const live = useRef(true);
  const shownKey = useRef(warm?.loaded ? key : '');
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
    if (shownKey.current !== key) {
      // Annet selskap eller prosjekt: vis det lagrede grunnlaget, ellers ventetekst.
      const cached = cacheable ? SNAPSHOTS.get(key) : null;
      if (cached?.loaded) {
        setState(cached.state);
        setTimeEntries(cached.timeEntries);
        setExpenses(cached.expenses);
        setSales(cached.sales);
        setAnbud(cached.anbud);
        if (cached.dueById) setDueById(cached.dueById);
        if (cached.invoices) setInvoices(cached.invoices);
        setReady(true);
        shownKey.current = key;
      } else {
        setReady(false);
      }
    }
    setRefreshing(true);
    // En forhåndslasting som pågår, brukes. Ellers en ny lesing.
    loadBillingBase(familyId, { projectId, project, force: stamp > 0 }).then((next) => {
      if (!active) return;
      setState(next.state);
      setTimeEntries(next.timeEntries);
      setExpenses(next.expenses);
      setSales(next.sales);
      setAnbud(next.anbud);
      shownKey.current = key;
      setReady(true);
      setRefreshing(false);
    }).catch((cause) => {
      if (!active) return;
      setError(String(cause?.message || 'Kunne ikke hente grunnlaget.'));
      setReady(true);
      setRefreshing(false);
    });
    return () => { active = false; };
  }, [familyId, projectId, stamp, demo]);

  // Indeksvarslene hentes når grunnlaget er på plass, så de ikke konkurrerer med det.
  const indexReady = ready || !!warm?.loaded;
  useEffect(() => {
    if (!familyId || demo || !indexReady) return undefined;
    let active = true;
    Promise.all([
      loadCases(familyId).catch(() => []),
      loadIndexCache().catch(() => null),
      loadRemoteIndexSnapshot().catch(() => null),
      loadAnbudState(familyId).catch(() => null),
    ]).then(([cases, cache, remote, loadedAnbud]) => {
      if (!active) return;
      const contracts = loadedAnbud?.contracts || [];
      const due = dueByContractId(contracts, cases, mergeIndexSnapshot(cache?.series, remote));
      setDueById(due);
      if (cacheable) rememberSnapshot(key, { dueById: due });
    }).catch(() => {});
    return () => { active = false; };
  }, [familyId, indexReady]);

  useEffect(() => {
    if (!familyId || typeof store.watchInvoices !== 'function') return undefined;
    return store.watchInvoices(familyId, (rows) => {
      if (!live.current) return;
      setInvoices(rows || []);
      if (cacheable) rememberSnapshot(key, { invoices: rows || [] });
    }, () => {});
  }, [familyId, store]);

  useEffect(() => {
    let active = true;
    if (!familyId || !canSeePowerOffice || familyId === '__demo__') {
      setPoStatus(null);
      return undefined;
    }
    loadPowerOfficeStatus(familyId).then((next) => {
      if (!active) return;
      setPoStatus(next);
      if (cacheable) rememberSnapshot(key, { poStatus: next });
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
  const contracts = anbud?.contracts || EMPTY;
  const companyDefaults = useMemo(() => resolveCompanyInvoiceDefaults(state), [state]);
  const chart = useMemo(() => resolveCompanyAccounts(state), [state]);
  const settingsFor = useCallback(
    (project) => resolveProjectInvoiceSettings(state, project).effective,
    [state],
  );
  const mode = poStatus?.connected ? 'poweroffice' : 'protop';
  const timesheetLocks = state.timesheetLocks || EMPTY;

  // Samme objekt så lenge ingenting er endret, så sidene ikke bygger grunnlaget på nytt
  // ved hvert tastetrykk i søket eller hver avkrysning.
  return useMemo(() => ({
    ready,
    refreshing,
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
    timesheetLocks,
    reload,
    setInvoices,
  }), [
    ready, refreshing, error, state, projects, shownEntries, shownExpenses, shownTrips, shownSales,
    invoices, customers, contracts, dueById, poStatus, mode, companyDefaults, chart, settingsFor,
    timesheetLocks, reload,
  ]);
}
