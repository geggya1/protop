/**
 * Utlegg: prosjektvelgeren med den ansattes aktive prosjekter først.
 */
import { projectPhaseOf } from '../project/statusFilter.js';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function projectLabel(row) {
  return [row.number ? `#${row.number}` : '', row.name].filter(Boolean).join(' ') || 'Uten navn';
}

/**
 * Prosjektene i velgeren. Uten søk står den ansattes aktive prosjekter øverst (deltaker,
 * prosjektleder eller timer ført), så andre aktive, så avsluttede. Søket treffer alle.
 * Arkiverte vises ikke, med mindre utlegget allerede står på et (keepId).
 */
export function expenseProjectOptions(projects = [], { mineIds = new Set(), keepId = '' } = {}) {
  const mine = mineIds instanceof Set ? mineIds : new Set(mineIds || []);
  const rows = (projects || [])
    .filter((row) => row?.id && (row.status !== 'arkivert' || row.id === keepId))
    .map((row) => {
      const closed = row.status === 'arkivert' || row.status === 'avsluttet' || projectPhaseOf(row) === 'avsluttet';
      const rank = closed ? 2 : (mine.has(row.id) ? 0 : 1);
      return {
        rank,
        option: {
          id: row.id,
          label: projectLabel(row),
          hint: text(row.client || row.customerName),
          group: ['Dine aktive prosjekter', 'Andre aktive prosjekter', 'Avsluttede prosjekter'][rank],
          keywords: [text(row.number), text(row.client || row.customerName)].filter(Boolean),
        },
      };
    });
  rows.sort((a, b) => a.rank - b.rank || a.option.label.localeCompare(b.option.label, 'nb', { numeric: true }));
  return rows.map((row) => row.option);
}
