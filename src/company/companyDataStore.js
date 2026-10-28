/**
 * Felles lesing for ett selskap (fase 1 i datasynk-planen). Én lytter per kilde
 * (ansatte, kunderegisteret, prosjektdokumentet, inntjeningsoppsettet), delt av alle
 * skjermer i skallet. Lytteren startes først når en skjerm ber om dataene, og stoppes
 * en stund etter at den siste har sluppet dem, så korte bytter mellom sider ikke gir
 * nye lesinger.
 *
 * Kildene sendes inn (companyDataSources.js i appen, falske i testene), så modulen
 * har ingen Firebase-avhengighet. Lagring går som før via storage-modulene.
 */
import { resolveAbsenceTypes } from '../arbeid/absenceCatalog.js';
import { resolveCompanyAccounts, resolveStandardAccounts } from '../economy/companyChart.js';
import { resolveCompanyInvoiceDefaults } from '../economy/companyInvoiceDefaults.js';
import { resolveHourlyRate } from '../economy/hourlyRate.js';
import {
  buildCompanyDirectory,
  indexCustomers,
  indexProjects,
  personName,
  resolveCustomer,
  resolvePerson,
  resolveProject,
} from './companyData.js';

/** Hvor lenge en lytter får stå etter at siste skjerm slapp den. */
export const RELEASE_GRACE_MS = 30000;

/** Skivene en skjerm kan be om, og hvilke kilder de trenger. */
const SLICE_SOURCES = {
  employees: ['employees'],
  directory: ['employees'],
  customers: ['customers'],
  projects: ['projects'],
  settings: ['projects', 'earnings'],
};

export const SLICES = Object.keys(SLICE_SOURCES);

function emptyRaw() {
  return {
    employees: { rows: [], ready: false, source: '', error: null },
    customers: { rows: [], ready: false, source: '', error: null },
    projects: { state: null, ready: false, source: '', error: null },
    earnings: { value: null, ready: false, source: '', error: null },
  };
}

function employeesSlice(raw) {
  const rows = raw.employees.rows;
  return {
    employees: rows,
    byId: new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])),
    ready: raw.employees.ready,
    source: raw.employees.source,
    error: raw.employees.error,
  };
}

function directorySlice(raw, members, me) {
  const index = buildCompanyDirectory({ employees: raw.employees.rows, members, me });
  return {
    ...index,
    ready: raw.employees.ready,
    resolvePerson: (id) => resolvePerson(id, index),
    nameOf: (id, fallback = '') => personName(id, index, fallback),
  };
}

function customersSlice(raw) {
  const index = indexCustomers(raw.customers.rows);
  return {
    ...index,
    customers: index.list,
    ready: raw.customers.ready,
    source: raw.customers.source,
    error: raw.customers.error,
    resolveCustomer: (ref) => resolveCustomer(ref, index),
  };
}

function projectsSlice(raw) {
  const state = raw.projects.state;
  const index = indexProjects(state?.projects || []);
  return {
    ...index,
    projects: index.list,
    ready: raw.projects.ready,
    source: raw.projects.source,
    error: raw.projects.error,
    resolveProject: (ref) => resolveProject(ref, index),
  };
}

/** Selskapsinnstillinger som i dag ligger i prosjektdokumentet, og satsene fra Inntjening. */
export function deriveCompanySettings(projectState, earnings) {
  const state = projectState || {};
  return {
    accounts: resolveCompanyAccounts(state),
    standardAccounts: resolveStandardAccounts(state),
    absenceTypes: resolveAbsenceTypes(state),
    redDays: Array.isArray(state.redDays) ? state.redDays : [],
    fullDayHours: Number(state.fullDayHours) || 8,
    mileagePolicies: Array.isArray(state.mileagePolicies) ? state.mileagePolicies : [],
    invoiceDefaults: resolveCompanyInvoiceDefaults(state),
    earnings: earnings || null,
    defaultHourlyRate: Number(earnings?.variables?.defaultBillableRate) || 0,
  };
}

