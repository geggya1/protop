import { ACTIVE_LANG_IDS, LANG_IDS } from './langs.js';

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value;
    else {
      cur[p] = cur[p] || {};
      cur = cur[p];
    }
  });
}

function isLeaf(v) {
  return v && typeof v === 'object' && LANG_IDS.some((id) => id in v);
}

/** Bygger én ordbok per språk fra tabellen ({ nb, en, … } i hvert blad). Mangler → en → nb → nøkkel. */
export function buildDicts(table, langIds = LANG_IDS) {
  const out = Object.fromEntries(langIds.map((id) => [id, {}]));
  const walk = (node, prefix) => {
    Object.entries(node).forEach(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (isLeaf(v)) {
        langIds.forEach((id) => setPath(out[id], key, v[id] || v.en || v.nb || key));
      } else if (v && typeof v === 'object') walk(v, key);
    });
  };
  walk(table, '');
  return out;
}

/** Bare språkene skallet kan vises på (nb og en). */
export function buildActiveDicts(table) {
  return buildDicts(table, ACTIVE_LANG_IDS);
}
