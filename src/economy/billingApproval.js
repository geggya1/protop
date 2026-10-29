/**
 * «Godkjenn utvalg» i Til fakturering: timene og postene i utvalget som ikke er
 * godkjent, ett prosjekt (ett fakturautkast) om gangen. Brukeren kontrollerer
 * linjene, fjerner haken på det som ikke skal godkjennes nå, og lagrer.
 * Ren logikk, så node-testene kan lese den.
 */
import { roundHours } from '../arbeid/hours.js';
import { round2 } from './invoiceLines.js';
import { isApprovedEntry } from './billingReady.js';

const OPERATIONS = [
  { id: 'expenses', label: 'Utlegg' },
  { id: 'trips', label: 'Kjøring' },
  { id: 'sales', label: 'Produktsalg' },
];

function text(value) {
  return String(value || '').trim();
}

/** Timer som ikke er godkjent: levert (låst timeliste) eller bare ført. */
export function entryStatusLabel(status) {
  if (status === 'låst') return 'Levert';
  if (status === 'registrert') return 'Ikke levert';
  return '';
}

function entryAmount(group, hours) {
  if (group.rate == null) return null;
  const base = round2(hours * group.rate);
  const markup = round2(base * ((Number(group.markupPercent) || 0) / 100));
  const discount = round2((base + markup) * ((Number(group.discountPercent) || 0) / 100));
  return round2(base + markup - discount);
}

/**
 * Linjene som skal kontrolleres på ett prosjekt: valgte timer og poster som ikke er
 * godkjent. Samme utvalg som selectionFor() (timer uten timepris og stoppede
 * prosjekter er ikke med).
 */
export function approvalLines(project, selected) {
  if (!project || project.blocked) return [];
  const has = (key) => !!selected?.has?.(key);
  const lines = [];
  for (const group of project.hourGroups || []) {
    if (!has(group.key) || group.rateMissing) continue;
    for (const entry of group.entries || []) {
      if (isApprovedEntry(entry)) continue;
      const hours = roundHours(entry._hours ?? entry.billableHours ?? entry.hours);
      lines.push({
        key: `te:${entry.id}`,
        kind: 'hours',
        date: text(entry.date),
        who: group.employeeName,
        what: [group.activityName, group.timeTypeLabel].filter(Boolean).join(' · '),
        note: text(entry.description),
        status: entryStatusLabel(entry.status),
        hours,
        amount: entryAmount(group, hours),
        row: entry,
      });
    }
  }
  for (const op of OPERATIONS) {
    for (const item of project[op.id] || []) {
      if (!has(item.key) || item.approved) continue;
      lines.push({
        key: item.key,
        kind: op.id,
        kindLabel: op.label,
        date: text(item.date),
        who: text(item.employeeName),
        what: text(item.description) || op.label,
        note: '',
        status: '',
        hours: 0,
        amount: round2(item.amount),
        row: item.row,
      });
    }
  }
  return lines.sort((a, b) => (
    (a.kind === 'hours' ? 0 : 1) - (b.kind === 'hours' ? 0 : 1)
    || a.date.localeCompare(b.date)
    || String(a.who).localeCompare(String(b.who), 'nb')
  ));
}

/**
 * Prosjektene i «Godkjenn utvalg», bare de som har noe å godkjenne.
 * selectedFor(project) gir de valgte nøklene på prosjektet (useBillingWorkflow).
 */
export function approvalReview(projects = [], selectedFor = () => new Set()) {
  return (projects || [])
    .map((project) => ({ project, lines: approvalLines(project, selectedFor(project)) }))
    .filter((row) => row.lines.length);
}

/** Antall, timer og beløp for linjene som er krysset av. */
export function approvalTotals(lines = [], picked = null) {
  const chosen = (lines || []).filter((line) => !picked || picked.has(line.key));
  return {
    count: chosen.length,
    hours: roundHours(chosen.reduce((sum, line) => sum + (line.hours || 0), 0)),
    amount: round2(chosen.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)),
  };
}

/** Utvalget approveWork() lagrer: radene som er krysset av. */
export function approvalSelection(lines = [], picked = null) {
  const chosen = (lines || []).filter((line) => !picked || picked.has(line.key));
  const rows = (kind) => chosen.filter((line) => line.kind === kind).map((line) => line.row);
  return {
    entries: rows('hours'),
    expenses: rows('expenses'),
    trips: rows('trips'),
    sales: rows('sales'),
  };
}

export function postsLabel(count) {
  const n = Number(count) || 0;
  return n === 1 ? '1 post' : `${n} poster`;
}
