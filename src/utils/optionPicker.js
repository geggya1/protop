/**
 * Felles velger (components/OptionPicker.jsx): grenser og ren logikk.
 * 1–4 valg vises som knapper side om side. 5 eller flere blir en liste (nedtrekk / bunnark).
 */
export const CHIP_LIMIT = 4;
export const SEARCH_FROM = 8;

export function normalizeOptions(options) {
  return (options || []).map((o) => (typeof o === 'string'
    ? { id: o, label: o }
    : { ...o, id: o.id ?? o.value, label: o.label ?? String(o.id ?? o.value ?? '') }));
}

/** Teksten i feltet: valgt etikett, «A, B», «A + 3 til» eller plassholderen. */
export function optionSummary(list, value, multiple, placeholder) {
  if (multiple) {
    const picked = list.filter((o) => (value || []).includes(o.id));
    if (!picked.length) return { text: placeholder, empty: true };
    if (picked.length <= 2) return { text: picked.map((o) => o.label).join(', '), empty: false };
    return { text: `${picked[0].label} + ${picked.length - 1} til`, empty: false };
  }
  const hit = list.find((o) => o.id === value);
  return hit ? { text: hit.label, empty: false } : { text: placeholder, empty: true };
}

export function filterOptions(list, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return list;
  return list.filter((o) => `${o.label} ${o.hint || ''} ${o.group || ''} ${(o.keywords || []).join(' ')}`.toLowerCase().includes(s));
}

/** Knapper eller liste? Egendefinert verdi krever alltid listen (med søkefelt). */
export function pickerMode(count, { chipLimit = CHIP_LIMIT, custom = false } = {}) {
  return count > 0 && count <= chipLimit && !custom ? 'chips' : 'list';
}
