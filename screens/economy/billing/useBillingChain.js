/**
 * Tallene i prosesslinjen Timer → Godkjenn → Til fakturering → Faktura.
 * Siden sender inn det den allerede har lastet (timer, låser, ansatte, fakturaer),
 * og hooken henter bare resten. Det som hentes, deles mellom de fire sidene i ett
 * minutt, så linjen ikke laster på nytt ved hvert sidebytte.
 */
import { useEffect, useMemo, useState } from 'react';
import { useOptionalApp } from '../../../src/context/AppContext';
import { billingChainCounts, mergeEntries } from '../../../src/economy/billingChain.js';
import { loadOpenChainEntries } from '../../../src/economy/timeEntryStorage.js';
import { watchInvoices } from '../../../src/economy/invoiceStorage.js';
import { watchEmployees } from '../../../src/employees/storage';
import { filterEmployeesForPicker } from '../../../src/arbeid/roles.js';
import { loadProjectState } from '../../../src/project/storage';
import { staleBillingData } from './useBillingData';

const FRESH_MS = 60 * 1000;
const CACHE = new Map();

function cached(familyId, key) {
  const hit = CACHE.get(`${familyId}:${key}`);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.value : null;
}

function remember(familyId, key, value) {
  CACHE.set(`${familyId}:${key}`, { at: Date.now(), value });
}

export default function useBillingChain({
  entries = null,
  locks = null,
  employees = null,
  invoices = null,
  enabled = true,
  // false: siden har selv alle åpne timer (Til fakturering sine 18 måneder), så låste og
  // godkjente timer hentes ikke en gang til. Tallene venter til sidens timer er lastet.
  fetchEntries = true,
} = {}) {
  const familyId = useOptionalApp()?.familyId || '';
  const needLocks = enabled && !locks;
  const needEmployees = enabled && !employees;
  const needInvoices = enabled && !invoices;
  const [remoteEntries, setRemoteEntries] = useState(() => (familyId ? cached(familyId, 'entries') : null));
  const [remoteLocks, setRemoteLocks] = useState(() => (familyId ? cached(familyId, 'locks') : null));
  const [remoteEmployees, setRemoteEmployees] = useState(null);
  const [remoteInvoices, setRemoteInvoices] = useState(null);

  useEffect(() => {
    if (!enabled || !familyId || !fetchEntries) return undefined;
    const warm = cached(familyId, 'entries');
    if (warm) {
      setRemoteEntries(warm);
      return undefined;
    }
    let live = true;
    loadOpenChainEntries(familyId).then((rows) => {
      remember(familyId, 'entries', rows);
      if (live) setRemoteEntries(rows);
    }).catch(() => {
      if (live) setRemoteEntries(null);
    });
    return () => { live = false; };
  }, [enabled, familyId, fetchEntries]);

  useEffect(() => {
    if (!needLocks || !familyId) return undefined;
    let live = true;
    loadProjectState(familyId, { hours: false }).then((state) => {
      const rows = state?.timesheetLocks || [];
      remember(familyId, 'locks', rows);
      if (live) setRemoteLocks(rows);
    }).catch(() => {});
    return () => { live = false; };
  }, [needLocks, familyId]);

  useEffect(() => {
    if (!needEmployees || !familyId) return undefined;
    return watchEmployees(familyId, (rows) => {
      setRemoteEmployees(filterEmployeesForPicker(rows || [], ''));
    }, () => {});
  }, [needEmployees, familyId]);

  useEffect(() => {
    if (!needInvoices || !familyId) return undefined;
    return watchInvoices(familyId, (rows) => setRemoteInvoices(rows || []), () => {});
  }, [needInvoices, familyId]);

  return useMemo(() => {
    // Sidens egne timer (f.eks. etter en godkjenning) vinner over det som ble hentet.
    const pageEntries = Array.isArray(entries) ? entries : null;
    const fetched = fetchEntries ? remoteEntries : null;
    const mergedEntries = pageEntries
      ? mergeEntries(fetched || [], pageEntries)
      : fetched;
    return billingChainCounts({
      employees: employees || remoteEmployees,
      locks: locks || remoteLocks,
      entries: mergedEntries,
      invoices: invoices || remoteInvoices,
    });
  }, [entries, locks, employees, invoices, fetchEntries, remoteEntries, remoteLocks, remoteEmployees, remoteInvoices]);
}

/** Etter en godkjenning eller et nytt utkast: neste side henter tallene på nytt. */
export function forgetBillingChain(familyId) {
  if (!familyId) return;
  CACHE.delete(`${familyId}:entries`);
  CACHE.delete(`${familyId}:locks`);
  staleBillingData(familyId);
}
