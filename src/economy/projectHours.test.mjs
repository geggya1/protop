/**
 * DS-09: timene til et prosjekt hentes på prosjekt-id og prosjektnummer. Har prosjektet
 * fått nytt nummer, finnes de eldre timene fortsatt på id-en; timer ført på et duplikat
 * med samme nummer finnes på nummeret. Timelinjen viser nummeret og navnet prosjektet
 * har nå (hydrateRefs).
 * Firestore er et lite minnelager med spørringer på ett felt.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const rows = new Map();
globalThis.__hoursTestRows = rows;
globalThis.__hoursTestQueries = [];

const MOCKS = {
  'firebase/firestore': `
    const rows = globalThis.__hoursTestRows;
    export const collection = (db, ...parts) => ({ path: parts.join('/') });
    export const doc = (db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] });
    export const where = (field, op, value) => ({ field, op, value });
    export const query = (col, ...clauses) => ({ path: col.path, clauses });
    export async function getDoc() { return { exists: () => false, data: () => undefined }; }
    export async function getDocs(q) {
      globalThis.__hoursTestQueries.push((q.clauses || []).map((c) => c.field + c.op + JSON.stringify(c.value)).join('&'));
      const hits = [...rows.values()].filter((row) => (q.clauses || []).every((c) => {
        if (c.op === '==') return row[c.field] === c.value;
        if (c.op === 'in') return c.value.includes(row[c.field]);
        return true;
      }));
      return { docs: hits.map((row) => ({ id: row.id, data: () => JSON.parse(JSON.stringify(row)) })) };
    }
    export const writeBatch = () => ({ set() {}, async commit() {} });
    export async function deleteDoc() {}
  `,
  firebase: 'export const db = {};',
  asyncStorage: `
    const mem = new Map();
    export default {
      async getItem(k) { return mem.has(k) ? mem.get(k) : null; },
      async setItem(k, v) { mem.set(k, String(v)); },
      async removeItem(k) { mem.delete(k); },
      async multiRemove(keys) { keys.forEach((k) => mem.delete(k)); },
      async getAllKeys() { return [...mem.keys()]; },
    };
  `,
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'firebase/firestore') return { url: 'mock:firebase/firestore', shortCircuit: true };
    if (/(^|\/)firebase\.js$/.test(specifier)) return { url: 'mock:firebase', shortCircuit: true };
    if (specifier === '@react-native-async-storage/async-storage') return { url: 'mock:asyncStorage', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('mock:')) return { format: 'module', source: MOCKS[url.slice(5)], shortCircuit: true };
    return next(url, context);
  },
});

const { loadTimeEntries, projectHoursQuery } = await import('./timeEntryStorage.js');
const { hydrateRows, indexProjects } = await import('../company/companyData.js');

// Prosjektet het 100 og har fått nummer 2100.
const project = { id: 'p1', number: '2100', name: 'Skole, byggetrinn 2' };
rows.set('t1', { id: 't1', projectId: 'p1', projectNumber: '100', projectName: 'Skole', employeeId: 'e1', date: '2026-03-01', hours: 7.5 });
rows.set('t2', { id: 't2', projectId: 'p_duplikat', projectNumber: '2100', projectName: 'Import', employeeId: 'e1', date: '2026-10-01', hours: 2 });
rows.set('t3', { id: 't3', projectId: 'p2', projectNumber: '300', employeeId: 'e1', date: '2026-10-01', hours: 1 });

assert.deepEqual(projectHoursQuery(project), { projectId: 'p1', projectNumbers: ['2100'] });

const loaded = await loadTimeEntries('co', projectHoursQuery(project));
assert.deepEqual(loaded.map((row) => row.id).sort(), ['t1', 't2'], 'timene med gammelt nummer (id) og på duplikatet (nummer)');
assert.ok(globalThis.__hoursTestQueries.includes('projectId=="p1"'), 'spørringen går på prosjekt-id');
assert.ok(globalThis.__hoursTestQueries.some((q) => q.startsWith('projectNumber==')), 'og på prosjektnummer');

// Bare nummeret: de eldre timene med det gamle nummeret kommer ikke med. Derfor id-en.
const byNumber = await loadTimeEntries('co', { projectNumbers: ['2100'] });
assert.deepEqual(byNumber.map((row) => row.id), ['t2']);

// Visningen viser prosjektets nummer og navn nå. En id som ikke finnes, beholder kopien.
const shown = hydrateRows(loaded, { projects: indexProjects([project]) });
const t1 = shown.find((row) => row.id === 't1');
assert.equal(t1.projectNumber, '2100');
assert.equal(t1.projectName, 'Skole, byggetrinn 2');
assert.equal(shown.find((row) => row.id === 't2').projectName, 'Import');
// Rader uten prosjekt-id (f.eks. importert salg) slås opp på nummeret.
const [sale] = hydrateRows([{ id: 's1', projectNumber: '2100', projectName: 'Gammelt' }], { projects: indexProjects([project]) });
assert.equal(sale.projectName, 'Skole, byggetrinn 2');

console.log('projectHours.test.mjs: ok');
