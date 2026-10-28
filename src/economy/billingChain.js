/**
 * Kjeden fra timer til faktura: Timer → Godkjenn → Til fakturering → Faktura.
 * Samme rekkefølge og samme tall på alle fire sidene, så brukeren ser hvor
 * arbeidet står og hvor det skal videre. Ren logikk, så node-testene kan lese den.
 */

export const BILLING_CHAIN = [
  { id: 'timer', label: 'Timer', tab: 'arbeid', subView: 'timeliste' },
  { id: 'godkjenn', label: 'Godkjenn', tab: 'arbeid', subView: 'godkjenning' },
  { id: 'fakturering', label: 'Til fakturering', tab: 'okonomi', subView: 'fakturagrunnlag' },
  { id: 'faktura', label: 'Faktura', tab: 'okonomi', subView: 'faktura' },
];

function text(value) {
  return String(value || '').trim();
}

/** Steget en side hører til, eller tom streng når siden ikke er en del av kjeden. */
export function billingChainStepFor(tab, subView = null) {
  const sub = text(subView) || (tab === 'arbeid' ? 'timeliste' : '');
  const step = BILLING_CHAIN.find((row) => row.tab === tab && row.subView === sub);
  return step?.id || '';
}

/** Godkjent, fakturerbar og ikke lagt på en faktura (heller ikke et utkast). */
export function isReadyEntry(row) {
  if (!row || row.status !== 'godkjent' || text(row.invoiceId)) return false;
  const billable = row.billableHours == null ? Number(row.hours) : Number(row.billableHours);
  return Number.isFinite(billable) && billable > 0;
}

/** Prosjekter med godkjente timer som ikke er fakturert. */
export function readyProjectIds(entries = []) {
  const ids = new Set();
  for (const row of entries || []) {
    if (isReadyEntry(row) && text(row.projectId)) ids.add(text(row.projectId));
  }
  return ids;
}

/**
 * Slår sammen timer fra skyen og timer siden har i minnet. Sidens rader vinner,
 * så en godkjenning vises med en gang, før lagringen har nådd skyen.
 */
export function mergeEntries(remote = [], local = []) {
  const byId = new Map();
  for (const row of remote || []) if (row?.id) byId.set(row.id, row);
  for (const row of local || []) if (row?.id) byId.set(row.id, row);
  return [...byId.values()];
}

/** Siste lås per ansatt (samme regel som Godkjenninger). */
function latestLocks(locks = []) {
  const byEmployee = new Map();
  for (const row of locks || []) {
    const id = text(row?.employeeId);
    if (!id || !text(row.throughDate)) continue;
    const prev = byEmployee.get(id);
    if (!prev || text(row.throughDate) > text(prev.throughDate)) byEmployee.set(id, row);
  }
  return byEmployee;
}

/**
 * Antall per steg.
 *   timer        aktive ansatte uten låst timeliste
 *   godkjenn     låste timelister som venter på kontroll
 *   fakturering  prosjekter med godkjente timer som ikke er fakturert
 *   faktura      fakturautkast som ikke er ferdigstilt
 * Et tall som ikke er kjent ennå, er null (vises uten tall).
 */
export function billingChainCounts({
  employees = null,
  locks = null,
  entries = null,
  invoices = null,
} = {}) {
  const byEmployee = locks ? latestLocks(locks) : null;
  let timer = null;
  if (employees && byEmployee) {
    timer = employees.filter((row) => row?.id && !byEmployee.has(row.id)).length;
  }
  let godkjenn = null;
  if (byEmployee) {
    const lockedHours = entries ? new Set(
      entries.filter((row) => row?.status === 'låst').map((row) => text(row.employeeId)),
    ) : null;
    godkjenn = [...byEmployee.values()].filter((row) => {
      if (text(row.approvedAt)) return false;
      // Lås uten førte timer har ingenting å kontrollere (som på Godkjenninger).
      return lockedHours ? lockedHours.has(text(row.employeeId)) : true;
    }).length;
  }
  const fakturering = entries ? readyProjectIds(entries).size : null;
  const faktura = invoices
    ? invoices.filter((row) => row && row.status === 'draft' && !row.deleted).length
    : null;
  return { timer, godkjenn, fakturering, faktura };
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/** Kort tekst under steget. */
export function billingChainDetail(id, count) {
  if (count == null) return '';
  if (id === 'timer') return count ? `${count} ikke låst` : 'Alle har låst';
  if (id === 'godkjenn') return count ? `${count} venter` : 'Ingen venter';
  if (id === 'fakturering') return count ? `${count} ${plural(count, 'prosjekt klart', 'prosjekter klare')}` : 'Ingen klare';
  if (id === 'faktura') return count ? `${count} utkast` : 'Ingen utkast';
  return '';
}

/** Stegene slik prosesslinjen tegner dem. */
export function billingChainSteps(counts = {}, current = '') {
  return BILLING_CHAIN.map((row, index) => {
    const count = counts?.[row.id] ?? null;
    return {
      ...row,
      number: index + 1,
      count,
      detail: billingChainDetail(row.id, count),
      current: row.id === current,
      // Noe venter på dette steget (vises tydeligere når det ikke er siden man står på).
      attention: row.id !== current && Number(count) > 0,
    };
  });
}

/** Knappen etter godkjenning: «Gå til fakturering (2 klare)». */
export function billingReadyLabel(count) {
  const n = Number(count) || 0;
  return n > 0 ? `Gå til fakturering (${n} klare)` : 'Gå til fakturering';
}

/** Lenken tilbake fra Til fakturering: «Til godkjenninger (1 venter)». */
export function approvalsBackLabel(count) {
  const n = Number(count) || 0;
  return n > 0 ? `Til godkjenninger (${n} venter)` : 'Til godkjenninger';
}
