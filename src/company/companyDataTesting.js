/**
 * Til render-tester: samme API som src/context/CompanyDataContext.js, men med faste data
 * og uten React-hooks, så testenes egne dispatchere ikke trenger useContext.
 *   if (id.includes('CompanyDataContext')) return companyDataHooks({ employees, customers, projects });
 */
import { liveCustomerList } from './companyData.js';
import { createCompanyDataStore, SLICES } from './companyDataStore.js';

export function companyDataHooks({
  employees = [],
  members = [],
  me = null,
  customers = [],
  projects = [],
  projectState = null,
  earnings = null,
  customersSource = 'remote',
} = {}) {
  const store = createCompanyDataStore('test', {
    employees: (id, onData) => { onData(employees, { source: 'remote' }); return () => {}; },
    customers: (id, onData) => { onData(customers, { source: customersSource }); return () => {}; },
    projects: (id, onData) => { onData(projectState || { projects }, { source: 'remote' }); return () => {}; },
    earnings: (id, onData) => { onData(earnings, { source: 'remote' }); return () => {}; },
  });
  store.setMembers(members, me);
  for (const key of SLICES) store.retain(key);
  const slice = (key) => () => store.get(key);
  const hooks = {
    store,
    CompanyDataProvider: ({ children }) => children,
    useCompanyDataStore: () => store,
    useEmployees: slice('employees'),
    useCompanyDirectory: slice('directory'),
    useCustomers: slice('customers'),
    useProjects: slice('projects'),
    useCompanySettings: slice('settings'),
    useCompanyRefs: () => ({
      directory: store.get('directory'),
      customers: store.get('customers'),
      projects: store.get('projects'),
    }),
    liveCustomerList,
  };
  return hooks;
}
