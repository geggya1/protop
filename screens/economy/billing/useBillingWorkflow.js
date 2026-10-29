/**
 * Til fakturering: avkryssing, «Godkjenn utvalg» og «Lag fakturautkast av utvalg».
 * Brukes av Økonomi → Til fakturering og prosjektets fane «Til fakturering».
 *
 * Prosjektene krysses av for masseoperasjoner. Linjene inne i et prosjekt er valgt fra
 * start (fastpris er ikke valgt), og bestemmer hva som kommer med på utkastet.
 * «Godkjenn utvalg» åpner en kontroll av det som ikke er godkjent (review), prosjekt
 * for prosjekt, før noe lagres.
 */
import { useCallback, useMemo, useState } from 'react';
import { buildInvoiceDraft } from '../../../src/economy/invoiceDraft.js';
import { approvedOnly, selectableKeys, selectionAmount, selectionFor } from '../../../src/economy/billingReady.js';
import { approvalReview } from '../../../src/economy/billingApproval.js';
import { approveWork, releaseWork, reserveWork } from '../../../src/economy/billingWork.js';
import * as invoiceStorage from '../../../src/economy/invoiceStorage.js';

export default function useBillingWorkflow({
  familyId,
  projects = [],
  data,
  supplier = {},
  actor = null,
  periodEnd = '',
  storage = null,
  onCreated,
  onError,
}) {
  const store = storage || invoiceStorage;
  const [checked, setChecked] = useState(() => new Set());
  const [excluded, setExcluded] = useState(() => new Set());
  const [fixedOn, setFixedOn] = useState(() => new Set());
  const [fixedAmounts, setFixedAmounts] = useState({});
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [pending, setPending] = useState(null);
  const [review, setReview] = useState(null);

  const selectedFor = useCallback((project) => {
    const keys = selectableKeys(project).filter((key) => !excluded.has(key));
    if (project.fixed && fixedOn.has(project.projectId)) keys.push(project.fixed.key);
    return new Set(keys);
  }, [excluded, fixedOn]);

  const toggleKey = useCallback((project, key) => {
    if (project.fixed && key === project.fixed.key) {
      setFixedOn((current) => {
        const next = new Set(current);
        if (next.has(project.projectId)) next.delete(project.projectId);
        else next.add(project.projectId);
        return next;
      });
      return;
    }
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleChecked = useCallback((projectId) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const setAllChecked = useCallback((on, list = projects) => {
    setChecked(on ? new Set(list.map((row) => row.projectId)) : new Set());
  }, [projects]);

  const setFixedAmount = useCallback((projectId, value) => {
    setFixedAmounts((current) => ({ ...current, [projectId]: value }));
    setFixedOn((current) => (current.has(projectId) ? current : new Set([...current, projectId])));
  }, []);

  const amountFor = useCallback((project) => selectionAmount(
    project,
    selectedFor(project),
    fixedAmounts[project.projectId] == null ? null : Number(fixedAmounts[project.projectId]) || 0,
  ), [selectedFor, fixedAmounts]);

  const totals = useMemo(() => {
    let open = 0;
    let picked = 0;
    for (const project of projects) {
      open += project.totals.total + (project.fixed && fixedOn.has(project.projectId) ? (Number(fixedAmounts[project.projectId] ?? project.fixed.amount) || 0) : 0);
      if (checked.has(project.projectId)) picked += amountFor(project);
    }
    return { open: Math.round(open * 100) / 100, picked: Math.round(picked * 100) / 100 };
  }, [projects, checked, amountFor, fixedOn, fixedAmounts]);

  function selectionOf(project) {
    const raw = fixedAmounts[project.projectId];
    return selectionFor(project, selectedFor(project), { fixedAmount: raw == null || raw === '' ? null : Number(raw) || 0 });
  }

  /**
   * «Godkjenn utvalg»: åpner kontrollen av det som ikke er godkjent i utvalget.
   * Gir antall prosjekter med noe å godkjenne (0 når alt allerede er godkjent).
   */
  function requestApprove(list) {
    const items = approvalReview(list, selectedFor);
    setReview(items.length ? items : null);
    return items.length;
  }

  /** Lagrer det som er krysset av i kontrollen (approvalSelection). Feil kastes videre. */
  async function approveSelections(selections) {
    if (busy) return 0;
    setBusy('approve');
    let count = 0;
    try {
      for (const selection of selections) {
        const result = await approveWork(familyId, selection);
        count += result.approved || 0;
      }
      return count;
    } finally {
      setBusy('');
      data?.reload?.();
    }
  }

  async function create(list, { approveFirst = false } = {}) {
    setPending(null);
    setBusy('draft');
    const created = [];
    const failed = [];
    setProgress({ done: 0, total: list.length });
    try {
      for (const project of list) {
        let selection = selectionOf(project);
        if (selection.unapprovedCount) {
          if (approveFirst) await approveWork(familyId, selection);
          else selection = approvedOnly(selection);
        }
        if (selection.empty) {
          failed.push({ project, error: 'Ingen godkjente poster i utvalget.' });
          continue;
        }
        const built = buildInvoiceDraft(selection, {
          settings: project.settings,
          chart: data?.chart || [],
          supplier,
          actor,
          periodEnd,
          mode: data?.mode || 'protop',
        });
        if (!built.ok) {
          failed.push({ project, error: built.error });
          continue;
        }
        const saved = await store.saveInvoice(familyId, built.invoice);
        try {
          await reserveWork(familyId, selection, saved.id);
          created.push(saved);
        } catch (cause) {
          // Rydd opp: frigjør det som ble reservert, og fjern utkastet.
          await releaseWork(familyId, saved, { mode: 'release' }).catch(() => {});
          await store.removeInvoice?.(familyId, saved.id).catch?.(() => {});
          failed.push({ project, error: String(cause?.message || cause) });
        }
        setProgress((current) => ({ ...(current || {}), done: (current?.done || 0) + 1 }));
      }
    } catch (cause) {
      failed.push({ project: null, error: String(cause?.message || cause) });
    } finally {
      setBusy('');
      setProgress(null);
      setChecked(new Set());
      data?.reload?.();
    }
    onCreated?.(created, failed);
    return { created, failed };
  }

  /** Spør først når utvalget har poster som ikke er godkjent. */
  function requestCreate(list) {
    const blocked = list.filter((project) => project.blocked);
    const usable = list.filter((project) => !project.blocked && !selectionOf(project).empty);
    if (!usable.length) {
      onError?.(blocked.length
        ? blocked.map((project) => `#${project.number} ${project.name}: ${project.blockReasons.join(', ')}`).join('\n')
        : 'Velg minst én post som kan faktureres.');
      return;
    }
    if (blocked.length) {
      onError?.(`Hoppet over fordi noe mangler: ${blocked.map((project) => `#${project.number} ${project.name} (${project.blockReasons.join(', ')})`).join('; ')}.`);
    }
    const unapproved = usable.reduce((sum, project) => sum + selectionOf(project).unapprovedCount, 0);
    if (unapproved) {
      setPending({ list: usable, unapproved });
      return;
    }
    create(usable);
  }

  return {
    checked,
    toggleChecked,
    setAllChecked,
    selectedFor,
    toggleKey,
    fixedAmounts,
    setFixedAmount,
    amountFor,
    totals,
    busy,
    progress,
    pending,
    cancelPending: () => setPending(null),
    confirmPending: (approveFirst) => pending && create(pending.list, { approveFirst }),
    requestCreate,
    review,
    requestApprove,
    closeReview: () => setReview(null),
    approveSelections,
  };
}
