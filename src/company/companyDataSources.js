/**
 * Kildene til CompanyDataProvider: én sanntidslytter per dokument eller samling.
 * Hver kilde er (companyId, onData, onError) => stopp.
 * Storage-modulene lastes først når kilden startes, så skjermer som bare trenger
 * ansatte ikke drar inn prosjekt- og anbudslagringen.
 */
function lazy(load, name) {
  return (companyId, onData, onError) => {
    let stop = null;
    let dead = false;
    load().then((mod) => {
      if (dead) return;
      stop = mod[name](companyId, onData, onError);
    }).catch((error) => {
      if (!dead) onError?.(error);
    });
    return () => {
      dead = true;
      stop?.();
    };
  };
}

export const companyDataSources = {
  employees: lazy(() => import('../employees/storage'), 'watchEmployees'),
  customers: lazy(() => import('../anbud/storage'), 'watchCustomerList'),
  projects: lazy(() => import('../project/storage'), 'watchProjectState'),
  earnings: lazy(() => import('../economy/earningsStorage'), 'watchEarningsSettings'),
};
