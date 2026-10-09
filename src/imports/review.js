/** Felles språk for kontroll av kunde- og ansattimport. */

export function employeeReviewSeverity(row) {
  if (!row || row.action === 'skip' || !row.employee) return 'block';
  if (row.warnings?.length || row.reason) return 'review';
  if (row.action === 'update' || row.matchKind) return 'existing';
  return 'ok';
}

export function reviewHeadline(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ok = list.filter((row) => row.severity === 'ok').length;
  const existing = list.filter((row) => row.severity === 'existing').length;
  const review = list.filter((row) => row.severity === 'review').length;
  const block = list.filter((row) => row.severity === 'block').length;
  const parts = [];
  if (ok) parts.push(`${ok} klare`);
  if (existing) parts.push(`${existing} finnes fra før`);
  if (review) parts.push(`${review} må kontrolleres`);
  if (block) parts.push(`${block} blir ikke importert`);
  return parts.join(' · ') || 'Ingen rader.';
}

export function reviewSections(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return [
    ['block', 'Krever behandling', list.filter((row) => row.severity === 'block')],
    ['review', 'Må kontrolleres', list.filter((row) => row.severity === 'review')],
    ['existing', 'Finnes fra før', list.filter((row) => row.severity === 'existing')],
    ['ok', 'Klare', list.filter((row) => row.severity === 'ok')],
  ].filter((section) => section[2].length);
}

export function issueTally(rows) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const issue of row.issues || []) {
      counts.set(issue, (counts.get(issue) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'nb'));
}

export function issueNeedsAction(issue) {
  return /blir ikke lagret|ble ikke importert|ikke gyldig|må være|finnes allerede|flere ganger|mangler navn/i.test(String(issue || ''));
}

/**
 * imported: rader som ble lagret. leftOut: rader som ikke ble lagret.
 * Hver rad har name, reason og issues.
 */
export function importResult(imported, leftOut) {
  const saved = Array.isArray(imported) ? imported : [];
  const missed = Array.isArray(leftOut) ? leftOut : [];
  const attention = saved.filter((row) => (row.issues || []).length);
  const total = saved.length + missed.length;
  return {
    complete: !missed.length && !attention.length,
    saved: saved.length,
    total,
    missed,
    attention,
  };
}
