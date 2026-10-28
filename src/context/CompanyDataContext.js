/**
 * CompanyDataProvider: felles lesing i bedriftsskallet, ved siden av AppContext.
 * Legg inn ting på ett sted, så oppdaterer alle åpne skjermer seg: ansatte, personer,
 * kunder, prosjekter og selskapsinnstillinger kommer fra én sanntidslytter per kilde
 * (src/company/companyDataStore.js), ikke fra en egen lesing på hver skjerm.
 *
 * Hookene virker også utenfor skallet, eller for et annet selskap enn det aktive:
 * da lytter de selv, som før. Lagring går fortsatt via storage-modulene
 * (saveProjectState / useProjectStateEditor, saveCustomers, saveEmployee).
 *
 * Uten JSX og uten AppContext-import, så modulen kan lastes i rene Node-tester.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createCompanyDataStore, SLICES } from '../company/companyDataStore.js';
import { companyDataSources } from '../company/companyDataSources.js';

const CompanyDataContext = createContext(null);

const EMPTY = (() => {
  const store = createCompanyDataStore('', {});
  const out = {};
  for (const key of SLICES) out[key] = { ...store.get(key), ready: true };
  return out;
})();

/**
 * Monteres der bedriftsskallet monteres (components/AppShell.jsx).
 * companyId: aktivt selskap (tom når gruppen ikke er et selskap).
 * members: families/{id}/parents fra AppContext. me: innlogget bruker (users/{uid}).
 */
export function CompanyDataProvider({ companyId = '', members = null, me = null, sources = null, children }) {
  const id = String(companyId || '').trim();
  const store = useMemo(
    () => (id ? createCompanyDataStore(id, sources || companyDataSources) : null),
    [id, sources],
  );
  useEffect(() => () => store?.dispose(), [store]);
  useEffect(() => {
    store?.setMembers(members || [], me);
  }, [store, members, me]);
  return React.createElement(CompanyDataContext.Provider, { value: store }, children);
}

/** Lageret for selskapet: skallets når det er samme selskap, ellers et eget for skjermen. */
function useStore(companyId) {
  const shared = useContext(CompanyDataContext);
  const wanted = String(companyId || '').trim() || shared?.companyId || '';
  const useShared = !!shared && shared.companyId === wanted;
  const own = useMemo(
    () => (!useShared && wanted ? createCompanyDataStore(wanted, companyDataSources, { graceMs: 0 }) : null),
    [useShared, wanted],
  );
  useEffect(() => () => own?.dispose(), [own]);
  return useShared ? shared : own;
}

function useSlice(key, companyId, enabled = true) {
  const store = useStore(enabled ? companyId : '');
  const active = enabled ? store : null;
  const [box, setBox] = useState(() => ({ store: active, value: active ? active.get(key) : null }));
  useEffect(() => {
    if (!active) return undefined;
    setBox({ store: active, value: active.get(key) });
    const off = active.subscribe(key, (value) => setBox({ store: active, value }));
    const release = active.retain(key);
    return () => {
      off();
      release();
    };
  }, [active, key]);
  if (!active) return EMPTY[key];
  return box.store === active ? box.value : active.get(key);
}

/** Skallets lager (eller null utenfor bedriftsskallet). */
export function useCompanyDataStore() {
  return useContext(CompanyDataContext);
}

/**
 * Ansatte i selskapet: { employees, byId, ready, source }. Én lytter for hele skallet.
 * enabled: false når skjermen ikke trenger listen (ingen lytter startes).
 */
export function useEmployees(companyId = '', { enabled = true } = {}) {
  return useSlice('employees', companyId, enabled);
}

/**
 * Én rad per person (ansettelse og medlemskap slått sammen): { rows, byEmployeeId, byUid,
 * resolvePerson(id), nameOf(id, reserve), ready }. resolvePerson tåler både uid og ansatt-id.
 */
export function useCompanyDirectory(companyId = '', { enabled = true } = {}) {
  return useSlice('directory', companyId, enabled);
}

/** Kunderegisteret i sanntid: { customers, byId, byNumber, byOrgnr, resolveCustomer(ref), ready, source }. */
export function useCustomers(companyId = '', { enabled = true } = {}) {
  return useSlice('customers', companyId, enabled);
}

/**
 * Prosjektene i sanntid, bare til lesing: { projects, byId, byNumber, resolveProject(ref), ready }.
 * Lagring går fortsatt via useProjectStateEditor / saveProjectState.
 */
export function useProjects(companyId = '', { enabled = true } = {}) {
  return useSlice('projects', companyId, enabled);
}

/**
 * Kontoplan, standardkontoer, fraværstyper, røde dager, normaldag, kjøresatser,
 * fakturastandarder og timepriser, med resolveHourlyRate({ project, contracts, date, employee }).
 */
export function useCompanySettings(companyId = '', { enabled = true } = {}) {
  return useSlice('settings', companyId, enabled);
}

/**
 * Oppslagene hydrateRefs trenger: { directory, customers, projects }.
 * want: { people, customers, projects } slår av kilder skjermen ikke trenger.
 */
export function useCompanyRefs(companyId = '', { people = true, customers = true, projects = true } = {}) {
  const directory = useSlice('directory', companyId, people);
  const customerSlice = useSlice('customers', companyId, customers);
  const projectSlice = useSlice('projects', companyId, projects);
  return useMemo(() => ({
    directory: people ? directory : null,
    customers: customers ? customerSlice : null,
    projects: projects ? projectSlice : null,
  }), [people, customers, projects, directory, customerSlice, projectSlice]);
}

export { liveCustomerList } from '../company/companyData.js';