function settingsSlice(raw) {
  const settings = deriveCompanySettings(raw.projects.state, raw.earnings.value);
  return {
    ...settings,
    ready: raw.projects.ready && raw.earnings.ready,
    /** Timepris i én rekkefølge: avtalen, prosjektet, den ansatte, selskapets standard. */
    resolveHourlyRate: (args = {}) => resolveHourlyRate({ earnings: settings.earnings, ...args }),
  };
}

export function createCompanyDataStore(companyId, sources = {}, { graceMs = RELEASE_GRACE_MS } = {}) {
  const id = String(companyId || '').trim();
  let raw = emptyRaw();
  let members = [];
  let me = null;
  const slices = new Map();
  const listeners = new Map();
  const running = new Map();
  const holds = new Map();
  const timers = new Map();
  let disposed = false;

  function build(key) {
    if (key === 'employees') return employeesSlice(raw);
    if (key === 'directory') return directorySlice(raw, members, me);
    if (key === 'customers') return customersSlice(raw);
    if (key === 'projects') return projectsSlice(raw);
    return settingsSlice(raw);
  }

  function get(key) {
    if (!slices.has(key)) slices.set(key, build(key));
    return slices.get(key);
  }

  function touched(keys) {
    for (const key of keys) {
      slices.delete(key);
      const set = listeners.get(key);
      if (!set?.size) continue;
      const value = get(key);
      for (const fn of [...set]) fn(value);
    }
  }

  function slicesFor(source) {
    return SLICES.filter((key) => SLICE_SOURCES[key].includes(source));
  }

  function emit(source, patch) {
    if (disposed) return;
    raw = { ...raw, [source]: { ...raw[source], ...patch } };
    touched(slicesFor(source));
  }

  function start(source) {
    if (running.has(source) || disposed || !id) return;
    const run = sources[source];
    if (typeof run !== 'function') {
      emit(source, { ready: true, source: 'none' });
      running.set(source, () => {});
      return;
    }
    const onData = (value, meta = {}) => {
      if (!running.has(source)) return;
      const from = meta?.source || 'remote';
      if (source === 'employees' || source === 'customers') {
        emit(source, { rows: Array.isArray(value) ? value : [], ready: true, source: from, error: null });
      } else if (source === 'projects') {
        emit(source, { state: value || null, ready: true, source: from, error: null });
      } else {
        emit(source, { value: value || null, ready: true, source: from, error: null });
      }
    };
    const onError = (error) => {
      if (!running.has(source)) return;
      emit(source, { ready: true, error: error || new Error('read-failed') });
    };
    running.set(source, () => {});
    let stop = null;
    try {
      stop = run(id, onData, onError);
    } catch (error) {
      onError(error);
    }
    running.set(source, typeof stop === 'function' ? stop : () => {});
  }

  function stopSource(source) {
    const stop = running.get(source);
    running.delete(source);
    try { stop?.(); } catch { /* ignore */ }
  }

  /** Be om en skive. Gir en funksjon som slipper den igjen. */
  function retain(key) {
    const needed = SLICE_SOURCES[key] || [];
    for (const source of needed) {
      clearTimeout(timers.get(source));
      timers.delete(source);
      holds.set(source, (holds.get(source) || 0) + 1);
      start(source);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const source of needed) {
        const left = (holds.get(source) || 1) - 1;
        holds.set(source, left);
        if (left > 0 || disposed) continue;
        clearTimeout(timers.get(source));
        const timer = setTimeout(() => {
          timers.delete(source);
          if ((holds.get(source) || 0) === 0) stopSource(source);
        }, graceMs);
        timer?.unref?.();
        timers.set(source, timer);
      }
    };
  }

  function subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  }

  /** Medlemmene (families/{id}/parents) og innlogget bruker, fra AppContext. */
  function setMembers(nextMembers, nextMe = null) {
    const list = Array.isArray(nextMembers) ? nextMembers : [];
    if (list === members && nextMe === me) return;
    members = list;
    me = nextMe || null;
    touched(['directory']);
  }

  function dispose() {
    disposed = true;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const source of [...running.keys()]) stopSource(source);
    listeners.clear();
  }

  return {
    companyId: id,
    get,
    retain,
    subscribe,
    setMembers,
    dispose,
    /** Til tester: kildene som lytter nå. */
    activeSources: () => [...running.keys()],
  };
}
