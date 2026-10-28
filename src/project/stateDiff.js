/**
 * Endringer på prosjektdokumentet (projects/state) som legges på ferske data i skyen.
 *
 * Før skrev hver lagring hele listene tilbake. En eldre kopi på en annen skjerm eller
 * enhet slettet da prosjekter andre hadde lagt til, og hentet tilbake rader andre hadde
 * slettet. Nå regnes bare det brukeren faktisk har endret ut (mot versjonen skjermen
 * lastet), og det legges på dokumentet slik det ligger i skyen når lagringen skjer.
 */
import { TOMBSTONE_KEYS, mergeDeletedRows } from './engine.js';

/** Felt som ikke hører til monolitten (egne samlinger) eller bare er lokale. */
const SKIP_KEYS = new Set(['timeEntries', 'absences', 'syncedAt', 'baseRev']);
const TOMBSTONE_KEY_SET = new Set(TOMBSTONE_KEYS);

function text(value) {
  return String(value || '').trim();
}

function json(value) {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch {
    return '';
  }
}

/** Kort signatur av en rad (FNV-1a), så vi ser om noen andre har endret den siden vi lastet. */
export function rowSignature(row) {
  const raw = json(row);
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${raw.length}:${hash.toString(36)}`;
}

function stampMs(row) {
  return Date.parse(row?.updatedAt || row?.addedAt || row?.createdAt || '') || 0;
}

/** Liste der hver rad er et objekt med unik id. Andre lister skrives som ett felt. */
function isRowList(value) {
  if (!Array.isArray(value)) return false;
  const ids = new Set();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const id = text(row.id);
    if (!id || ids.has(id)) return false;
    ids.add(id);
  }
  return true;
}

export function emptyProjectDiff() {
  return { lists: {}, fields: {}, deletedRows: [], strict: false };
}

/**
 * Hva som er endret fra base til next.
 * base = null betyr at vi ikke vet hva skjermen lastet. Da er ingenting slettet,
 * og en rad legges bare på når den er ny eller nyere enn den i skyen (strict).
 */
export function diffProjectStates(base, next, { at = new Date().toISOString() } = {}) {
  const diff = emptyProjectDiff();
  const after = next && typeof next === 'object' ? next : {};
  if (!base || typeof base !== 'object') {
    diff.strict = true;
    for (const [key, value] of Object.entries(after)) {
      if (SKIP_KEYS.has(key) || key === 'deletedRows' || value === undefined) continue;
      if (isRowList(value)) {
        if (value.length) diff.lists[key] = { upsert: value, remove: [], baseSigs: {} };
      } else {
        diff.fields[key] = value;
      }
    }
    diff.deletedRows = mergeDeletedRows(after.deletedRows);
    return diff;
  }
  const keys = new Set([...Object.keys(base), ...Object.keys(after)]);
  // Rader under et slettet prosjekt holdes ute av prosjektets egen markering (deletedProjects).
  const goneProjects = new Set((after.deletedProjects || []).map((row) => text(row?.id)).filter(Boolean));
  for (const key of keys) {
    if (SKIP_KEYS.has(key) || key === 'deletedRows') continue;
    const before = base[key];
    const value = after[key];
    // Et felt som mangler i den nye kopien, er ikke slettet av brukeren.
    if (value === undefined) continue;
    const beforeRows = before === undefined ? [] : before;
    if (isRowList(beforeRows) && isRowList(value)) {
      const prevById = new Map(beforeRows.map((row) => [text(row.id), row]));
      const nextIds = new Set();
      const upsert = [];
      const baseSigs = {};
      for (const row of value) {
        const id = text(row.id);
        nextIds.add(id);
        const prev = prevById.get(id);
        if (prev && json(prev) === json(row)) continue;
        upsert.push(row);
        if (prev) baseSigs[id] = rowSignature(prev);
      }
      const remove = [...prevById.keys()].filter((id) => !nextIds.has(id));
      if (upsert.length || remove.length) diff.lists[key] = { upsert, remove, baseSigs };
      if (remove.length && TOMBSTONE_KEY_SET.has(key)) {
        const marked = remove.filter((id) => !goneProjects.has(text(prevById.get(id)?.projectId)));
        diff.deletedRows.push(...marked.map((id) => ({ key, id, deletedAt: at })));
      }
      continue;
    }
    if (json(before) !== json(value)) diff.fields[key] = value;
  }
  // Nye slettemarkeringer (f.eks. fra deleteExpense) følger med.
  const known = new Set((base.deletedRows || []).map((row) => `${row?.key}|${row?.id}`));
  for (const row of after.deletedRows || []) {
    if (!known.has(`${row?.key}|${row?.id}`)) diff.deletedRows.push(row);
  }
  diff.deletedRows = mergeDeletedRows(diff.deletedRows);
  return diff;
}

/**
 * Den lokale kopien fra en eldre versjon av appen (før køen) kan ha endringer som aldri nådde
 * skyen (uten nett, eller dokumentet var for stort). Den gamle versjonen slo kopien inn i skyen
 * ved neste lasting. Nå legges bare det som trygt kan være ulagret, i køen én gang:
 *  - en rad som finnes i skyen, når den lokale er nyere (updatedAt),
 *  - en ny rad, når den er laget eller endret etter at skyen sist ble lagret (da kan ingen andre ha
 *    sett og slettet den), og ikke er merket slettet,
 *  - andre felt, når den lokale kopien er lagret etter skyen.
 * Ingenting slettes. Gir endringen mot skyens kopi, eller null.
 */
export function legacyLocalChanges(local, remote) {
  const mine = local && typeof local === 'object' ? local : {};
  const cloud = remote && typeof remote === 'object' ? remote : {};
  const cloudAt = Date.parse(cloud.syncedAt || '') || 0;
  const localAt = Date.parse(mine.syncedAt || '') || 0;
  const gone = new Set((cloud.deletedRows || []).map((row) => `${row?.key}|${text(row?.id)}`));
  const goneProjects = new Set((cloud.deletedProjects || []).map((row) => text(row?.id)).filter(Boolean));
  const next = { ...cloud };
  let touched = false;
  for (const [key, value] of Object.entries(mine)) {
    if (SKIP_KEYS.has(key) || key === 'deletedRows' || key === 'deletedProjects' || value === undefined) continue;
    const current = cloud[key];
    if (isRowList(value) && (current === undefined || isRowList(current))) {
      const rows = Array.isArray(current) ? [...current] : [];
      const index = new Map(rows.map((row, i) => [text(row.id), i]));
      const added = [];
      for (const row of value) {
        const id = text(row.id);
        if (index.has(id)) {
          const theirs = rows[index.get(id)];
          if (stampMs(row) > stampMs(theirs) && json(row) !== json(theirs)) {
            rows[index.get(id)] = row;
            touched = true;
          }
          continue;
        }
        const deleted = gone.has(`${key}|${id}`) || goneProjects.has(text(row.projectId))
          || (key === 'projects' && goneProjects.has(id));
        if (cloudAt && stampMs(row) > cloudAt && !deleted) {
          added.push(row);
          touched = true;
        }
      }
      next[key] = [...added, ...rows];
      continue;
    }
    if (cloudAt && localAt > cloudAt && json(value) !== json(current)) {
      next[key] = value;
      touched = true;
    }
  }
  if (!touched) return null;
  const diff = diffProjectStates(cloud, next);
  return isEmptyProjectDiff(diff) ? null : diff;
}

export function isEmptyProjectDiff(diff) {
  if (!diff) return true;
  if (Object.keys(diff.fields || {}).length) return false;
  if ((diff.deletedRows || []).length) return false;
  return !Object.values(diff.lists || {}).some((entry) => (
    (entry?.upsert || []).length || (entry?.remove || []).length
  ));
}

/** Listene og feltene en endring rører (styrer hvilke dokumenter som skrives). */
export function projectDiffKeys(diff) {
  const keys = new Set([
    ...Object.keys(diff?.lists || {}),
    ...Object.keys(diff?.fields || {}),
  ]);
  if ((diff?.deletedRows || []).length) keys.add('deletedRows');
  return keys;
}

/**
 * Slå sammen to endringer (b etter a) til én, så køen ikke vokser for hver lagring.
 * Endringer med og uten kjent utgangspunkt holdes for seg.
 */
export function combineProjectDiffs(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (!!a.strict !== !!b.strict) return null;
  const out = emptyProjectDiff();
  out.strict = !!a.strict;
  out.fields = { ...(a.fields || {}), ...(b.fields || {}) };
  out.deletedRows = mergeDeletedRows(a.deletedRows, b.deletedRows);
  const keys = new Set([...Object.keys(a.lists || {}), ...Object.keys(b.lists || {})]);
  for (const key of keys) {
    const first = a.lists?.[key] || { upsert: [], remove: [], baseSigs: {} };
    const second = b.lists?.[key] || { upsert: [], remove: [], baseSigs: {} };
    const upsert = new Map((first.upsert || []).map((row) => [text(row.id), row]));
    const remove = new Set(first.remove || []);
    // Utgangspunktet er versjonen før den første endringen.
    const baseSigs = { ...(second.baseSigs || {}), ...(first.baseSigs || {}) };
    for (const id of second.remove || []) {
      upsert.delete(id);
      remove.add(id);
    }
    for (const row of second.upsert || []) {
      const id = text(row.id);
      upsert.set(id, row);
      remove.delete(id);
    }
    if (upsert.size || remove.size) out.lists[key] = { upsert: [...upsert.values()], remove: [...remove], baseSigs };
  }
  return out;
}

/**
 * Legg endringen på ferske data. Raden vinner hvis ingen andre har endret den siden
 * vi lastet. Har noen gjort det, vinner nyeste updatedAt (lik tid: vår endring).
 * Uten kjent utgangspunkt (strict) legges raden bare på når den er ny eller nyere.
 * onSkip(key, id) kalles når en endring uten kjent utgangspunkt ikke ble lagt på (skyen
 * hadde noe annet), så tapet kan vises for brukeren i stedet for å skje i det stille.
 */
export function applyProjectDiff(fresh, diff, { onSkip = null } = {}) {
  const next = { ...(fresh && typeof fresh === 'object' ? fresh : {}) };
  if (!diff) return next;
  for (const [key, entry] of Object.entries(diff.lists || {})) {
    const current = Array.isArray(next[key]) ? next[key] : [];
    const remove = new Set(entry.remove || []);
    const upsert = new Map((entry.upsert || []).map((row) => [text(row.id), row]));
    const baseSigs = entry.baseSigs || {};
    const out = [];
    for (const row of current) {
      const id = text(row?.id);
      if (id && remove.has(id)) continue;
      if (id && upsert.has(id)) {
        const mine = upsert.get(id);
        upsert.delete(id);
        const untouched = !diff.strict && baseSigs[id] && baseSigs[id] === rowSignature(row);
        const newer = diff.strict ? stampMs(mine) > stampMs(row) : stampMs(mine) >= stampMs(row);
        if (diff.strict && !newer && json(mine) !== json(row)) onSkip?.(key, id);
        out.push(untouched || newer ? mine : row);
        continue;
      }
      out.push(row);
    }
    // Nye rader først, slik listene ellers legger dem inn.
    next[key] = [...upsert.values(), ...out];
  }
  for (const [key, value] of Object.entries(diff.fields || {})) {
    if (diff.strict && next[key] !== undefined && next[key] !== null
      && !(Array.isArray(next[key]) && !next[key].length)) {
      if (json(next[key]) !== json(value)) onSkip?.(key, '');
      continue;
    }
    next[key] = value;
  }
  if ((diff.deletedRows || []).length) {
    next.deletedRows = mergeDeletedRows(next.deletedRows, diff.deletedRows);
  }
  return next;
}
